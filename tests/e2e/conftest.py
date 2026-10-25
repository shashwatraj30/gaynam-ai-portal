"""End-to-end harness (Playwright for Python, no pytest-playwright needed).

* Builds the fixture DB (tests/build_fixture.py, never data/vidhi_legal.db) in a temp dir.
* Copies backend/ and frontend/app to a SHORT temp dir (Windows long-path safe) and starts
  ``python backend/server.py`` on a free port with GYANAM_UI=new and a test JWT secret.
* Fixtures: ``base_url`` (session), ``browser_name`` (parametrised by --e2e-browsers),
  ``browser``, ``context``/``page`` (fresh per test), ``login`` (token injection per role).

Environment:
  GYANAM_E2E_PYDEPS   extra sys.path entry that holds playwright (e.g. C:\\Temp\\gy_pw)
  GYANAM_E2E_WORKDIR  short working dir root (default C:\\Temp\\gy_e2e on Windows, system temp elsewhere)
  GYANAM_E2E_BASE_URL use an already running server instead of launching one
  GYANAM_E2E_HEADED=1 show browsers
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

_PYDEPS = os.environ.get("GYANAM_E2E_PYDEPS")
if _PYDEPS and _PYDEPS not in sys.path:
    sys.path.insert(0, _PYDEPS)

import pytest  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

ALL_BROWSERS = ("chromium", "firefox", "webkit")
ROLE_TARGETS = {
    "Justice": "HON_JUSTICE", "Clerk": "LAW_CLERK", "Faculty": "FACULTY",
    "Student": "STUDENT", "Auditor": "AUDITOR", "Admin": "ADMINISTRATOR",
}
# Names shown on the sign in page (backend/auth.py INSTITUTIONAL_DIRECTORY)
ROLE_NAMES = {
    "Justice": "Justice R.K. Sharma", "Clerk": "Siddharth Mathur", "Faculty": "Aparna Sengupta",
    "Student": "Ananya Rathore", "Auditor": "Rajeshwar Singhal", "Admin": "Harishankar Pareek",
}


def pytest_addoption(parser):
    parser.addoption("--e2e-browsers", default="chromium",
                     help="comma list of chromium,firefox,webkit or 'all'")
    parser.addoption("--update-baselines", action="store_true", default=False,
                     help="rewrite tests/e2e/baselines/*.png instead of comparing")


def pytest_configure(config):
    config.addinivalue_line("markers", "visual: screenshot regression")
    config.addinivalue_line("markers", "a11y: axe-core scans")
    config.addinivalue_line("markers", "perf: performance budget")


def _browsers(config):
    raw = config.getoption("--e2e-browsers")
    if raw.strip().lower() == "all":
        return list(ALL_BROWSERS)
    return [b.strip() for b in raw.split(",") if b.strip()]


def pytest_generate_tests(metafunc):
    if "browser_name" in metafunc.fixturenames:
        metafunc.parametrize("browser_name", _browsers(metafunc.config), scope="session")


def _lp(path):
    """Extended-length path prefix so very long workspace paths copy on Windows."""
    path = os.path.abspath(path)
    pre = chr(92) * 2 + "?" + chr(92)
    return pre + path if os.name == "nt" and not path.startswith(pre) else path


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _work_root():
    explicit = os.environ.get("GYANAM_E2E_WORKDIR")
    if explicit:
        os.makedirs(explicit, exist_ok=True)
        return explicit
    if os.name == "nt":
        os.makedirs(r"C:\Temp\gy_e2e", exist_ok=True)
        return r"C:\Temp\gy_e2e"
    return tempfile.gettempdir()


def launch_app():
    """Generator: boots a fresh app + fixture DB, yields its base URL, tears everything down afterwards."""
    external = os.environ.get("GYANAM_E2E_BASE_URL")
    if external:
        yield external.rstrip("/")
        return
    work = tempfile.mkdtemp(prefix="r", dir=_work_root())
    shutil.copytree(_lp(os.path.join(ROOT, "backend")), os.path.join(work, "backend"),
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    os.makedirs(os.path.join(work, "frontend"))
    shutil.copytree(_lp(os.path.join(ROOT, "frontend", "app")), os.path.join(work, "frontend", "app"),
                    ignore=shutil.ignore_patterns("tests", "node_modules"))
    seal = os.path.join(ROOT, "frontend", "nluj_seal.png")
    if os.path.exists(seal):
        shutil.copy(_lp(seal), os.path.join(work, "frontend", "nluj_seal.png"))
    os.makedirs(os.path.join(work, "tests"))
    shutil.copy(_lp(os.path.join(ROOT, "tests", "build_fixture.py")), os.path.join(work, "tests", "build_fixture.py"))
    docs = os.path.join(work, "docs")
    os.makedirs(docs)
    for n in ("USER_MANUAL.md", "COMMERCIAL_PROPOSAL_GYANAM_AI.md"):
        with open(os.path.join(docs, n), "w", encoding="utf-8") as f:
            f.write(f"# {n}\n\nFixture document for the e2e suite.\n")
    db = os.path.join(work, "e2e.db")
    env = dict(os.environ)
    env.update(
        GYANAM_DB_PATH=db, GYANAM_UPLOAD_DIR=os.path.join(work, "uploads"), GYANAM_DOCS_DIR=docs,
        GYANAM_JWT_SECRET="e2e-secret-not-for-production", GYANAM_ENFORCE_AUTH="1",
        GYANAM_ALLOW_LEGACY_HEADER="0", GYANAM_UI="new", PYTHONUTF8="1", PYTHONIOENCODING="utf-8",
        GEMINI_API_KEY="",
    )
    # Build the fixture in a child process so this process never imports the backend.
    r = subprocess.run([sys.executable, "-c",
                        "import sys;sys.path.insert(0,'tests');import build_fixture as b;b.build(sys.argv[1])", db],
                       cwd=work, env=env, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    port = _free_port()
    env["PORT"] = str(port)
    log = open(os.path.join(work, "server.log"), "w", encoding="utf-8")
    proc = subprocess.Popen([sys.executable, os.path.join(work, "backend", "server.py")], cwd=work, env=env,
                            stdout=log, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{port}"
    deadline = time.time() + 60
    ok = False
    while time.time() < deadline:
        if proc.poll() is not None:
            break
        try:
            with urllib.request.urlopen(base + "/api/status", timeout=2) as resp:
                if resp.status == 200:
                    ok = True
                    break
        except Exception:
            time.sleep(0.3)
    if not ok:
        proc.kill()
        log.close()
        with open(os.path.join(work, "server.log"), encoding="utf-8", errors="replace") as f:
            raise RuntimeError("e2e server did not start:\n" + f.read()[-3000:])
    yield base
    proc.terminate()
    try:
        proc.wait(10)
    except Exception:
        proc.kill()
    log.close()
    shutil.rmtree(work, ignore_errors=True)


@pytest.fixture(scope="session")
def server():
    yield from launch_app()


@pytest.fixture(scope="session")
def base_url(server):
    return server


@pytest.fixture(scope="session")
def _pw():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        yield p


def _find_chromium(headless=True):
    """Fallback when the exact chromium revision wanted by playwright is missing: env override, else any
    installed chromium-*/chrome.exe (or headless shell) under ms-playwright. Never downloads."""
    import glob
    env = os.environ.get("GYANAM_E2E_CHROMIUM")
    if env and os.path.exists(env):
        return env
    roots = [os.environ.get("PLAYWRIGHT_BROWSERS_PATH"),
             os.path.join(os.environ.get("LOCALAPPDATA", ""), "ms-playwright"),
             os.path.expanduser("~/.cache/ms-playwright"), os.path.expanduser("~/Library/Caches/ms-playwright")]
    pats = ["chromium-*/chrome-win64/chrome.exe", "chromium-*/chrome-win/chrome.exe",
            "chromium-*/chrome-linux*/chrome", "chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium"]
    shells = ["chromium_headless_shell-*/chrome-headless-shell-win64/chrome-headless-shell.exe",
              "chromium_headless_shell-*/chrome-headless-shell-linux*/chrome-headless-shell"]
    for pats_ in ((pats + shells) if True else []):
        for r in filter(None, roots):
            hits = sorted(glob.glob(os.path.join(r, pats_)))
            if hits:
                return hits[-1]
    return None


@pytest.fixture(scope="session")
def browser(_pw, browser_name):
    headless = os.environ.get("GYANAM_E2E_HEADED") != "1"
    bt = getattr(_pw, browser_name)
    try:
        b = bt.launch(headless=headless)
    except Exception as exc:
        if browser_name != "chromium":
            pytest.skip(f"{browser_name} is not installed for this playwright ({str(exc).splitlines()[0][:120]}); "
                        "not downloading browsers")
        exe = _find_chromium(headless)
        if not exe:
            pytest.skip("no installed Chromium found under ms-playwright (set GYANAM_E2E_CHROMIUM)")
        b = bt.launch(headless=headless, executable_path=exe)
    yield b
    b.close()


_TOKENS = {}


def api_token(base_url, role):
    """SSO token for a role label (cached). Returns (token, user)."""
    key = (base_url, role)
    if key not in _TOKENS:
        req = urllib.request.Request(
            base_url + "/api/auth/sso/nluj", method="POST",
            data=json.dumps({"target_role": ROLE_TARGETS[role]}).encode(),
            headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            body = json.loads(r.read())
        _TOKENS[key] = (body["access_token"], body["user"])
    return _TOKENS[key]


class Tracker:
    """Collects console errors, page errors and failed requests."""
    def __init__(self, page):
        self.console, self.pageerrors, self.failed = [], [], []
        page.on("console", lambda m: self.console.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: self.pageerrors.append(str(e)))
        page.on("requestfailed", lambda r: self.failed.append(f"{r.method} {r.url} {r.failure}"))

    def errors(self, ignore=()):
        out = [c for c in self.console if not any(i in c for i in ignore)]
        return out + self.pageerrors


@pytest.fixture()
def context(browser, base_url):
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, base_url=base_url, accept_downloads=True)
    ctx.set_default_timeout(15000)
    yield ctx
    ctx.close()


@pytest.fixture()
def page(context):
    p = context.new_page()
    p.tracker = Tracker(p)
    yield p


def seed_script(token, user):
    return ("(()=>{try{if(!sessionStorage.getItem('__e2e_seeded')){"
            f"sessionStorage.setItem('gyanam.token',{json.dumps(token)});"
            f"sessionStorage.setItem('gyanam.user',{json.dumps(json.dumps(user))});"
            "sessionStorage.setItem('__e2e_seeded','1');}}catch(e){}})();")


@pytest.fixture()
def login(context, base_url):
    """login('Justice') seeds sessionStorage for the context (new pages open already signed in)."""
    def _login(role):
        token, user = api_token(base_url, role)
        context.add_init_script(seed_script(token, user))
        return token
    return _login


@pytest.fixture(scope="session")
def ids():
    """Deterministic ids from tests/build_fixture.py (judgment 1 = the curated ECIL landmark)."""
    return {"judgment": 1, "draft": 1, "review_draft": 4, "matter": "macp-3-2021"}
