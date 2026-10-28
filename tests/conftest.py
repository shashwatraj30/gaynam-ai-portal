import os
import sys
import tempfile

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "backend"))

# Isolation: set BEFORE any backend import so data/vidhi_legal.db is never opened.
_TMP = tempfile.mkdtemp(prefix="gyanam_test_")
os.environ["GYANAM_DB_PATH"] = os.path.join(_TMP, "mini.db")
os.environ["GYANAM_UPLOAD_DIR"] = os.path.join(_TMP, "uploads")
os.environ["GYANAM_DOCS_DIR"] = os.path.join(_TMP, "docs")
os.makedirs(os.environ["GYANAM_DOCS_DIR"], exist_ok=True)
for _n in ("USER_MANUAL.md", "COMMERCIAL_PROPOSAL_GYANAM_AI.md"):
    with open(os.path.join(os.environ["GYANAM_DOCS_DIR"], _n), "w", encoding="utf-8") as _f:
        _f.write("# " + _n + "\nfixture document\n")
os.environ["GYANAM_JWT_SECRET"] = "test-secret-not-for-production"
os.environ["GYANAM_ENFORCE_AUTH"] = "1"
os.environ["GYANAM_ALLOW_LEGACY_HEADER"] = "0"  # default is off; legacy tests opt in with monkeypatch
# Empty, not popped: envload.load_env() only fills a key that is *absent* from os.environ, so popping
# it here would let a real .env file on the machine silently repopulate it (and tests would start
# making live Gemini calls). An empty string stays "present", so it can never be backfilled.
os.environ["GEMINI_API_KEY"] = ""

import build_fixture  # noqa: E402

FIXTURE_IDS = build_fixture.build(os.environ["GYANAM_DB_PATH"])

from fastapi.testclient import TestClient  # noqa: E402
import server  # noqa: E402
import database  # noqa: E402

assert os.path.abspath(database.DB_PATH).startswith(os.path.abspath(_TMP))

# Role label -> SSO target_role
ROLE_TARGETS = {
    "Justice": "HON_JUSTICE",
    "Clerk": "LAW_CLERK",
    "Student": "STUDENT",
    "Auditor": "AUDITOR",
    "Admin": "ADMINISTRATOR",
}


@pytest.fixture(scope="session")
def client():
    with TestClient(server.app) as c:
        yield c


@pytest.fixture(scope="session")
def hdr(client):
    out = {}
    for label, target in ROLE_TARGETS.items():
        r = client.post("/api/auth/sso/nluj", json={"target_role": target})
        assert r.status_code == 200, r.text
        out[label] = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return out


@pytest.fixture(scope="session")
def ids():
    return FIXTURE_IDS


@pytest.fixture()
def draft_payload():
    return {
        "case_title": "Test v. State", "case_number": "CRL.A. 500/2025", "court": "High Court",
        "facts": "f", "issues": "i", "petitioner_arguments": "p", "respondent_arguments": "r",
        "statutory_provisions": "s", "draft_content_json": {"sections": []},
    }
