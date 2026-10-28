import { addMessages } from '../index.js';
import './research.hi.js';

const hi = {
  'jd.reader': 'निर्णय', 'jd.notFound': 'निर्णय नहीं मिला', 'jd.notFoundMsg': 'इस आईडी का कोई निर्णय नहीं है। वह हटाया गया हो सकता है या लिंक गलत है।', 'jd.backResearch': 'शोध पर लौटें',
  'jd.copyCite': 'उद्धरण कॉपी करें', 'jd.print': 'प्रिंट करें', 'jd.graph': 'उद्धरण ग्राफ़', 'jd.check': 'यह उद्धरण जाँचें',
  'jd.metadata': 'अभिलेख विवरण', 'jd.status': 'उपचार', 'jd.statusNote': 'कॉर्पस में कोई प्रतिकूल उपचार दर्ज नहीं है। यह इस बात की जाँच नहीं कि विधि अब भी मान्य है; स्रोत से पुष्टि करें।',
  'jd.openOverruling': 'अधिक्रमित करने वाला निर्णय खोजें', 'jd.pdfTitle': 'स्रोत निर्णय (PDF)', 'jd.openOriginal': 'मूल खोलें', 'jd.pdfNote': 'PDF ही स्वयं निर्णय है।',
  'jd.noPdf': 'इस अभिलेख के लिए कोई स्रोत PDF जुड़ी नहीं है।', 'jd.noText': 'इस अभिलेख का पूर्ण पाठ उपलब्ध नहीं है।', 'jd.none': 'दर्ज नहीं।', 'jd.noLinks': 'अभी तक कोई उद्धरण संबंध दर्ज नहीं।',
  'jd.sections': 'निर्णय के खंड', 'jd.tab.judgment': 'निर्णय', 'jd.tab.headnote': 'हेडनोट', 'jd.tab.ratio': 'रेशियो', 'jd.tab.cited': 'उद्धृत मामले',
  'jd.partyPet': 'अपीलकर्ता / याचिकाकर्ता', 'jd.partyRes': 'प्रतिवादी', 'jd.parties': 'पक्षकार', 'jd.copyRatio': 'अनुपात कॉपी करें', 'jd.copyHeadnote': 'शीर्षनोट कॉपी करें', 'jd.copiedText': 'कॉपी हो गया',
  'jd.copyPara': 'उद्धरण सहित अनुच्छेद कॉपी करें', 'jd.paraLink': 'अनुच्छेद {n} का लिंक', 'jd.tab.paragraphs': 'अनुच्छेद',
  'jd.parasNone': 'इस निर्णय के अनुच्छेदों का पाठ अभी उपलब्ध नहीं है', 'jd.parasNoneMsg': 'स्रोत PDF ही स्वयं निर्णय है।', 'jd.parasFailed': 'अनुच्छेद लोड नहीं हो सके।', 'jd.paraPage': 'पृष्ठ {p}', 'jd.paraMissing': 'अनुच्छेद {n} लोड किए गए पाठ में नहीं है।',
  'jd.citedByTitle': 'इन निर्णयों में उद्धृत', 'jd.citedByNone': 'कॉर्पस में इस अभिलेख को उद्धृत करने वाला कोई निर्णय दर्ज नहीं है।', 'jd.citedByFailed': 'उद्धृत करने वाले निर्णय लोड नहीं हो सके।', 'jd.citedByPara': 'अनुच्छेद {n}',
  'jd.downloadPdf': 'PDF डाउनलोड करें', 'jd.startDraft': 'इस निर्णय के साथ मसौदा शुरू करें',
};
addMessages('hi', hi);
export default hi;
