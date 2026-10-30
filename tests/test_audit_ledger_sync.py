"""Bug 4: one shared log_audit, audit_logs <-> hash-chain ledger never silently diverge."""
import random
import sqlite3
import threading
import uuid

import pytest

import audit_dpdp
import audit_utils
import database
import search_routes
import search_service
import server


def _q(sql, params=()):
    conn = database.get_connection()
    try:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()


def _row(action):
    rows = _q("SELECT * FROM audit_logs WHERE action = ?", (action,))
    assert len(rows) == 1, rows
    return rows[0]


def _blocks(audit_id):
    return _q("SELECT * FROM cryptographic_audit_ledger WHERE audit_log_id = ?", (audit_id,))


@pytest.fixture(autouse=True)
def _fast(monkeypatch):
    monkeypatch.setattr(audit_utils.time, "sleep", lambda s: None)


def _act(tag):
    return f"T4_{tag}_{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------- unit
def test_ledger_failure_flags_row_not_lost(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("ledger down")
    monkeypatch.setattr(audit_utils, "record_tamper_evident_event", boom)
    act = _act("FAIL")
    audit_utils.log_audit(act, "d")  # must not raise
    r = _row(act)
    assert r["ledger_synced"] == 0
    assert _blocks(r["id"]) == []


def test_ledger_success_on_second_attempt_stays_synced(monkeypatch):
    real = audit_dpdp.record_tamper_evident_event
    calls = {"n": 0}

    def flaky(*a, **k):
        calls["n"] += 1
        if calls["n"] == 1:
            raise sqlite3.OperationalError("database is locked")
        return real(*a, **k)
    monkeypatch.setattr(audit_utils, "record_tamper_evident_event", flaky)
    act = _act("RETRY")
    audit_utils.log_audit(act, "d")
    r = _row(act)
    assert calls["n"] == 2
    assert r["ledger_synced"] == 1
    assert len(_blocks(r["id"])) == 1


def test_audit_insert_failure_raises(monkeypatch):
    class Bad:
        def execute(self, *a, **k):
            raise sqlite3.OperationalError("disk I/O error")

        def close(self):
            pass
    monkeypatch.setattr(audit_utils, "get_connection", lambda: Bad())
    with pytest.raises(sqlite3.OperationalError):
        audit_utils.log_audit(_act("RAISE"), "d")


def test_recorded_values_match_old_server_semantics():
    act = _act("VALS")
    audit_utils.log_audit(act, "d", role="ROLEX", user={"full_name": "Jane", "role": "CLERK"})
    r = _row(act)
    assert (r["user_name"], r["user_role"], r["ip_address"]) == ("Jane", "ROLEX", "127.0.0.1")
    act2 = _act("VALS2")
    audit_utils.log_audit(act2, "d")
    r2 = _row(act2)
    assert (r2["user_name"], r2["user_role"]) == ("Hon'ble User (NLUJ)", "Hon'ble Justice / Judicial User")
    b = _blocks(r["id"])[0]
    assert (b["user_name"], b["user_role"], b["action"], b["details"], b["ip_address"]) == \
        ("Jane", "ROLEX", act, "d", "127.0.0.1")


# ---------------------------------------------------------------- structural
def test_single_log_audit_implementation():
    assert server.log_audit is search_service.log_audit is audit_utils.log_audit
    assert search_routes.log_audit is audit_utils.log_audit


def test_documents_audit_path_writes_through_audit_utils(client, hdr):
    r = client.post("/api/documents", data={"doc_type": "PETITION", "matter_key": "wp-b4-1", "title": "B4"},
                    files={"file": ("b4.txt", b"Petitioner v. State. Facts: x.", "text/plain")}, headers=hdr["Clerk"])
    assert r.status_code == 201, r.text
    did = r.json()["id"]
    rows = _q("SELECT * FROM audit_logs WHERE action='DOCUMENT_UPLOADED' AND details LIKE ?", (f"document {did}%",))
    assert len(rows) == 1 and rows[0]["ledger_synced"] == 1
    assert len(_blocks(rows[0]["id"])) == 1


# ---------------------------------------------------------------- reconciliation endpoint
def _make_pending(monkeypatch, n):
    ids = []
    with monkeypatch.context() as m:
        def boom(*a, **k):
            raise RuntimeError("x")
        m.setattr(audit_utils, "record_tamper_evident_event", boom)
        for _ in range(n):
            a = _act("PEND")
            audit_utils.log_audit(a, "pending detail")
            ids.append(_row(a)["id"])
    return ids


def test_resync_endpoint_converges_idempotent_and_gated(client, hdr, monkeypatch):
    client.post("/api/admin/audit/resync-ledger", headers=hdr["Admin"])  # drain leftovers from earlier tests
    ids = _make_pending(monkeypatch, 3)
    for role in ("Justice", "Clerk", "Student", "Auditor"):
        assert client.post("/api/admin/audit/resync-ledger", headers=hdr[role]).status_code == 403
    assert client.post("/api/admin/audit/resync-ledger").status_code == 401
    assert _q("SELECT COUNT(*) c FROM audit_logs WHERE ledger_synced = 0")[0]["c"] >= 3

    r = client.post("/api/admin/audit/resync-ledger", headers=hdr["Admin"])
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["pending_before"] >= 3 and s["resynced"] == s["pending_before"] and s["still_pending"] == 0
    assert _q("SELECT COUNT(*) c FROM audit_logs WHERE ledger_synced = 0")[0]["c"] == 0
    for i in ids:
        assert len(_blocks(i)) == 1
    assert audit_dpdp.verify_ledger_integrity()["status"] == "VERIFIED_SECURE"
    assert client.get("/api/audit/ledger/verify", headers=hdr["Auditor"]).json()["status"] == "VERIFIED_SECURE"
    # one summary audit event for the run, none per resynced row
    assert len(_q("SELECT id FROM audit_logs WHERE action='AUDIT_LEDGER_RESYNC' AND details LIKE ?",
                  (f'%"resynced": {s["resynced"]}%',))) >= 1

    again = client.post("/api/admin/audit/resync-ledger", headers=hdr["Admin"]).json()
    assert again == {"pending_before": 0, "resynced": 0, "still_pending": 0}


def test_resync_never_double_appends(monkeypatch):
    (rid,) = _make_pending(monkeypatch, 1)
    # a "concurrent process" already wrote the block but crashed before flipping the flag
    r = _q("SELECT * FROM audit_logs WHERE id=?", (rid,))[0]
    audit_dpdp.record_tamper_evident_event(r["user_name"], r["user_role"], r["action"], r["details"],
                                           r["ip_address"], audit_log_id=rid)
    audit_utils.resync_pending_ledger()
    assert len(_blocks(rid)) == 1
    assert _q("SELECT ledger_synced s FROM audit_logs WHERE id=?", (rid,))[0]["s"] == 1


def test_resync_leaves_row_pending_if_ledger_still_down(monkeypatch):
    (rid,) = _make_pending(monkeypatch, 1)
    with monkeypatch.context() as m:
        m.setattr(audit_utils, "record_tamper_evident_event", lambda *a, **k: 1 / 0)
        out = audit_utils.resync_pending_ledger()
    assert out["still_pending"] >= 1
    assert _q("SELECT ledger_synced s FROM audit_logs WHERE id=?", (rid,))[0]["s"] == 0
    audit_utils.resync_pending_ledger()
    assert _q("SELECT ledger_synced s FROM audit_logs WHERE id=?", (rid,))[0]["s"] == 1


# ---------------------------------------------------------------- migration
def _fresh_db(path, with_ledger=True):
    c = sqlite3.connect(path)
    c.row_factory = sqlite3.Row
    c.execute("""CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL,
        user_name TEXT NOT NULL, user_role TEXT NOT NULL, action TEXT NOT NULL, details TEXT, ip_address TEXT)""")
    if with_ledger:
        c.execute("""CREATE TABLE cryptographic_audit_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL, user_name TEXT NOT NULL, user_role TEXT NOT NULL, action TEXT NOT NULL,
            details TEXT NOT NULL, ip_address TEXT NOT NULL, prev_hash TEXT NOT NULL, current_hash TEXT NOT NULL)""")
    return c


def _ins_audit(c, ts, action, user="U", details="d"):
    return c.execute("INSERT INTO audit_logs (timestamp,user_name,user_role,action,details,ip_address) "
                     "VALUES (?,?,?,?,?,?)", (ts, user, "R", action, details, "1.1.1.1")).lastrowid


def _ins_block(c, ts, action, user="U", details="d"):
    c.execute("INSERT INTO cryptographic_audit_ledger (timestamp,user_name,user_role,action,details,ip_address,"
              "prev_hash,current_hash) VALUES (?,?,?,?,?,?,?,?)", (ts, user, "R", action, details, "1.1.1.1", "p", "c"))


def test_backfill_flags_exactly_rows_without_counterpart(tmp_path):
    c = _fresh_db(str(tmp_path / "m.db"))
    ok1 = _ins_audit(c, "2026-03-01 10:00:00", "A")
    _ins_block(c, "2026-03-01 10:00:00.412", "A")                 # same second
    ok2 = _ins_audit(c, "2026-03-01 10:00:59", "B")
    _ins_block(c, "2026-03-01 10:01:00.003", "B")                 # crossed a second boundary
    miss1 = _ins_audit(c, "2026-03-02 09:00:00", "C")             # no block
    miss2 = _ins_audit(c, "2026-03-02 09:00:01", "A", user="V")   # no block for this user
    # two identical audit rows but only ONE block -> exactly one is flagged (one-to-one matching)
    d1 = _ins_audit(c, "2026-03-03 09:00:00", "D")
    d2 = _ins_audit(c, "2026-03-03 09:00:00", "D")
    _ins_block(c, "2026-03-03 09:00:00.100", "D")
    _ins_block(c, "2026-03-09 09:00:00.100", "ORPHAN")            # block with no audit row: untouched
    c.commit()
    database._m009_audit_ledger_sync(c)
    c.commit()
    flagged = {r[0] for r in c.execute("SELECT id FROM audit_logs WHERE ledger_synced = 0")}
    assert {miss1, miss2} <= flagged and ok1 not in flagged and ok2 not in flagged
    assert len(flagged & {d1, d2}) == 1 and len(flagged) == 3
    linked = {r[0] for r in c.execute(
        "SELECT audit_log_id FROM cryptographic_audit_ledger WHERE audit_log_id IS NOT NULL")}
    assert {ok1, ok2} <= linked and len(linked) == 3
    assert c.execute("SELECT audit_log_id FROM cryptographic_audit_ledger WHERE action='ORPHAN'").fetchone()[0] is None
    snap = (c.execute("SELECT id, ledger_synced FROM audit_logs ORDER BY id").fetchall(),
            c.execute("SELECT id, audit_log_id FROM cryptographic_audit_ledger ORDER BY id").fetchall())
    snap = [[tuple(r) for r in part] for part in snap]
    database._m009_audit_ledger_sync(c)  # idempotent re-run
    c.commit()
    again = [[tuple(r) for r in part] for part in (
        c.execute("SELECT id, ledger_synced FROM audit_logs ORDER BY id").fetchall(),
        c.execute("SELECT id, audit_log_id FROM cryptographic_audit_ledger ORDER BY id").fetchall())]
    assert snap == again


def test_migration_creates_missing_ledger_table(tmp_path):
    c = _fresh_db(str(tmp_path / "n.db"), with_ledger=False)
    rid = _ins_audit(c, "2026-03-01 10:00:00", "A")
    c.commit()
    database._m009_audit_ledger_sync(c)
    assert c.execute("SELECT ledger_synced FROM audit_logs WHERE id=?", (rid,)).fetchone()[0] == 0
    cols = {r[1] for r in c.execute("PRAGMA table_info(cryptographic_audit_ledger)")}
    assert "audit_log_id" in cols


def test_run_migrations_idempotent_and_registered():
    assert "009_audit_ledger_sync" in [n for n, _ in database.MIGRATIONS]
    assert database.run_migrations() == []
    cols = {r["name"] for r in _q("PRAGMA table_info(audit_logs)")}
    assert "ledger_synced" in cols


def test_acceptance_verified_blocks_match_audit_rows(client, hdr):
    """After backfill + one resync every audit row has exactly one linked block; the verify endpoint
    counts all blocks = audit rows + legacy blocks that never had an audit_logs row."""
    conn = database.get_connection()
    database._m009_audit_ledger_sync(conn)  # as on a fresh deploy: fixture audit rows have no blocks
    conn.commit()
    conn.close()
    client.post("/api/admin/audit/resync-ledger", headers=hdr["Admin"])
    client.post("/api/admin/audit/resync-ledger", headers=hdr["Admin"])
    audits = _q("SELECT COUNT(*) c FROM audit_logs")[0]["c"]
    linked = _q("SELECT COUNT(DISTINCT audit_log_id) c FROM cryptographic_audit_ledger "
                "WHERE audit_log_id IS NOT NULL")[0]["c"]
    assert linked == audits
    unlinked = _q("SELECT COUNT(*) c FROM cryptographic_audit_ledger WHERE audit_log_id IS NULL")[0]["c"]
    v = client.get("/api/audit/ledger/verify", headers=hdr["Auditor"]).json()
    assert v["status"] == "VERIFIED_SECURE"
    assert v["total_blocks_verified"] == audits + unlinked
    assert _q("SELECT COUNT(*) c FROM audit_logs WHERE ledger_synced = 0")[0]["c"] == 0


# ---------------------------------------------------------------- concurrency
def test_concurrent_log_audit_no_silent_loss(monkeypatch):
    real = audit_dpdp.record_tamper_evident_event
    rng = random.Random(7)
    rng_lock = threading.Lock()

    def sometimes_fail(*a, **k):
        with rng_lock:
            fail = rng.random() < 0.45
        if fail:
            raise sqlite3.OperationalError("database is locked")
        return real(*a, **k)
    monkeypatch.setattr(audit_utils, "record_tamper_evident_event", sometimes_fail)

    # real lock contention: another connection holds the write lock for a while
    blocker = database.get_connection()
    blocker.execute("BEGIN IMMEDIATE")

    def _release():
        blocker.rollback()
        blocker.close()
    release = threading.Timer(0.3, _release)
    release.start()

    tag = _act("CONC")
    errors = []

    def work(i):
        try:
            audit_utils.log_audit(f"{tag}_{i}", f"n{i}")
        except Exception as e:  # pragma: no cover
            errors.append(e)
    threads = [threading.Thread(target=work, args=(i,)) for i in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(30)
    release.join()
    assert not errors, errors

    rows = _q("SELECT * FROM audit_logs WHERE action LIKE ?", (f"{tag}_%",))
    assert len(rows) == 20
    for r in rows:
        n = len(_blocks(r["id"]))
        assert n <= 1
        if r["ledger_synced"] == 1:
            assert n == 1, "synced row without ledger block = silent loss"
        else:
            assert n == 0
    assert any(r["ledger_synced"] == 0 for r in rows)  # the failure injection did bite
    monkeypatch.setattr(audit_utils, "record_tamper_evident_event", real)
    audit_utils.resync_pending_ledger()
    for r in _q("SELECT * FROM audit_logs WHERE action LIKE ?", (f"{tag}_%",)):
        assert r["ledger_synced"] == 1 and len(_blocks(r["id"])) == 1
    assert audit_dpdp.verify_ledger_integrity()["status"] == "VERIFIED_SECURE"
