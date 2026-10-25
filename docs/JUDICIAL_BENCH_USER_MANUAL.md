# JUDICIAL BENCH & LEGAL RESEARCH WORKBENCH OPERATING MANUAL

**Document Reference:** NLUJ-JOM-2026-V2.5  
**System:** GYANAM AI — National Law University Jodhpur Edition (Powered by Kelyvo)  
**Authorized Users:** Hon'ble Presiding Judges, Registrars, Judicial Research Clerks, Faculty Deans, and NLU Scholars  
**Evaluation Scope:** National Law University, Jodhpur Institutional Procurement Committee  

---

## 1. System Access & Accredited Role-Based Session Initiation

### 1.1 Secure Portal Access
1. Launch any modern enterprise web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, or Safari).
2. Navigate to your accredited institutional evaluation URL (e.g., the secure evaluation portal at `https://forest-knitting-wav-real.trycloudflare.com` or your designated campus intranet address).
3. The platform initialises the **Executive Institutional Interface** co-branded with the National Law University, Jodhpur emblem and Kelyvo engineering marks.

### 1.2 Persona Selection & Single Sign-On (SSO)
In the top-right header, locate the **Judicial Session Pill** and click it to open the **Institutional Role-Based Access Gateway (RBAC)**. The platform provides six accredited operational profiles conforming to **Section 20 of the Tender Scope of Work**:

1. **Hon'ble Justice R.K. Sharma** (*Judicial User / High Court Bench*):
   - **Permissions:** Unrestricted access to all 15 decree sections, precedent search, pleading intake, Bench Digital Seal signing (SOW Sec. 12), and Official Gazette export.
2. **Adv. Siddharth Mathur** (*Researcher / Chamber Law Clerk*):
   - **Permissions:** Pleading intake, degraded brief OCR processing, precedent citation analysis, and draft decree preparation. (Bench seal signing restricted).
3. **Dr. Aparna Sengupta** (*Faculty Dean / Constitutional Law*):
   - **Permissions:** Academic research, landmark jurisprudence analysis, and precedent lineage inspection.
4. **Ananya Rathore** (*Student Scholar / Undergraduate Law Cell*):
   - **Permissions:** Research access across 1.18 Lakh case corpus and citation validation. (Drafting and intake modules display authoritative Section 20 restriction guards).
5. **Prof. (Dr.) H. Pareek** (*Administrator / University Registrar*):
   - **Permissions:** Full system administration, live telemetry, and registry synchronisation daemon monitoring.
6. **CA Rajeshwar Singhal** (*Institutional Compliance Auditor*):
   - **Permissions:** Read-only forensic verification of the cryptographic SHA-256 audit ledger and DPDP Act 2023 logs.

*Select any persona card and click **"Sign In ➔"** to establish an authenticated cryptographic session.*

---

## 2. Module 1: Precedent Search & National SCitation Verification

### 2.1 Searching the Active Case Corpus
1. Locate the grand search interface on the home workstation.
2. The search index queries over **1,18,000 authentic Indian court decisions (117,988 primary judgments)** across the Supreme Court of India and all 25 High Courts with sub-16ms hardware-accelerated latency.
3. Input options:
   - **Natural Language Legal Questions:** e.g., *"principles of natural justice in disciplinary proceedings"*, *"scope of judicial review in administrative contracts"*.
   - **Statutory Provisions:** e.g., *"Section 482 CrPC quashing of FIR"*, *"Section 138 Negotiable Instruments Act presumption"*, *"Article 311(2) inquiry report non-furnishing"*.
   - **Canonical Law Reporter Citations:** e.g., *"AIR 1994 SC 1074"*, *"(2017) 10 SCC 1"*, *"2024 SCC OnLine SC 120"*.
   - **Quick Benchmark Queries:** One-click benchmark pills are provided for instant evaluation (*Natural Justice (ECIL)*, *Right to Privacy (Puttaswamy)*, *Section 139 NI Act (Rangappa)*).

### 2.2 Jurisdictional District & Bench Authority Resolution
- **District Resolution:** Every judgment card automatically resolves and displays the jurisdictional district (e.g., *Jodhpur District*, *Jaipur District*, *Mumbai Suburban*, *Tis Hazari, Central Delhi*).
- **Stare Decisis Upper Bench Priority (Article 141):** Results are hierarchically prioritised by bench strength:
  - *Constitution Bench (5+ Judges)* — Priority 98
  - *Full / Larger Bench (3+ Judges)* — Priority 95
  - *Division Bench (2 Judges)* — Priority 90
  - *Single Judge Bench* — Priority 75
- **Precedent Validity Flags:**
  - `GOOD_LAW` (Green): Active binding precedent; safe for citation.
  - `DISTINGUISHED` (Amber): Valid principle, but factual applicability distinguished by subsequent benches.
  - `OVERRULED` (Red): Explicitly invalidated law; red alerts prevent mistaken reliance.

---

## 3. Module 2: Pleading Intake & Degraded Document OCR Normalization

### 3.1 Uploading Case Briefs & Pleadings
1. Navigate to the **"Upload Case & Briefs"** workstation.
2. Drag and drop any petition, plaint, written statement, or first information report (`.pdf`, `.txt`, or scanned image).
3. Pre-loaded institutional sample briefs (*Sample FIR 06/2024*, *Land Acquisition Writ Petition*, *Commercial Arbitration Appeal*) are available for immediate one-click testing.

### 3.2 Degraded OCR Restoration
1. If processing historical, photocopied, or low-contrast court records, click **"Process Scanned Brief via Neural OCR"**.
2. The normalization pipeline executes:
   - Dynamic adaptive binarization and contrast stretching.
   - De-skewing and margin artifact elimination.
   - Broken hyphenation repair and Indian citation standardization.

### 3.3 Statutory Privacy Redaction (DPDP Act 2023 Compliance)
- PII redaction algorithms automatically mask personal identifiers including Aadhaar numbers, PAN cards, mobile numbers, and matrimonial/POCSO identities before synthesis.
- Click **"Transfer Directly to Judgment Studio"** to inject the clean facts, grounds, and statutory provisions into the drafting synthesizer.

---

## 4. Module 3: 15-Section Canonical Judgment Drafting Studio

### 4.1 Order Synthesis
1. Navigate to the **"Draft Judgment"** workstation.
2. Confirm the case parameters:
   - **Case Title:** e.g., *Ramesh Kumar v. State of Rajasthan & Ors.*
   - **Docket / Case Number:** e.g., *D.B. Civil Special Appeal (Writ) No. 412/2024*
   - **Court of Record:** *High Court of Judicature for Rajasthan at Jodhpur*
3. Select Synthesis Engine:
   - **Local Judicial Engine:** Offline, deterministic legal reasoning operating directly on verified precedent data.
   - **Gemini Neural Reasoning Engine:** Optional cloud-assisted neural mode using your institution's API credentials.
4. Click **"Synthesize 15-Section Judgment"**. The engine synthesizes the complete order within 2 to 4 seconds.

### 4.2 The 15 Canonical Judicial Sections (SOW Section 7)
The drafted decree adheres to standard Indian judicial formatting:
1. **Cause Title & Coram:** Court heading, bench coram, and party designations.
2. **Case Number & Roster Details:** Procedural roster category and registry numbers.
3. **Impugned Order & Subject Matter:** Concise summary of the challenged lower order or FIR.
4. **Material Facts of the Case:** Chronological summary of established undisputed facts.
5. **Submissions of Petitioner / Appellant:** Structured arguments with statutory grounds.
6. **Submissions of Respondent / State:** Formal counter-submissions and defences.
7. **Issues Framed for Determination:** Numbered judicial propositions for adjudication.
8. **Statutory Provisions Invoked:** Relevant legislative sections (e.g., Article 311(2), Section 482 CrPC).
9. **Evaluation of Evidence & Record:** Analysis of testimonies, affidavits, and inquiry records.
10. **Principles of Law & Governing Precedents:** Synthesized ratios ranked by bench priority.
11. **Discussion & Judicial Deliberation:** Rigorous legal analysis applying law to facts.
12. **Application of Law to Established Facts:** Direct resolution of petitioner contentions.
13. **Substantive Findings on Framed Issues:** Issue-by-issue judicial determinations.
14. **Conclusion & Operative Order:** Definitive judicial decree (Allowed, Dismissed, Quashed).
15. **Directions, Bench Seal & Attestation:** Cost directions, compliance timelines, and formal judicial signature block.

### 4.3 Five-Stage Decree Lifecycle & Judicial Publishing
- **Lifecycle Progression:** `DRAFT` ➔ `CHAMBERS_REVIEW` ➔ `BENCH_APPROVED` ➔ `OFFICIAL_GAZETTE` ➔ `ARCHIVED`.
- **Bench Seal Verification:** Progression to *Bench Approved* and *Official Gazette* requires `HON_JUSTICE` authorization.
- **Export Formats:**
  - **Export Judicial DOCX:** Generates an official Microsoft Word document formatted according to High Court rules (1.5" legal binding margin, Book Antiqua typography, formal legal running headers).
  - **Print Gazette Order:** Generates an official printable court gazette with cryptographic SHA-256 seal verification.

---

## 5. Module 4: Precedent Lineage & Interactive Jurisprudence Network

1. Navigate to the **"Precedent Lineage"** workstation.
2. Enter any landmark ruling (e.g., *ADM Jabalpur v. Shivkant Shukla*, *Justice K.S. Puttaswamy v. Union of India*).
3. The interactive visualizer charts:
   - Evolution of constitutional doctrine across decades.
   - Direct overruling relationships (red vectors).
   - Binding affirmation and reliance paths (green vectors).
4. Eliminates citation errors by ensuring no overruled authority enters an active court order.

---

## 6. Module 5: Cryptographic Audit Ledger & DPDP Compliance

1. Navigate to the **"Audit & Security"** workstation.
2. The tamper-evident ledger maintains a cryptographically chained log (SHA-256) of every search, pleading intake, draft generation, and role authentication.
3. Click **"Verify Cryptographic Audit Chain"**:
   - The engine validates every linked block from genesis to the latest event.
   - Confirms mathematical proof of non-tampering under **Section 65B of the Indian Evidence Act, 1872** and **Section 63 of the Bharatiya Sakshya Adhiniyam, 2023**.
4. Full DPDP Act 2023 telemetry displays data minimization statistics, active consent tokens, and air-gap verification.
