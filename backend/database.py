import sqlite3
import json
import os
from typing import List, Dict, Any, Optional

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
DB_PATH = os.environ.get("GYANAM_DB_PATH") or os.path.join(PROJECT_ROOT, "data", "vidhi_legal.db")

def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA mmap_size = 3000000000;")
    conn.execute("PRAGMA cache_size = -200000;")
    conn.execute("PRAGMA temp_store = MEMORY;")
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # 1. Main Judgments Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS judgments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        petitioner TEXT,
        respondent TEXT,
        court TEXT NOT NULL,
        bench TEXT,
        judges TEXT,
        judgment_date TEXT,
        year INTEGER,
        citation TEXT,
        equivalent_citations TEXT,
        statutes_considered TEXT,
        subject_category TEXT,
        headnote TEXT,
        ratio_decidendi TEXT,
        full_text TEXT NOT NULL,
        precedent_status TEXT DEFAULT 'FOLLOWED',  -- FOLLOWED, OVERRULED, DISTINGUISHED, REFERRED_TO_LARGER_BENCH, AFFIRMED
        overruled_by TEXT,
        cases_cited TEXT,  -- JSON list
        citing_cases_count INTEGER DEFAULT 0,
        source_url TEXT,
        cnr_number TEXT,
        docket_number TEXT,
        source_pdf_url TEXT,
        provenance_authority TEXT
    );
    """)

    # 2. Virtual Table for Full-Text Search (FTS5 with BM25)
    cursor.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS judgments_fts USING fts5(
        title,
        court,
        bench,
        judges,
        citation,
        equivalent_citations,
        statutes_considered,
        subject_category,
        headnote,
        ratio_decidendi,
        full_text,
        content='judgments',
        content_rowid='id',
        tokenize='unicode61 remove_diacritics 2'
    );
    """)

    # Triggers to keep FTS index synchronized
    cursor.execute("""
    CREATE TRIGGER IF NOT EXISTS judgments_ai AFTER INSERT ON judgments BEGIN
        INSERT INTO judgments_fts(rowid, title, court, bench, judges, citation, equivalent_citations, statutes_considered, subject_category, headnote, ratio_decidendi, full_text)
        VALUES (new.id, new.title, new.court, new.bench, new.judges, new.citation, new.equivalent_citations, new.statutes_considered, new.subject_category, new.headnote, new.ratio_decidendi, new.full_text);
    END;
    """)

    cursor.execute("""
    CREATE TRIGGER IF NOT EXISTS judgments_ad AFTER DELETE ON judgments BEGIN
        INSERT INTO judgments_fts(judgments_fts, rowid, title, court, bench, judges, citation, equivalent_citations, statutes_considered, subject_category, headnote, ratio_decidendi, full_text)
        VALUES('delete', old.id, old.title, old.court, old.bench, old.judges, old.citation, old.equivalent_citations, old.statutes_considered, old.subject_category, old.headnote, old.ratio_decidendi, old.full_text);
    END;
    """)

    cursor.execute("""
    CREATE TRIGGER IF NOT EXISTS judgments_au AFTER UPDATE ON judgments BEGIN
        INSERT INTO judgments_fts(judgments_fts, rowid, title, court, bench, judges, citation, equivalent_citations, statutes_considered, subject_category, headnote, ratio_decidendi, full_text)
        VALUES('delete', old.id, old.title, old.court, old.bench, old.judges, old.citation, old.equivalent_citations, old.statutes_considered, old.subject_category, old.headnote, old.ratio_decidendi, old.full_text);
        INSERT INTO judgments_fts(rowid, title, court, bench, judges, citation, equivalent_citations, statutes_considered, subject_category, headnote, ratio_decidendi, full_text)
        VALUES (new.id, new.title, new.court, new.bench, new.judges, new.citation, new.equivalent_citations, new.statutes_considered, new.subject_category, new.headnote, new.ratio_decidendi, new.full_text);
    END;
    """)

    # 3. Draft Judgments Table (Tender Section 7 & 12)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS draft_judgments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_title TEXT NOT NULL,
        case_number TEXT NOT NULL,
        court TEXT NOT NULL,
        date_created TEXT NOT NULL,
        petitioner TEXT,
        respondent TEXT,
        facts TEXT,
        issues TEXT,
        petitioner_arguments TEXT,
        respondent_arguments TEXT,
        statutory_provisions TEXT,
        draft_content_json TEXT NOT NULL,
        verified_citations_json TEXT,
        status TEXT DEFAULT 'DRAFT', -- DRAFT, UNDER_REVIEW, APPROVED, SIGNED
        reviewed_by TEXT,
        version INTEGER DEFAULT 1
    );
    """)

    # 4. Institutional Audit Logs (Tender Section 16 & 21)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        user_name TEXT NOT NULL,
        user_role TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT
    );
    """)

    conn.commit()
    migrate_draft_columns(conn)
    conn.close()

def migrate_draft_columns(conn):
    """Safe ALTER migrations (idempotent) for draft_judgments."""
    try:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(draft_judgments)").fetchall()}
        if not cols:
            return
        if "matter_key" not in cols:
            conn.execute("ALTER TABLE draft_judgments ADD COLUMN matter_key TEXT")
        if "version" not in cols:
            conn.execute("ALTER TABLE draft_judgments ADD COLUMN version INTEGER DEFAULT 1")
        conn.execute("""
        CREATE TABLE IF NOT EXISTS draft_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draft_id INTEGER NOT NULL,
            version INTEGER NOT NULL,
            saved_at TEXT NOT NULL,
            saved_by TEXT,
            status TEXT,
            snapshot_json TEXT
        );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_draft_versions_draft ON draft_versions(draft_id, version)")
        conn.commit()
    except Exception as e:
        print(f"Draft migration warning: {e}")

if __name__ == "__main__":
    init_db()
    print("Database schema successfully initialized on SSD at:", DB_PATH)
