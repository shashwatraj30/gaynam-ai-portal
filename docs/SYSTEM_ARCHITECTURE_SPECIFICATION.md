# SYSTEM ARCHITECTURE SPECIFICATION: GYANAM AI (NLU JODHPUR EDITION)

**Author:** Technical Architecture Group, Kelyvo Inc.  
**Commissioned by:** National Law University, Jodhpur  
**Target Environments:**  
- **Phase 1 (Current Evaluation):** Hardware-Accelerated Local Benchmark Sandbox  
- **Phase 2 (Target Production):** MeitY-Empaneled Sovereign AWS Cloud (AWS Asia Pacific - Mumbai `ap-south-1` / Hyderabad `ap-south-2`)  
**System Version:** 2.5.0 Institutional Edition  

---

## 1. Executive Summary & Two-Phase Architecture Evolution

To satisfy the technical and procurement mandates of the National Law University, Jodhpur (NLU Jodhpur) RFP, GYANAM AI is architected across two distinct, complementary phases:

1. **Phase 1 (Current State — High-Performance Evaluation Benchmark):**  
   Designed for local evaluation, algorithmic verification, and air-gapped demonstration. It runs directly on high-speed NVMe block storage on a dedicated workstation, demonstrating sub-15ms BM25 precedent retrieval, deterministic citation graph verification, and 15-section judicial draft synthesis with zero external network dependency.
2. **Phase 2 (Target Production — Enterprise Sovereign AWS Cloud):**  
   Designed for campus-wide and inter-court deployment across Hon'ble Justices, Law Clerks, and Research Scholars. It deploys as a containerized, auto-scaling microservices topology on AWS sovereign infrastructure in India, featuring Multi-AZ redundancy, Amazon OpenSearch distributed indexing, Aurora PostgreSQL Serverless, AWS Bedrock private VPC reasoning, and hardware security module (HSM) encryption.

---

## 2. Infrastructure Comparison: Current POC vs. Target AWS Production

| Architectural Layer | Current State (Phase 1: Local Evaluation Benchmark) | Target Production State (Phase 2: Enterprise AWS Sovereign Cloud) |
|---|---|---|
| **Cloud & Data Sovereignty** | Local dedicated NVMe workstation; remote evaluator access via ephemeral Cloudflare Tunnel (`trycloudflare.com`). | **AWS India Sovereign VPC (Mumbai `ap-south-1` / Hyderabad `ap-south-2`)** in strict compliance with MeitY empanelment and High Court data residency norms. |
| **Edge Security & CDN** | Direct localhost port routing. | **Amazon CloudFront** + **AWS WAF (Web Application Firewall)** with India-only geofencing, rate-limiting, and AWS Shield anti-DDoS protection. |
| **Compute & Microservices** | Single-node **FastAPI / Uvicorn ASGI** process running on workstation CPU/GPU. | **AWS ECS Fargate / Amazon EKS (Kubernetes)** with horizontal pod auto-scaling (HPA) and Application Load Balancer (ALB). |
| **Full-Text Legal Search** | **SQLite FTS5 (WAL mode)** standalone demo benchmark for local UI & latency validation. | **Amazon OpenSearch Service** (Distributed multi-node cluster ingesting live Supreme Court of India and 25 High Court APIs via SCitation grid). |
| **Vector & Semantic Search** | In-memory dot-product semantic vector matcher. | **Amazon Aurora PostgreSQL with `pgvector`** for hybrid sparse (BM25) and dense (semantic embeddings) legal retrieval. |
| **Relational & Judicial Metadata** | Embedded SQLite database file (`kelyvo.db`). | **Amazon Aurora PostgreSQL Serverless v2** (Multi-AZ replication, automated point-in-time recovery, Row-Level Security / RLS for judicial roles). |
| **Document Lake & Gazettes** | Local file system directory. | **Amazon S3 Standard & S3 Glacier Flexible Retrieval** with customer-managed keys (AWS KMS) and Object Lock (WORM compliance for court records). |
| **AI Drafting & Reasoning Bridge** | Local hybrid bridge / external Gemini API bridge. | **Amazon Bedrock (Private VPC Endpoints)** using Claude 3.5 Sonnet / Llama 3 fine-tuned legal models with **Zero-Data-Retention and Zero-Training Guarantees**. |
| **DPDP Act 2023 & PII Anonymization** | High-performance regex token substitution. | **Dedicated Presidio PII Anonymization Microservice** backed by **AWS CloudHSM** for cryptographic de-identification of sensitive judicial records. |
| **Audit Ledger & Chain of Custody** | Append-only local SHA-256 block ledger file. | **Amazon QLDB / Cryptographic Ledger** integrated with AWS CloudTrail for immutable, Section 65B-admissible judicial audit logging. |
| **Identity & Authentication** | Local JWT bearer tokens with static role evaluation. | **AWS Cognito / Institutional SAML 2.0 / Shibboleth SSO** integrated with NLU Jodhpur identity providers and judicial MFA. |

---

## 3. System Topology Diagrams

### A. Current Phase 1 Architecture (Hardware-Accelerated Local Benchmark)

```
+-----------------------------------------------------------------------------------+
|                           PRESENTATION TIER (UI / UX)                             |
|  - Modern Judicial Studio (HTML5 / Tailwind CSS / Vanilla JS / Canvas)            |
|  - High Court Gazette Print Engine & Interactive Precedent Lineage Visualizer     |
+-----------------------------------------+-----------------------------------------+
                                          | JSON over HTTPS (TLS 1.3 via Tunnel)
+-----------------------------------------v-----------------------------------------+
|                       APPLICATION & ORCHESTRATION TIER                            |
|  - FastAPI (Python 3.9+ / Uvicorn ASGI Server on Workstation)                     |
|  - JWT Bearer Authentication & RBAC Engine (Hon'ble Justice, Clerk, Scholar)      |
|  - 15-Section Judgment Drafting Synthesizer & Hybrid LLM Bridge                   |
+-------------------+---------------------+--------------------+--------------------+
                    |                     |                    |
+-------------------v---+   +-------------v------+   +---------v--------------------+
|  PRECEDENT SEARCH     |   | CITATION VERIFIER  |   | DPDP ACT & AUDIT LEDGER      |
|  - SQLite FTS5 Engine |   | - SCitation Graph  |   | - Real-time PII Anonymizer   |
|  - BM25 Hardware Rank |   | - Anti-Overruling  |   | - SHA-256 Tamper-Proof Chain |
+-------------------+---+   +-------------+------+   +---------+--------------------+
                    |                     |                    |
+-------------------v---------------------v--------------------v--------------------+
|                         STORAGE & PERSISTENCE TIER                                |
|  - Standalone Evaluation Benchmark Corpus (Local SQLite WAL Mode for Testing)     |
|  - Inverted Full-Text Indexes, Precedent Lineage Matrices, Audit Block Log        |
+-----------------------------------------------------------------------------------+
```

### B. Target Phase 2 Architecture (Enterprise Sovereign AWS Cloud)

```
                                  +---------------------------------------+
                                  |     END USERS (JUDGES & SCHOLARS)     |
                                  | High Courts / NLU Jodhpur / Advocates |
                                  +---------------------------------------+
                                                      |
                                                      | HTTPS (TLS 1.3)
                                                      v
                                  +---------------------------------------+
                                  |       AMAZON CLOUDFRONT + AWS WAF     |
                                  |  DDoS Shield | Geo-Restriction (IN)   |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |    APPLICATION LOAD BALANCER (ALB)    |
                                  +---------------------------------------+
                                                      |
         +--------------------------------------------+--------------------------------------------+
         |                                            |                                            |
         v                                            v                                            v
+-------------------------------+            +-------------------------------+            +-------------------------------+
|    PRESENTATION TIER (UI)     |            |    CORE API & ORCHESTRATION   |            |   DPDP & COMPLIANCE GATEWAY   |
| Amazon S3 Static Web Hosting  |            | AWS ECS Fargate (Auto-Scale)  |            | Presidio PII De-identifier    |
| Tailwind / Vanilla JS Studio  |            | FastAPI Python Microservices  |            | AWS KMS Encryption & Ledger   |
+-------------------------------+            +-------------------------------+            +-------------------------------+
                                                      |
       +----------------------------------------------+----------------------------------------------+
       |                                              |                                              |
       v                                              v                                              v
+-------------------------------+            +-------------------------------+            +-------------------------------+
|    HYBRID RETRIEVAL TIER      |            |    STORAGE & METADATA TIER    |            |   SECURE SOVEREIGN LLM TIER   |
| Amazon OpenSearch (BM25)      |            | Amazon Aurora PostgreSQL v2   |            | AWS Bedrock (Private VPC)     |
| Precedent Citation Graph      |            | Cases, Judges, Statues, Coram |            | 15-Section Order Synthesizer  |
| Aurora pgvector Hybrid Search |            | Amazon S3 (Encrypted Corpus)  |            | Anti-Hallucination Verifier   |
+-------------------------------+            +-------------------------------+            +-------------------------------+
```

---

## 4. Deep Tier Breakdown

### Tier 1: Presentation & Judicial Workbench (UI/UX)
- **High Court Gazette Print Engine:** One-click compilation of verified judicial orders into formatted, printable gazette decrees complying with High Court formatting norms.
- **Precedent Lineage Visualizer:** Interactive canvas displaying citations, distinguishing larger-bench modifications, and marking overruled precedents in red alerts.
- **Side-by-Side Verification Bench:** Allows the user to view case pleadings on the left and the drafted judgment order on the right, with every paragraph hyperlinked to source records.

### Tier 2: Application, Authentication & Orchestration
- **FastAPI Core Microservices:** High-throughput asynchronous endpoints enforcing sub-15ms response latencies.
- **Judicial RBAC:** Operational segregation tailored for Hon'ble Justices, Law Clerks, and Research Scholars.
- **15-Section Judgment Drafting Synthesizer:** Enforces standard Indian judicial anatomy:
  1. Cause Title & Coram
  2. Procedural History
  3. Factual Matrix & Summary of Pleadings
  4. Contentions of the Petitioner / Appellant
  5. Contentions of the Respondent / State
  6. Points for Determination / Issues Framed
  7. Statutory Framework & Provisions Considered
  8. Precedent Analysis & Distinguishing Precedents
  9. Ratio Decidendi & Judicial Reasoning
  10. Treatment of Oral & Documentary Evidence
  11. Application of Law to Facts
  12. Findings on Individual Issues
  13. Operative Order & Relief Granted
  14. Cost Orders & Ancillary Directions
  15. Signature Block & Official Seal

### Tier 3: Search, Precedent Retrieval & Citation Graph
- **Okapi BM25 Mathematical Retrieval Engine:**
  $$\text{Score}(D, Q) = \sum_{i=1}^{N} \text{IDF}(q_i) \cdot \frac{f(q_i, D) \cdot (k_1 + 1)}{f(q_i, D) + k_1 \cdot \left(1 - b + b \cdot \frac{|D|}{\text{avgdl}}\right)}$$
  *(Parameters: $k_1 = 1.2$, $b = 0.75$).*
- **SCitation Graph:** Validates every citation against canonical Indian reporters (`AIR`, `SCC`, `SCR`, `ILR`, `Scale`, `CrLJ`).
- **Anti-Overruling Guardrail:** Automatically evaluates judicial treatment status:
  - `GOOD_LAW`: Valid, binding precedent.
  - `DISTINGUISHED`: Valid, but contextually differentiated.
  - `OVERRULED`: Explicitly overturned by subsequent rulings (e.g., *ADM Jabalpur* overturned by *K.S. Puttaswamy*). Triggers red alert.

### Tier 4: Storage, DPDP Act Security & Cryptographic Ledger
- **Digital Personal Data Protection (DPDP) Act 2023 Compliance:** Automatic red-action of victim identities in sensitive cases (POCSO, sexual violence), Aadhaar numbers, and financial details.
- **Cryptographic Audit Chain:**
  $$\text{Block Hash}_n = \text{SHA-256}(\text{Block Hash}_{n-1} \,\|\, \text{Timestamp} \,\|\, \text{User} \,\|\, \text{Role} \,\|\, \text{Action} \,\|\, \text{Payload} \,\|\, \text{IP})$$
  Ensures legally admissible evidence integrity under Section 65B of the Indian Evidence Act, 1872 / Section 63 of the Bharatiya Sakshya Adhiniyam, 2023.

---

## 5. Complete Scope of Work (SOW) — NLU Jodhpur RFP

### 5.1 Judicial Data Acquisition & Corpus Management
* **Supreme Court of India:** Complete historical archive of judgments, orders, bench compositions, party names, and cited/citing relationship trees.
* **High Courts of India:** Structured ingestion across all 25 High Courts (Rajasthan High Court, Delhi, Bombay, Calcutta, Madras, Allahabad, etc.).
* **Continuous Ingestion Pipeline:** Automated daily/weekly synchronization for newly pronounced judgments with automated deduplication.

### 5.2 Natural Language Legal Research & Precedent Search
* **Natural-Language Query Interface:** Plain-English search capabilities for complex statutory queries.
* **Multi-Filter Faceting:** Instant search filtering by Court, Bench Type (Single/Division/Constitution), Judge Name, Date Range, and Statutory Act/Section.
* **Ratio & Proposition Extraction:** Automated extraction of core propositions and ratio decidendi supported by exact paragraph citations.

### 5.3 AI-Assisted Judgment & Order Drafting System
* **15-Section Structured Synthesis:** Automated generation of draft orders adhering to standard Indian judicial formatting.
* **Pleadings & Facts Ingestion:** Allows bench clerks to upload petition briefs, written submissions, and lower-court orders to synthesize structured factual chronologies.
* **Zero-Hallucination Attribution:** Strict rule-based guardrails ensuring that every legal proposition is backed by an authenticated SC/HC precedent.

### 5.4 SCitation Integration & Precedent Graph Analytics
* **Cross-Citation Normalization:** Unifies citations across diverse reporting journals (`AIR`, `SCC`, `SCR`, `ILR`, `Scale`).
* **Precedent Treatment Tracking:** Identifies whether a cited judgment is *Approved*, *Followed*, *Distinguished*, *Doubted*, or *Overruled*.
* **Bench Strength Hierarchy:** Prioritizes decisions of larger benches (e.g., 7-Judge over 5-Judge over 2-Judge).

### 5.5 Security, Data Sovereignty & DPDP Act Compliance
* **100% Indian Data Sovereignty:** All data, models, indexes, and logs reside strictly within MeitY-empanelled data centers in India.
* **Zero Model Training Clause:** No user queries, draft judgments, or judicial documents shall ever be stored or used by any third party for public AI model training.
* **DPDP Act 2023 Redaction:** Automated anonymization of victim names in sensitive offenses (e.g., Section 376 IPC / POCSO Act), personal financial identifiers, and residential addresses.
* **Cryptographic Audit Trail:** Immutable SHA-256 audit ledger tracking all user actions, document exports, and system queries.

### 5.6 Deployment, Training & Institutional Handover
* **Single Sign-On (SSO):** Integration with NLU Jodhpur institutional identity servers.
* **User Manuals & Bench Documentation:** Complete manuals delivered for Hon'ble Justices, Law Clerks, and Research Scholars.
* **Institutional Training Workshops:** Dedicated onboarding and technical training sessions for faculty, researchers, and students.
* **Maintenance & Service Level Agreement (SLA):** 99.9% uptime guarantee with dedicated support and scheduled index updates.

---

Certified by **Kelyvo Inc.** for NLU Jodhpur RFP Evaluation.
