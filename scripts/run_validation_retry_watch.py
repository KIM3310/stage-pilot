#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import subprocess
import time
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
MATRIX_RUNNER = (
    REPO_ROOT
    / "experiments"
    / "prompt-bfcl-ralph-matrix"
    / "run_prompt_bfcl_ralph_matrix.py"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Wait for a validation matrix CSV, rerun missing/failed candidates, "
            "and promote successful retries to a larger validation set."
        )
    )
    parser.add_argument("--models-file", type=Path, required=True)
    parser.add_argument("--wait-results-csv", type=Path, required=True)
    parser.add_argument("--retry-model-ids", type=str, required=True)
    parser.add_argument("--retry-runtime-root", type=Path, required=True)
    parser.add_argument("--promote-runtime-root", type=Path, required=True)
    parser.add_argument("--bfcl-root", type=Path, required=True)
    parser.add_argument("--python-executable", type=Path, required=True)
    parser.add_argument("--wait-poll-sec", type=float, default=60.0)
    parser.add_argument("--retry-cases-per-category", type=int, default=10)
    parser.add_argument("--promote-cases-per-category", type=int, default=20)
    parser.add_argument("--num-threads", type=int, default=1)
    parser.add_argument("--salvage-stall-sec", type=float, default=60.0)
    parser.add_argument("--child-poll-interval-sec", type=float, default=5.0)
    parser.add_argument("--min-improvement-pp", type=float, default=0.1)
    return parser.parse_args()


def log(message: str) -> None:
    print(message, flush=True)


def wait_for_file(path: Path, poll_sec: float) -> None:
    while not path.exists():
        log(f"waiting for {path}")
        time.sleep(poll_sec)


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_retry_ids(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def rows_by_id(rows: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    return {row["id"]: row for row in rows if row.get("id")}


def find_retry_ids(rows: list[dict[str, str]], desired_ids: list[str]) -> list[str]:
    indexed = rows_by_id(rows)
    retry_ids: list[str] = []
    for model_id in desired_ids:
        row = indexed.get(model_id)
        if row is None or row.get("status") != "completed":
            retry_ids.append(model_id)
    return retry_ids


def find_promote_ids(
    rows: list[dict[str, str]],
    *,
    min_improvement_pp: float,
) -> list[str]:
    promote_ids: list[str] = []
    for row in rows:
        if row.get("status") != "completed":
            continue
        raw_delta = row.get("overall_delta_pp", "")
        try:
            delta = float(raw_delta)
        except ValueError:
            continue
        if delta >= min_improvement_pp:
            promote_ids.append(row["id"])
    return promote_ids


def run_matrix(
    *,
    python_executable: Path,
    models_file: Path,
    model_ids: list[str],
    runtime_root: Path,
    bfcl_root: Path,
    cases_per_category: int,
    num_threads: int,
    salvage_stall_sec: float,
    child_poll_interval_sec: float,
) -> None:
    runtime_root.parent.mkdir(parents=True, exist_ok=True)
    command = [
        str(python_executable),
        str(MATRIX_RUNNER),
        "--models-file",
        str(models_file),
        "--model-ids",
        ",".join(model_ids),
        "--runtime-root",
        str(runtime_root),
        "--bfcl-root",
        str(bfcl_root),
        "--python-executable",
        str(python_executable),
        "--cases-per-category",
        str(cases_per_category),
        "--num-threads",
        str(num_threads),
        "--salvage-stall-sec",
        str(salvage_stall_sec),
        "--child-poll-interval-sec",
        str(child_poll_interval_sec),
    ]
    log("RUN " + " ".join(command))
    subprocess.run(command, cwd=REPO_ROOT, check=False)


def main() -> None:
    args = parse_args()
    desired_ids = parse_retry_ids(args.retry_model_ids)
    wait_for_file(args.wait_results_csv, args.wait_poll_sec)

    initial_rows = load_rows(args.wait_results_csv)
    retry_ids = find_retry_ids(initial_rows, desired_ids)
    if retry_ids:
        log("retry ids: " + ", ".join(retry_ids))
        run_matrix(
            python_executable=args.python_executable,
            models_file=args.models_file,
            model_ids=retry_ids,
            runtime_root=args.retry_runtime_root,
            bfcl_root=args.bfcl_root,
            cases_per_category=args.retry_cases_per_category,
            num_threads=args.num_threads,
            salvage_stall_sec=args.salvage_stall_sec,
            child_poll_interval_sec=args.child_poll_interval_sec,
        )
        retry_results_csv = args.retry_runtime_root / "matrix_results.csv"
        if retry_results_csv.exists():
            retry_rows = load_rows(retry_results_csv)
        else:
            retry_rows = []
    else:
        log("no retry ids")
        retry_rows = []

    promote_ids = find_promote_ids(
        retry_rows,
        min_improvement_pp=args.min_improvement_pp,
    )
    if promote_ids:
        log("promote ids: " + ", ".join(promote_ids))
        run_matrix(
            python_executable=args.python_executable,
            models_file=args.models_file,
            model_ids=promote_ids,
            runtime_root=args.promote_runtime_root,
            bfcl_root=args.bfcl_root,
            cases_per_category=args.promote_cases_per_category,
            num_threads=args.num_threads,
            salvage_stall_sec=args.salvage_stall_sec,
            child_poll_interval_sec=args.child_poll_interval_sec,
        )
    else:
        log("no promote ids")


if __name__ == "__main__":
    main()
