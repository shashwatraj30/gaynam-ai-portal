#!/bin/bash
# VIDHI AI — NLU JODHPUR EDITION (POWERED BY KELYVO)
# AUTOMATED ONLINE HOT BACKUP SCRIPT FOR VIDHI DATABASE

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="$PROJECT_DIR/data/vidhi_legal.db"
BACKUP_DIR="$PROJECT_DIR/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/vidhi_legal_backup_$TIMESTAMP.db"

mkdir -p "$BACKUP_DIR"

echo "=========================================================="
echo "VIDHI AI: Initiating Online Hot Database Backup"
echo "Source: $DB_PATH"
echo "Timestamp: $TIMESTAMP"
echo "=========================================================="

# 1. Use SQLite non-blocking online backup API
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# 2. Verify integrity of backup
echo "Verifying backup integrity..."
INTEGRITY=$(sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;")
if [ "$INTEGRITY" != "ok" ]; then
    echo "ERROR: Backup integrity check failed: $INTEGRITY"
    exit 1
fi
echo "Backup integrity verified: OK"

# 3. Compress backup with gzip
gzip "$BACKUP_FILE"
COMPRESSED_FILE="$BACKUP_FILE.gz"

# 4. Generate SHA-256 Checksum for Section 65B compliance
shasum -a 256 "$COMPRESSED_FILE" > "$COMPRESSED_FILE.sha256"

echo "Backup completed successfully!"
echo "Target: $COMPRESSED_FILE"
echo "Checksum: $(cat "$COMPRESSED_FILE.sha256")"
echo "=========================================================="
