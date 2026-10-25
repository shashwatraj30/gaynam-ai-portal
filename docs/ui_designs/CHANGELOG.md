# Design canvas changelog

Source of the work: `docs/UI_REDESIGN_PLAN.md` section 13 (design backlog D0). Date: 25 Oct 2026.

## 1. Copy corrections to the existing boards (plan 13.2, principle P9)

| Board | Before | After |
|---|---|---|
| Main (design system) | Status chip "Good law" | "No adverse treatment" |
| Research | Chip "Good law" on Rangappa | "No adverse treatment recorded" |
| Research | Rangappa row "Cited 3,100 times" with no marker | Kept (Rangappa is curated), now followed by a "Curated" chip |
| Research | Omprakash row: "Good law" chip, "CRLR/138/2024 · Disposition: dismissed · Jodhpur", cite chip "✓ CNR …" | "No adverse treatment recorded" chip; line shows coram, disposition and says "metadata only, the PDF is the judgment"; chip reads "CNR RJHC020056402024" with no tick (CNR is a case number, not a citation) |
| Research | Source panel: "Good law as of today", "Binding on Rajasthan HC", "Cited 3,100 times" | "No adverse treatment recorded", "Binding on Rajasthan HC (Supreme Court)" (derived from court hierarchy), "Cited 3,100 times" plus "Curated" chip; ratio label now "Ratio decidendi · curated headnote" |
| Judgment | Chip "Good law" | "No adverse treatment recorded" plus "Curated" chip |
| Judgment | "Paragraphs from the full text" | "Curated paragraphs of the ratio" (full_text is a metadata record, never the judgment) |
| Judgment | Note "Today the reader shows the full text with paragraph numbers" | Rows that are not curated show metadata and the source PDF (see the new JudgmentMetadata board) |
| Judgment | Tile "3,100 Times cited" and "Good law · Precedent status" | "Times cited · curated" and "No adverse treatment recorded · Precedent status" |
| Judgment | Mini graph label "Cited by ×3,100" | "Cited by ×3,100 (curated)" |
| Graph | "Cited by ×4,500" | "Cited by ×4,500 (curated)" |
| Home | "Searches 1,18,096 real judgments" | "Searches 1,18,096 judgments (metadata and source PDFs)" |
| Home, Alerts | "is no longer good law" | "has been overruled" |
| Studio | "Found, good law" and "Authority no longer good law" | "Found, no adverse treatment recorded" and "Authority has been overruled" |
| Review | "Authorities relied on, all good law today" | "Authorities relied on, none overruled as of today" |
| Review | "Every citation is taken from the court record, not typed by the AI" (a claim the product cannot back) | "Every citation was looked up in the corpus" |
| Citation check | "tell you whether it is still good law" and "Still good law: no, overruled by a 9-judge bench" | "tell you whether it has been overruled" and "Overruled: yes, by a 9-judge bench" |
| Matter history | Events attributed to "Hon'ble User", "Hon'ble Judicial User", "Registry" (pre-B2 audit rows share one user) | All five events read "User not recorded" |
| Audit trail | Footnote only about shortened hashes | Adds: "Until user attribution ships, every row carries the same user." |
| Sign in | Checked: left-panel claims are factual (1,18,096 judgments, citations checked against the corpus, actions in the audit trail). No full-text AI review claim found. | No change |

Systematic grep terms used on all 17 boards: "good law", "binding on", "cited N times", "×N", "real judgments", "active users", "full text", "AI review", "Hon'ble User", "Registry". No padded metric such as "active users 6" remains: the Chamber board's "6 institutional profiles / 6 active" are the real profile counts.

Not changed on purpose: "Binding" chips on SC rows in Home "New in the corpus" (SC binding is computable from court hierarchy); the two overruled pairs and the "Overruled" chips (real `precedent_status`); Rangappa and Puttaswamy figures (curated rows, now marked).

## 2. New boards (plan 13.1), all registered in `canvas.json` (boards, order, three new section titles)

| # | Board | Canvas position | Covers |
|---|---|---|---|
| 1 | `States.dc.html` | 0, 9520 | Skeletons for list, card and reader; empty states (no results, no matters, no alerts, no graph links); inline and page errors with request id; offline banner; session ended; 403 and 404 pages |
| 2 | `Overlays.dc.html` | 1520, 9520 | Ctrl K palette, user menu, confirm dialog (suspend, discard, approve), 409 "changed elsewhere" dialog, toast variants |
| 3 | `IntakeSteps.dc.html` | 3040, 9520 | Step 1 (drop zone, paste, reading state with Cancel), "Sample data" banner on step 2, step 3 confirm issues |
| 4 | `StudioProgress.dc.html` | 0, 11420 | Generation in progress with Cancel (no fake percentage), Parameters tab, Precedents tab, template-fallback and model banners, scan-noise banner, autosave indicator variants |
| 5 | `JudgmentMetadata.dc.html` | 1520, 11420 | Metadata-only reader: header, "Metadata record" note, embedded PDF with "Open original", record details with CNR label, treatment note, "No citation links recorded yet", no-PDF variant |
| 6 | `RoleHomes.dc.html` | 3040, 11420 | Researcher, Faculty/Student, Administrator, Auditor Homes |
| 7 | `Settings.dc.html` | 0, 13820 | Language, density (with a comfortable/compact preview), AI drafting key note (server-side only), saved toast |
| 8 | `Mobile390.dc.html` | 1520, 13820 | Home, Research, Judgment reader, Review and sign at 390 px, plus the read-only Studio and phone rules |
| 9 | `Hindi.dc.html` | 3040, 13820 | Home and Research with Hindi chrome; Devanagari type notes |

Conventions followed: same `<x-dc>` / `<helmet>` / `data-dc-script` structure as Main, 1440 px frame, tokens from plan section 4 only (green primary, red only for overruled and signing, amber for attention and errors, blue for info), Source Serif 4 and Inter (plus Noto Devanagari on the Hindi board), copy taken from `frontend/app/js/i18n` catalogues. Judgment, Omprakash, Rangappa, court counts (43,556 / 20,402 / 18,809 / 14,505 / 5,398 / 4,611 / 926), 1,201 ledger blocks and 1,213 audit rows are real values from plan section 2.

Illustrative content, labelled as such on the boards: the intake issues in IntakeSteps (derived from the sample FIR 04/17), the Researcher greeting and the Studio parameter values for the illustrative Mehra Traders matter. The date, bench and coram of the Omprakash record are marked as "from the record" rather than invented.

## 3. Not done

- Boards were checked structurally (balanced markup, valid `canvas.json`) but not rendered in a browser, because the preview pane could not open files from this location. Please open the canvas once and check the heights in `canvas.json`.
- `support.js` is referenced by every board, as before, but is not in the folder (it is supplied by the canvas host).
- The Studio's "autosave" and "engine label" variants are on StudioProgress, not as separate frames of the original Studio board.
