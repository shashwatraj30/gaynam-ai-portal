"""Bug 5 (backend half): /api/dashboard_metrics must stay fast on a realistically sized corpus (~118k rows in prod)
and must return exactly what the former per-statistic full-table queries returned."""
import os
import random
import sqlite3
import statistics
import tempfile
import time

import pytest

import database

SLA_P95_SECONDS = 1.0
N_ROWS = 100_000
N_REQUESTS = 20

# Shape of the real corpus: a few huge High Courts, ~4% Supreme Court, two precedent statuses.
_COURT_WEIGHTS = [
    ("High Court of Gujarat", 37), ("High Court for State of Telangana", 17), ("Bombay High Court", 16),
    ("High Court of Uttarakhand", 12), ("High Court of Chhattisgarh", 5), ("Supreme Court of India", 4),
    ("Madras High Court", 3), ("High Court of Karnataka", 1), ("High Court of Rajasthan", 1),
    ("High Court of Delhi", 1), ("Calcutta High Court", 1), ("Gauhati High Court", 1), ("Patna High Court", 1),
]

LEGACY_SQL = {
    "total": "SELECT COUNT(*) FROM judgments",
    "sc": "SELECT COUNT(*) FROM judgments WHERE court LIKE '%Supreme Court%'",
    "top": "SELECT court, COUNT(*) as c FROM judgments GROUP BY court ORDER BY c DESC LIMIT 8",
    "status": "SELECT precedent_status, COUNT(*) as c FROM judgments GROUP BY precedent_status",
}


def _legacy(conn):
    total = conn.execute(LEGACY_SQL["total"]).fetchone()[0]
    sc = conn.execute(LEGACY_SQL["sc"]).fetchone()[0]
    top = [(r[0], r[1]) for r in conn.execute(LEGACY_SQL["top"]).fetchall()]
    status = {r[0]: r[1] for r in conn.execute(LEGACY_SQL["status"]).fetchall()}
    return total, sc, top, status


@pytest.fixture(scope="module")
def big_db(client):
    """Bulk-load ~100k judgments into a throwaway copy of the schema, then point the app at it for this module."""
    old_path = database.DB_PATH
    tmp = tempfile.mkdtemp(prefix="gyanam_perf_")
    path = os.path.join(tmp, "big.db")
    src = sqlite3.connect(old_path)  # users/roles/schema from the contract fixture, so the test tokens stay valid
    dst = sqlite3.connect(path)
    src.backup(dst)
    src.close()
    dst.close()
    database.DB_PATH = path
    try:
        conn = database.get_connection()
        rng = random.Random(7)
        names, weights = zip(*_COURT_WEIGHTS)
        rows = []
        for i in range(N_ROWS):
            court = rng.choices(names, weights)[0]
            status = "OVERRULED" if i % 50000 == 7 else "FOLLOWED"
            rows.append((f"PERF-{i}", f"Case {i}", court, "x", status))
        conn.executemany(
            "INSERT INTO judgments (case_id, title, court, full_text, precedent_status) VALUES (?,?,?,?,?)", rows)
        conn.commit()
        conn.close()
        yield path
    finally:
        database.DB_PATH = old_path


def _p95(samples):
    return statistics.quantiles(samples, n=20, method="inclusive")[-1]


def test_dashboard_metrics_p95_under_sla_on_100k_rows(client, hdr, big_db):
    h = hdr["Justice"]
    assert client.get("/api/dashboard_metrics", headers=h).status_code == 200  # warm the page cache
    samples = []
    for _ in range(N_REQUESTS):
        t0 = time.perf_counter()
        r = client.get("/api/dashboard_metrics", headers=h)
        samples.append(time.perf_counter() - t0)
        assert r.status_code == 200
    assert _p95(samples) < SLA_P95_SECONDS, f"p95 {_p95(samples):.3f}s over {SLA_P95_SECONDS}s SLA"


def test_big_db_response_matches_legacy_queries(client, hdr, big_db):
    body = client.get("/api/dashboard_metrics", headers=hdr["Justice"]).json()
    conn = sqlite3.connect(big_db)
    total, sc, top, status = _legacy(conn)
    conn.close()
    assert body["total_judgments"] == total >= N_ROWS
    assert body["supreme_court_count"] == sc and body["high_court_count"] == total - sc
    assert [(c["court"], c["c"]) for c in body["top_courts"]] == sorted(top, key=lambda x: (-x[1], x[0]))
    assert body["status_counts"] == status


def test_aggregates_use_covering_indexes(big_db):
    conn = sqlite3.connect(big_db)
    for sql in ("SELECT court, COUNT(*) FROM judgments GROUP BY court",
                "SELECT precedent_status, COUNT(*) FROM judgments GROUP BY precedent_status"):
        plan = " ".join(r[3] for r in conn.execute("EXPLAIN QUERY PLAN " + sql))
        assert "COVERING INDEX" in plan, plan
    conn.close()


def test_fixture_response_shape_and_values_match_legacy(client, hdr):
    """On the small contract fixture: same field names/types and the same Supreme Court count as the old LIKE."""
    body = client.get("/api/dashboard_metrics", headers=hdr["Justice"]).json()
    conn = database.get_connection()
    total, sc, top, status = _legacy(conn)
    conn.close()
    assert set(body) >= {"total_judgments", "supreme_court_count", "high_court_count", "top_courts", "status_counts"}
    assert isinstance(body["total_judgments"], int) and isinstance(body["status_counts"], dict)
    assert all(set(c) == {"court", "c"} for c in body["top_courts"])
    assert body["supreme_court_count"] == sc > 0
    assert body["total_judgments"] == total and body["status_counts"] == status
    assert [(c["court"], c["c"]) for c in body["top_courts"]] == sorted(top, key=lambda x: (-x[1], x[0]))
