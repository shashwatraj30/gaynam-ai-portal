# Brief for coding agents (v3: Documents + parity)

Read first: `CLAUDE.md`, `docs/API_V3_CONTRACT.md` (the contract you build against), and for frontend work
`frontend/app/CONTRACT.md`. Plan context: `docs/legacy_review/COMPARE_A.md`, `COMPARE_B.md`.

## Working rules
- Edit ONLY the files your prompt says you own. If you need a change in a file you don't own, write it as an exact
  patch request in `docs/wiring/<your-agent-name>.md` (file, function, before/after) and carry on.
- Do not commit, push, install packages or download anything. No new dependencies.
- Match the surrounding code's style, naming and comment density. No fabricated data: when something is unknown,
  return empty values and say so.
- The project path is very long. Python `open()` on it can fail and Windows tools reject it as a working dir.
  Run tests from your OWN short copy, never a shared one:
  ```bash
  P="C:/Users/Lenovo/AppData/Roaming/Claude/scratch-workspaces/1f0f15cc-7249-4f18-a6b1-507fed63660b/d9a21309-0164-4be9-8d58-2242dbb710e6/scratch-2026-10-24-c3e964/gyanam/Gyanam_AI_Portal"
  R=/c/Temp/gy_<agentname>; rm -rf $R; mkdir -p $R && cp -r "$P/backend" "$P/tests" "$P/pytest.ini" $R/ && mkdir -p $R/frontend && cp -r "$P/frontend/app" $R/frontend/
  cd $R && PYTHONPATH="C:/Temp/gy_dev" python -m pytest -q -p no:cacheprovider --ignore=tests/e2e
  ```
  Frontend tests: `cd "$P/frontend/app" && node --test "tests/*.test.js"` (Node works on the long path).
  Re-copy after each change. Edit files in the real project path (`$P/...`), never in your copy.
- Tests use the fixture DB (`tests/conftest.py`, `tests/build_fixture.py`), never `data/vidhi_legal.db`.
- Finish with: all tests you own passing, the full backend suite passing (or failures explained as caused by another
  agent's in-progress file), and a short report: files changed, endpoints/functions added, tests added, open issues.
