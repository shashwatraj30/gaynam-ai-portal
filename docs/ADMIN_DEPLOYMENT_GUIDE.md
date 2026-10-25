# IT ADMINISTRATOR & PRODUCTION DEPLOYMENT GUIDE

**Document Reference:** NLUJ-ADG-2026-V2.5  
**Product:** GYANAM AI — National Law University Jodhpur Edition (Powered by Kelyvo)  
**Target Environment:** Sovereign Campus Data Center / High Court Computer Cell / NIC Sovereign Cloud  
**Certified Server Platforms:** Enterprise Linux (Red Hat Enterprise Linux 9, Ubuntu Server 22.04 / 24.04 LTS)  

---

## 1. Enterprise Target Environment & Sovereign Infrastructure

GYANAM AI is engineered for institutional deployment within accredited government and educational infrastructure. The platform guarantees complete operational autonomy, cryptographic determinism, and zero reliance on external proprietary services:

- **Deployment Scope:** Certified for High Court Computer Cells, National Law University intranet clusters, and State Data Centers (SDC).
- **Cloud Compatibility:** Pre-configured for National Informatics Centre (NIC) MeghRaj Sovereign Cloud and MeitY-empaneled Tier-3/Tier-4 data centers.
- **Security & Sovereign Isolation:** 100% on-premise data residency; case pleadings, internal judicial deliberations, and generated draft orders never leave sovereign institutional jurisdiction.

---

## 2. Production Containerized Deployment (Docker Compose)

GYANAM AI provides hardened, rootless containerization designed for air-gapped institutional environments with zero host filesystem contamination:

### Step 1: Transfer Application Package to Host
```bash
# Extract official university release package:
git clone https://github.com/kelyvo/gyanam-ai-nluj.git /opt/gyanam_ai
cd /opt/gyanam_ai
```

### Step 2: Build and Launch Services
```bash
docker-compose up -d --build
```

### Step 3: Verify Deployment & Health Check
```bash
docker ps
curl -s http://127.0.0.1:8090/api/status
```

The container stack initialises:
1. **`gyanam-backend`:** FastAPI application powered by high-concurrency Uvicorn ASGI workers.
2. **`gyanam-nginx`:** Production reverse proxy managing TLS 1.3 termination, rate-limiting, and static asset distribution.
3. **`gyanam-storage`:** Dedicated persistent volume mount for the high-speed SQLite FTS5 database engine.

---

## 3. Bare-Metal Linux Deployment (Systemd Service)

For sovereign judicial installations where Docker execution is restricted by institutional policy:

### Step 1: Install Core System Dependencies
```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv sqlite3 libsqlite3-dev tesseract-ocr
```

### Step 2: Configure Application Environment
```bash
python3 -m venv /opt/gyanam_ai/venv
/opt/gyanam_ai/venv/bin/pip install -r requirements.txt
```

### Step 3: Configure Systemd Service Daemon
Create `/etc/systemd/system/gyanam.service`:
```ini
[Unit]
Description=Gyanam AI — Legal Judgment & Precedent System (NLU Jodhpur Edition)
After=network.target

[Service]
Type=simple
User=gyanam
Group=gyanam
WorkingDirectory=/opt/gyanam_ai
ExecStart=/opt/gyanam_ai/venv/bin/python backend/server.py
Restart=always
RestartSec=5
Environment="PORT=8090"
Environment="PYTHONPATH=/opt/gyanam_ai/backend"

[Install]
WantedBy=multi-user.target
```

Enable and activate the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable gyanam
sudo systemctl start gyanam
sudo systemctl status gyanam
```

Verify service availability via local socket:
```bash
curl -s http://127.0.0.1:8090/api/status
```

---

## 4. Reverse Proxy & Domain SSL/TLS Configuration (Nginx)

For campus-wide access under an accredited domain (e.g., `https://gyanam.nlujodhpur.ac.in`), configure Nginx upstream:

```nginx
server {
    listen 443 ssl http2;
    server_name gyanam.nlujodhpur.ac.in;

    ssl_certificate /etc/ssl/certs/nluj_gyanam.crt;
    ssl_certificate_key /etc/ssl/private/nluj_gyanam.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 5. Automated Hot Backup & Disaster Recovery Architecture

To ensure zero downtime and safeguard all judicial records, deploy the non-blocking SQLite hot backup routine via cron:

```bash
# Automated daily midnight backup routine:
bash scripts/backup_db.sh
```

### Architectural Mechanism:
- Uses SQLite's online non-blocking backup API (`.backup`) to capture a point-in-time snapshot without locking active search queries or drafting sessions.
- Archives are compressed with gzip, stamped with institutional date markers, and verified against an automated FTS5 index consistency check.
- Generates a cryptographic SHA-256 integrity checksum for each backup archive to satisfy compliance audits under Section 65B of the Indian Evidence Act.
