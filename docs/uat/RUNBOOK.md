# Gyanam AI UAT: Runbook (Windows)

How to start a staging copy of the portal on a Windows laptop, load the fictional UAT data, reset it between sessions, and record the screen. All commands were run end to end on Windows 10 with Windows PowerShell 5.1; the first-time setup takes about 5 minutes and a reset about 15 seconds.

**Safety statement:** nothing here writes to `data\vidhi_legal.db`. The staging server runs against a copy at `C:\gyanam-uat\work\vidhi_legal.db` on port **8091** (the normal dev port 8090 is left alone).

Helper files in this folder:

| File | Purpose |
|---|---|
| `uat.ps1` | PowerShell functions: `Initialize-Uat`, `Start-Uat`, `Stop-Uat`, `Reset-Uat`, `Test-Uat`, `Get-UatErrors` |
| `prepare_uat_db.py` | Makes the UAT master DB from a copy: removes FIR-derived drafts and their audit rows, re-chains the ledger |
| `seed_uat.py` | Adds the five fictional matters UAT/WP/9101 to 9105/2026 through the API |

---

## 1. Prerequisites

| Item | Check |
|---|---|
| Windows 10 or 11 laptop, 8 GB RAM, 3 GB free disk | `Get-PSDrive C` |
| Python 3.11 or 3.12 (plan B0 targets these; 3.13 ran in our test but is not pinned in CI) | `python --version` |
| Git checkout of the project (the `.env` file with `GYANAM_JWT_SECRET` is in the project root) | `Test-Path .\.env` |
| Chrome or Edge, current | `chrome://version` |
| Screen recorder: OBS Studio, or Windows Xbox Game Bar (`Win+Alt+R`) | §8 |
| The project dependencies | below |

Open **Windows PowerShell** in the project root (the folder that contains `backend`, `frontend`, `docs`) and run:

```powershell
cd path\to\Gyanam_AI_Portal
python -m venv venv
.\venv\Scripts\python.exe -m pip install --upgrade pip
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

If scripts are blocked: `Set-ExecutionPolicy -Scope Process -Bypass` (affects only this window).

Check `.env` in the project root. It must contain `GYANAM_JWT_SECRET=...` and **must not** contain an active (uncommented) `GEMINI_API_KEY=` line. UAT uses the template engine so that drafts are repeatable and no pleading text leaves the laptop:

```powershell
Select-String -Path .\.env -Pattern 'GEMINI_API_KEY'
# Expected: the line starts with #  (commented out). If not, put a # in front of it for UAT.
```

Never print or paste the `.env` contents into a ticket or email.

## 2. One-time set-up: master DB, fictional matters, fixture files

```powershell
. .\docs\uat\uat.ps1
Initialize-Uat
```

What this does, in order (takes a few minutes; the 345 MB DB is copied twice):

1. Creates `C:\gyanam-uat\` with `master`, `work`, `uploads`, `logs`, `files`, `recordings` and `profile` folders.
2. Runs `prepare_uat_db.py`: takes a consistent copy of `data\vidhi_legal.db` with the SQLite backup API, deletes the 25 drafts made from scanned police FIRs (`FIR No. ...` and `Scanned Document Intake`), deletes the audit and ledger rows that mention them, uploads and OCR runs, and re-chains the remaining ledger. Output in our test: `drafts removed: 25`, `audit_logs rows removed: 149`, `ledger blocks removed: 149, kept: 1053`, `ledger verifies: True`.
3. Starts the server on the working copy and runs `seed_uat.py`, which creates:

| Matter | Status | Purpose |
|---|---|---|
| UAT/WP/9101/2026 Sunita Choudhary v. State of Rajasthan | In review, flawed (garbled section, a citation that is not in the corpus) | J-08, J-09, J-11, C-12 |
| UAT/WP/9102/2026 Mohan Lal v. Union of India | In review, clean | J-10 |
| UAT/WP/9103/2026 Kavita Devi v. Director, Secondary Education | Approved by bench | J-12 |
| UAT/WP/9104/2026 Dinesh Bishnoi v. State of Rajasthan | Draft, cites the overruled K. J. Bhat | J-02, J-07, C-08 |
| UAT/WP/9105/2026 Ramesh Kumawat v. State of Rajasthan | Draft, clean | C-09, C-10, C-11 |

4. Stops the server and saves the seeded DB as `C:\gyanam-uat\master\uat_seeded.db` with its SHA-256 in `uat_seeded.sha256`. Copy the hash into `RESULTS_TEMPLATE.md` §1.
5. Puts the two fixture files for the intake tasks in `C:\gyanam-uat\files\`:
   - `sample_writ_petition.txt` (fictional writ petition, task C-06),
   - `unreadable_scan.png` (a blank 64x64 image the reader cannot read, so the "Sample data" banner appears, task C-05).

If anything in this step fails, fix the cause and run `Initialize-Uat` again; it rebuilds from scratch.

**Do not use** the FIR images in `sample_docs\` in UAT (UAT plan §3). Participants never see the original data folder.

## 3. Starting the staging server

```powershell
. .\docs\uat\uat.ps1     # once per PowerShell window
Reset-Uat                # restores the seeded DB and starts the server
Test-Uat                 # prints PASS or FAIL per pre-session check
```

`Start-Uat` is what `Reset-Uat` calls. Underneath, it is exactly this:

```powershell
$env:GYANAM_DB_PATH      = 'C:\gyanam-uat\work\vidhi_legal.db'
$env:GYANAM_UPLOAD_DIR   = 'C:\gyanam-uat\uploads'
$env:PORT                = '8091'
$env:GYANAM_UI           = 'new'       # new UI at / and /app/
$env:GYANAM_ENFORCE_AUTH = '1'         # real 401/403 behaviour, not the legacy open profile
$env:GEMINI_API_KEY      = ''          # template engine
.\venv\Scripts\python.exe backend\server.py
```

The server loads the rest (`GYANAM_JWT_SECRET`) from the project `.env`. Logs go to `C:\gyanam-uat\logs\server.log` and `server.err.log`.

Open the portal in a fresh browser profile (§8): <http://localhost:8091/#/signin>. Swagger is at <http://localhost:8091/docs>. Do not point participants at `/legacy`.

Stop the server with `Stop-Uat`.

## 4. What `Test-Uat` must show before every session day

All eight lines must say PASS:

```
PASS  server answers /api/status
PASS  about 118,096 judgments indexed
PASS  at least one alert (found 2)
PASS  five UAT fixture drafts present (found 5)
PASS  audit ledger verifies (VERIFIED_SECURE, 1064 blocks)
PASS  (2008) 4 SCC 54 is recorded as overruled
PASS  new UI served at /app/
PASS  no active GEMINI_API_KEY line in .env (template fallback)
```

Block counts differ if the source DB changed. Then do these manual checks (5 minutes) in the browser:

1. Sign in as each of the six profiles once; confirm the landing page (Home; the Auditor lands on Audit trail).
2. Judge: Matters shows 5 UAT matters plus the ones from the corpus; Alerts shows the critical alert on UAT/WP/9104/2026 first.
3. Research for `bail in economic offences` returns results and the first result opens a reader. Confirm the source PDF frames or "Open original" appears. If the venue network blocks AWS S3 / sci.gov.in, tell the facilitators; do not coach participants (UAT plan §3 item 7).
4. Clerk: `#/matters/new` with `C:\gyanam-uat\files\unreadable_scan.png` shows the banner "Sample data — not read from your document".
5. Browser zoom 100%, notifications off, bookmarks bar hidden, and no other tabs.

Run `Reset-Uat` again after these checks so that the first participant starts from the seeded state.

## 5. Resetting between sessions (about 15 seconds)

Run after **every** participant, before the next one sits down:

```powershell
Reset-Uat
```

It stops the server, copies `uat_seeded.db` over the working DB, removes any `-wal`/`-shm` leftovers, empties `C:\gyanam-uat\uploads`, and starts the server. Then, in the browser:

1. Close the participant's window and recording.
2. Open a new window with a fresh profile (see §8), so `sessionStorage` and `localStorage` (Research history, language, density, token) are empty.
3. Delete any files the participant downloaded (`Downloads\*.docx`).

If the participant entered real case data by mistake: stop the recording, run `Reset-Uat` at once, cut the segment from the recording, delete the Downloads folder contents, and log the incident (`RESULTS_TEMPLATE.md` §9).

### Rebuilding after code changes

When a new build is deployed between UAT rounds, pull it and rebuild nothing else; the master DB stays valid. Record the commit in the results header:

```powershell
git rev-parse --short HEAD
```

If the schema changed (new tables or columns), delete `C:\gyanam-uat\master\*.db` and run `Initialize-Uat` again.

## 6. Counting server errors (criterion S12)

At the end of each day:

```powershell
Get-UatErrors
```

It prints the number of logged HTTP responses and the number of 5xx. Any 5xx line is copied to the results issue log with the time, and compared with the observation sheet to see whether a participant saw it. The log is overwritten on the next start, so copy it first:

```powershell
Copy-Item C:\gyanam-uat\logs\server.log "C:\gyanam-uat\logs\server_$(Get-Date -Format yyyyMMdd_HHmm).log"
```

## 7. Common problems

| Symptom | Cause and fix |
|---|---|
| `Port 8091 is already in use` | `Stop-Uat`, or `Get-NetTCPConnection -LocalPort 8091` to see the process. |
| `Server did not answer in 30 s` | Read `C:\gyanam-uat\logs\server.err.log`. If it says `python-multipart` is missing: `.\venv\Scripts\python.exe -m pip install python-multipart`. |
| Sign in page shows "Cannot reach the server" | Server not running, or the browser points to the wrong port. Use 8091. |
| Every action returns 401 after a restart | `GYANAM_JWT_SECRET` missing from `.env`, so a random secret is made each run. Add one to `.env` and reset; in a new browser profile participants sign in again anyway. |
| Source PDFs do not appear | No internet or the venue blocks AWS Open Data / sci.gov.in. The reader falls back to "Open original". Record it in the session note. |
| Draft generation takes up to 2 minutes and shows no percentage | Expected only if a model key is set. With no key it takes under a second. Check `.env`. |
| Fonts look different | The fonts are self-hosted; check `frontend\app\fonts` exists and the page was not opened from `file://`. |
| `Sync now` fails | It needs internet (it downloads open data). "Sync failed" is an honest result for A-03 when offline. |
| Participant clicked Seal or Approve by mistake | That is their path; do not reset mid-session. Reset afterwards. |

## 8. Screen recording and browser set-up

### Browser window (fresh profile every session)

```powershell
# Chrome (add --window-size=1024,768 for the narrow-screen block)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="C:\gyanam-uat\profile\$(Get-Date -Format HHmmss)" --no-first-run --disable-extensions "http://localhost:8091/#/signin"

# Edge
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --user-data-dir="C:\gyanam-uat\profile\$(Get-Date -Format HHmmss)" --no-first-run "http://localhost:8091/#/signin"
```

A new `--user-data-dir` means no saved history, extensions, translation pop-ups or old tokens. Delete `C:\gyanam-uat\profile\*` at the end of the day.

### Recording with OBS Studio (recommended)

1. Install OBS Studio. Settings > Output: recording format `mkv` (safe if the laptop dies; remux to mp4 afterwards), encoder x264 or hardware, bitrate 4000 kbps. Settings > Video: base 1920x1080, output 1280x720, 15 fps (enough for UI work, small files).
2. Sources: one **Window Capture** of the browser only (not Display Capture, so notifications and other apps never appear), one **Audio Input Capture** for the microphone. Add Desktop Audio only if you need system sounds.
3. Hotkeys: Settings > Hotkeys > Start/Stop Recording `Ctrl+Alt+R`, so the observer can start and stop without opening OBS.
4. Test: record 20 seconds, play back, confirm the voice is audible and the cursor is visible (Window Capture > Capture Cursor on).

### Recording with Xbox Game Bar (nothing to install)

Focus the browser window and press `Win+Alt+R` to start and stop. Files go to `%USERPROFILE%\Videos\Captures`. It records only the focused window, which is fine. It cannot record File Explorer or the desktop, so DOCX downloads will not be filmed; the observer notes the outcome.

### Good practice

- Turn on **Focus Assist** (Settings > System > Focus) so messages never appear. Close mail and chat.
- Ask for consent first (UAT plan §4.3). Start recording only after "yes". With "no", the observer takes notes only.
- Say the participant code at the start of the recording ("This is J02, session S04") and use it in the file name: `S04_J02_2026-11-04_UAT4.mkv`. Never use a person's name in a file name.
- Put a visible clock in the recording, or say the time at the start of each task. The observer writes the recording timestamp in `OBSERVATION_SHEET.csv` (`recording_timestamp`).
- Keep the face camera off unless the participant has agreed to it.
- Pause the recording during consent form signing and when the participant says anything personal.
- Save recordings to `C:\gyanam-uat\recordings\` only; no email, no cloud sync. At the end of the day copy them to the encrypted drive of the UAT lead and then delete the originals.
- Delete raw recordings within 30 days of sign-off (UAT plan §4.2).

## 9. Day-of checklist (print)

Before the first participant:
- [ ] `. .\docs\uat\uat.ps1` loaded; `Reset-Uat` run; `Test-Uat` shows ALL CHECKS PASSED
- [ ] Manual checks in §4 done and `Reset-Uat` run again
- [ ] Observation sheet copied for the day, header columns filled
- [ ] Printed: consent forms, task cards (scenario text only), questionnaire, facilitator script
- [ ] Recording tested; Focus Assist on; Downloads empty
- [ ] `C:\gyanam-uat\files\unreadable_scan.png` and `sample_writ_petition.txt` ready for the clerk sessions

Between participants:
- [ ] `Reset-Uat`; new browser profile; Downloads emptied; recording named with the next code

End of day:
- [ ] `Get-UatErrors`; copy `server.log`
- [ ] Observation sheets saved under participant codes
- [ ] Recordings moved to the encrypted drive; originals deleted
- [ ] `Stop-Uat`; close browser; delete `C:\gyanam-uat\profile\*`
- [ ] Five-line session notes written (UAT plan §10 step 1)

## 10. Clean-up after the final session

```powershell
. .\docs\uat\uat.ps1
Stop-Uat
Remove-Item C:\gyanam-uat\work, C:\gyanam-uat\uploads, C:\gyanam-uat\profile -Recurse -Force
```

Keep `C:\gyanam-uat\master\uat_seeded.sha256` with the results report. Delete the large `.db` files in `C:\gyanam-uat\master` when no further round is planned. The real database and its backups were never touched by any step in this runbook.
