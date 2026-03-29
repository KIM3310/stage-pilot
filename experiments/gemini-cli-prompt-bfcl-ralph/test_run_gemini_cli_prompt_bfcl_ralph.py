#!/usr/bin/env python3
from __future__ import annotations

import runpy
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT_PATH = (
    Path(__file__).resolve().parent / "run_gemini_cli_prompt_bfcl_ralph.py"
)
MOD = runpy.run_path(str(SCRIPT_PATH))

validate_args = MOD["validate_args"]
resolve_cli_path = MOD["resolve_cli_path"]
sanitize_gemini_stdout = MOD["sanitize_gemini_stdout"]
parse_gemini_json_output = MOD["parse_gemini_json_output"]
build_gemini_prompt_command = MOD["build_gemini_prompt_command"]
ensure_runtime_layout = MOD["ensure_runtime_layout"]
check_gemini_login = MOD["check_gemini_login"]
build_markdown_report = MOD["build_markdown_report"]
extract_allowed_function_calls_from_text = MOD["extract_allowed_function_calls_from_text"]
normalize_gemini_bfcl_output = MOD["normalize_gemini_bfcl_output"]


class TestRunGeminiCliPromptBfclRalph(unittest.TestCase):
    def test_validate_args_rejects_missing_model_or_cli_fields(self) -> None:
        bad_cases = [
            SimpleNamespace(
                cases_per_category=1,
                num_threads=1,
                temperature=0.0,
                model_name="",
                provider_name="Gemini CLI",
                cli_path="gemini",
                gemini_model="gemini-2.5-flash-lite",
                error_report_top_n=5,
                request_timeout_sec=30.0,
                max_step_limit=20,
                ralph_variant="default",
            ),
            SimpleNamespace(
                cases_per_category=1,
                num_threads=1,
                temperature=0.0,
                model_name="gemini-cli-default",
                provider_name="Gemini CLI",
                cli_path="gemini",
                gemini_model=" ",
                error_report_top_n=5,
                request_timeout_sec=30.0,
                max_step_limit=20,
                ralph_variant="default",
            ),
        ]
        for args in bad_cases:
            with self.subTest(args=args):
                with self.assertRaises(SystemExit):
                    validate_args(args)

    def test_resolve_cli_path_and_command_building(self) -> None:
        with patch("shutil.which", return_value="/usr/local/bin/gemini"):
            self.assertEqual(resolve_cli_path("gemini"), "/usr/local/bin/gemini")

        command = build_gemini_prompt_command(
            cli_path="/usr/local/bin/gemini",
            prompt="Reply with OK",
            gemini_model="gemini-2.5-flash-lite",
        )
        self.assertEqual(
            command,
            [
                "/usr/local/bin/gemini",
                "-p",
                "Reply with OK",
                "-o",
                "json",
                "-m",
                "gemini-2.5-flash-lite",
            ],
        )

    def test_parse_gemini_json_output_ignores_cached_credentials_banner(self) -> None:
        payload = parse_gemini_json_output(
            'Loaded cached credentials.\n{"response":"OK","stats":{"models":{}}}\n'
        )
        self.assertEqual(payload["response"], "OK")
        self.assertEqual(
            sanitize_gemini_stdout(
                "Loaded cached credentials.\nfirst line\nsecond line\n"
            ),
            "first line\nsecond line",
        )

    def test_ensure_runtime_layout_writes_metadata_env_file(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            runtime_root = Path(td)
            cli_workspace = ensure_runtime_layout(
                runtime_root=runtime_root,
                cli_path="/usr/local/bin/gemini",
                gemini_model="gemini-2.5-flash-lite",
            )
            env_text = (runtime_root / ".env").read_text(encoding="utf-8")
            self.assertIn("GEMINI_CLI_PATH=/usr/local/bin/gemini", env_text)
            self.assertIn("GEMINI_MODEL=gemini-2.5-flash-lite", env_text)
            self.assertTrue(cli_workspace.exists())

    def test_check_gemini_login_surfaces_missing_credentials(self) -> None:
        class _Proc:
            def __init__(self, returncode: int, stdout: str = "", stderr: str = "") -> None:
                self.returncode = returncode
                self.stdout = stdout
                self.stderr = stderr

        with patch(
            "subprocess.run",
            return_value=_Proc(
                0,
                stdout="No previous sessions found for this project.\nLoaded cached credentials.\n",
            ),
        ):
            self.assertEqual(
                check_gemini_login("/usr/local/bin/gemini"),
                "Loaded cached credentials.",
            )

        with patch(
            "subprocess.run",
            return_value=_Proc(1, stderr="Please login first\n"),
        ):
            with self.assertRaises(SystemExit):
                check_gemini_login("/usr/local/bin/gemini")

    def test_build_markdown_report_uses_gemini_title(self) -> None:
        summary = {
            "categories": ["simple_python"],
            "cases_per_category": 3,
            "metrics_percent_point": {
                "Overall Acc": {"baseline": 10.0, "ralph": 12.0, "delta": 2.0},
            },
        }
        report = build_markdown_report(
            summary=summary,
            provider_name="Gemini CLI",
            model_name="gemini-cli-default",
            baseline_display="baseline",
            ralph_display="ralph",
            runtime_root=Path("/tmp/runtime"),
            run_ids_enabled=True,
        )
        self.assertIn("# Gemini CLI Prompt-Mode BFCL Benchmark Report", report)
        self.assertIn("- Provider: `Gemini CLI`", report)
        self.assertIn("| Overall Acc | 10.00 | 12.00 | +2.00 |", report)

    def test_normalizes_gemini_wrapper_outputs_into_bfcl_calls(self) -> None:
        allowed = ["calculate_triangle_area", "triangle_properties.get", "spotify.play"]

        self.assertEqual(
            normalize_gemini_bfcl_output(
                "print(calculate_triangle_area(base=10, height=5))",
                allowed,
            ),
            "calculate_triangle_area(base=10, height=5)",
        )
        self.assertEqual(
            normalize_gemini_bfcl_output(
                "spotify.play(song_name='one')\nspotify.play(song_name='two')",
                allowed,
            ),
            "[spotify.play(song_name='one'), spotify.play(song_name='two')]",
        )
        self.assertEqual(
            extract_allowed_function_calls_from_text(
                "triangletriangle_properties.get(side1=5, side2=4, side3=3)",
                allowed,
            ),
            ["triangle_properties.get(side1=5, side2=4, side3=3)"],
        )


if __name__ == "__main__":
    unittest.main()
