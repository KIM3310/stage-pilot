#!/usr/bin/env python3
from __future__ import annotations

import runpy
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT_PATH = (
    Path(__file__).resolve().parent / "run_claude_cli_prompt_bfcl_ralph.py"
)
MOD = runpy.run_path(str(SCRIPT_PATH))

validate_args = MOD["validate_args"]
resolve_cli_path = MOD["resolve_cli_path"]
build_claude_prompt_command = MOD["build_claude_prompt_command"]
sanitize_claude_stdout = MOD["sanitize_claude_stdout"]
ensure_runtime_layout = MOD["ensure_runtime_layout"]
check_claude_login = MOD["check_claude_login"]
build_markdown_report = MOD["build_markdown_report"]
normalize_claude_bfcl_output = MOD["normalize_claude_bfcl_output"]


class TestRunClaudeCliPromptBfclRalph(unittest.TestCase):
    def test_validate_args_rejects_missing_required_fields(self) -> None:
        bad_args = SimpleNamespace(
            cases_per_category=1,
            num_threads=1,
            temperature=0.0,
            model_name="",
            provider_name="Claude CLI",
            cli_path="claude",
            error_report_top_n=5,
            request_timeout_sec=30.0,
            max_step_limit=20,
            ralph_variant="default",
        )
        with self.assertRaises(SystemExit):
            validate_args(bad_args)

    def test_resolve_cli_path_and_command_building(self) -> None:
        with patch("shutil.which", return_value="/usr/local/bin/claude"):
            self.assertEqual(resolve_cli_path("claude"), "/usr/local/bin/claude")

        command = build_claude_prompt_command(
            cli_path="/usr/local/bin/claude",
            prompt="Reply with OK",
            claude_model="sonnet",
        )
        self.assertEqual(
            command,
            [
                "/usr/local/bin/claude",
                "-p",
                "Reply with OK",
                "--output-format",
                "text",
                "--tools",
                "",
                "--permission-mode",
                "dontAsk",
                "--no-session-persistence",
                "--model",
                "sonnet",
            ],
        )

    def test_sanitize_and_normalize_output(self) -> None:
        self.assertEqual(
            sanitize_claude_stdout("\u001b[32mOK\u001b[0m\n"),
            "OK",
        )
        self.assertEqual(
            normalize_claude_bfcl_output(
                "print(calculate_triangle_area(base=10, height=5))",
                ["calculate_triangle_area"],
            ),
            "calculate_triangle_area(base=10, height=5)",
        )

    def test_ensure_runtime_layout_writes_env_file(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            runtime_root = Path(td)
            cli_workspace = ensure_runtime_layout(
                runtime_root=runtime_root,
                cli_path="/usr/local/bin/claude",
                claude_model="sonnet",
            )
            env_text = (runtime_root / ".env").read_text(encoding="utf-8")
            self.assertIn("CLAUDE_CLI_PATH=/usr/local/bin/claude", env_text)
            self.assertIn("CLAUDE_MODEL=sonnet", env_text)
            self.assertTrue(cli_workspace.exists())

    def test_check_claude_login_surfaces_auth_errors(self) -> None:
        class _Proc:
            def __init__(self, returncode: int, stdout: str = "", stderr: str = "") -> None:
                self.returncode = returncode
                self.stdout = stdout
                self.stderr = stderr

        with patch(
            "subprocess.run",
            return_value=_Proc(0, stdout="OK\n"),
        ):
            self.assertEqual(
                check_claude_login("/usr/local/bin/claude", "sonnet"),
                "OK",
            )

        with patch(
            "subprocess.run",
            return_value=_Proc(
                1,
                stderr="Your organization does not have access to Claude.\n",
            ),
        ):
            with self.assertRaises(SystemExit):
                check_claude_login("/usr/local/bin/claude", "sonnet")

    def test_build_markdown_report_uses_claude_title(self) -> None:
        summary = {
            "categories": ["simple_python"],
            "cases_per_category": 3,
            "metrics_percent_point": {
                "Overall Acc": {"baseline": 10.0, "ralph": 12.0, "delta": 2.0},
            },
        }
        report = build_markdown_report(
            summary=summary,
            provider_name="Claude CLI",
            model_name="claude-cli-default",
            baseline_display="baseline",
            ralph_display="ralph",
            runtime_root=Path("/tmp/runtime"),
            run_ids_enabled=True,
        )
        self.assertIn("# Claude CLI Prompt-Mode BFCL Benchmark Report", report)
        self.assertIn("- Provider: `Claude CLI`", report)
        self.assertIn("| Overall Acc | 10.00 | 12.00 | +2.00 |", report)


if __name__ == "__main__":
    unittest.main()
