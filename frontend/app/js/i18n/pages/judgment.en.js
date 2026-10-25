import { addMessages } from '../index.js';
import './research.en.js';

const en = {
  'jd.reader': 'Judgment', 'jd.notFound': 'Judgment not found', 'jd.notFoundMsg': 'No judgment has this id. It may have been removed or the link is wrong.', 'jd.backResearch': 'Back to research',
  'jd.copyCite': 'Copy citation', 'jd.print': 'Print', 'jd.graph': 'Citation graph', 'jd.check': 'Check this citation',
  'jd.metadata': 'Record details', 'jd.status': 'Treatment', 'jd.statusNote': 'No adverse treatment is recorded in the corpus. This is not a check that the law is still good; confirm against the source.',
  'jd.openOverruling': 'Search for the overruling judgment', 'jd.pdfTitle': 'Source judgment (PDF)', 'jd.openOriginal': 'Open original', 'jd.pdfNote': 'The PDF is the judgment itself.',
  'jd.noPdf': 'No source PDF is linked for this record.', 'jd.noText': 'No full text is held for this record.', 'jd.none': 'Not recorded.', 'jd.noLinks': 'No citation links recorded yet.',
  'jd.sections': 'Judgment sections', 'jd.tab.judgment': 'Judgment', 'jd.tab.headnote': 'Headnote', 'jd.tab.ratio': 'Ratio', 'jd.tab.cited': 'Cited cases',
};
addMessages('en', en);
export default en;
