import { addMessages } from '../index.js';
import './judgment.en.js';

const en = {
  'cc.title': 'Check a citation', 'cc.lede': 'Paste an SCC, AIR, SCR, INSC or neutral citation. We look it up in the corpus and report any recorded adverse treatment.',
  'cc.label': 'Citation', 'cc.hint': 'For example (2010) 11 SCC 441', 'cc.submit': 'Check citation', 'cc.try': 'Try:',
  'cc.past': 'Past checks', 'cc.pastNote': 'Kept in this browser for this session only.',
  'cc.chk.format': 'Citation format recognised', 'cc.chk.found': 'Judgment found in the corpus', 'cc.chk.treatment': 'Adverse treatment recorded?', 'cc.chk.quote': 'Quote-to-paragraph match',
  'cc.fmtOk': 'Format: {f}', 'cc.fmtUnknown': 'Format not recognised; matched by text search.', 'cc.notChecked': 'Not checked', 'cc.later': 'Needs judgment text (paragraphs not loaded yet)',
  'cc.treat.overruled': 'Recorded as overruled', 'cc.treat.dist': 'Recorded as distinguished; check factual parity',
  'cc.overruledBy': 'Overruled by {by}. Do not rely on it.', 'cc.overruled': 'This decision is recorded as overruled. Do not rely on it.',
  'cc.distinguished': 'This decision has been distinguished in later judgments. Check that the facts are comparable.',
  'cc.foundNote': 'Found in the corpus. No adverse treatment is recorded, which is not a confirmation that the law is still good.',
  'cc.notFoundTitle': 'Not found in the corpus', 'cc.notFoundMsg': 'No match for "{q}".', 'cc.notFoundHint': 'Check the volume, the report abbreviation (SCC, SCR, AIR) and the page. The citation may also be wrong.',
  'cc.searchInstead': 'Search for it instead', 'cc.checks': 'Checks', 'cc.openJudgment': 'Open this judgment', 'cc.openOverruling': 'Search for the overruling judgment',
  'cc.tab.single': 'Check a citation', 'cc.tab.doc': 'Check a document', 'cc.benchmarks': 'Benchmark citations:', 'cc.tabs': 'Citation check modes',
  'cc.doc.lede': 'Paste the text of a pleading or brief, or choose a .txt, .pdf or .docx file. Every citation found is looked up in the corpus.', 'cc.doc.text': 'Document text', 'cc.doc.file': 'Or choose a file', 'cc.doc.run': 'Check citations',
  'cc.doc.needInput': 'Paste some text or choose a file first.', 'cc.doc.unsupported': 'Only .txt, .pdf and .docx files can be checked.', 'cc.doc.uploaded': 'The file was uploaded to Documents so its citations could be extracted.',
  'cc.doc.textOnly': 'You cannot upload files, so only pasted text or a .txt file can be checked. PDF and Word files need the upload permission.',
  'cc.doc.none': 'No citations were found in this document.', 'cc.doc.summary': '{total} citations: {found} found, {overruled} overruled, {distinguished} distinguished, {notfound} not found.',
  'cc.doc.col.citation': 'Citation', 'cc.doc.col.verdict': 'Result', 'cc.doc.col.match': 'Matched case', 'cc.doc.col.actions': 'Actions',
  'cc.doc.v.found': 'Found, no adverse treatment recorded', 'cc.doc.v.overruled': 'Overruled', 'cc.doc.v.distinguished': 'Distinguished', 'cc.doc.v.notfound': 'Not found in corpus', 'cc.doc.v.unknown': 'Not checked',
  'cc.doc.addBrief': 'Add to brief', 'cc.doc.openPdf': 'Open PDF', 'cc.doc.openJudgment': 'Open', 'cc.doc.noMatch': 'No match', 'cc.doc.exportCsv': 'Export table (CSV)', 'cc.doc.working': 'Checking citations', 'cc.doc.failed': 'The document could not be checked.',
  'cc.startDraft': 'Start a draft with this authority', 'cc.addBrief': 'Add to bench brief', 'cc.openPdf': 'Open source PDF',
};
addMessages('en', en);
export default en;
