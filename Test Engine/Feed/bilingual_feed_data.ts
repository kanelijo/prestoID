/**
 * MockS Bilingual Real-Time Exam Feed Data
 * Contains authentic updates, notifications, and strategies in English + Hindi
 */

export interface BilingualFeedItem {
  id: string;
  category: 'EXAM_UPDATES' | 'STRATEGY' | 'CURRENT_AFFAIRS';
  title: string;
  title_hi: string;
  summary: string;
  summary_hi: string;
  target_exam: string;
  exam_category: 'Govt' | 'Engineering Entrance' | 'Medical Entrance' | 'Central & Law' | 'Boards Exam';
  official_pdf_url: string | null;
  created_at: string;
  source_portal: string;
}

export const INITIAL_BILINGUAL_FEEDS: BilingualFeedItem[] = [
  // ─── 1. GOVT (MPPSC, MP POLICE, SSC CGL) ───────────────────────────
  {
    id: 'feed_mppsc_2026_notif',
    category: 'EXAM_UPDATES',
    title: 'MPPSC State Services 2026 Official Notification Released',
    title_hi: 'एमपी लोक सेवा आयोग राज्य सेवा परीक्षा 2026 आधिकारिक अधिसूचना जारी',
    summary: 'Madhya Pradesh Public Service Commission has officially announced 227 administrative posts including Deputy Collector and DSP. Online registration opens next week.',
    summary_hi: 'मध्य प्रदेश लोक सेवा आयोग ने डिप्टी कलेक्टर और डीएसपी सहित 227 प्रशासनिक पदों के लिए विज्ञापन जारी किया है। ऑनलाइन आवेदन अगले सप्ताह से शुरू होंगे।',
    target_exam: 'MPPSC',
    exam_category: 'Govt',
    official_pdf_url: 'https://mppsc.mp.gov.in',
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30m ago
    source_portal: 'mppsc.mp.gov.in',
  },
  {
    id: 'feed_mppsc_strat_gk',
    category: 'STRATEGY',
    title: 'MPPSC Prelims: Top 10 High-Yield MP History & Geography Units',
    title_hi: 'एमपीपीएससी प्रारंभिक परीक्षा: एमपी इतिहास और भूगोल के महत्वपूर्ण अध्याय',
    summary: 'Detailed blueprint analyzing how Units 1, 3, and 5 contribute over 42% of questions in Paper 1. Focus areas include MP tribal heritage and river systems.',
    summary_hi: 'पेपर 1 में 42% से अधिक प्रश्नों का विश्लेषण। मध्य प्रदेश की जनजातीय विरासत, प्रमुख नदियां और संवैधानिक व्यवस्था पर विशेष ध्यान दें।',
    target_exam: 'MPPSC',
    exam_category: 'Govt',
    official_pdf_url: null,
    created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(), // 3h ago
    source_portal: 'MockS Editorial Team',
  },
  {
    id: 'feed_ssc_cgl_tier1_dates',
    category: 'EXAM_UPDATES',
    title: 'SSC CGL Tier-1 Examination Schedule & Admit Card Status',
    title_hi: 'एसएससी सीजीएल टियर-1 परीक्षा कार्यक्रम और प्रवेश पत्र स्थिति',
    summary: 'Staff Selection Commission has uploaded application status for all regional zones. Tier-1 CBT examination will be conducted in multiple shifts.',
    summary_hi: 'कर्मचारी चयन आयोग ने सभी क्षेत्रीय जोनों के लिए आवेदन स्थिति जारी कर दी है। टियर-1 कंप्यूटर आधारित परीक्षा कई पालियों में आयोजित की जाएगी।',
    target_exam: 'SSC CGL/CHSL',
    exam_category: 'Govt',
    official_pdf_url: 'https://ssc.gov.in',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(), // 8h ago
    source_portal: 'ssc.gov.in',
  },
  {
    id: 'feed_mp_police_si_update',
    category: 'EXAM_UPDATES',
    title: 'MP Police Sub-Inspector (SI) & Constable Physical Test Norms',
    title_hi: 'एमपी पुलिस सब-इंस्पेक्टर (एसआई) शारीरिक दक्षता परीक्षा मापदंड',
    summary: 'Home Department Madhya Pradesh updates physical endurance standards (800m run, long jump, shot put) and marks weightage distribution.',
    summary_hi: 'मध्य प्रदेश गृह विभाग ने 800 मीटर दौड़, लंबी कूद और गोला फेंक के शारीरिक दक्षता मानकों और अंकों के वितरण को अंतिम रूप दिया।',
    target_exam: 'MP POLICE',
    exam_category: 'Govt',
    official_pdf_url: 'https://esb.mp.gov.in',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    source_portal: 'esb.mp.gov.in',
  },

  // ─── 2. ENGINEERING (JEE MAIN, JEE ADVANCED) ──────────────────────
  {
    id: 'feed_jee_main_session1',
    category: 'EXAM_UPDATES',
    title: 'NTA JEE Main Session 1 Registration & Examination Guidelines',
    title_hi: 'एनटीए जेईई मेन सत्र 1 पंजीकरण और परीक्षा दिशानिर्देश जारी',
    summary: 'National Testing Agency opens online application window. Candidates can check revised syllabus, Section B integer rounding instructions, and city slips.',
    summary_hi: 'राष्ट्रीय परीक्षा एजेंसी (NTA) ने जेईई मेन सत्र 1 के लिए आवेदन पोर्टल खोला। संशोधित पाठ्यक्रम और सेक्शन बी के पूर्णांक नियमों की जांच करें।',
    target_exam: 'JEE Main',
    exam_category: 'Engineering Entrance',
    official_pdf_url: 'https://jeemain.nta.nic.in',
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    source_portal: 'jeemain.nta.nic.in',
  },
  {
    id: 'feed_jee_physics_weightage',
    category: 'STRATEGY',
    title: 'High-Scoring Chapters in JEE Physics: Modern Physics & Electrodynamics',
    title_hi: 'जेईई फिजिक्स के सर्वाधिक स्कोरिंग अध्याय: आधुनिक भौतिकी और विद्युत चुंबकत्व',
    summary: 'Mastering 5 core chapters can secure 60+ marks in Physics. Review PYQs from 2021-2024 NTA morning and evening shift papers.',
    summary_hi: 'भौतिकी में केवल 5 मुख्य अध्यायों से 60+ अंक हासिल किए जा सकते हैं। 2021-2024 के पिछले वर्षों के प्रश्नों का अभ्यास करें।',
    target_exam: 'JEE Main',
    exam_category: 'Engineering Entrance',
    official_pdf_url: null,
    created_at: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    source_portal: 'MockS Engineering Cell',
  },

  // ─── 3. MEDICAL (NEET UG) ─────────────────────────────────────────
  {
    id: 'feed_neet_ug_bulletin',
    category: 'EXAM_UPDATES',
    title: 'NTA NEET UG Information Bulletin: Updated Qualifying Percentiles',
    title_hi: 'एनटीए नीट यूजी सूचना विवरणिका: अद्यतन योग्यता पर्सेंटाइल और नियम',
    summary: 'NTA releases official notification for MBBS, BDS, AYUSH admissions. 200 minutes pen-and-paper format confirmed across 550+ exam cities in India.',
    summary_hi: 'एनटीए ने एमबीबीएस, बीडीएस और आयुष प्रवेश के लिए अधिसूचना जारी की। भारत के 550+ शहरों में 200 मिनट का पेन-पेपर प्रारूप में परीक्षा होगी।',
    target_exam: 'NEET UG',
    exam_category: 'Medical Entrance',
    official_pdf_url: 'https://exams.nta.ac.in/NEET',
    created_at: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
    source_portal: 'exams.nta.ac.in/NEET',
  },
  {
    id: 'feed_neet_bio_ncert_tactics',
    category: 'STRATEGY',
    title: 'How to Target 350+ in NEET Biology: Line-by-Line NCERT Plan',
    title_hi: 'नीट बायोलॉजी में 350+ अंक कैसे प्राप्त करें: एनसीईआरटी अध्ययन योजना',
    summary: 'Human Physiology, Genetics, and Ecology constitute over 56% of Biology marks. Diagram-labeling drill sheets and summary tables recommended.',
    summary_hi: 'मानव शरीर विज्ञान, आनुवंशिकी और पारिस्थितिकी जीव विज्ञान के 56% से अधिक अंकों का निर्माण करते हैं। चित्र-आधारित प्रश्नों पर ध्यान केंद्रित करें।',
    target_exam: 'NEET UG',
    exam_category: 'Medical Entrance',
    official_pdf_url: null,
    created_at: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    source_portal: 'MockS Medical Faculty',
  },

  // ─── 4. CENTRAL & LAW (CUET, CLAT, CAT) ───────────────────────────
  {
    id: 'feed_cuet_ug_portal',
    category: 'EXAM_UPDATES',
    title: 'CUET UG Registration Portal Active for Central & State Universities',
    title_hi: 'सीयूईटी यूजी पंजीकरण पोर्टल केंद्रीय और राज्य विश्वविद्यालयों के लिए सक्रिय',
    summary: 'Combined University Entrance Test dates confirmed for admissions to DU, BHU, JNU, and participating institutions across General and Domain tests.',
    summary_hi: 'डीयू, बीएचयू, जेएनयू और राज्य विश्वविद्यालयों में प्रवेश के लिए सीयूईटी परीक्षा तिथियों की पुष्टि। सामान्य परीक्षण और डोमेन विषयों के संयोजन की जांच करें।',
    target_exam: 'CUET [UG/PG]',
    exam_category: 'Central & Law',
    official_pdf_url: 'https://cuetug.ntaonline.in',
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    source_portal: 'cuetug.ntaonline.in',
  },
  {
    id: 'feed_clat_legal_reasoning',
    category: 'STRATEGY',
    title: 'Cracking CLAT Legal Reasoning & Passage-Based Critical Questions',
    title_hi: 'क्लैट लीगल रीजनिंग और पैसेज-आधारित प्रश्नों को हल करने की तकनीक',
    summary: 'Key constitutional landmark judgments and contract law principles essential for National Law Universities entrance examination.',
    summary_hi: 'राष्ट्रीय विधि विश्वविद्यालयों (NLU) प्रवेश परीक्षा के लिए महत्वपूर्ण संवैधानिक निर्णय और अनुबंध कानून के सिद्धांत।',
    target_exam: 'CLAT',
    exam_category: 'Central & Law',
    official_pdf_url: null,
    created_at: new Date(Date.now() - 1000 * 60 * 500).toISOString(),
    source_portal: 'Consortium of NLUs Insights',
  },

  // ─── 5. BOARDS (CLASS 10TH & 12TH) ────────────────────────────────
  {
    id: 'feed_cbse_12th_datesheet',
    category: 'EXAM_UPDATES',
    title: 'CBSE Class 12th & 10th Board Exam Datesheet & Practical Circular',
    title_hi: 'सीबीएसई कक्षा 10वीं और 12वीं बोर्ड परीक्षा डेटशीट और प्रायोगिक परीक्षा परिपत्र',
    summary: 'Central Board of Secondary Education announces official timetable for Science, Commerce, and Arts streams with competency-based question blueprint.',
    summary_hi: 'सीबीएसई ने विज्ञान, वाणिज्य और कला संकायों के लिए योग्यता-आधारित प्रश्न प्रारूप के साथ आधिकारिक समय सारिणी की घोषणा की।',
    target_exam: 'Class 12th PCM',
    exam_category: 'Boards Exam',
    official_pdf_url: 'https://www.cbse.gov.in',
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    source_portal: 'cbse.gov.in',
  },
];
