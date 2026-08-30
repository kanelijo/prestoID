export interface ExamCategoryConfig {
  key: string;
  name: string;
  exams: string[];
  sampleTests: {
    id: string;
    title: string;
    description: string;
    exam_category: string;
    subject_name: string;
    duration_minutes: number;
    total_marks: number;
    questions_count: number;
    difficulty_level: 'Easy' | 'Medium' | 'Hard';
  }[];
  sampleLeaderboard: {
    id: string;
    rank: number;
    name: string;
    target_exam: string;
    score: number;
    accuracy: string;
    state: string;
  }[];
}

/**
 * Detailed Streams and Subjects for Board Exams (10th / 12th)
 */
export const BOARD_STREAMS: Record<string, { name: string; subjects: string[] }> = {
  'Class 12th - Science (PCM)': {
    name: 'Class 12th - Science (PCM)',
    subjects: [
      'Physics',
      'Chemistry',
      'Mathematics',
      'English Core',
      'Computer Science / IP',
      'Physical Education',
      'Hindi',
    ],
  },
  'Class 12th - Science (PCB)': {
    name: 'Class 12th - Science (PCB)',
    subjects: [
      'Physics',
      'Chemistry',
      'Biology',
      'English Core',
      'Physical Education',
      'Biotechnology',
      'Hindi',
    ],
  },
  'Class 12th - Commerce': {
    name: 'Class 12th - Commerce',
    subjects: [
      'Accountancy',
      'Business Studies',
      'Economics',
      'Mathematics / Applied Maths',
      'English Core',
      'Informatics Practices',
      'Hindi',
    ],
  },
  'Class 12th - Arts / Humanities': {
    name: 'Class 12th - Arts / Humanities',
    subjects: [
      'History',
      'Political Science',
      'Geography',
      'Economics',
      'Psychology',
      'Sociology',
      'English Core',
      'Hindi',
    ],
  },
  'Class 10th (Secondary Board)': {
    name: 'Class 10th (Secondary Board)',
    subjects: [
      'Mathematics (Standard/Basic)',
      'Science (Physics/Chem/Bio)',
      'Social Science (Hist/Civ/Geo/Eco)',
      'English Language & Literature',
      'Hindi (Course A/B)',
      'Sanskrit',
      'Information Technology',
    ],
  },
};

export const EXAM_TAXONOMY: Record<string, ExamCategoryConfig> = {
  Government: {
    key: 'Government',
    name: 'Govt Recruitment',
    exams: [
      'ALL',
      'MPPSC',
      'MP POLICE',
      'MP PATWARI',
      'SSC CGL/CHSL',
      'RAILWAY [NTPC/GROUP D]',
      'BANKING [IBPS/SBI]',
      'UPSC',
    ],
    sampleTests: [
      {
        id: 'pub-mock-1',
        title: 'MPPSC Prelims Paper 1 — Full Length Mock 2026',
        description: 'Comprehensive 100 question mock test covering MP GK, Indian Polity, History, and Geography.',
        exam_category: 'MPPSC',
        subject_name: 'General Studies',
        duration_minutes: 120,
        total_marks: 200,
        questions_count: 100,
        difficulty_level: 'Medium',
      },
      {
        id: 'pub-mock-2',
        title: 'MP Police SI & Constable — Reasoning & Math Speed Drill',
        description: 'High-yield numerical ability, non-verbal reasoning, and state aptitude practice.',
        exam_category: 'MP POLICE',
        subject_name: 'Aptitude & Reasoning',
        duration_minutes: 45,
        total_marks: 50,
        questions_count: 50,
        difficulty_level: 'Easy',
      },
      {
        id: 'pub-mock-3',
        title: 'SSC CGL/CHSL Tier-1 — General Awareness Master Drill',
        description: 'Curated MCQs on Indian Economy, History, Science & Current Affairs.',
        exam_category: 'SSC CGL/CHSL',
        subject_name: 'General Awareness',
        duration_minutes: 30,
        total_marks: 50,
        questions_count: 25,
        difficulty_level: 'Hard',
      },
      {
        id: 'pub-mock-4',
        title: 'RAILWAY [NTPC/GROUP D] — General Science Practice',
        description: 'High-frequency Physics, Chemistry, and Biology questions with bilingual explanations.',
        exam_category: 'RAILWAY [NTPC/GROUP D]',
        subject_name: 'General Science',
        duration_minutes: 40,
        total_marks: 60,
        questions_count: 40,
        difficulty_level: 'Medium',
      },
    ],
    sampleLeaderboard: [
      { id: 'gov-1', rank: 1, name: 'Ananya Sharma', target_exam: 'MPPSC', score: 192, accuracy: '96%', state: 'Bhopal, MP' },
      { id: 'gov-2', rank: 2, name: 'Rohit Verma', target_exam: 'MPPSC', score: 186, accuracy: '93%', state: 'Indore, MP' },
      { id: 'gov-3', rank: 3, name: 'Pooja Tiwari', target_exam: 'SSC CGL/CHSL', score: 182, accuracy: '91%', state: 'Jabalpur, MP' },
      { id: 'gov-4', rank: 4, name: 'Vikram Singh', target_exam: 'MP POLICE', score: 178, accuracy: '89%', state: 'Gwalior, MP' },
      { id: 'gov-5', rank: 5, name: 'Deepak Patel', target_exam: 'RAILWAY [NTPC/GROUP D]', score: 174, accuracy: '87%', state: 'Ujjain, MP' },
    ],
  },

  Engineering: {
    key: 'Engineering',
    name: 'Engineering Entrance',
    exams: ['ALL', 'JEE Main', 'JEE Advanced', 'GATE', 'BITSAT'],
    sampleTests: [
      {
        id: 'jee-mock-1',
        title: 'JEE Main 2026 — Full Length Mock (Physics, Chemistry, Maths)',
        description: 'Comprehensive 75 questions mock test with NTA pattern, numerical value questions & detailed solutions.',
        exam_category: 'JEE Main',
        subject_name: 'PCM Combined',
        duration_minutes: 180,
        total_marks: 300,
        questions_count: 75,
        difficulty_level: 'Hard',
      },
      {
        id: 'jee-mock-2',
        title: 'JEE Main Physics — Mechanics & Rotational Dynamics Speed Drill',
        description: 'High-yield Newton laws, Work Energy, and Rotational Motion MCQs with timing benchmarks.',
        exam_category: 'JEE Main',
        subject_name: 'Physics',
        duration_minutes: 60,
        total_marks: 100,
        questions_count: 25,
        difficulty_level: 'Medium',
      },
      {
        id: 'jee-mock-3',
        title: 'JEE Main Chemistry — Organic Reactions & Mechanisms Mastery',
        description: 'Reaction mechanisms, named reactions, and electrophilic additions practice drill.',
        exam_category: 'JEE Main',
        subject_name: 'Chemistry',
        duration_minutes: 45,
        total_marks: 100,
        questions_count: 25,
        difficulty_level: 'Medium',
      },
      {
        id: 'jee-mock-4',
        title: 'JEE Main Mathematics — Calculus & Coordinate Geometry Drill',
        description: 'Definite integrals, differential equations, and conic sections speed practice.',
        exam_category: 'JEE Main',
        subject_name: 'Mathematics',
        duration_minutes: 60,
        total_marks: 100,
        questions_count: 25,
        difficulty_level: 'Hard',
      },
    ],
    sampleLeaderboard: [
      { id: 'eng-1', rank: 1, name: 'Aryan Agarwal', target_exam: 'JEE Main', score: 292, accuracy: '98%', state: 'Kota, RJ' },
      { id: 'eng-2', rank: 2, name: 'Tanmay Saxena', target_exam: 'JEE Main', score: 284, accuracy: '95%', state: 'Indore, MP' },
      { id: 'eng-3', rank: 3, name: 'Rhea Kulkarni', target_exam: 'JEE Advanced', score: 278, accuracy: '93%', state: 'Bhopal, MP' },
      { id: 'eng-4', rank: 4, name: 'Harshit Bansal', target_exam: 'JEE Main', score: 272, accuracy: '91%', state: 'Delhi, NCR' },
    ],
  },

  Medical: {
    key: 'Medical',
    name: 'Medical Entrance',
    exams: ['ALL', 'NEET UG', 'NEET PG', 'AIIMS'],
    sampleTests: [
      {
        id: 'neet-mock-1',
        title: 'NEET UG 2026 — Full Length PCB Comprehensive Mock',
        description: 'NTA pattern 200 questions test covering Botany, Zoology, Physics & Chemistry sections with negative marking.',
        exam_category: 'NEET UG',
        subject_name: 'PCB Combined',
        duration_minutes: 200,
        total_marks: 720,
        questions_count: 200,
        difficulty_level: 'Medium',
      },
      {
        id: 'neet-mock-2',
        title: 'NEET Biology — Genetics, Evolution & Human Physiology',
        description: 'High-weightage NCERT line-by-line MCQs with detailed explanations.',
        exam_category: 'NEET UG',
        subject_name: 'Biology',
        duration_minutes: 45,
        total_marks: 180,
        questions_count: 45,
        difficulty_level: 'Medium',
      },
      {
        id: 'neet-mock-3',
        title: 'NEET Chemistry — Physical & Inorganic NCERT Drill',
        description: 'Chemical bonding, coordination compounds, and equilibrium speed practice.',
        exam_category: 'NEET UG',
        subject_name: 'Chemistry',
        duration_minutes: 45,
        total_marks: 180,
        questions_count: 45,
        difficulty_level: 'Medium',
      },
    ],
    sampleLeaderboard: [
      { id: 'med-1', rank: 1, name: 'Devika Nair', target_exam: 'NEET UG', score: 710, accuracy: '99%', state: 'Bhopal, MP' },
      { id: 'med-2', rank: 2, name: 'Siddharth Roy', target_exam: 'NEET UG', score: 698, accuracy: '97%', state: 'Indore, MP' },
      { id: 'med-3', rank: 3, name: 'Ananya Deshmukh', target_exam: 'NEET UG', score: 685, accuracy: '95%', state: 'Jabalpur, MP' },
    ],
  },

  Central: {
    key: 'Central',
    name: 'Central & Law',
    exams: ['ALL', 'CUET [UG/PG]', 'CLAT', 'CAT'],
    sampleTests: [
      {
        id: 'cuet-mock-1',
        title: 'CUET [UG/PG] 2026 — General Test & Domain Mock',
        description: 'General mental ability, numerical reasoning, and language comprehension for Central Universities.',
        exam_category: 'CUET [UG/PG]',
        subject_name: 'General Test',
        duration_minutes: 60,
        total_marks: 250,
        questions_count: 50,
        difficulty_level: 'Medium',
      },
      {
        id: 'clat-mock-1',
        title: 'CLAT 2026 — Legal Reasoning & Critical Thinking Master Drill',
        description: 'Passage-based questions on Constitutional Law, Torts, and Current Legal Affairs.',
        exam_category: 'CLAT',
        subject_name: 'Legal Reasoning',
        duration_minutes: 60,
        total_marks: 120,
        questions_count: 60,
        difficulty_level: 'Hard',
      },
      {
        id: 'cat-mock-1',
        title: 'CAT — Quantitative Aptitude & Data Interpretation Drill',
        description: 'High-difficulty algebra, arithmetic, and logical puzzle sets for IIM aspirants.',
        exam_category: 'CAT',
        subject_name: 'QA & DILR',
        duration_minutes: 60,
        total_marks: 100,
        questions_count: 30,
        difficulty_level: 'Hard',
      },
    ],
    sampleLeaderboard: [
      { id: 'cen-1', rank: 1, name: 'Raghav Singhal', target_exam: 'CUET [UG/PG]', score: 245, accuracy: '98%', state: 'Delhi, NCR' },
      { id: 'cen-2', rank: 2, name: 'Megha Sen', target_exam: 'CLAT', score: 112, accuracy: '94%', state: 'Bhopal, MP' },
      { id: 'cen-3', rank: 3, name: 'Rohan Gupta', target_exam: 'CAT', score: 94, accuracy: '92%', state: 'Indore, MP' },
    ],
  },

  Board: {
    key: 'Board',
    name: 'Boards Exam',
    exams: [
      'ALL',
      'Class 12th PCM',
      'Class 12th PCB',
      'Class 12th Commerce',
      'Class 12th Arts',
      'Class 10th Board',
    ],
    sampleTests: [
      {
        id: 'brd-mock-1',
        title: 'Class 12th Physics — Board Model Paper 2026',
        description: 'Complete syllabus board exam practice paper with Section A (MCQs), Section B (Short), and Section C/D (Derivations).',
        exam_category: 'Class 12th PCM',
        subject_name: 'Physics',
        duration_minutes: 180,
        total_marks: 70,
        questions_count: 35,
        difficulty_level: 'Medium',
      },
      {
        id: 'brd-mock-2',
        title: 'Class 12th Chemistry — Board Exam Master Drill',
        description: 'Organic reaction mechanisms, chemical kinetics numericals, and coordination compounds model test.',
        exam_category: 'Class 12th PCM',
        subject_name: 'Chemistry',
        duration_minutes: 180,
        total_marks: 70,
        questions_count: 35,
        difficulty_level: 'Medium',
      },
      {
        id: 'brd-mock-3',
        title: 'Class 12th Mathematics — Calculus & Vectors Board Mock',
        description: 'Integration, differential equations, and 3D geometry board pattern test with step-by-step marking scheme.',
        exam_category: 'Class 12th PCM',
        subject_name: 'Mathematics',
        duration_minutes: 180,
        total_marks: 80,
        questions_count: 38,
        difficulty_level: 'Medium',
      },
      {
        id: 'brd-mock-4',
        title: 'Class 12th Biology — CBSE/State Board Sample Paper',
        description: 'Genetics, Ecology, and Human Welfare high-yield descriptive and diagram-based questions.',
        exam_category: 'Class 12th PCB',
        subject_name: 'Biology',
        duration_minutes: 180,
        total_marks: 70,
        questions_count: 33,
        difficulty_level: 'Medium',
      },
      {
        id: 'brd-mock-5',
        title: 'Class 10th Science & Mathematics — Board Mock Drill',
        description: 'High-yield sample test based on latest NCERT board curriculum with objective and subjective sections.',
        exam_category: 'Class 10th Board',
        subject_name: 'Science & Maths',
        duration_minutes: 120,
        total_marks: 80,
        questions_count: 40,
        difficulty_level: 'Medium',
      },
    ],
    sampleLeaderboard: [
      { id: 'brd-1', rank: 1, name: 'Aditya Chouhan', target_exam: 'Class 12th PCM', score: 68, accuracy: '97%', state: 'Indore, MP' },
      { id: 'brd-2', rank: 2, name: 'Ritika Sengupta', target_exam: 'Class 12th PCB', score: 67, accuracy: '95%', state: 'Bhopal, MP' },
      { id: 'brd-3', rank: 3, name: 'Sanket Agrawal', target_exam: 'Class 12th Commerce', score: 76, accuracy: '95%', state: 'Gwalior, MP' },
      { id: 'brd-4', rank: 4, name: 'Priya Rathore', target_exam: 'Class 10th Board', score: 78, accuracy: '98%', state: 'Ujjain, MP' },
    ],
  },
};

/**
 * Returns the matching Category Key for a given exam name
 */
export function getCategoryForExam(targetExam: string): 'Engineering' | 'Medical' | 'Central' | 'Board' | 'Government' {
  const norm = (targetExam || '').toLowerCase();
  if (norm.includes('jee') || norm.includes('gate') || norm.includes('engineering') || norm.includes('bitsat')) {
    return 'Engineering';
  }
  if (norm.includes('neet') || norm.includes('medical') || norm.includes('aiims')) {
    return 'Medical';
  }
  if (norm.includes('cuet') || norm.includes('clat') || norm.includes('cat') || norm.includes('law')) {
    return 'Central';
  }
  if (norm.includes('board') || norm.includes('class 10') || norm.includes('class 12') || norm.includes('pcm') || norm.includes('pcb') || norm.includes('cbse') || norm.includes('mp board')) {
    return 'Board';
  }
  return 'Government';
}
