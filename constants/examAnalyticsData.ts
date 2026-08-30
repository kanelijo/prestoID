export interface Topic {
  id: string;
  name: string;
  weight: string;
  isHighYield?: boolean;
}

export interface SubjectGroup {
  subject: string;
  topics: Topic[];
}

export interface ExamPatternItem {
  title: string;
  details: string[];
}

export interface CutoffEntry {
  year: string;
  general: string;
  obc: string;
  sc_st: string;
  ews?: string;
}

export interface ExamAnalyticsData {
  examName: string;
  category: string;
  totalMarks: number;
  durationMinutes: number;
  negativeMarking: string;
  targetSafeScore: string;
  syllabus: SubjectGroup[];
  pattern: ExamPatternItem[];
  eligibility: string[];
  cutoffs: CutoffEntry[];
  phases: {
    phase: string;
    title: string;
    description: string;
  }[];
  mockAdvice: string;
}

export const EXAM_ANALYTICS_MAP: Record<string, ExamAnalyticsData> = {
  'MPPSC': {
    examName: 'MPPSC State Services',
    category: 'Govt / Civil Services',
    totalMarks: 400,
    durationMinutes: 240,
    negativeMarking: 'No Negative Marking in Prelims',
    targetSafeScore: '162+ / 200 (Paper I)',
    syllabus: [
      {
        subject: 'General Studies (Paper 1) — High Yield',
        topics: [
          { id: 'mppsc_1', name: 'History, Culture & Literature of MP', weight: 'High Yield (18%)', isHighYield: true },
          { id: 'mppsc_2', name: 'Geography of Madhya Pradesh', weight: 'High Yield (16%)', isHighYield: true },
          { id: 'mppsc_3', name: 'Constitutional System & Economy of MP', weight: 'High Yield (14%)', isHighYield: true },
          { id: 'mppsc_4', name: 'National & Regional Constitutional Bodies (Units 10)', weight: 'High Yield (15%)', isHighYield: true },
          { id: 'mppsc_5', name: 'Science & Technology (ICT, Robotics, AI)', weight: 'High Yield (12%)', isHighYield: true },
          { id: 'mppsc_6', name: 'Current Events (National, International & MP)', weight: 'Med Yield (10%)' },
          { id: 'mppsc_7', name: 'History of India & National Movement', weight: 'Med Yield (8%)' },
          { id: 'mppsc_8', name: 'World & Indian Physical Geography', weight: 'Low Yield (7%)' },
        ],
      },
      {
        subject: 'General Aptitude / CSAT (Paper 2)',
        topics: [
          { id: 'mppsc_csat_1', name: 'Reading Comprehension (Hindi & English)', weight: 'High Yield (30%)', isHighYield: true },
          { id: 'mppsc_csat_2', name: 'Logical Reasoning & Analytical Ability', weight: 'High Yield (25%)', isHighYield: true },
          { id: 'mppsc_csat_3', name: 'Decision Making & Problem Solving', weight: 'Med Yield (15%)' },
          { id: 'mppsc_csat_4', name: 'Basic Numeracy & Data Interpretation', weight: 'High Yield (20%)', isHighYield: true },
          { id: 'mppsc_csat_5', name: 'Class 10th Hindi Grammar', weight: 'Med Yield (10%)' },
        ],
      },
    ],
    pattern: [
      {
        title: 'Prelims Examination Format',
        details: [
          'Paper I: General Studies (100 Questions / 200 Marks / 2 Hours)',
          'Paper II: General Aptitude Test (100 Questions / 200 Marks / 2 Hours)',
          'Nature: Objective Multiple Choice (OMR/CBT)',
          'Negative Marking: Zero (No penalty for incorrect response)',
          'Qualification: Paper II is qualifying (40% for UR, 30% for Reserved)',
        ],
      },
      {
        title: 'Mains Examination Format',
        details: [
          '6 Descriptive Papers totaling 1500 Marks',
          'Interview / Personality Test: 175 Marks',
          'Final Merit calculated on Mains (1500) + Interview (175)',
        ],
      },
    ],
    eligibility: [
      'Graduation in any discipline from a recognized University.',
      'Age Limit: 21 to 40 Years (Relaxation of 5 years for SC/ST/OBC/Women of MP).',
      'MP State Employment Exchange (Rojgar Panjiyan) registration is mandatory.',
    ],
    cutoffs: [
      { year: '2024 (Prelims)', general: '162 / 200', obc: '158 / 200', sc_st: '142 / 200', ews: '156 / 200' },
      { year: '2023 (Prelims)', general: '160 / 200', obc: '154 / 200', sc_st: '138 / 200', ews: '154 / 200' },
      { year: '2022 (Prelims)', general: '154 / 200', obc: '148 / 200', sc_st: '134 / 200', ews: '148 / 200' },
    ],
    phases: [
      {
        phase: 'Phase 1: MP Special Mastery (Weeks 1-6)',
        title: 'Complete Units 1, 3, 5, 10',
        description: 'Over 45% questions originate from MP History, Geography, Polity, and Commissions. Prioritize these over ancient Indian history.',
      },
      {
        phase: 'Phase 2: Science, Tech & Current Affairs (Weeks 7-10)',
        title: 'Unit 7 & 9 Deep Dive',
        description: 'ICT, Robotics, Artificial Intelligence, and MP-specific government welfare schemes and budget allocations.',
      },
      {
        phase: 'Phase 3: Test Series & Error Log (Last 4 Weeks)',
        title: 'Full-Length Mock Drills',
        description: 'Take 2 Mock tests weekly in 10:00 AM - 12:00 PM slot to match real exam biological clock. Review all incorrect options.',
      },
    ],
    mockAdvice: 'Target at least 25 Sectional Drills and 15 Full-Length Mock Exams with an average score of 165+ for 100% safe qualification.',
  },

  'JEE Main': {
    examName: 'JEE Main (Engineering Entrance)',
    category: 'Engineering Entrance',
    totalMarks: 300,
    durationMinutes: 180,
    negativeMarking: '-1 Mark for incorrect MCQ & Numerical Response',
    targetSafeScore: '190+ / 300 (99+ Percentile)',
    syllabus: [
      {
        subject: 'Physics — High Yield Topics',
        topics: [
          { id: 'jee_p_1', name: 'Mechanics & Rotational Motion', weight: 'High Yield (24%)', isHighYield: true },
          { id: 'jee_p_2', name: 'Current Electricity & Magnetism', weight: 'High Yield (20%)', isHighYield: true },
          { id: 'jee_p_3', name: 'Modern Physics & Dual Nature', weight: 'High Yield (16%)', isHighYield: true },
          { id: 'jee_p_4', name: 'Ray Optics & Wave Optics', weight: 'Med Yield (14%)', isHighYield: true },
          { id: 'jee_p_5', name: 'Thermodynamics & Kinetic Theory', weight: 'Med Yield (14%)' },
          { id: 'jee_p_6', name: 'Gravitation & Fluid Mechanics', weight: 'Low Yield (12%)' },
        ],
      },
      {
        subject: 'Chemistry — High Yield Topics',
        topics: [
          { id: 'jee_c_1', name: 'Organic Reaction Mechanisms & Carbonyls', weight: 'High Yield (28%)', isHighYield: true },
          { id: 'jee_c_2', name: 'Coordination Compounds & d/f-Block', weight: 'High Yield (22%)', isHighYield: true },
          { id: 'jee_c_3', name: 'Chemical Bonding & Molecular Structure', weight: 'High Yield (18%)', isHighYield: true },
          { id: 'jee_c_4', name: 'Thermodynamics & Chemical Equilibrium', weight: 'Med Yield (16%)' },
          { id: 'jee_c_5', name: 'Electrochemistry & Chemical Kinetics', weight: 'Med Yield (16%)' },
        ],
      },
      {
        subject: 'Mathematics — High Yield Topics',
        topics: [
          { id: 'jee_m_1', name: 'Differential & Integral Calculus', weight: 'High Yield (32%)', isHighYield: true },
          { id: 'jee_m_2', name: 'Vectors & 3D Geometry', weight: 'High Yield (20%)', isHighYield: true },
          { id: 'jee_m_3', name: 'Coordinate Geometry (Conics & Circles)', weight: 'High Yield (18%)', isHighYield: true },
          { id: 'jee_m_4', name: 'Matrices, Determinants & Sequences', weight: 'Med Yield (16%)' },
          { id: 'jee_m_5', name: 'Probability, Permutations & Statistics', weight: 'Med Yield (14%)' },
        ],
      },
    ],
    pattern: [
      {
        title: 'NTA Exam Structure',
        details: [
          '75 Questions to attempt out of 90 (25 each in Physics, Chemistry, Math)',
          'Section A: 20 Mandatory Multiple Choice Questions per subject',
          'Section B: 10 Numerical value questions (Attempt any 5 per subject)',
          'Marking: +4 for correct, -1 for wrong response in both Sections',
          'Total Duration: 180 Minutes (3 Hours) Computer Based Test (CBT)',
        ],
      },
    ],
    eligibility: [
      'Passed 10+2 / Class 12 with Physics, Chemistry, Mathematics with 75% aggregate (65% for SC/ST) or top 20 percentile in respective board.',
      'No upper age limit for JEE Main.',
    ],
    cutoffs: [
      { year: '2024 (Percentile)', general: '93.23', obc: '79.28', sc_st: '60.09 / 46.69', ews: '81.32' },
      { year: '2023 (Percentile)', general: '90.77', obc: '73.61', sc_st: '51.97 / 37.29', ews: '75.62' },
      { year: '2022 (Percentile)', general: '88.41', obc: '67.00', sc_st: '43.08 / 26.77', ews: '63.11' },
    ],
    phases: [
      {
        phase: 'Phase 1: High-Weightage Chapters (Weeks 1-8)',
        title: 'Master Modern Physics, Vectors/3D, Organic Carbonyls',
        description: 'These topics alone provide 40% of the total test score with high accuracy returns.',
      },
      {
        phase: 'Phase 2: PYQ Solving & Timing (Weeks 9-14)',
        title: 'Solve Previous 5 Years (2020-2024 NTA Shifts)',
        description: 'Complete 30 papers timed with stopwatch. Master Section B integer rounding rules.',
      },
      {
        phase: 'Phase 3: Simulated CBT Mocks (Weeks 15-18)',
        title: 'Full Simulation with Error Log',
        description: 'Strict 3-hour mock test routine with negative marking analysis. Review missed concepts within 24h.',
      },
    ],
    mockAdvice: 'Maintain an 85%+ accuracy rate in Section A before attempting risky guesses in Section B.',
  },

  'NEET UG': {
    examName: 'NEET UG (Medical Entrance)',
    category: 'Medical Entrance',
    totalMarks: 720,
    durationMinutes: 200,
    negativeMarking: '-1 Mark for incorrect response',
    targetSafeScore: '650+ / 720 (Govt Medical College MBBS)',
    syllabus: [
      {
        subject: 'Biology (Botany & Zoology) — 360 Marks',
        topics: [
          { id: 'neet_b_1', name: 'Human Physiology & Organ Systems', weight: 'High Yield (22%)', isHighYield: true },
          { id: 'neet_b_2', name: 'Genetics & Molecular Basis of Inheritance', weight: 'High Yield (20%)', isHighYield: true },
          { id: 'neet_b_3', name: 'Ecology & Biodiversity Conservation', weight: 'High Yield (16%)', isHighYield: true },
          { id: 'neet_b_4', name: 'Cell Biology & Cell Cycle', weight: 'Med Yield (14%)', isHighYield: true },
          { id: 'neet_b_5', name: 'Plant Physiology & Photosynthesis', weight: 'Med Yield (14%)' },
          { id: 'neet_b_6', name: 'Human Reproduction & Reproductive Health', weight: 'Med Yield (14%)' },
        ],
      },
      {
        subject: 'Physics — 180 Marks',
        topics: [
          { id: 'neet_p_1', name: 'Current Electricity & Magnetic Effects', weight: 'High Yield (22%)', isHighYield: true },
          { id: 'neet_p_2', name: 'Mechanics (Laws of Motion, Work, Energy)', weight: 'High Yield (20%)', isHighYield: true },
          { id: 'neet_p_3', name: 'Modern Physics & Semiconductors', weight: 'High Yield (18%)', isHighYield: true },
          { id: 'neet_p_4', name: 'Optics (Ray & Wave)', weight: 'Med Yield (14%)' },
          { id: 'neet_p_5', name: 'Thermodynamics & Thermal Physics', weight: 'Med Yield (14%)' },
        ],
      },
      {
        subject: 'Chemistry — 180 Marks',
        topics: [
          { id: 'neet_c_1', name: 'Organic Chemistry (Named Reactions & Biomolecules)', weight: 'High Yield (30%)', isHighYield: true },
          { id: 'neet_c_2', name: 'Coordination Compounds & Periodic Table', weight: 'High Yield (20%)', isHighYield: true },
          { id: 'neet_c_3', name: 'Equilibrium (Ionic & Chemical)', weight: 'High Yield (18%)', isHighYield: true },
          { id: 'neet_c_4', name: 'Chemical Kinetics & Solutions', weight: 'Med Yield (16%)' },
          { id: 'neet_c_5', name: 'Structure of Atom & Bonding', weight: 'Med Yield (16%)' },
        ],
      },
    ],
    pattern: [
      {
        title: 'NTA Exam Structure',
        details: [
          '180 Questions to answer out of 200 (45 each in Physics, Chemistry, Botany, Zoology)',
          'Section A: 35 Mandatory Questions per subject',
          'Section B: 15 Questions per subject (Answer any 10)',
          'Marking: +4 for correct answer, -1 for wrong answer, 0 for unattempted',
          'Total Duration: 200 Minutes (3 Hours 20 Minutes) Pen-and-Paper OMR',
        ],
      },
    ],
    eligibility: [
      'Passed 10+2 with Physics, Chemistry, Biology/Biotechnology and English.',
      'Minimum 50% aggregate for UR, 40% for OBC/SC/ST in PCB.',
      'Minimum age of 17 years completed on or before 31st December of the admission year.',
    ],
    cutoffs: [
      { year: '2024 (MBBS All India)', general: '655+ / 720', obc: '650+ / 720', sc_st: '580+ / 720', ews: '652+ / 720' },
      { year: '2023 (MBBS All India)', general: '618 / 720', obc: '615 / 720', sc_st: '530 / 720', ews: '616 / 720' },
      { year: '2022 (MBBS All India)', general: '596 / 720', obc: '594 / 720', sc_st: '498 / 720', ews: '595 / 720' },
    ],
    phases: [
      {
        phase: 'Phase 1: NCERT Biology Word-by-Word (Months 1-3)',
        title: 'Master all 38 Chapters in NCERT',
        description: 'Target 340+ in Biology. Every line and diagram label of NCERT Class 11 and 12 must be memorized.',
      },
      {
        phase: 'Phase 2: Physics Formulae & Organic Mechanisms (Months 4-6)',
        title: 'Speed Drill & Direct Numerical Practice',
        description: 'Solve 100 MCQs daily in Physics and Physical Chemistry within a 90-minute timer.',
      },
      {
        phase: 'Phase 3: 200-Minute Full OMR Simulations (Last 2 Months)',
        title: 'Simulated 2:00 PM to 5:20 PM Drills',
        description: 'Practice bubbling real OMR sheets to eliminate bubbling errors and negative mark leakage.',
      },
    ],
    mockAdvice: 'Aim for 350+ in Biology and 150+ in Chemistry to take off pressure from Physics calculations.',
  },

  'SSC CGL': {
    examName: 'SSC Combined Graduate Level',
    category: 'Govt / Central Staff Selection',
    totalMarks: 200,
    durationMinutes: 60,
    negativeMarking: '-0.50 Marks per wrong answer in Tier 1',
    targetSafeScore: '155+ / 200 (Tier 1)',
    syllabus: [
      {
        subject: 'General Intelligence & Reasoning (50 Marks)',
        topics: [
          { id: 'ssc_r_1', name: 'Analogy, Classification & Coding-Decoding', weight: 'High Yield (28%)', isHighYield: true },
          { id: 'ssc_r_2', name: 'Series (Number, Alphabet, Mixed)', weight: 'High Yield (24%)', isHighYield: true },
          { id: 'ssc_r_3', name: 'Syllogisms & Venn Diagrams', weight: 'High Yield (18%)', isHighYield: true },
          { id: 'ssc_r_4', name: 'Blood Relations & Direction Sense', weight: 'Med Yield (15%)' },
          { id: 'ssc_r_5', name: 'Non-Verbal (Paper Folding & Mirror Image)', weight: 'Med Yield (15%)' },
        ],
      },
      {
        subject: 'Quantitative Aptitude (50 Marks)',
        topics: [
          { id: 'ssc_q_1', name: 'Arithmetic (Percentage, Profit/Loss, Ratio, SI/CI)', weight: 'High Yield (35%)', isHighYield: true },
          { id: 'ssc_q_2', name: 'Geometry & Mensuration (2D/3D)', weight: 'High Yield (25%)', isHighYield: true },
          { id: 'ssc_q_3', name: 'Algebra & Equations', weight: 'High Yield (18%)', isHighYield: true },
          { id: 'ssc_q_4', name: 'Trigonometry & Heights/Distances', weight: 'Med Yield (12%)' },
          { id: 'ssc_q_5', name: 'Data Interpretation (Charts & Tables)', weight: 'Med Yield (10%)' },
        ],
      },
      {
        subject: 'English Comprehension & Grammar (50 Marks)',
        topics: [
          { id: 'ssc_e_1', name: 'Error Spotting & Sentence Improvement', weight: 'High Yield (30%)', isHighYield: true },
          { id: 'ssc_e_2', name: 'Vocabulary (Synonyms, Antonyms, One Word)', weight: 'High Yield (28%)', isHighYield: true },
          { id: 'ssc_e_3', name: 'Cloze Test & Reading Comprehension', weight: 'High Yield (24%)', isHighYield: true },
          { id: 'ssc_e_4', name: 'Active/Passive & Direct/Indirect Speech', weight: 'Med Yield (18%)' },
        ],
      },
      {
        subject: 'General Awareness (50 Marks)',
        topics: [
          { id: 'ssc_ga_1', name: 'Static GK (Dance, Art, Festivals, Rivers)', weight: 'High Yield (32%)', isHighYield: true },
          { id: 'ssc_ga_2', name: 'Indian Polity & Constitution Articles', weight: 'High Yield (25%)', isHighYield: true },
          { id: 'ssc_ga_3', name: 'Current Affairs (Last 8 Months)', weight: 'High Yield (22%)', isHighYield: true },
          { id: 'ssc_ga_4', name: 'General Science & History', weight: 'Med Yield (21%)' },
        ],
      },
    ],
    pattern: [
      {
        title: 'Tier 1 Format (Screening)',
        details: [
          '100 Questions (25 each in Reasoning, Quant, English, GA)',
          'Total Marks: 200 (2 Marks per question)',
          'Negative Marking: 0.50 marks deducted per wrong answer',
          'Duration: 60 Minutes (Composite Time)',
        ],
      },
      {
        title: 'Tier 2 Format (Merit)',
        details: [
          'Paper 1: Math & Reasoning (60 Q / 180 Marks / 1 Hr)',
          'English & GA (70 Q / 210 Marks / 1 Hr)',
          'Computer Knowledge Module (Qualifying) & Data Entry Speed Test',
        ],
      },
    ],
    eligibility: [
      'Bachelor’s Degree in any discipline from a recognized University.',
      'Age Limit: 18 to 30/32 Years (varies by post; relaxation for reserved categories).',
    ],
    cutoffs: [
      { year: '2024 (Tier 1)', general: '150.04', obc: '145.34', sc_st: '126.83 / 118.16', ews: '143.44' },
      { year: '2023 (Tier 1)', general: '150.04', obc: '145.93', sc_st: '126.29 / 118.16', ews: '143.44' },
      { year: '2022 (Tier 1)', general: '114.27', obc: '102.78', sc_st: '89.08 / 77.56', ews: '102.35' },
    ],
    phases: [
      {
        phase: 'Phase 1: Quant Speed & Grammar Rules (Weeks 1-6)',
        title: 'Master Vedic Math, Tables up to 30, Squares up to 50',
        description: 'Speed is the deciding factor in SSC CGL Tier 1. Complete 100 questions in 60 minutes.',
      },
      {
        phase: 'Phase 2: Static GK & Vocab Building (Weeks 7-10)',
        title: 'Learn 50 Black Book Vocab words daily',
        description: 'Memorize folk dances, classical musicians, and articles 1-51A.',
      },
      {
        phase: 'Phase 3: 1 Mock Daily Routine (Last 4 Weeks)',
        title: 'Daily CBT Mock Test with Detailed Analysis',
        description: 'Complete 30 full-length mocks. Identify topics costing more than 45 seconds per question.',
      },
    ],
    mockAdvice: 'Target 18-20 minutes in Quant, 14-16 minutes in Reasoning, 10-12 minutes in English, and 5-6 minutes in General Awareness.',
  },
};

/**
 * Returns analytics data for any target exam with seamless fallback
 */
export function getExamAnalytics(examName: string): ExamAnalyticsData {
  if (!examName) return EXAM_ANALYTICS_MAP['MPPSC'];

  const direct = EXAM_ANALYTICS_MAP[examName];
  if (direct) return direct;

  const foundKey = Object.keys(EXAM_ANALYTICS_MAP).find(
    (k) => k.toLowerCase() === examName.toLowerCase() || examName.toLowerCase().includes(k.toLowerCase())
  );

  return foundKey ? EXAM_ANALYTICS_MAP[foundKey] : EXAM_ANALYTICS_MAP['MPPSC'];
}
