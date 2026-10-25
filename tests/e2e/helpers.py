"""Shared helpers for the e2e suite (selectors, route table, axe runner, visual diff)."""
import json
import os
import re
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
AXE_PATH = os.path.join(HERE, "vendor", "axe.min.js")
BASELINE_DIR = os.path.join(HERE, "baselines")

ALL_ROLES = ("Justice", "Clerk", "Faculty", "Student", "Admin", "Auditor")
SEARCHERS = ("Justice", "Clerk", "Faculty", "Student", "Admin")  # SEARCH
DRAFTERS = ("Justice", "Clerk")  # DRAFT_FULL / UPLOAD_PLEADING

# Console noise that is a property of the fixture data, not of the app: fixture source_pdf_url hosts are
# example.test, which the (correct) CSP frame-src refuses to frame.
# WebKit also logs "Refused to apply a stylesheet..." for its own built-in <select> popup sheet under any
# style-src 'self' policy (reproduced on a bare page with a CSP meta and one <select>); not an app defect.
CONSOLE_IGNORE = ("Framing 'https://example.test", "(frame-src) at https://example.test",
                  "Refused to load https://example.test", "Refused to load https://example.test",
                  "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'")

PASTED_PLEADING = (
    "IN THE HIGH COURT OF JUDICATURE FOR RAJASTHAN AT JODHPUR\n"
    "S.B. Criminal Miscellaneous Bail Application No. 1234/2026\n"
    "Ramesh Kumar S/o Mohan Lal .... Petitioner\nVersus\nState of Rajasthan .... Respondent\n"
    "FACTS: The petitioner was arrested on 5.1.2026 in FIR No. 12/2026 P.S. Airport for offences under "
    "Sections 420 and 406 IPC.\n"
    "ISSUES: 1. Whether the petitioner is entitled to bail under Section 439 CrPC.\n"
    "PRAYER: It is therefore prayed that the bail application be allowed.\n"
)


def routes(ids):
    """(name, hash route, roles allowed to see it) per plan 5.1. ``ids`` = dict(judgment, draft, matter)."""
    return [
        ("home", "/", ALL_ROLES),
        ("research", "/research", SEARCHERS),
        ("judgment", f"/judgments/{ids['judgment']}", SEARCHERS),
        ("citation-check", "/judgments/check", SEARCHERS),
        ("matters", "/matters", DRAFTERS),
        ("matter", f"/matters/{ids['matter']}", DRAFTERS),
        ("intake", "/matters/new", DRAFTERS),
        ("drafts", "/drafts", DRAFTERS),
        ("studio", f"/drafts/{ids['draft']}", DRAFTERS),
        ("review", f"/drafts/{ids['review_draft']}/review", DRAFTERS),
        ("graph", "/graph", SEARCHERS),
        ("alerts", "/alerts", DRAFTERS),
        ("audit", "/audit", ("Justice", "Admin", "Auditor")),
        ("chamber", "/chamber", ("Admin",)),
        ("library", "/library", ALL_ROLES),
        ("settings", "/settings", ALL_ROLES),
        ("forbidden", "/forbidden", ALL_ROLES),
        ("not-found", "/not-found", ALL_ROLES),
    ]


def api_get(base_url, path, token):
    req = urllib.request.Request(base_url + path, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def api_status(base_url, path, token=None, method="GET"):
    """HTTP status of an API call (urllib raises on 4xx, so unwrap it)."""
    req = urllib.request.Request(base_url + path, method=method, headers={"Authorization": f"Bearer {token}"} if token else {})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def goto(page, route):
    """Open a hash route and wait until THAT route has rendered (skeleton gone, a fresh h1 present).

    Hash navigation inside the SPA does not reload the page, so the previous page's h1 would satisfy a naive
    wait (Firefox and WebKit dispatch hashchange later than Chromium). Old h1s are tagged stale first."""
    same = False
    try:
        same = page.evaluate("(r) => location.hash === '#' + r", route)
        if not same:
            page.evaluate("() => document.querySelectorAll('h1').forEach((e) => e.setAttribute('data-stale', '1'))")
    except Exception:
        pass  # about:blank before the first navigation
    page.goto("/app/#" + route)
    wait_ready(page)


def wait_ready(page, timeout=15000):
    page.wait_for_selector("h1:not([data-stale])", state="visible", timeout=timeout)
    page.wait_for_function(
        "() => !document.querySelector('[aria-busy=\"true\"]') && !document.querySelector('.g-skeleton')", timeout=timeout)


def dialog(page):
    """The open confirm dialog (role=alertdialog) or modal (role=dialog); a lazy locator, safe to build early."""
    return page.locator("[role=alertdialog], [role=dialog]").last


def sign_in_via_ui(page, role_name_fragment):
    """Real sign in: open the app, pick the profile card, press Continue."""
    page.goto("/app/")
    page.wait_for_url(re.compile(r"#/signin"))
    page.get_by_label(re.compile(role_name_fragment)).check()
    page.get_by_role("button", name=re.compile(r"^Continue as")).click()
    page.wait_for_function("() => !location.hash.startsWith('#/signin')")
    wait_ready(page)


def run_axe(page, tags=("wcag2a", "wcag2aa", "wcag21a", "wcag21aa")):
    """Run axe-core (vendored) on the current page; returns violations list (serious/critical only)."""
    if not page.evaluate("() => typeof window.axe !== 'undefined'"):
        with open(AXE_PATH, encoding="utf-8") as f:
            page.evaluate(f.read())  # evaluate, not <script>: the app CSP forbids inline scripts
    result = page.evaluate(
        "async (tags) => { const r = await axe.run(document, {runOnly: {type: 'tag', values: tags}}); "
        "return r.violations.map(v => ({id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => ({"
        "target: n.target.join(' '), summary: (n.failureSummary || '').slice(0, 300)}))})); }", list(tags))
    return [v for v in result if v["impact"] in ("serious", "critical")]


def format_violations(vs):
    out = []
    for v in vs:
        out.append(f"[{v['impact']}] {v['id']}: {v['help']}")
        for n in v["nodes"][:4]:
            out.append(f"    {n['target']}  ::  {n['summary'].replace(chr(10), ' ')[:200]}")
    return "\n".join(out)


def blank_png(path):
    """A valid 64x64 white PNG with no text (pure stdlib), for OCR-failure tests."""
    import struct
    import zlib

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + b"\xff" * 64 for _ in range(64))
    data = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 64, 64, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(data)
    return path


# ---------- visual regression ----------
def _pixels(png_bytes):
    from PIL import Image
    import io
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    return im


def diff_ratio(a_bytes, b_bytes, tolerance=8):
    """Fraction of pixels whose any channel differs by more than ``tolerance`` (0..1). Size mismatch = 1.0."""
    from PIL import Image, ImageChops
    a, b = _pixels(a_bytes), _pixels(b_bytes)
    if a.size != b.size:
        return 1.0, None
    diff = ImageChops.difference(a, b)
    mask = diff.point(lambda v: 255 if v > tolerance else 0).convert("L")
    bad = sum(1 for p in mask.getdata() if p)
    total = a.size[0] * a.size[1]
    return bad / total, diff


def lp(path):
    """Windows extended-length prefix: workspaces can sit under paths longer than MAX_PATH."""
    path = os.path.abspath(path)
    pre = chr(92) * 2 + "?" + chr(92)
    return pre + path if os.name == "nt" and not path.startswith(pre) else path


def compare_baseline(name, shot_bytes, update=False, threshold=0.002, out_dir=None):
    """Compare ``shot_bytes`` to baselines/<name>.png. Returns (ok, message). Plan 10.5: threshold 0.2%."""
    path = os.path.join(BASELINE_DIR, name + ".png")
    os.makedirs(lp(os.path.dirname(path)), exist_ok=True)
    if update or not os.path.exists(path):
        with open(lp(path), "wb") as f:
            f.write(shot_bytes)
        return True, "baseline written"
    with open(lp(path), "rb") as f:
        base = f.read()
    ratio, diff = diff_ratio(base, shot_bytes)
    if ratio <= threshold:
        return True, f"diff {ratio:.4%}"
    if out_dir:
        os.makedirs(lp(out_dir), exist_ok=True)
        with open(lp(os.path.join(out_dir, name.replace("/", "_") + ".actual.png")), "wb") as f:
            f.write(shot_bytes)
        if diff is not None:
            diff.save(lp(os.path.join(out_dir, name.replace("/", "_") + ".diff.png")))
    return False, f"{name}: {ratio:.3%} of pixels differ (limit {threshold:.1%}); see tests/e2e/.artifacts"


SECTION_KEYS = [
    "section_1_case_title", "section_2_case_number", "section_3_introduction", "section_4_brief_facts",
    "section_5_submissions_petitioner", "section_6_submissions_respondent", "section_7_issues_framed",
    "section_8_statutory_provisions", "section_9_evidence_analysis", "section_10_applicable_principles",
    "section_11_discussion_reasoning", "section_12_application_of_law", "section_13_findings_on_issues",
    "section_14_conclusion_disposition", "section_15_citations_authorities",
]


def create_draft(base_url, token, title="E2E Conflict v. State", number="E2E/1/2026"):
    """POST /api/save_draft with all 15 sections filled; returns the new draft id."""
    body = {
        "case_title": title, "case_number": number, "court": "High Court", "facts": "f", "issues": "i",
        "petitioner_arguments": "p", "respondent_arguments": "r", "statutory_provisions": "s",
        "draft_content_json": {"sections": {k: f"Text of {k}." for k in SECTION_KEYS}, "engine": "template"},
    }
    req = urllib.request.Request(base_url + "/api/save_draft", method="POST", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())["draft_id"]
