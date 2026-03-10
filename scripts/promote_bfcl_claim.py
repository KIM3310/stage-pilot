#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Promote one BFCL runtime folder into a checked-in claim artifact folder."
    )
    parser.add_argument("--source-run-dir", type=Path, required=True)
    parser.add_argument("--artifact-dir", type=Path, required=True)
    parser.add_argument("--title", type=str, required=True)
    parser.add_argument("--subtitle", type=str, required=True)
    parser.add_argument("--source-label", type=str, required=True)
    parser.add_argument("--baseline-label", type=str, default="Baseline")
    parser.add_argument("--ralph-label", type=str, default="RALPH Loop")
    parser.add_argument(
        "--chart-name",
        type=str,
        default="benchmark.svg",
        help="Output SVG filename inside the artifact directory.",
    )
    return parser.parse_args()


def copy_if_exists(src: Path, dest: Path) -> None:
    if not src.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


def main() -> int:
    args = parse_args()
    source = args.source_run_dir.resolve()
    artifact_dir = args.artifact_dir.resolve()
    artifact_dir.mkdir(parents=True, exist_ok=True)

    summary_path = source / "summary.json"
    report_path = source / "benchmark_report.md"
    error_forensics_path = source / "error_forensics.json"
    score_csv_path = source / "score" / "data_overall.csv"
    stdout_path = source / "stdout.log"
    stderr_path = source / "stderr.log"

    if not summary_path.exists():
        raise SystemExit(f"summary.json not found: {summary_path}")

    copy_if_exists(summary_path, artifact_dir / "summary.json")
    copy_if_exists(report_path, artifact_dir / "benchmark_report.md")
    copy_if_exists(error_forensics_path, artifact_dir / "error_forensics.json")
    copy_if_exists(score_csv_path, artifact_dir / "data_overall.csv")
    copy_if_exists(stdout_path, artifact_dir / "stdout.log")
    copy_if_exists(stderr_path, artifact_dir / "stderr.log")

    chart_script = Path(__file__).resolve().parent / "render-bfcl-gain-chart.py"
    subprocess.check_call(
        [
            sys.executable,
            str(chart_script),
            "--summary-json",
            str(artifact_dir / "summary.json"),
            "--output-svg",
            str(artifact_dir / args.chart_name),
            "--title",
            args.title,
            "--subtitle",
            args.subtitle,
            "--source-label",
            args.source_label,
            "--baseline-label",
            args.baseline_label,
            "--ralph-label",
            args.ralph_label,
        ]
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
