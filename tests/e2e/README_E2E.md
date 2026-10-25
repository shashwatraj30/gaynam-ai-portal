# End-to-end tests (Playwright for Python)

Boots the real app on a free port with a fixture database (`tests/build_fixture.py`, never `data/vidhi_legal.db`),
copied with `backend/` and `frontend/app/` to a short temp dir (`C:\Temp\gy_e2e` on Windows).

```
pip install -r requirements-dev.txt playwright pillow
python -m playwright install chromium firefox webkit
python -m pytest -c tests/e2e/pytest.ini tests/e2e                        # chromium
python -m pytest -c tests/e2e/pytest.ini tests/e2e --e2e-browsers=all     # chromium + firefox + webkit
python -m pytest -c tests/e2e/pytest.ini tests/e2e -k "journey or negative" --e2e-browsers=firefox
```

`-c tests/e2e/pytest.ini` keeps the backend `tests/conftest.py` out of the run; plain `pytest` ignores `tests/e2e`.
If Playwright lives outside site-packages set `GYANAM_E2E_PYDEPS=<dir>` (and `PLAYWRIGHT_BROWSERS_PATH`).

| File | What |
|---|---|
| `test_smoke.py` | every route in plan 5.1 for every role that may see it (h1, no console errors); denied roles land on `#/forbidden` |
| `test_journeys.py` | the 12 step judge's day, Student, Auditor, Administrator journeys |
| `test_negative.py` | invalid/expired token, 401 mid session, offline banner, 409 conflict, empty search, OCR fallback, 404 |
| `test_keyboard.py` | sign in tab order, skip link, Ctrl K palette and focus return |
| `test_a11y.py` | axe-core (vendored `vendor/axe.min.js` 4.10.2) at 1440 and 390 px, en and hi; serious or critical fails |
| `test_perf.py` | shell interactive under 1.5 s and shell JS budget |
| `test_visual.py` | screenshot baselines at 1440, 1024, 390 |

## Visual baselines

Stored in `tests/e2e/baselines/<browser>-<platform>/<page>-<width>.png` (font rasterisation differs per OS and browser,
so each combination has its own set). Diff = share of pixels whose channel differs by more than 8; limit 0.2 %.
A missing baseline for your browser/platform **skips** the test.

```
python -m pytest -c tests/e2e/pytest.ini tests/e2e/test_visual.py --update-baselines                    # chromium, this OS
python -m pytest -c tests/e2e/pytest.ini tests/e2e/test_visual.py --update-baselines --e2e-browsers=all
```

Review the PNGs, then commit them. Failures write `tests/e2e/.artifacts/<name>.actual.png` and `.diff.png`.
Linux baselines for CI: run the `e2e-nightly` workflow with `update_baselines` and commit the uploaded
`baselines/*-linux` folders.
