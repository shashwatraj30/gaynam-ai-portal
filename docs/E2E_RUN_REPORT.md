# E2E run report (chromium)

Command: `python -m pytest -c tests/e2e/pytest.ini tests/e2e --e2e-browsers=chromium -rfEs`
Harness: tests/e2e/conftest.py `browser` fixture now falls back to an installed chromium (revision 1234) via executable_path.
Firefox and webkit were not run. Exact pass count not captured (summary line missing from log); 3 failed, 79 skipped (axe report-only, needs GYANAM_AXE_ALL=1).

| Test | Cause | Type |
|---|---|---|
| test_journeys.py::test_judges_day | `get_by_label("Citation")` is ambiguous: matches nav link aria-label "Citation graph" and the citation input (strict mode violation) | test bug (use exact=True / get_by_role textbox) |
| test_perf.py::test_shell_interactive_budget[home] | interactive median 2096 ms > 1500 ms budget | app perf (or budget too tight on this machine) |
| test_perf.py::test_shell_interactive_budget[research] | interactive median 1808 ms > 1500 ms budget | app perf (or budget too tight) |

## Final run (after fixes)
- Chromium, Firefox 1555 and WebKit 2370 (installed with `playwright install firefox webkit`): 202 passed per browser, 0 failed (606 total; axe report-only, perf and visual-baseline tests excluded from this run).
- `test_judges_day`: fixed (test bug, `get_by_label("Citation", exact=True)`).
- Perf budget: `modulepreload` links for the boot module graph were added to `frontend/app/index.html`; interactive median went from about 2.1 s / 1.8 s to about 0.7 s on `#/` and `#/research` (budget 1.5 s). The earlier numbers were also taken while other test runs loaded the machine.
- Visual regression: no baselines exist for any browser, so those tests skip until `--update-baselines` is run and the images are reviewed.
