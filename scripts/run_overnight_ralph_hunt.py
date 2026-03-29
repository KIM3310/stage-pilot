#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import shutil
import subprocess
import argparse
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


KST = ZoneInfo("Asia/Seoul")
REPO_ROOT = Path(__file__).resolve().parents[1]
BFCL_ROOT = Path("/Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard")
BFCL_PYTHON = BFCL_ROOT / ".venv311" / "bin" / "python"
MATRIX_RUNNER = (
    REPO_ROOT
    / "experiments"
    / "prompt-bfcl-ralph-matrix"
    / "run_prompt_bfcl_ralph_matrix.py"
)
OVERNIGHT_ROOT = (
    REPO_ROOT
    / "experiments"
    / "prompt-bfcl-ralph-matrix"
    / f"runtime-overnight-{datetime.now(KST).strftime('%Y%m%d-%H%M%S')}"
)
OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1"
MIN_IMPROVEMENT_PP = 0.1


@dataclass(frozen=True)
class Candidate:
    family: str
    label: str
    kind: str
    model_name: str
    variant: str
    provider_name: str
    provider_docs_url: str
    provider_license: str
    base_url: str | None = None
    api_key: str | None = None
    skip_model_check: bool = False
    cli_path: str | None = None
    gemini_model: str | None = None
    local_model_to_pull: str | None = None

    @property
    def entry_id(self) -> str:
        family_slug = self.family.lower().replace(".", "-").replace(" ", "-")
        variant_slug = self.variant.lower().replace(".", "-").replace(" ", "-")
        return f"{self.kind}-{family_slug}-{variant_slug}"

    def to_entry(self) -> dict[str, Any]:
        entry: dict[str, Any] = {
            "id": self.entry_id,
            "label": self.label,
            "family": self.family,
            "kind": self.kind,
            "enabled": True,
            "provider_name": self.provider_name,
            "provider_docs_url": self.provider_docs_url,
            "provider_license": self.provider_license,
            "model_name": self.model_name,
            "ralph_variant": self.variant,
        }
        if self.kind == "openai-compatible":
            entry["base_url"] = self.base_url
            entry["api_key"] = self.api_key or "dummy"
            entry["skip_model_check"] = self.skip_model_check
        elif self.kind == "gemini-cli":
            entry["cli_path"] = self.cli_path or "gemini"
            entry["gemini_model"] = self.gemini_model
        return entry


def log(message: str) -> None:
    timestamp = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S KST")
    print(f"[{timestamp}] {message}", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Search BFCL prompt-mode RALPH variants for local or service-backed models."
    )
    parser.add_argument(
        "--runtime-root",
        type=Path,
        default=OVERNIGHT_ROOT,
        help="Output directory for matrix runs and hunt status.",
    )
    parser.add_argument(
        "--local-only",
        action="store_true",
        help="Skip Gemini CLI candidates and search only local Ollama-backed models.",
    )
    parser.add_argument(
        "--families",
        type=str,
        default="",
        help="Optional comma-separated candidate family filter (for example qwen3.5-4b,gemma3-4b).",
    )
    parser.add_argument(
        "--phase1-cases",
        type=int,
        default=3,
        help="Cases per category for the first search phase.",
    )
    parser.add_argument(
        "--phase2-cases",
        type=int,
        default=3,
        help="Cases per category for the second search phase.",
    )
    parser.add_argument(
        "--validation5-cases",
        type=int,
        default=5,
        help="Cases per category for the first validation phase.",
    )
    parser.add_argument(
        "--validation10-cases",
        type=int,
        default=10,
        help="Cases per category for the second validation phase.",
    )
    parser.add_argument(
        "--min-improvement-pp",
        type=float,
        default=MIN_IMPROVEMENT_PP,
        help="Minimum overall delta in percentage points required to keep a winner.",
    )
    parser.add_argument(
        "--skip-phase-two",
        action="store_true",
        help="Skip the second search phase even if phase one produces no winner for some families.",
    )
    parser.add_argument(
        "--skip-validation10",
        action="store_true",
        help="Skip the larger validation pass.",
    )
    return parser.parse_args()


def now_kst() -> datetime:
    return datetime.now(KST)


def compute_deadline() -> datetime:
    now = now_kst()
    tomorrow = now + timedelta(days=1)
    return tomorrow.replace(hour=9, minute=0, second=0, microsecond=0)


def seconds_left(deadline: datetime) -> float:
    return max(0.0, (deadline - now_kst()).total_seconds())


def run_command(command: list[str], *, cwd: Path) -> None:
    log("RUN " + " ".join(command))
    completed = subprocess.run(command, cwd=cwd, check=False)
    if completed.returncode != 0:
        raise RuntimeError(
            f"Command failed with exit code {completed.returncode}: {' '.join(command)}"
        )


def available_ollama_models() -> set[str]:
    proc = subprocess.run(
        ["ollama", "list"],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ollama list failed: {proc.stderr.strip()}")

    models: set[str] = set()
    for line in proc.stdout.splitlines()[1:]:
        stripped = line.strip()
        if not stripped:
            continue
        name = stripped.split()[0]
        if name:
            models.add(name)
    return models


def installed_target_locals() -> set[str]:
    desired = {
        "gemma3:4b",
        "llama3.1:8b",
        "llama3.2:latest",
        "mistral:latest",
        "phi3:latest",
        "qwen2.5:1.5b",
        "qwen3.5:4b",
        "deepseek-r1:1.5b",
    }
    installed = available_ollama_models()
    missing = sorted(desired - installed)
    if missing:
        log(
            "Skipping unavailable Ollama targets: "
            + ", ".join(missing)
        )
    ready = installed.intersection(desired)
    if ready:
        log("Active Ollama targets: " + ", ".join(sorted(ready)))
    return ready


def find_gemini_cli() -> str | None:
    candidates = [
        shutil.which("gemini"),
        "/Users/kim/.nvm/versions/node/v24.13.0/bin/gemini",
        "/opt/homebrew/bin/gemini",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return None


def write_models_file(path: Path, entries: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"models": entries}
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def load_matrix_records(csv_path: Path) -> list[dict[str, str]]:
    if not csv_path.exists():
        return []
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def to_float(raw: str | None) -> float | None:
    if raw is None or raw == "":
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def build_phase_one_candidates(
    available_locals: set[str],
    *,
    gemini_cli_path: str | None,
) -> list[Candidate]:
    candidates: list[Candidate] = []

    if gemini_cli_path:
        candidates.extend(
            [
                Candidate(
                    family="gemini-cli-2.5-flash-lite",
                    label="Gemini CLI 2.5 Flash-Lite [default]",
                    kind="gemini-cli",
                    model_name="gemini-cli-2-5-flash-lite",
                    variant="default",
                    provider_name="Gemini CLI",
                    provider_docs_url="https://github.com/google-gemini/gemini-cli",
                    provider_license="Proprietary",
                    cli_path=gemini_cli_path,
                    gemini_model="gemini-2.5-flash-lite",
                ),
                Candidate(
                    family="gemini-cli-2.5-flash-lite",
                    label="Gemini CLI 2.5 Flash-Lite [minimal]",
                    kind="gemini-cli",
                    model_name="gemini-cli-2-5-flash-lite",
                    variant="minimal",
                    provider_name="Gemini CLI",
                    provider_docs_url="https://github.com/google-gemini/gemini-cli",
                    provider_license="Proprietary",
                    cli_path=gemini_cli_path,
                    gemini_model="gemini-2.5-flash-lite",
                ),
                Candidate(
                    family="gemini-cli-2.5-flash-lite",
                    label="Gemini CLI 2.5 Flash-Lite [coverage]",
                    kind="gemini-cli",
                    model_name="gemini-cli-2-5-flash-lite",
                    variant="coverage",
                    provider_name="Gemini CLI",
                    provider_docs_url="https://github.com/google-gemini/gemini-cli",
                    provider_license="Proprietary",
                    cli_path=gemini_cli_path,
                    gemini_model="gemini-2.5-flash-lite",
                ),
            ]
        )

    local_specs = [
        ("gemma3:4b", "gemma3-4b", "Ollama Gemma 3 4B"),
        ("llama3.1:8b", "llama3-1-8b", "Ollama Meta Llama 3.1 8B"),
        ("llama3.2:latest", "llama3-2-latest", "Ollama Meta Llama 3.2"),
        ("phi3:latest", "phi3-latest", "Ollama Phi-3"),
        ("qwen2.5:1.5b", "qwen2.5-1.5b", "Ollama Qwen 2.5 1.5B"),
        ("qwen3.5:4b", "qwen3.5-4b", "Ollama Qwen 3.5 4B"),
        ("mistral:latest", "mistral-latest", "Ollama Mistral"),
        ("deepseek-r1:1.5b", "deepseek-r1-1.5b", "Ollama DeepSeek R1 1.5B"),
    ]
    local_variants_by_family = {
        "gemma3-4b": ["minimal", "coverage", "schema-lock"],
        "llama3-1-8b": ["schema-lock", "coverage", "parallel-safe"],
        "llama3-2-latest": ["schema-lock", "coverage", "parallel-safe"],
        "phi3-latest": ["minimal", "coverage", "schema-lock"],
        "qwen2.5-1.5b": ["minimal", "coverage", "schema-lock", "parallel-safe"],
        "qwen3.5-4b": ["minimal", "coverage", "schema-lock", "parallel-safe"],
        "mistral-latest": ["default", "minimal", "coverage", "schema-lock"],
        "deepseek-r1-1.5b": ["default", "minimal", "coverage"],
    }

    for model_name, family, base_label in local_specs:
        if model_name not in available_locals:
            continue
        for variant in local_variants_by_family[family]:
            candidates.append(
                Candidate(
                    family=family,
                    label=f"{base_label} [{variant}]",
                    kind="openai-compatible",
                    model_name=model_name,
                    variant=variant,
                    provider_name="Ollama",
                    provider_docs_url="http://127.0.0.1:11434",
                    provider_license="Custom",
                    base_url=OLLAMA_BASE_URL,
                    api_key="dummy",
                    skip_model_check=True,
                    local_model_to_pull=model_name,
                )
            )
    return candidates


def filter_candidates(
    candidates: list[Candidate], allowed_families: set[str]
) -> list[Candidate]:
    if not allowed_families:
        return candidates
    return [candidate for candidate in candidates if candidate.family in allowed_families]


def build_phase_two_candidates(
    families_without_win: set[str], available_locals: set[str]
) -> list[Candidate]:
    local_family_to_model = {
        "gemma3-4b": ("gemma3:4b", "Ollama Gemma 3 4B"),
        "llama3-1-8b": ("llama3.1:8b", "Ollama Meta Llama 3.1 8B"),
        "llama3-2-latest": ("llama3.2:latest", "Ollama Meta Llama 3.2"),
        "phi3-latest": ("phi3:latest", "Ollama Phi-3"),
        "qwen2.5-1.5b": ("qwen2.5:1.5b", "Ollama Qwen 2.5 1.5B"),
        "qwen3.5-4b": ("qwen3.5:4b", "Ollama Qwen 3.5 4B"),
        "mistral-latest": ("mistral:latest", "Ollama Mistral"),
        "deepseek-r1-1.5b": ("deepseek-r1:1.5b", "Ollama DeepSeek R1 1.5B"),
    }
    candidates: list[Candidate] = []

    if "gemini-cli-2.5-flash-lite" in families_without_win:
        for variant in ["schema-lock", "parallel-safe", "call-count"]:
            candidates.append(
                Candidate(
                    family="gemini-cli-2.5-flash-lite",
                    label=f"Gemini CLI 2.5 Flash-Lite [{variant}]",
                    kind="gemini-cli",
                    model_name="gemini-cli-2-5-flash-lite",
                    variant=variant,
                    provider_name="Gemini CLI",
                    provider_docs_url="https://github.com/google-gemini/gemini-cli",
                    provider_license="Proprietary",
                    cli_path=find_gemini_cli() or "gemini",
                    gemini_model="gemini-2.5-flash-lite",
                )
            )

    for family in sorted(families_without_win):
        if family not in local_family_to_model:
            continue
        model_name, base_label = local_family_to_model[family]
        if model_name not in available_locals:
            continue
        for variant in ["compact", "strict", "call-count"]:
            candidates.append(
                Candidate(
                    family=family,
                    label=f"{base_label} [{variant}]",
                    kind="openai-compatible",
                    model_name=model_name,
                    variant=variant,
                    provider_name="Ollama",
                    provider_docs_url="http://127.0.0.1:11434",
                    provider_license="Custom",
                    base_url=OLLAMA_BASE_URL,
                    api_key="dummy",
                    skip_model_check=True,
                    local_model_to_pull=model_name,
                )
            )
    return candidates


def best_improved_by_family(
    candidates: list[Candidate],
    records: list[dict[str, str]],
    *,
    min_improvement_pp: float,
) -> list[Candidate]:
    candidate_by_id = {candidate.entry_id: candidate for candidate in candidates}
    best: dict[str, tuple[float, Candidate]] = {}
    for record in records:
        record_id = record.get("id", "")
        candidate = candidate_by_id.get(record_id)
        if candidate is None:
            continue
        if record.get("status") != "completed":
            continue
        delta = to_float(record.get("overall_delta_pp"))
        if delta is None or delta < min_improvement_pp:
            continue
        existing = best.get(candidate.family)
        if existing is None or delta > existing[0]:
            best[candidate.family] = (delta, candidate)
    return [item[1] for item in best.values()]


def families_without_win(
    phase_candidates: list[Candidate],
    winners: list[Candidate],
) -> set[str]:
    winner_families = {candidate.family for candidate in winners}
    return {candidate.family for candidate in phase_candidates} - winner_families


def run_matrix_phase(
    *,
    phase_name: str,
    candidates: list[Candidate],
    cases_per_category: int,
    runtime_root: Path,
) -> list[dict[str, str]]:
    if not candidates:
        log(f"{phase_name}: no candidates to run")
        return []

    models_file = runtime_root / f"{phase_name}.models.json"
    write_models_file(models_file, [candidate.to_entry() for candidate in candidates])

    command = [
        str(BFCL_PYTHON),
        str(MATRIX_RUNNER),
        "--models-file",
        str(models_file),
        "--runtime-root",
        str(runtime_root / phase_name),
        "--bfcl-root",
        str(BFCL_ROOT),
        "--python-executable",
        str(BFCL_PYTHON),
        "--cases-per-category",
        str(cases_per_category),
        "--num-threads",
        "1",
        "--salvage-stall-sec",
        "20",
        "--child-poll-interval-sec",
        "5",
    ]
    csv_path = runtime_root / phase_name / "matrix_results.csv"
    log("RUN " + " ".join(command))
    completed = subprocess.run(command, cwd=REPO_ROOT, check=False)
    records = load_matrix_records(csv_path)
    if completed.returncode != 0:
        if records:
            log(
                f"{phase_name}: matrix exited with code {completed.returncode}, "
                f"continuing with {len(records)} partial record(s)"
            )
            return records
        raise RuntimeError(
            f"Command failed with exit code {completed.returncode}: {' '.join(command)}"
        )
    return records


def run_validation_phase(
    *,
    phase_name: str,
    winners: list[Candidate],
    cases_per_category: int,
    runtime_root: Path,
) -> list[dict[str, str]]:
    return run_matrix_phase(
        phase_name=phase_name,
        candidates=winners,
        cases_per_category=cases_per_category,
        runtime_root=runtime_root,
    )


def write_status(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    if not BFCL_PYTHON.exists():
        raise SystemExit(f"BFCL python not found: {BFCL_PYTHON}")

    deadline = compute_deadline()
    runtime_root = args.runtime_root
    runtime_root.mkdir(parents=True, exist_ok=True)
    status_path = runtime_root / "overnight_status.json"

    allowed_families = {
        item.strip()
        for item in args.families.split(",")
        if item.strip()
    }

    log(f"Overnight RALPH hunt root: {runtime_root}")
    log(f"Deadline set to: {deadline.isoformat()}")

    installed_locals = installed_target_locals()
    gemini_cli_path = None if args.local_only else find_gemini_cli()
    if not gemini_cli_path:
        log("Gemini CLI unavailable or disabled; skipping Gemini service-backed search")
    phase_one_candidates = build_phase_one_candidates(
        installed_locals,
        gemini_cli_path=gemini_cli_path,
    )
    phase_one_candidates = filter_candidates(phase_one_candidates, allowed_families)

    status: dict[str, Any] = {
        "started_at": now_kst().isoformat(),
        "deadline": deadline.isoformat(),
        "runtime_root": str(runtime_root),
        "local_only": args.local_only,
        "families": sorted(allowed_families),
        "installed_ollama_targets": sorted(installed_locals),
        "gemini_cli_available": gemini_cli_path is not None,
        "gemini_cli_path": gemini_cli_path,
        "phase1_cases": args.phase1_cases,
        "phase2_cases": args.phase2_cases,
        "validation5_cases": args.validation5_cases,
        "validation10_cases": args.validation10_cases,
        "min_improvement_pp": args.min_improvement_pp,
        "phase_one_candidates": [candidate.entry_id for candidate in phase_one_candidates],
        "phase_one_winners": [],
        "phase_two_candidates": [],
        "phase_two_winners": [],
        "validation5_winners": [],
        "validation10_winners": [],
        "errors": [],
    }
    write_status(status_path, status)

    if seconds_left(deadline) < 1800:
        log("Less than 30 minutes left before the deadline. Exiting without search.")
        status["finished_at"] = now_kst().isoformat()
        status["note"] = "Insufficient time before deadline"
        write_status(status_path, status)
        return

    try:
        phase_one_records = run_matrix_phase(
            phase_name="phase1-search",
            candidates=phase_one_candidates,
            cases_per_category=args.phase1_cases,
            runtime_root=runtime_root,
        )
    except Exception as exc:
        status["errors"].append(f"phase1-search failed: {exc}")
        write_status(status_path, status)
        raise
    phase_one_winners = best_improved_by_family(
        phase_one_candidates,
        phase_one_records,
        min_improvement_pp=args.min_improvement_pp,
    )
    status["phase_one_winners"] = [candidate.entry_id for candidate in phase_one_winners]
    write_status(status_path, status)

    remaining_families = families_without_win(phase_one_candidates, phase_one_winners)
    phase_two_candidates = build_phase_two_candidates(remaining_families, installed_locals)
    phase_two_candidates = filter_candidates(phase_two_candidates, allowed_families)
    status["phase_two_candidates"] = [candidate.entry_id for candidate in phase_two_candidates]
    write_status(status_path, status)

    phase_two_winners: list[Candidate] = []
    if (not args.skip_phase_two) and phase_two_candidates and seconds_left(deadline) > 5400:
        try:
            phase_two_records = run_matrix_phase(
                phase_name="phase2-search",
                candidates=phase_two_candidates,
                cases_per_category=args.phase2_cases,
                runtime_root=runtime_root,
            )
            phase_two_winners = best_improved_by_family(
                phase_two_candidates,
                phase_two_records,
                min_improvement_pp=args.min_improvement_pp,
            )
            status["phase_two_winners"] = [
                candidate.entry_id for candidate in phase_two_winners
            ]
            write_status(status_path, status)
        except Exception as exc:
            status["errors"].append(f"phase2-search failed: {exc}")
            write_status(status_path, status)

    winner_by_family: dict[str, Candidate] = {}
    for candidate in phase_one_winners + phase_two_winners:
        existing = winner_by_family.get(candidate.family)
        if existing is None:
            winner_by_family[candidate.family] = candidate
            continue
        if candidate.variant == "schema-lock" and existing.variant != "schema-lock":
            winner_by_family[candidate.family] = candidate

    validation_candidates = list(winner_by_family.values())
    validation5_winners: list[Candidate] = []
    if validation_candidates and seconds_left(deadline) > 3600:
        try:
            validation5_records = run_validation_phase(
                phase_name="validation-5",
                winners=validation_candidates,
                cases_per_category=args.validation5_cases,
                runtime_root=runtime_root,
            )
            validation5_winners = best_improved_by_family(
                validation_candidates,
                validation5_records,
                min_improvement_pp=args.min_improvement_pp,
            )
            status["validation5_winners"] = [
                candidate.entry_id for candidate in validation5_winners
            ]
            write_status(status_path, status)
        except Exception as exc:
            status["errors"].append(f"validation-5 failed: {exc}")
            write_status(status_path, status)

    if (
        (not args.skip_validation10)
        and validation5_winners
        and seconds_left(deadline) > 7200
    ):
        try:
            validation10_records = run_validation_phase(
                phase_name="validation-10",
                winners=validation5_winners,
                cases_per_category=args.validation10_cases,
                runtime_root=runtime_root,
            )
            validation10_winners = best_improved_by_family(
                validation5_winners,
                validation10_records,
                min_improvement_pp=args.min_improvement_pp,
            )
            status["validation10_winners"] = [
                candidate.entry_id for candidate in validation10_winners
            ]
            write_status(status_path, status)
        except Exception as exc:
            status["errors"].append(f"validation-10 failed: {exc}")
            write_status(status_path, status)

    status["finished_at"] = now_kst().isoformat()
    write_status(status_path, status)
    log("Overnight RALPH hunt completed")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Interrupted")
        raise SystemExit(130)
