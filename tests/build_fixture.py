"""Builds a small fixture SQLite DB (about 300 judgments) for the API contract tests.

Never touches data/vidhi_legal.db: the caller passes the target path and
GYANAM_DB_PATH must already point at it before ``database`` is imported.
"""
import json
import os
import sys

BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

COURTS = ["Supreme Court of India", "Gujarat High Court", "Bombay High Court", "Rajasthan High Court"]
CURATED_CASE_ID = "SCI-1993-ECIL"  # also listed in backend/seeder.py
OVERRULED_A = ("SCI-1990-OVERRULED-A", "Old Rule v. State", "(1990) 1 SCC 100")
OVERRULED_B = ("SCI-1985-OVERRULED-B", "Ancient Doctrine v. Union", "(1985) 2 SCC 200")
OVERRULER_A = ("SCI-2010-OVERRULER-A", "New Rule v. State", "(2010) 11 SCC 441")
OVERRULER_B = ("SCI-2005-OVERRULER-B", "Modern Doctrine v. Union", "(2005) 3 SCC 300")

_COLS = ["case_id", "title", "court", "bench", "judges", "judgment_date", "year", "citation",
         "statutes_considered", "subject_category", "headnote", "ratio_decidendi", "full_text",
         "precedent_status", "overruled_by", "cases_cited", "citing_cases_count",
         "source_url", "source_pdf_url", "cnr_number", "docket_number"]


def _insert(cur, **kw):
    row = {c: kw.get(c) for c in _COLS}
    row["full_text"] = row["full_text"] or "record"
    row["precedent_status"] = row["precedent_status"] or "FOLLOWED"
    row["court"] = row["court"] or COURTS[0]
    cur.execute(f"INSERT INTO judgments ({','.join(_COLS)}) VALUES ({','.join('?' * len(_COLS))})",
                [row[c] for c in _COLS])
    return cur.lastrowid


def build(db_path):
    import database
    assert os.path.abspath(database.DB_PATH) == os.path.abspath(db_path), "DB_PATH mismatch; set GYANAM_DB_PATH first"
    assert "vidhi_legal.db" not in db_path
    database.init_db()
    conn = database.get_connection()
    cur = conn.cursor()

    # One curated landmark (real headnote, in seeder.py)
    _insert(cur, case_id=CURATED_CASE_ID, title="Managing Director, ECIL v. B. Karunakar",
            court=COURTS[0], bench="Constitution Bench (5 Judges)", judges="K. Ramaswamy, J.",
            judgment_date="1993-11-01", year=1993, citation="(1993) 4 SCC 727",
            statutes_considered="Article 311(2)", subject_category="Service Law",
            headnote="Natural justice: supply of inquiry report to delinquent employee is mandatory.",
            ratio_decidendi="The delinquent has a right to the inquiry report before penalty.",
            citing_cases_count=1420, source_url="https://example.test/ecil",
            source_pdf_url="https://example.test/ecil.pdf",
            cases_cited=json.dumps(["Old Rule v. State (1990) 1 SCC 100", "Unknown Case v. Nobody (1970) 9 SCC 9"]))

    # Two overruled pairs
    for old, new in ((OVERRULED_A, OVERRULER_A), (OVERRULED_B, OVERRULER_B)):
        _insert(cur, case_id=new[0], title=new[1], citation=new[2], year=int(new[2][1:5]),
                judgment_date=f"{new[2][1:5]}-05-05", bench="Constitution Bench (5 Judges)",
                headnote="Judicial determination by the court (template).",
                ratio_decidendi="Judicial determination by the court (template).",
                citing_cases_count=35, source_pdf_url=f"https://example.test/{new[0]}.pdf",
                cases_cited=json.dumps([f"{old[1]} {old[2]} (overruled)"]))
        _insert(cur, case_id=old[0], title=old[1], citation=old[2], year=int(old[2][1:5]),
                judgment_date=f"{old[2][1:5]}-03-03", precedent_status="OVERRULED",
                overruled_by=f"{new[1]} {new[2]}", bench="Division Bench (2 Judges)",
                headnote="Judicial determination by the court (template).",
                ratio_decidendi="Judicial determination by the court (template).",
                citing_cases_count=35, source_pdf_url=f"https://example.test/{old[0]}.pdf")

    # Bulk template rows up to 300
    n = 0
    while cur.execute("SELECT COUNT(*) FROM judgments").fetchone()[0] < 300:
        n += 1
        year = 1960 + (n % 60)
        court = COURTS[n % len(COURTS)]
        _insert(cur, case_id=f"FIX-{n:04d}", title=f"State {n} v. Person {n}", court=court,
                bench="Single Judge", judges="A. B. Kumar, J.", year=year,
                judgment_date=f"{year}-01-{(n % 27) + 1:02d}",
                citation=f"({year}) {n} SCC {n + 1}",
                statutes_considered="Sections 302, 420 IPC; theft 379",
                subject_category="Criminal Law",
                headnote=f"Judicial determination by {court} in matter {n} concerning bail theft murder cheating.",
                ratio_decidendi=f"Judicial determination by {court} in matter {n}.",
                full_text=f"Record of case {n}: bail, theft, murder, cheating, dowry, article 226 writ.",
                citing_cases_count=35, source_pdf_url=f"https://example.test/fix/{n}.pdf",
                docket_number=f"CRL/{n}/{year}")

    ids = {r["case_id"]: r["id"] for r in cur.execute("SELECT id, case_id FROM judgments")}

    def content(precedents=(), verified=()):
        return json.dumps({
            "retrieved_precedents": [{"id": ids[c], "case_id": c} for c in precedents],
            "verified_citations": [{"status": "OVERRULED_WARNING",
                                    "case_data": {"id": ids[c], "citation": OVERRULED_A[2]}} for c in verified],
        })

    drafts = [
        ("Raman v. State", "CRL.A. 11/2024", "DRAFT", content()),
        ("Raman v. State", "CRL.A. 11/2024 (Airport P.S.)", "UNDER_REVIEW", content()),
        ("Mehta v. Union", "WP 77/2023", "SIGNED", content()),
        ("Shah v. State", "SB CRL 5/2022", "CHAMBER_REVIEW", content()),
        ("Citing Old Rule v. State", "CRL.A. 99/2024", "DRAFT", content([OVERRULED_A[0]], [OVERRULED_A[0]])),
        ("Gupta v. State", "MACP 3/2021", "DRAFT", content()),
    ]
    for i, (title, cn, st, cj) in enumerate(drafts, 1):
        cur.execute("""INSERT INTO draft_judgments (case_title, case_number, court, date_created, petitioner, respondent,
            facts, issues, petitioner_arguments, respondent_arguments, statutory_provisions, draft_content_json,
            status, reviewed_by, version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)""",
                    (title, cn, "High Court", f"2026-01-{i:02d} 10:00", "P", "R", "f", "i", "pa", "ra", "s", cj, st, "Test"))

    for i in range(40):
        cur.execute("INSERT INTO audit_logs (timestamp, user_name, user_role, action, details, ip_address) VALUES (?,?,?,?,?,?)",
                    (f"2026-0{1 + i % 9}-{(i % 27) + 1:02d} 09:00:00", "Fixture User" if i % 2 else "Other Person",
                     "RESEARCHER", "SEARCH_QUERY" if i % 3 else "SAVE_DRAFT",
                     f"Query: bail {i}" if i % 3 else f"Draft ID {1 + i % 6}: x", "127.0.0.1"))
    conn.commit()
    conn.close()
    return ids
