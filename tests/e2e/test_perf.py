"""Performance budget (plan 10.5): shell interactive < 1.5 s on the local server (cold cache, median of 5),
and the JS the shell needs before first paint. Numbers are printed (run with -s) and asserted."""
import statistics

import pytest

from conftest import api_token, seed_script
from helpers import wait_ready

pytestmark = pytest.mark.perf

SHELL_INTERACTIVE_MS = 1500
SHELL_JS_BYTES = 120 * 1024  # plan: JS under 120 KB uncompressed for the shell (see test for what counts)

_MEASURE = """() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const h1 = document.querySelector('h1');
  const js = performance.getEntriesByType('resource').filter(r => /\\.js(\\?|$)/.test(r.name));
  const shellOnly = js.filter(r => !/\\/js\\/pages\\/[^/]+\\.js|\\/i18n\\/pages\\//.test(r.name));
  const sum = a => a.reduce((n, r) => n + (r.decodedBodySize || 0), 0);
  return {interactive: performance.now(), domInteractive: nav.domInteractive, load: nav.loadEventEnd,
          jsAll: sum(js), jsShell: sum(shellOnly), jsFiles: js.length, h1: !!h1};
}"""


@pytest.mark.parametrize("path,role", [("#/", "Justice"), ("#/research", "Justice")], ids=["home", "research"])
def test_shell_interactive_budget(browser, base_url, browser_name, path, role, capsys):
    runs = []
    for _ in range(5):
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, base_url=base_url)
        tok, user = api_token(base_url, role)
        ctx.add_init_script(seed_script(tok, user))
        page = ctx.new_page()
        try:
            page.goto("/app/" + path)
            wait_ready(page)
            runs.append(page.evaluate(_MEASURE))
        finally:
            ctx.close()
    med = statistics.median(r["interactive"] for r in runs)
    js_shell = statistics.median(r["jsShell"] for r in runs)
    js_all = statistics.median(r["jsAll"] for r in runs)
    with capsys.disabled():
        print(f"\n[perf] {browser_name} {path}: interactive median {med:.0f} ms "
              f"(runs {[round(r['interactive']) for r in runs]}), shell JS {js_shell / 1024:.0f} KB, "
              f"all JS loaded {js_all / 1024:.0f} KB in {runs[0]['jsFiles']} files")
    assert med < SHELL_INTERACTIVE_MS, f"shell interactive {med:.0f} ms exceeds {SHELL_INTERACTIVE_MS} ms"
    assert js_shell < SHELL_JS_BYTES, f"shell JS {js_shell / 1024:.0f} KB exceeds budget"
