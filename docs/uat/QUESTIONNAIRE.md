# Gyanam AI UAT: Post-Session Questionnaire

Given on paper (or a form) after the task block, filled in by the participant alone. Takes about 5 minutes. Participant code: ________  Role: ________  Date: ________  Language used: English / Hindi / both

Do not write any case details in the free-text boxes.

---

## Part A: System Usability Scale (SUS)

Tick one box per statement: 1 = strongly disagree, 5 = strongly agree. The statements are the standard SUS wording with "system" replaced by "Gyanam AI portal".

| # | Statement | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 1 | I think that I would like to use the Gyanam AI portal frequently. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 2 | I found the Gyanam AI portal unnecessarily complex. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 3 | I thought the Gyanam AI portal was easy to use. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 4 | I think that I would need the support of a technical person to be able to use the Gyanam AI portal. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 5 | I found the various functions in the Gyanam AI portal were well integrated. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 6 | I thought there was too much inconsistency in the Gyanam AI portal. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 7 | I would imagine that most people would learn to use the Gyanam AI portal very quickly. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 8 | I found the Gyanam AI portal very cumbersome to use. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 9 | I felt very confident using the Gyanam AI portal. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 10 | I needed to learn a lot of things before I could get going with the Gyanam AI portal. | ☐ | ☐ | ☐ | ☐ | ☐ |

### SUS scoring (analyst)

1. For odd items (1, 3, 5, 7, 9): contribution = score minus 1.
2. For even items (2, 4, 6, 8, 10): contribution = 5 minus score.
3. Sum the ten contributions (0 to 40) and multiply by 2.5. The result is 0 to 100.
4. Report the mean per role and overall (UAT plan §8, S3 and S4: overall at least 80; each role with 2 or more participants at least 75).
5. A blank item makes that participant's SUS invalid; leave the participant out of SUS only, not out of other measures.

The scoring formula is also in `RESULTS_TEMPLATE.md` (section 3) as a spreadsheet formula.

---

## Part B: Trust in citations and sources

1 = strongly disagree, 5 = strongly agree, N = I did not see this.

| # | Statement | 1 | 2 | 3 | 4 | 5 | N |
|---|---|---|---|---|---|---|---|
| B1 | When the portal says a citation is "Found in corpus", I believe the quotation I plan to use is accurate. | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| B2 | When the portal says "No adverse treatment recorded", I believe the decision is still good law. | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| B3 | I understand which checks the portal has actually run and which it has not. | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| B4 | Opening the source PDF from a result made me more confident in what I read. | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| B5 | I would rely on a ranked list of authorities from this portal without opening the judgments. | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| B6 | The red "Overruled" warnings were impossible to miss. | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| B7 | The grey "Not checked yet" rows made me trust the portal more, not less. | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| B8 | I know who or what wrote the draft text (a fixed template or an AI model). | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

Open questions:

- B9. In your own words, what is the difference between "Found in corpus" and "verified"? ______________________
- B10. Which one thing on screen would you want checked by a human before you rely on it? ______________________
- B11. Was there anything the portal showed that you did not believe? What and why? ______________________

### How the analyst reads Part B (calibration, not agreement)

The right answers are not all "agree". The portal checks only two things today, so:

| Item | Well-calibrated answer | Over-trust signal |
|---|---|---|
| B1 | 1 or 2 (found does not mean the quote is accurate) | 4 or 5 |
| B2 | 1 or 2 (it only means nothing adverse is recorded) | 4 or 5 |
| B3 | 4 or 5 | 1 or 2 |
| B4 | no fixed answer; high is good | n/a |
| B5 | 1 or 2 | 4 or 5 |
| B6 | 4 or 5 | 1 or 2 (redesign the warning) |
| B7 | 3 to 5 (honesty is welcomed) | 1 (users read it as incompleteness: review wording) |
| B8 | 4 or 5 | 1 or 2 |

Report the share of well-calibrated answers for B1, B2 and B5 (target at least 85%) and flag every over-trust answer for triage as a possible severity-4 issue, together with the matching H-task result.

---

## Part C: Clarity of statuses and labels

For each item, show the participant the label **without context** (read aloud or on a card) and ask: "What does this mean to you?" The observer writes the answer verbatim and scores it against the glossary: 2 = correct, 1 = partly correct, 0 = wrong or no idea. Do this before the participant sees the glossary column, which is never shown to them.

| # | Label shown (English UI) | Meaning the system intends (glossary) |
|---|---|---|
| C1 | No adverse treatment recorded | No overruling or distinguishing is recorded in the corpus for this judgment. Not a confirmation that the law is good. |
| C2 | Overruled by ... Do not rely on it. | A later judgment recorded in the corpus overruled it. |
| C3 | Found in corpus | A judgment matching the citation exists in this database. Says nothing about quote accuracy. |
| C4 | Not checked yet | This check has not been built or run. It is not a pass and not a fail. |
| C5 | Not found in the corpus | No match in this database. The citation may be wrong or the case not loaded. |
| C6 | Template draft / Template fallback | The text is a fixed template filled with your inputs, not written by a model. |
| C7 | Sample data — not read from your document | The details on screen are a built-in sample because the reader could not read the file. |
| C8 | Approved by bench | A user with approval rights approved it in Gyanam. Not a digital signature. |
| C9 | Final, sealed | The draft can no longer be edited and a fingerprint (SHA-256) of the export was recorded. |
| C10 | Returned to clerk | The judge sent it back; the clerk can edit it and send it again. |
| C11 | Chain intact | The audit ledger has no changed or missing entries. |
| C12 | User not recorded | The portal did not record who acted when this older entry was written. |
| C13 | Suspended until restart | The suspension is temporary and ends when the server restarts. |
| C14 | No citation links recorded yet | The corpus holds no citation links for this judgment. It does not mean no one cited it. |

Then ask the participant to rate, from 1 (very unclear) to 5 (very clear):

- C15. The words used for statuses overall. ☐1 ☐2 ☐3 ☐4 ☐5
- C16. The colours used for statuses (green, amber, red, grey). ☐1 ☐2 ☐3 ☐4 ☐5
- C17. Which status word would you change, and to what? ______________________

Scoring: average the 0 to 2 scores per label. A label with a mean below 1.5 (or any participant scoring 0 on C1, C3, C4 or C7) goes to triage as a wording issue; apply UAT plan §9 for severity.

---

## Part D: Hindi labels (only for participants who did the Hindi block)

Participant switched the interface to Hindi in Settings. Show each Hindi label as it appears in the UI. Ask what it means in their words, then ask whether it is clear (Y) or unclear/misleading (N). The reference column is the intended meaning, which the participant never sees. The Hindi text is taken from the current Hindi message files (`frontend/app/js/i18n/pages/*.hi.js`); if a file changes, copy the new text to the card before the session.

| # | Hindi label on screen | Intended meaning | Clear (Y/N) | Participant's words |
|---|---|---|---|---|
| D1 | कोई प्रतिकूल उपचार दर्ज नहीं | No adverse treatment recorded | | |
| D2 | अधिक्रमित (ओवररूल्ड) | Overruled | | |
| D3 | पलटा गया (the Alerts page label) | Overruled. Check whether participants take it as the same as D2. | | |
| D4 | भिन्न माना गया | Distinguished | | |
| D5 | निर्णय कॉर्पस में मौजूद है | Judgment exists in the corpus | | |
| D6 | अभी जाँचा नहीं गया | Not checked yet | | |
| D7 | कॉर्पस में नहीं मिला | Not found in the corpus | | |
| D8 | उद्धरण-से-अनुच्छेद मिलान | Quote-to-paragraph match | | |
| D9 | टेम्पलेट विकल्प | Template fallback | | |
| D10 | नमूना डेटा — आपके दस्तावेज़ से नहीं पढ़ा गया | Sample data, not read from your document | | |
| D11 | केवल ज्ञानम् में अनुमोदन। डिजिटल हस्ताक्षर जुड़ा नहीं है। | Approval in Gyanam only. Digital signature not connected. | | |
| D12 | अनुमोदित करें / अंतिम रूप में मुहरबंद करें / लिपिक को लौटाएँ | Approve / Seal as final / Return to clerk | | |
| D13 | अभी कोई उद्धरण संबंध दर्ज नहीं | No citation links recorded yet | | |
| D14 | श्रृंखला अखंड | Chain intact | | |
| D15 | उपयोगकर्ता दर्ज नहीं | User not recorded | | |
| D16 | पुनः आरंभ तक निलंबित | Suspended until restart | | |

Then:

- D17. Are any English legal terms better left in English (for example "ratio", "coram", "overruled")? Which? ______________________
- D18. Which Hindi word sounds like court language and which sounds like translated software language? ______________________
- D19. Overall, how natural is the Hindi? ☐1 ☐2 ☐3 ☐4 ☐5
- D20. Did anything change meaning when you switched from English to Hindi? ______________________

Scoring for S10: a label is "understood" when the participant's words match the intended meaning. Compute the share understood per label. Below 80%, or any participant calling a label misleading, sends the label to the native-speaker reviewer (plan P8). Note D2 versus D3: the current Hindi message files use two different words for "overruled", so record explicitly whether participants treat them as the same.

---

## Part E: Closing

- E1. How likely are you to recommend this portal to a colleague in your role? 0 (not at all) to 10 (extremely): ☐0 ☐1 ☐2 ☐3 ☐4 ☐5 ☐6 ☐7 ☐8 ☐9 ☐10
- E2. What is the one thing that would stop you using this at work? ______________________
- E3. What is the one thing you liked best? ______________________
- E4. Is there anything you expected that the portal did not offer? ______________________ (the observer logs these as "expectation gaps", UAT plan §10 step 8)
- E5. May we contact you for a follow-up question? ☐ Yes ☐ No (contact details are kept apart from this form)
