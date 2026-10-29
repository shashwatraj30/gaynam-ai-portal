import sqlite3
import json
import os
from typing import List, Dict, Any, Optional

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
DB_PATH = os.environ.get("GYANAM_DB_PATH") or os.path.join(PROJECT_ROOT, "data", "vidhi_legal.db")
# Optional: a populated DB baked into the image at build time (see Dockerfile), used to seed an
# empty persistent volume on first boot -- a one-time deploy-time alternative to transferring a
# large file over a separate connection (SFTP/SSH) after the fact. Normally absent; harmless no-op.
SEED_DB_PATH = os.environ.get("GYANAM_SEED_DB_PATH") or os.path.join(PROJECT_ROOT, "seed", "vidhi_legal.db")

def _seed_if_empty():
    if os.path.exists(SEED_DB_PATH) and not os.path.exists(DB_PATH):
        import shutil
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        print(f"Seeding database from {SEED_DB_PATH} -> {DB_PATH}")
        shutil.copyfile(SEED_DB_PATH, DB_PATH)

def _connect():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
    except sqlite3.DatabaseError:
        conn.close()  # release the file handle before the caller tries to delete it (esp. on Windows)
        raise
    return conn

def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    _seed_if_empty()
    try:
        conn = _connect()
    except sqlite3.DatabaseError as e:
        # A prior write (e.g. an interrupted upload or a killed process) left a corrupt file.
        # There is nothing to recover from the file itself, and crash-looping on every boot is
        # worse than starting clean -- remove it (and its WAL/SHM/journal siblings) and recreate.
        print(f"WARNING: {DB_PATH} is corrupt ({e}); recreating a fresh database.")
        for suffix in ("", "-wal", "-shm", "-journal"):
            try:
                os.remove(DB_PATH + suffix)
            except FileNotFoundError:
                pass
        conn = _connect()
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
    run_migrations(conn)
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


# ---------------------------------------------------------------- versioned migrations
# Each migration is idempotent (IF NOT EXISTS / column checks) and recorded in schema_migrations,
# so running it on an existing database (including the 329 MB corpus DB) only adds what is missing.

def _columns(conn, table):
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _add_column(conn, table, column, decl):
    cols = _columns(conn, table)
    if cols and column not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")


def _m002_documents(conn):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        matter_key TEXT,
        doc_type TEXT NOT NULL DEFAULT 'OTHER',
        title TEXT NOT NULL,
        original_name TEXT,
        stored_name TEXT,
        mime TEXT,
        size INTEGER DEFAULT 0,
        sha256 TEXT,
        source TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'READ',
        chars INTEGER DEFAULT 0,
        pages INTEGER,
        redactions_json TEXT,
        uploaded_by TEXT,
        uploaded_role TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_documents_matter ON documents(matter_key);
    CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at);
    CREATE TABLE IF NOT EXISTS document_text (
        document_id TEXT PRIMARY KEY,
        text_redacted TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS document_extractions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        fields_json TEXT NOT NULL,
        issues_json TEXT NOT NULL,
        authorities_json TEXT,
        confirmed INTEGER NOT NULL DEFAULT 0,
        saved_by TEXT,
        saved_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_doc_extr ON document_extractions(document_id, version);
    CREATE TABLE IF NOT EXISTS document_pins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL,
        judgment_id INTEGER NOT NULL,
        issue_ref TEXT,
        note TEXT,
        added_by TEXT,
        added_at TEXT NOT NULL,
        UNIQUE(document_id, judgment_id)
    );
    """)
    _add_column(conn, "draft_judgments", "document_id", "TEXT")


def _m003_saved_searches(conn):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS saved_searches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        query TEXT NOT NULL,
        filters_json TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id);
    """)


def _m004_user_status(conn):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS user_status (
        user_id TEXT PRIMARY KEY,
        active INTEGER NOT NULL DEFAULT 1,
        changed_by TEXT,
        changed_at TEXT NOT NULL
    );
    """)


def _m005_draft_version_note(conn):
    _add_column(conn, "draft_versions", "note", "TEXT")


def _m006_paragraphs_treatments(conn):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS judgment_paragraphs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        judgment_id INTEGER NOT NULL,
        para_no INTEGER NOT NULL,
        text TEXT NOT NULL,
        page INTEGER,
        UNIQUE(judgment_id, para_no)
    );
    CREATE TABLE IF NOT EXISTS judgment_treatments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        citing_id INTEGER NOT NULL,
        cited_id INTEGER NOT NULL,
        treatment TEXT NOT NULL,
        para_no INTEGER,
        source_ref TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_treat_cited ON judgment_treatments(cited_id);
    CREATE INDEX IF NOT EXISTS idx_treat_citing ON judgment_treatments(citing_id);
    """)


def _m007_lineages(conn):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS lineage_streams (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subtitle TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS lineage_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stream_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        judgment_id INTEGER,
        year INTEGER,
        title TEXT NOT NULL,
        citation TEXT,
        holding TEXT,
        coram TEXT,
        bench TEXT,
        impact TEXT,
        overruled INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_lineage_nodes_stream ON lineage_nodes(stream_id, sort_order);
    """)


def _m008_audit_indexes(conn):
    conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(timestamp)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)")


MIGRATIONS = [
    ("001_draft_columns", migrate_draft_columns),
    ("002_documents", _m002_documents),
    ("003_saved_searches", _m003_saved_searches),
    ("004_user_status", _m004_user_status),
    ("005_draft_version_note", _m005_draft_version_note),
    ("006_paragraphs_treatments", _m006_paragraphs_treatments),
    ("007_lineages", _m007_lineages),
    ("008_audit_indexes", _m008_audit_indexes),
]


def run_migrations(conn=None):
    """Apply every migration not yet recorded in schema_migrations. Returns the names applied."""
    own = conn is None
    if own:
        conn = get_connection()
    applied = []
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
        done = {r[0] for r in conn.execute("SELECT name FROM schema_migrations").fetchall()}
        from datetime import datetime, timezone
        for name, fn in MIGRATIONS:
            if name in done:
                continue
            fn(conn)
            conn.execute("INSERT OR IGNORE INTO schema_migrations(name, applied_at) VALUES (?, ?)",
                         (name, datetime.now(timezone.utc).isoformat()))
            conn.commit()
            applied.append(name)
    finally:
        if own:
            conn.close()
    return applied


if __name__ == "__main__":
    init_db()
    print("Database schema successfully initialized on SSD at:", DB_PATH)
