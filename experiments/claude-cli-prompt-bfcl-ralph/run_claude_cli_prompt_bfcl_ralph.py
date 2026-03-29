#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import runpy
import shutil
import subprocess
import time
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SHARED_PATH = (
    Path(__file__).resolve().parents[1]
    / "grok-prompt-bfcl-ralph"
    / "run_grok_prompt_bfcl_ralph.py"
)
SHARED = runpy.run_path(str(SHARED_PATH), run_name="prompt_bfcl_ralph_shared")

KIRO_SHARED_PATH = (
    Path(__file__).resolve().parents[1]
    / "kiro-cli-prompt-bfcl-ralph"
    / "run_kiro_cli_prompt_bfcl_ralph.py"
)
KIRO_SHARED = runpy.run_path(str(KIRO_SHARED_PATH), run_name="prompt_bfcl_claude_cli_shared")
MATRIX_SHARED_PATH = (
    Path(__file__).resolve().parents[1]
    / "prompt-bfcl-ralph-matrix"
    / "run_prompt_bfcl_ralph_matrix.py"
)
MATRIX_SHARED = runpy.run_path(
    str(MATRIX_SHARED_PATH),
    run_name="prompt_bfcl_claude_cli_matrix_shared",
)

DEFAULT_CATEGORIES = SHARED["DEFAULT_CATEGORIES"]
get_ralph_variant = SHARED["get_ralph_variant"]
list_ralph_variants = SHARED["list_ralph_variants"]
extract_called_function_names = SHARED["extract_called_function_names"]
sanitize_bfcl_output_to_allowed_functions = SHARED[
    "sanitize_bfcl_output_to_allowed_functions"
]
clone_response_with_text = SHARED["clone_response_with_text"]
sanitize_result_files_to_allowed_functions = SHARED[
    "sanitize_result_files_to_allowed_functions"
]
format_missing_dependency_error = SHARED["format_missing_dependency_error"]
parse_categories = SHARED["parse_categories"]
resolve_runtime_categories = SHARED["resolve_runtime_categories"]
bootstrap_bfcl_imports = SHARED["bootstrap_bfcl_imports"]
create_run_ids_map = SHARED["create_run_ids_map"]
write_run_ids_file = SHARED["write_run_ids_file"]
run_generation_and_eval = SHARED["run_generation_and_eval"]
load_score_rows = SHARED["load_score_rows"]
build_summary = SHARED["build_summary"]
compute_metric_outcomes = SHARED["compute_metric_outcomes"]
resolve_report_markdown_path = SHARED["resolve_report_markdown_path"]
resolve_error_report_json_path = SHARED["resolve_error_report_json_path"]
clear_stale_output_file = SHARED["clear_stale_output_file"]
strip_ansi = KIRO_SHARED["strip_ansi"]
render_prompt_transcript = KIRO_SHARED["render_prompt_transcript"]
attempt_score_json_summary_salvage = MATRIX_SHARED["attempt_score_json_summary_salvage"]

CLI_TOOL_OVERRIDE_PROMPT = """\
Important Claude CLI override:
- Ignore Claude Code built-in tools, workspace tools, MCP tools, and local file/search tools.
- Treat the BFCL function schema in this conversation as the only callable tool universe.
- Do not say a BFCL function is unavailable just because it is not a Claude Code tool.
- Output BFCL function calls only when the task maps to the provided schema.
"""


def env_or_none(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value is not None and value.strip():
            return value.strip()
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Benchmark prompt-mode baseline vs RALPH-loop prompt on BFCL "
            "through Claude CLI."
        )
    )
    parser.add_argument(
        "--bfcl-root",
        type=Path,
        default=Path("/Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard"),
        help="Path to BFCL root directory (contains bfcl_eval package).",
    )
    parser.add_argument(
        "--runtime-root",
        type=Path,
        default=Path(__file__).resolve().parent / "runtime",
        help="Output/runtime root for BFCL result/, score/, metadata, run-id file.",
    )
    parser.add_argument(
        "--model-name",
        type=str,
        default=env_or_none("CLAUDE_BFCL_MODEL_NAME") or "claude-cli-default",
        help="BFCL display model ID for this Claude CLI run.",
    )
    parser.add_argument(
        "--provider-name",
        type=str,
        default=env_or_none("CLAUDE_PROVIDER_NAME") or "Claude CLI",
        help="Provider label shown in BFCL score rows and reports.",
    )
    parser.add_argument(
        "--provider-docs-url",
        type=str,
        default=env_or_none("CLAUDE_PROVIDER_DOCS_URL")
        or "https://docs.anthropic.com/en/docs/claude-code/overview",
        help="Optional documentation URL used in BFCL metadata.",
    )
    parser.add_argument(
        "--provider-license",
        type=str,
        default=env_or_none("CLAUDE_PROVIDER_LICENSE") or "Proprietary",
        help="License label recorded in BFCL metadata.",
    )
    parser.add_argument(
        "--cli-path",
        type=str,
        default=env_or_none("CLAUDE_CLI_PATH") or "claude",
        help="Claude CLI executable path.",
    )
    parser.add_argument(
        "--claude-model",
        type=str,
        default=env_or_none("CLAUDE_MODEL"),
        help="Optional Claude CLI --model override (for example: sonnet).",
    )
    parser.add_argument(
        "--categories",
        type=str,
        default=",".join(DEFAULT_CATEGORIES),
        help=(
            "Comma-separated BFCL categories. Default: "
            "simple_python,multiple,parallel,parallel_multiple"
        ),
    )
    parser.add_argument(
        "--cases-per-category",
        type=int,
        default=20,
        help="If > 0, evaluate first N test IDs per category via --run-ids mode.",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.001,
        help="Benchmark metadata only. Claude CLI does not expose a temperature flag.",
    )
    parser.add_argument(
        "--num-threads",
        type=int,
        default=1,
        help="Parallel BFCL worker count.",
    )
    parser.add_argument(
        "--skip-login-check",
        action="store_true",
        help="Skip the Claude CLI credential check.",
    )
    parser.add_argument(
        "--include-input-log",
        action="store_true",
        help="Enable BFCL verbose inference input logs.",
    )
    parser.add_argument(
        "--allow-agentic-run-ids",
        action="store_true",
        help="Allow memory/web_search categories when --cases-per-category > 0.",
    )
    parser.add_argument(
        "--preflight-only",
        action="store_true",
        help="Run environment/category/login diagnostics and exit.",
    )
    parser.add_argument(
        "--report-markdown",
        type=Path,
        default=None,
        help="Optional markdown report output path. Relative paths resolve from --runtime-root.",
    )
    parser.add_argument(
        "--error-report-json",
        type=Path,
        default=None,
        help="Optional JSON file for inference error forensic summary.",
    )
    parser.add_argument(
        "--error-report-top-n",
        type=int,
        default=5,
        help="How many top error reasons to print per model when failures are present.",
    )
    parser.add_argument(
        "--request-timeout-sec",
        type=float,
        default=120.0,
        help="Per-request timeout (seconds) for each Claude CLI subprocess.",
    )
    parser.add_argument(
        "--max-step-limit",
        type=int,
        default=20,
        help="Override BFCL MAXIMUM_STEP_LIMIT to cap per-turn tool-call loops.",
    )
    parser.add_argument(
        "--ralph-variant",
        type=str,
        default="default",
        help=(
            "RALPH loop prompt variant. "
            f"Supported: {', '.join(list_ralph_variants())}"
        ),
    )
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> None:
    if args.cases_per_category < 0:
        raise SystemExit("--cases-per-category must be >= 0.")
    if args.num_threads <= 0:
        raise SystemExit("--num-threads must be >= 1.")
    if args.temperature < 0:
        raise SystemExit("--temperature must be >= 0.")
    if not args.model_name or not args.model_name.strip():
        raise SystemExit("--model-name must not be blank.")
    if not args.provider_name or not args.provider_name.strip():
        raise SystemExit("--provider-name must not be blank.")
    if not args.cli_path or not args.cli_path.strip():
        raise SystemExit("--cli-path must not be blank.")
    if args.error_report_top_n <= 0:
        raise SystemExit("--error-report-top-n must be >= 1.")
    if args.request_timeout_sec <= 0:
        raise SystemExit("--request-timeout-sec must be > 0.")
    if args.max_step_limit <= 0:
        raise SystemExit("--max-step-limit must be >= 1.")
    get_ralph_variant(args.ralph_variant)


def resolve_cli_path(cli_path: str) -> str:
    candidate = cli_path.strip()
    if not candidate:
        raise SystemExit("--cli-path must not be blank.")
    if "/" in candidate:
        path = Path(candidate).expanduser()
        if not path.exists():
            raise SystemExit(f"Claude CLI executable not found: {path}")
        return str(path)

    resolved = shutil.which(candidate)
    if not resolved:
        raise SystemExit(
            f"Could not find Claude CLI on PATH: {candidate}. Install it or pass --cli-path."
        )
    return resolved


def sanitize_claude_stdout(text: str) -> str:
    return "\n".join(
        line.strip()
        for line in strip_ansi(text).replace("\r", "").splitlines()
        if line.strip()
    ).strip()


FUNCTION_CALL_START_RE = re.compile(r"([A-Za-z_][A-Za-z0-9_.]*)\s*\(")


def extract_balanced_call_from_text(text: str, start_index: int) -> str | None:
    paren_depth = 0
    quote_char: str | None = None
    escaped = False

    for index in range(start_index, len(text)):
        char = text[index]
        if quote_char is not None:
            if escaped:
                escaped = False
                continue
            if char == "\\":
                escaped = True
                continue
            if char == quote_char:
                quote_char = None
            continue

        if char in {"'", '"'}:
            quote_char = char
            continue

        if char == "(":
            paren_depth += 1
        elif char == ")":
            paren_depth -= 1
            if paren_depth == 0:
                return text[start_index : index + 1].strip()

    return None


def extract_allowed_function_calls_from_text(
    text: str, allowed_function_names: list[str]
) -> list[str]:
    raw_text = text or ""
    matches: list[tuple[int, str]] = []

    for function_name in sorted(set(allowed_function_names), key=len, reverse=True):
        needle = f"{function_name}("
        start = 0
        while True:
            index = raw_text.find(needle, start)
            if index < 0:
                break
            call = extract_balanced_call_from_text(raw_text, index)
            if call:
                matches.append((index, call))
            start = index + len(function_name)

    matches.sort(key=lambda item: item[0])
    deduped: list[str] = []
    seen: set[str] = set()
    for _, call in matches:
        if call not in seen:
            seen.add(call)
            deduped.append(call)
    return deduped


def normalize_claude_bfcl_output(text: str, allowed_function_names: list[str]) -> str:
    if not allowed_function_names:
        return (text or "").strip()

    extracted_calls = extract_allowed_function_calls_from_text(text, allowed_function_names)
    if extracted_calls:
        if len(extracted_calls) == 1:
            return extracted_calls[0]
        return "[" + ", ".join(extracted_calls) + "]"

    sanitized_text = sanitize_bfcl_output_to_allowed_functions(
        text,
        allowed_function_names,
    ).strip()
    if sanitized_text and any(
        name in extract_called_function_names(sanitized_text)
        for name in allowed_function_names
    ):
        return sanitized_text

    return (text or "").strip()


def extract_claude_error(stdout: str, stderr: str) -> str:
    combined: list[str] = []
    for source in (stderr, stdout):
        for raw_line in strip_ansi(source).replace("\r", "").splitlines():
            line = raw_line.strip()
            if line:
                combined.append(line)
    if not combined:
        return "claude CLI failed without output"
    return combined[-1][-400:]


def build_claude_prompt_command(
    *,
    cli_path: str,
    prompt: str,
    claude_model: str | None,
) -> list[str]:
    command = [
        cli_path,
        "-p",
        prompt,
        "--output-format",
        "text",
        "--tools",
        "",
        "--permission-mode",
        "dontAsk",
        "--no-session-persistence",
    ]
    if isinstance(claude_model, str) and claude_model.strip():
        command.extend(["--model", claude_model.strip()])
    return command


def check_claude_login(cli_path: str, claude_model: str | None) -> str:
    proc = subprocess.run(
        build_claude_prompt_command(
            cli_path=cli_path,
            prompt="Reply with OK only.",
            claude_model=claude_model,
        ),
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0:
        message = extract_claude_error(proc.stdout, proc.stderr)
        raise SystemExit(
            "Claude CLI credential check failed: "
            f"{message}. Run `claude` and finish login with an account that has Claude Code access."
        )

    cleaned = sanitize_claude_stdout(proc.stdout)
    if not cleaned:
        raise SystemExit("Claude CLI credential check returned no usable output.")
    return cleaned[-200:]


def ensure_runtime_layout(
    runtime_root: Path,
    *,
    cli_path: str,
    claude_model: str | None,
) -> Path:
    runtime_root.mkdir(parents=True, exist_ok=True)
    (runtime_root / "result").mkdir(exist_ok=True)
    (runtime_root / "score").mkdir(exist_ok=True)
    cli_workspace = runtime_root / "cli_workspace"
    cli_workspace.mkdir(exist_ok=True)

    for stale_file in [
        runtime_root / "summary.json",
        runtime_root / "test_case_ids_to_generate.json",
    ]:
        if stale_file.exists():
            stale_file.unlink()

    for stale_csv in (runtime_root / "score").glob("*.csv"):
        stale_csv.unlink()

    for stale_path in (runtime_root / "score").iterdir():
        if stale_path.is_dir():
            shutil.rmtree(stale_path)

    env_lines = [
        f"CLAUDE_CLI_PATH={cli_path}",
        f"CLAUDE_MODEL={(claude_model or '').strip()}",
    ]
    (runtime_root / ".env").write_text("\n".join(env_lines) + "\n", encoding="utf-8")
    return cli_workspace


def run_preflight_checks(
    *,
    bfcl_root: Path,
    runtime_root: Path,
    provider_name: str,
    model_name: str,
    categories: list[str],
    cases_per_category: int,
    allow_agentic_run_ids: bool,
    cli_path: str,
    skip_login_check: bool,
    claude_model: str | None,
) -> None:
    checks: list[tuple[str, str]] = []

    def add(status: str, message: str) -> None:
        checks.append((status, message))

    add("PASS", f"BFCL root found: {bfcl_root}")

    try:
        bootstrap_bfcl_imports(bfcl_root, runtime_root)
        from bfcl_eval.utils import load_dataset_entry
    except ModuleNotFoundError as exc:
        raise SystemExit(format_missing_dependency_error(exc)) from exc

    add("PASS", "BFCL imports available")

    run_ids_enabled = cases_per_category > 0
    resolved_categories = resolve_runtime_categories(
        categories=categories,
        run_ids_enabled=run_ids_enabled,
        allow_agentic_run_ids=allow_agentic_run_ids,
    )
    add("PASS", f"Category validation passed ({len(resolved_categories)} categories)")

    if run_ids_enabled:
        run_ids_map = create_run_ids_map(resolved_categories, cases_per_category)
        total_ids = sum(len(ids) for ids in run_ids_map.values())
        add("PASS", f"Run-id sampling ready ({total_ids} IDs across {len(run_ids_map)} categories)")
    else:
        add("INFO", "Run-id sampling disabled (cases_per_category=0)")
        for category in resolved_categories:
            try:
                entries = load_dataset_entry(category, include_prereq=False)
            except Exception as exc:
                raise SystemExit(
                    f"Dataset probe failed for category '{category}': {exc}"
                ) from exc
            add("PASS", f"Dataset probe ok for {category} ({len(entries)} entries)")

    add("PASS", f"Claude CLI found: {cli_path}")
    if claude_model:
        add("PASS", f"Claude model target: {claude_model}")

    if skip_login_check:
        add("WARN", "Skipped Claude CLI credential check (--skip-login-check)")
    else:
        identity = check_claude_login(cli_path, claude_model)
        add("PASS", f"Claude CLI credential check passed ({identity})")

    print("\n=== Preflight Report ===")
    for status, message in checks:
        print(f"[{status}] {message}")
    print(f"[INFO] Provider: {provider_name}")
    print(f"[INFO] Model Label: {model_name}")
    print(f"[INFO] Timestamp (UTC): {datetime.now(timezone.utc).isoformat()}")
    print("Preflight completed successfully.")


def register_custom_models(
    *,
    model_name: str,
    cli_path: str,
    claude_model: str | None,
    cli_workspace: Path,
    request_timeout_sec: float,
    provider_name: str,
    provider_docs_url: str | None,
    provider_license: str,
    ralph_variant_name: str = "default",
) -> tuple[str, str, str, str]:
    try:
        from bfcl_eval.constants.enums import ModelStyle
        from bfcl_eval.constants.model_config import MODEL_CONFIG_MAPPING, ModelConfig
        from bfcl_eval.model_handler.base_handler import BaseHandler
        from bfcl_eval.model_handler.utils import (
            default_decode_ast_prompting,
            default_decode_execute_prompting,
            format_execution_results_prompting,
            system_prompt_pre_processing_chat_model,
        )
    except ModuleNotFoundError as exc:
        raise SystemExit(format_missing_dependency_error(exc)) from exc

    ralph_variant = get_ralph_variant(ralph_variant_name)
    system_prompt_suffix = str(ralph_variant["system_prompt_suffix"])
    preflight_prompt = str(ralph_variant["preflight_prompt"])
    final_prompt = str(ralph_variant["final_prompt"])
    analysis_context_chars = int(ralph_variant["analysis_context_chars"])
    repair_attempts = int(ralph_variant.get("repair_attempts", 0))
    repair_prompt = str(ralph_variant.get("repair_prompt", "")).strip()

    class ClaudeCLIPromptHandler(BaseHandler):
        def __init__(self, *args, **kwargs) -> None:
            super().__init__(*args, **kwargs)
            self.model_style = ModelStyle.OPENAI_COMPLETIONS
            self.cli_path = cli_path
            self.claude_model = claude_model
            self.cli_workspace = cli_workspace
            self.request_timeout_sec = request_timeout_sec

        def decode_ast(self, result, language, has_tool_call_tag):
            return default_decode_ast_prompting(result, language, has_tool_call_tag)

        def decode_execute(self, result, has_tool_call_tag):
            return default_decode_execute_prompting(result, has_tool_call_tag)

        def _run_claude_prompt(self, prompt: str) -> tuple[str, float]:
            command = build_claude_prompt_command(
                cli_path=self.cli_path,
                prompt=prompt,
                claude_model=self.claude_model,
            )
            start_time = time.time()
            proc = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=self.request_timeout_sec,
                cwd=self.cli_workspace,
            )
            end_time = time.time()

            if proc.returncode != 0:
                raise RuntimeError(
                    f"Claude CLI request failed: {extract_claude_error(proc.stdout, proc.stderr)}"
                )

            content = sanitize_claude_stdout(proc.stdout)
            if not content:
                raise RuntimeError("Claude CLI returned empty output.")

            return content, end_time - start_time

        def _query_prompting(self, inference_data: dict):
            prompt = render_prompt_transcript(inference_data["message"])
            inference_data["inference_input_log"] = {
                "message": repr(inference_data["message"]),
                "rendered_prompt": prompt,
            }
            content, latency = self._run_claude_prompt(prompt)
            allowed_function_names = inference_data.get("allowed_function_names", [])
            return {
                "content": normalize_claude_bfcl_output(content, allowed_function_names),
                "input_token": 0,
                "output_token": 0,
            }, latency

        def _pre_query_processing_prompting(self, test_entry: dict) -> dict:
            functions: list = test_entry["function"]
            test_entry_id: str = test_entry["id"]
            test_entry["question"][0] = system_prompt_pre_processing_chat_model(
                test_entry["question"][0], functions, test_entry_id
            )
            first_turn = test_entry["question"][0]
            if first_turn and first_turn[0].get("role") == "system":
                first_turn[0]["content"] = (
                    f"{first_turn[0]['content']}\n\n{CLI_TOOL_OVERRIDE_PROMPT}"
                )
            else:
                first_turn.insert(0, {"role": "system", "content": CLI_TOOL_OVERRIDE_PROMPT})

            return {
                "message": [],
                "allowed_function_names": [
                    function["name"]
                    for function in functions
                    if isinstance(function, dict) and isinstance(function.get("name"), str)
                ],
            }

        def _parse_query_response_prompting(self, api_response: Any) -> dict:
            return {
                "model_responses": api_response["content"],
                "model_responses_message_for_chat_history": {
                    "role": "assistant",
                    "content": api_response["content"],
                },
                "input_token": 0,
                "output_token": 0,
            }

        def add_first_turn_message_prompting(
            self, inference_data: dict, first_turn_message: list[dict]
        ) -> dict:
            inference_data["message"].extend(first_turn_message)
            return inference_data

        def _add_next_turn_user_message_prompting(
            self, inference_data: dict, user_message: list[dict]
        ) -> dict:
            inference_data["message"].extend(user_message)
            return inference_data

        def _add_assistant_message_prompting(
            self, inference_data: dict, model_response_data: dict
        ) -> dict:
            inference_data["message"].append(
                model_response_data["model_responses_message_for_chat_history"]
            )
            return inference_data

        def _add_execution_results_prompting(
            self, inference_data: dict, execution_results: list[str], model_response_data: dict
        ) -> dict:
            formatted_results_message = format_execution_results_prompting(
                inference_data, execution_results, model_response_data
            )
            inference_data["message"].append(
                {"role": "user", "content": formatted_results_message}
            )
            return inference_data

    class ClaudeCLIRalphLoopPromptHandler(ClaudeCLIPromptHandler):
        def _pre_query_processing_prompting(self, test_entry: dict) -> dict:
            inference_data = super()._pre_query_processing_prompting(test_entry)
            inference_data["ralph_allowed_function_names"] = [
                function["name"]
                for function in test_entry.get("function", [])
                if isinstance(function, dict) and isinstance(function.get("name"), str)
            ]
            first_turn = test_entry["question"][0]
            if first_turn and first_turn[0].get("role") == "system":
                first_turn[0]["content"] = (
                    f"{first_turn[0]['content']}\n\n{system_prompt_suffix}"
                )
            else:
                first_turn.insert(0, {"role": "system", "content": system_prompt_suffix})
            return inference_data

        def _query_prompting(self, inference_data: dict):
            base_messages = deepcopy(inference_data["message"])

            analysis_messages = deepcopy(base_messages)
            analysis_messages.append({"role": "system", "content": preflight_prompt})
            analysis_prompt = render_prompt_transcript(analysis_messages)
            analysis_text, analysis_latency = self._run_claude_prompt(analysis_prompt)

            final_messages = deepcopy(base_messages)
            if analysis_text.strip():
                final_messages.append(
                    {
                        "role": "system",
                        "content": (
                            "Internal RALPH checklist (do not quote this in output):\n"
                            f"{analysis_text[:analysis_context_chars]}"
                        ),
                    }
                )
            final_messages.append({"role": "system", "content": final_prompt})

            final_prompt_text = render_prompt_transcript(final_messages)
            inference_data["inference_input_log"] = {
                "base_message": repr(base_messages),
                "ralph_variant": ralph_variant["name"],
                "ralph_analysis_prompt": preflight_prompt,
                "ralph_final_prompt": final_prompt,
                "ralph_repair_prompt": repair_prompt,
                "rendered_final_prompt": final_prompt_text,
            }

            final_text_raw, final_latency = self._run_claude_prompt(final_prompt_text)
            total_latency = analysis_latency + final_latency

            allowed_function_names = inference_data.get("ralph_allowed_function_names", [])
            invalid_function_names = [
                name
                for name in extract_called_function_names(final_text_raw)
                if name not in allowed_function_names
            ]
            repair_count = 0
            while (
                repair_prompt
                and repair_attempts > 0
                and invalid_function_names
                and repair_count < repair_attempts
                and allowed_function_names
            ):
                repair_messages = deepcopy(base_messages)
                if analysis_text.strip():
                    repair_messages.append(
                        {
                            "role": "system",
                            "content": (
                                "Internal RALPH checklist (do not quote this in output):\n"
                                f"{analysis_text[:analysis_context_chars]}"
                            ),
                        }
                    )
                repair_messages.append({"role": "assistant", "content": final_text_raw})
                repair_messages.append(
                    {
                        "role": "system",
                        "content": (
                            f"{repair_prompt}\n"
                            f"Allowed function names: {', '.join(allowed_function_names)}\n"
                            "Invalid function names in the draft: "
                            f"{', '.join(sorted(set(invalid_function_names)))}"
                        ),
                    }
                )
                repaired_prompt = render_prompt_transcript(repair_messages)
                final_text_raw, repaired_latency = self._run_claude_prompt(repaired_prompt)
                total_latency += repaired_latency
                invalid_function_names = [
                    name
                    for name in extract_called_function_names(final_text_raw)
                    if name not in allowed_function_names
                ]
                repair_count += 1

            final_text_raw = normalize_claude_bfcl_output(
                final_text_raw,
                allowed_function_names,
            )
            lowered = final_text_raw.lower().strip()
            looks_empty_or_refusal = (
                lowered in {"", "[]"}
                or "cannot comply" in lowered
                or "i cannot" in lowered
                or "i'm sorry" in lowered
            )
            if looks_empty_or_refusal:
                fallback_prompt = render_prompt_transcript(base_messages)
                final_text_raw, fallback_latency = self._run_claude_prompt(fallback_prompt)
                total_latency += fallback_latency
                final_text_raw = normalize_claude_bfcl_output(
                    final_text_raw,
                    allowed_function_names,
                )

            return {
                "content": final_text_raw,
                "input_token": 0,
                "output_token": 0,
                "ralph_analysis": analysis_text,
            }, total_latency

        def _parse_query_response_prompting(self, api_response: Any) -> dict:
            response_data = super()._parse_query_response_prompting(api_response)
            ralph_analysis = api_response.get("ralph_analysis")
            if isinstance(ralph_analysis, str) and ralph_analysis.strip():
                response_data["ralph_analysis"] = ralph_analysis
            return response_data

    baseline_registry = f"{model_name}-prompt-baseline"
    if ralph_variant["name"] == "default":
        ralph_registry = f"{model_name}-prompt-ralph-loop"
    else:
        ralph_registry = f"{model_name}-prompt-ralph-loop-{ralph_variant['name']}"
    baseline_display = f"{model_name} (Prompt Baseline)"
    ralph_display = f"{model_name} (Prompt + {ralph_variant['label']})"

    model_url = provider_docs_url or "https://docs.anthropic.com/en/docs/claude-code/overview"

    MODEL_CONFIG_MAPPING[baseline_registry] = ModelConfig(
        model_name=model_name,
        display_name=baseline_display,
        url=model_url,
        org=provider_name,
        license=provider_license,
        model_handler=ClaudeCLIPromptHandler,
        input_price=None,
        output_price=None,
        is_fc_model=False,
        underscore_to_dot=False,
    )

    MODEL_CONFIG_MAPPING[ralph_registry] = ModelConfig(
        model_name=model_name,
        display_name=ralph_display,
        url=model_url,
        org=provider_name,
        license=provider_license,
        model_handler=ClaudeCLIRalphLoopPromptHandler,
        input_price=None,
        output_price=None,
        is_fc_model=False,
        underscore_to_dot=False,
    )

    return baseline_registry, ralph_registry, baseline_display, ralph_display


def build_markdown_report(
    *,
    summary: dict[str, Any],
    provider_name: str,
    model_name: str,
    baseline_display: str,
    ralph_display: str,
    runtime_root: Path,
    run_ids_enabled: bool,
) -> str:
    metrics = summary["metrics_percent_point"]
    outcomes = compute_metric_outcomes(metrics)

    lines = [
        "# Claude CLI Prompt-Mode BFCL Benchmark Report",
        "",
        f"- Generated (UTC): {datetime.now(timezone.utc).isoformat()}",
        f"- Provider: `{provider_name}`",
        f"- Model: `{model_name}`",
        f"- Runtime Root: `{runtime_root}`",
        f"- Categories: `{', '.join(summary['categories'])}`",
        f"- Cases per category: `{summary['cases_per_category']}`",
        f"- Run-id mode: `{'enabled' if run_ids_enabled else 'disabled'}`",
        "",
        "## Scoreboard",
        "",
        f"- Baseline: `{baseline_display}`",
        f"- RALPH: `{ralph_display}`",
        "",
        "| Metric | Baseline | RALPH | Delta (pp) |",
        "|---|---:|---:|---:|",
    ]

    for metric, values in metrics.items():
        base_val = values["baseline"]
        ralph_val = values["ralph"]
        delta = values["delta"]
        base_txt = "N/A" if base_val is None else f"{base_val:.2f}"
        ralph_txt = "N/A" if ralph_val is None else f"{ralph_val:.2f}"
        delta_txt = "N/A" if delta is None else f"{delta:+.2f}"
        lines.append(f"| {metric} | {base_txt} | {ralph_txt} | {delta_txt} |")

    wins = outcomes["wins"]
    losses = outcomes["losses"]
    ties = outcomes["ties"]
    unknown = outcomes["unknown"]

    verdict = "mixed"
    if len(wins) > len(losses):
        verdict = "improved"
    elif len(wins) < len(losses):
        verdict = "regressed"
    elif wins and losses:
        verdict = "balanced"

    lines.extend(
        [
            "",
            "## Headline",
            "",
            f"- Verdict: `{verdict}`",
            f"- Wins: `{len(wins)}` | Losses: `{len(losses)}` | "
            f"Ties: `{len(ties)}` | Unknown: `{len(unknown)}`",
        ]
    )
    if wins:
        best_metric, best_delta = wins[0]
        lines.append(f"- Best gain: `{best_metric}` ({best_delta:+.2f} pp)")
    if losses:
        worst_metric, worst_delta = losses[0]
        lines.append(f"- Biggest drop: `{worst_metric}` ({worst_delta:+.2f} pp)")
    if unknown:
        lines.append(f"- Missing metrics: `{', '.join(unknown)}`")

    return "\n".join(lines) + "\n"


def print_summary(summary: dict[str, Any], provider_name: str, model_name: str) -> None:
    print("\n=== Prompt-Mode BFCL Benchmark Summary ===")
    print(f"provider: {provider_name}")
    print(f"model: {model_name}")
    print(f"categories: {', '.join(summary['categories'])}")
    print(f"cases_per_category: {summary['cases_per_category']}")
    print("\nmetric | baseline | ralph | delta(pp)")
    print("-" * 52)
    for metric, values in summary["metrics_percent_point"].items():
        baseline = values["baseline"]
        ralph = values["ralph"]
        delta = values["delta"]
        baseline_txt = "N/A" if baseline is None else f"{baseline:.2f}"
        ralph_txt = "N/A" if ralph is None else f"{ralph:.2f}"
        delta_txt = "N/A" if delta is None else f"{delta:+.2f}"
        print(f"{metric:22} | {baseline_txt:>8} | {ralph_txt:>6} | {delta_txt:>8}")


def main() -> None:
    args = parse_args()
    validate_args(args)

    SHARED["validate_bfcl_root"](args.bfcl_root)
    categories = parse_categories(args.categories)
    if not categories:
        raise SystemExit("No categories provided.")

    cli_path = resolve_cli_path(args.cli_path)
    run_ids_enabled = args.cases_per_category > 0
    error_report_json_path = resolve_error_report_json_path(
        runtime_root=args.runtime_root,
        error_report_json=args.error_report_json,
    )

    if args.preflight_only:
        run_preflight_checks(
            bfcl_root=args.bfcl_root,
            runtime_root=args.runtime_root,
            provider_name=args.provider_name,
            model_name=args.model_name,
            categories=categories,
            cases_per_category=args.cases_per_category,
            allow_agentic_run_ids=args.allow_agentic_run_ids,
            cli_path=cli_path,
            skip_login_check=args.skip_login_check,
            claude_model=args.claude_model,
        )
        return

    if not args.skip_login_check:
        check_claude_login(cli_path, args.claude_model)

    cli_workspace = ensure_runtime_layout(
        args.runtime_root,
        cli_path=cli_path,
        claude_model=args.claude_model,
    )
    bootstrap_bfcl_imports(args.bfcl_root, args.runtime_root)
    clear_stale_output_file(error_report_json_path)

    categories = resolve_runtime_categories(
        categories=categories,
        run_ids_enabled=run_ids_enabled,
        allow_agentic_run_ids=args.allow_agentic_run_ids,
    )

    if run_ids_enabled:
        run_ids_map = create_run_ids_map(categories, args.cases_per_category)
        run_ids_path = write_run_ids_file(args.runtime_root, run_ids_map)
        print(f"Wrote run-id file: {run_ids_path}")

    baseline_registry, ralph_registry, baseline_display, ralph_display = register_custom_models(
        model_name=args.model_name,
        cli_path=cli_path,
        claude_model=args.claude_model,
        cli_workspace=cli_workspace,
        request_timeout_sec=args.request_timeout_sec,
        provider_name=args.provider_name,
        provider_docs_url=args.provider_docs_url,
        provider_license=args.provider_license,
        ralph_variant_name=args.ralph_variant,
    )
    print("Registered custom models:", baseline_registry, ralph_registry)

    os.environ["MAXIMUM_STEP_LIMIT"] = str(args.max_step_limit)
    print(f"Applied BFCL MAXIMUM_STEP_LIMIT={args.max_step_limit}")

    summary: dict[str, Any] | None = None
    try:
        run_generation_and_eval(
            runtime_root=args.runtime_root,
            model_registries=[baseline_registry, ralph_registry],
            categories=categories,
            num_threads=args.num_threads,
            include_input_log=args.include_input_log,
            run_ids_enabled=run_ids_enabled,
        )
    except Exception as exc:
        summary = attempt_score_json_summary_salvage(
            baseline_registry=baseline_registry,
            ralph_registry=ralph_registry,
            runtime_root=args.runtime_root,
            categories=categories,
            cases_per_category=args.cases_per_category,
        )
        if summary is None:
            raise
        print(
            "Fell back to score-json summary salvage after BFCL aggregate failure: "
            f"{exc}"
        )
    except ModuleNotFoundError as exc:
        raise SystemExit(format_missing_dependency_error(exc)) from exc

    sanitize_result_files_to_allowed_functions(
        runtime_root=args.runtime_root,
        registries=[baseline_registry, ralph_registry],
    )

    if summary is None:
        score_rows = load_score_rows(args.runtime_root)
        summary = build_summary(
            score_rows=score_rows,
            baseline_registry=baseline_registry,
            ralph_registry=ralph_registry,
            categories=categories,
            cases_per_category=args.cases_per_category,
        )
    summary_path = args.runtime_root / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print_summary(summary, args.provider_name, args.model_name)
    print(f"\nSaved summary: {summary_path}")

    report_markdown_path = resolve_report_markdown_path(
        runtime_root=args.runtime_root,
        report_markdown=args.report_markdown,
    )
    report_markdown = build_markdown_report(
        summary=summary,
        provider_name=args.provider_name,
        model_name=args.model_name,
        baseline_display=baseline_display,
        ralph_display=ralph_display,
        runtime_root=args.runtime_root,
        run_ids_enabled=run_ids_enabled,
    )
    report_markdown_path.write_text(report_markdown, encoding="utf-8")
    print(f"Saved markdown report: {report_markdown_path}")

    SHARED["write_error_forensics_report"](
        runtime_root=args.runtime_root,
        registries=[baseline_registry, ralph_registry],
        destination_path=error_report_json_path,
        top_n=args.error_report_top_n,
    )
    print(f"Saved error forensic report: {error_report_json_path}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        raise SystemExit(130)
