import { addMessages } from '../index.js';
import './judgment.en.js';

const en = {
  'cc.title': 'Check a citation', 'cc.lede': 'Paste an SCC, AIR, SCR, INSC or neutral citation. We look it up in the corpus and report any recorded adverse treatment.',
  'cc.label': 'Citation', 'cc.hint': 'For example (2010) 11 SCC 441', 'cc.submit': 'Check citation', 'cc.try': 'Try:',
  'cc.past': 'Past checks', 'cc.pastNote': 'Kept in this browser for this session only.',
  'cc.chk.format': 'Citation format recognised', 'cc.chk.found': 'Judgment found in the corpus', 'cc.chk.treatment': 'Adverse treatment recorded?', 'cc.chk.quote': 'Quote-to-paragraph match',
  'cc.fmtOk': 'Format: {f}', 'cc.fmtUnknown': 'Format not recognised; matched by text search.', 'cc.notChecked': 'Not checked', 'cc.later': 'Not checked yet',
  'cc.treat.overruled': 'Recorded as overruled', 'cc.treat.dist': 'Recorded as distinguished; check factual parity',
  'cc.overruledBy': 'Overruled by {by}. Do not rely on it.', 'cc.overruled': 'This decision is recorded as overruled. Do not rely on it.',
  'cc.distinguished': 'This decision has been distinguished in later judgments. Check that the facts are comparable.',
  'cc.foundNote': 'Found in the corpus. No adverse treatment is recorded, which is not a confirmation that the law is still good.',
  'cc.notFoundTitle': 'Not found in the corpus', 'cc.notFoundMsg': 'No match for "{q}".', 'cc.notFoundHint': 'Check the volume, the report abbreviation (SCC, SCR, AIR) and the page. The citation may also be wrong.',
  'cc.searchInstead': 'Search for it instead', 'cc.checks': 'Checks', 'cc.openJudgment': 'Open this judgment', 'cc.openOverruling': 'Search for the overruling judgment',
};
addMessages('en', en);
export default en;
