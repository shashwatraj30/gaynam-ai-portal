# GYANAM AI Portal — Developer & Designer Guide

Welcome to the **GYANAM AI Legal Intelligence & Judgment Drafting Portal** codebase (built in collaboration with National Law University, Jodhpur).

This repository contains the complete end-to-end portal:
- **Backend**: Python (Starlette/FastAPI/Uvicorn), SQLite FTS5 (1,18,084 real Supreme Court & High Court judgments), Dual-Pipeline OCR (Apple Vision + Tesseract).
- **Frontend**: High-performance Single Page Application (SPA) in `frontend/index.html` with Tailwind CSS, custom judicial design tokens, Lucide icons, and zero-build vanilla JS.
- **Plans & Dossiers**: Full architectural tender dossiers, commercial proposals, presentation blueprints, and implementation roadmaps in `plans_and_blueprints/` and `docs/`.

---

## ⚡ Quickstart (Run in 2 Minutes)

### 1. Prerequisites
- Python 3.10, 3.11, or 3.12
- macOS / Linux / Windows WSL2

### 2. Setup Environment
```bash
# Navigate to project root
cd Gyanam_AI_Portal

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Launch Portal
```bash
# Easy launch via script:
./start_gyanam.sh

# Or directly via Python:
python backend/server.py
```

Open your browser at:
- **Main Portal**: `http://localhost:8090` (or `http://localhost:8080`)
- **Presentation Deck**: `http://localhost:8090/presentation.html`
- **Health Check**: `http://localhost:8090/api/health`

*Note: Changes made to `frontend/index.html` will reflect immediately upon browser refresh (no build/compile step needed).*

---

## 📂 Project Directory Structure

```
Gyanam_AI_Portal/
│
├── backend/                        # Core Python Backend Services
│   ├── server.py                   # Main HTTP Server & REST API endpoints
│   ├── database.py                 # SQLite FTS5 database connection & query engine
│   ├── judgment_engine.py          # AI synthesis, ratio decidendi & judgment drafting
│   ├── ocr_engine.py               # Dual-engine OCR (Apple Vision Framework / Tesseract)
│   ├── vision_ocr.m                # Native macOS Vision framework Objective-C bridge
│   ├── citation_verifier.py        # Validates case citations & section accuracy
│   ├── document_parser.py          # FIR, charge sheet, and bail petition text parser
│   ├── auth.py                     # RBAC authentication & session security
│   ├── export_engine.py            # PDF & Word export with court seals and signatures
│   ├── court_sync_daemon.py        # Background updater for judicial citations
│   ├── ingest_authentic_cases.py   # Bulk ingestion tool for legal databases
│   └── audit_dpdp.py               # DPDP Act 2023 tamper-proof audit logger
│
├── frontend/                       # Web Client & UI Assets
│   ├── index.html                  # Main SPA interface (6,700+ lines, modular tabs)
│   ├── presentation.html           # 10-slide interactive judicial deck
│   ├── nluj_seal.png               # High-res NLU Jodhpur institutional seal
│   ├── gyanam_emblem_transparent.png # Gyanam Ashoka emblem
│   ├── kelyvo_logo.png             # Technology partner logo
│   ├── nlu_campus_real.jpg         # Campus backdrop asset
│   ├── SYSTEM_ARCHITECTURE_AND_TENDER_DOSSIER_GYANAM_AI.pdf # Rendered architecture PDF
│   └── [sample FIR images]         # Test FIRs and court orders for OCR verification
│
├── data/
│   └── vidhi_legal.db              # 1,18,084 Full-Text Indexed SC/HC Judgment Corpus
│
├── plans_and_blueprints/           # High-Level Strategic & Commercial Documentation
│   ├── ANIMATED_PRESENTATION_BLUEPRINT_GYANAM_AI.md
│   ├── COMMERCIAL_QUOTATION_AND_PROPOSAL_GYANAM_AI.md
│   ├── GYANAM_AI_GAMMA_PRESENTATION.md
│   ├── chatgpt_hindi_voice_guide_gyanam_ai.md
│   ├── handwritten_fir_ocr_audit_and_fix.md
│   ├── institutional_rollout_phase1_phase2.md
│   └── presentation_guide_nlu_jodhpur.md
│
├── docs/                           # Tender compliance specs & system documentation
│   └── [Technical specifications, architecture diagrams, user manuals]
│
├── sample_docs/                    # Sample bail petitions, degraded FIRs, and pleadings
├── presentation_screenshots/       # Reference UI/UX screenshots
├── scripts/                        # Benchmarks and test automation scripts
├── Dockerfile                      # Production container spec
├── docker-compose.yml              # Multi-container deployment configuration
├── nginx.conf                      # Reverse proxy & SSL termination configuration
├── requirements.txt                # Python package dependencies
└── start_gyanam.sh                 # Single-click launcher script
```

---

## 🎨 UI/UX Architecture & How to Modify

The frontend is intentionally designed as a zero-friction, single-bundle application inside `frontend/index.html`. This means:
1. **No complex Node/NPM build chains** required to tweak styles or test layouts.
2. Uses **Tailwind CSS (via CDN)** with extensive custom classes defined in the `<style>` block at the top of `index.html`.
3. All interactive states are managed cleanly via vanilla JavaScript functions attached to standard DOM events.

### Primary Navigation Tabs in `frontend/index.html`:
1. **Intake & OCR Studio (`#tab-intake`)**: Document upload zone, dual-pipeline OCR scanner, degraded FIR preview, extracted metadata sidebar.
2. **Legal Research Hub (`#tab-research`)**: Full-text semantic search over 1.18 Lakh judgments, filters by court/bench/year, citation badges.
3. **Judgment Drafting Studio (`#tab-judgment`)**: Split-view editor for drafting judicial orders, live AI ratio synthesis, auto-citation insertion.
4. **Citation Lineage Graph (`#tab-citation-graph`)**: Visual precedence tree showing overruled vs. upheld judgments.
5. **DPDP Audit Vault (`#tab-audit`)**: Tamper-evident ledger showing access logs, query times, and pseudonymized records.
6. **Admin / RBAC Panel (`#tab-admin`)**: Role-based access control, bench allocation, and quota management.

See `UI_UX_DESIGN_GUIDELINES.md` for full design tokens, color palette, typography hierarchy, and recommended visual enhancements.

---

## 🔌 Core Backend API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/search` | `POST` | Full-text FTS5 search across 1.18 Lakh judgments |
| `/api/ocr/process_brief` | `POST` | Uploads PDF/image FIR and returns structured extracted text |
| `/api/draft_judgment` | `POST` | Generates structured judicial order based on FIR & citations |
| `/api/verify_single_citation`| `POST` | Real-time check if citation is authentic, overruled, or active |
| `/api/export/pdf` | `POST` | Renders drafted judgment into printable PDF with court seal |
| `/api/audit/logs` | `GET` | Fetches DPDP audit trail |
| `/api/health` | `GET` | Server status and database health |

---

## 🚀 Tips for the Designer / IT Lead
- If you prefer modern component frameworks (React, Vue, or Svelte), the backend REST APIs are 100% decoupled and return standard JSON. You can easily build a separate frontend frontend framework on top of `backend/server.py`.
- Feel free to restructure CSS into external stylesheets or modularize `index.html` into component partials as needed!
