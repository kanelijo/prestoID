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

export const EXAM_TAXONOMY: Record<string, ExamCategoryConfig> = {
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
      {
        id: 'jee-mock-5',
        title: 'JEE Advanced — Paper 1 Multi-Correct & Matrix Match Drill',
        description: 'Advanced problem-solving across electrostatics, thermodynamics, and complex numbers.',
        exam_category: 'JEE Advanced',
        subject_name: 'PCM Advanced',
        duration_minutes: 180,
        total_marks: 180,
        questions_count: 54,
        difficulty_level: 'Hard',
      },
    ],
    sampleLeaderboard: [
      { id: 'eng-1', rank: 1, name: 'Aryan Agarwal', target_exam: 'JEE Main', score: 292, accuracy: '98%', state: 'Kota, RJ' },
      { id: 'eng-2', rank: 2, name: 'Tanmay Saxena', target_exam: 'JEE Main', score: 284, accuracy: '95%', state: 'Indore, MP' },
      { id: 'eng-3', rank: 3, name: 'Rhea Kulkarni', target_exam: 'JEE Advanced', score: 278, accuracy: '93%', state: 'Bhopal, MP' },
      { id: 'eng-4', rank: 4, name: 'Harshit Bansal', target_exam: 'JEE Main', score: 272, accuracy: '91%', state: 'Delhi, NCR' },
      { id: 'eng-5', rank: 5, name: 'Pranav Joshi', target_exam: 'GATE', score: 265, accuracy: '89%', state: 'Gwalior, MP' },
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
      {
        id: 'neet-mock-4',
        title: 'NEET Physics — Optics, Modern Physics & Mechanics',
        description: 'Formula-based numericals and conceptual assertions from past 10 years NEET papers.',
        exam_category: 'NEET UG',
        subject_name: 'Physics',
        duration_minutes: 60,
        total_marks: 180,
        questions_count: 45,
        difficulty_level: 'Hard',
      },
    ],
    sampleLeaderboard: [
      { id: 'med-1', rank: 1, name: 'Devika Nair', target_exam: 'NEET UG', score: 710, accuracy: '99%', state: 'Bhopal, MP' },
      { id: 'med-2', rank: 2, name: 'Siddharth Roy', target_exam: 'NEET UG', score: 698, accuracy: '97%', state: 'Indore, MP' },
      { id: 'med-3', rank: 3, name: 'Ananya Deshmukh', target_exam: 'NEET UG', score: 685, accuracy: '95%', state: 'Jabalpur, MP' },
      { id: 'med-4', rank: 4, name: 'Kavya Sharma', target_exam: 'AIIMS', score: 676, accuracy: '94%', state: 'Ujjain, MP' },
    ],
  },

  Central: {
    key: 'Central',
    name: 'Central & Law',
    exams: ['ALL', 'CUET (UG/PG)', 'CLAT', 'CAT'],
    sampleTests: [
      {
        id: 'cuet-mock-1',
        title: 'CUET UG 2026 — General Test & Domain Mock',
        description: 'General mental ability, numerical reasoning, and language comprehension for Central Universities.',
        exam_category: 'CUET (UG/PG)',
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
      { id: 'cen-1', rank: 1, name: 'Raghav Singhal', target_exam: 'CUET (UG/PG)', score: 245, accuracy: '98%', state: 'Delhi, NCR' },
      { id: 'cen-2', rank: 2, name: 'Megha Sen', target_exam: 'CLAT', score: 112, accuracy: '94%', state: 'Bhopal, MP' },
      { id: 'cen-3', rank: 3, name: 'Rohan Gupta', target_exam: 'CAT', score: 94, accuracy: '92%', state: 'Indore, MP' },
    ],
  },

  Government: {
    key: 'Government',
    name: 'Government Recruitment',
    exams: ['ALL', 'MPPSC', 'MP Police (SI/Constable)', 'MP Patwari', 'SSC CGL', 'Railway', 'Banking', 'UPSC'],
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
        exam_category: 'MP Police (SI/Constable)',
        subject_name: 'Aptitude & Reasoning',
        duration_minutes: 45,
        total_marks: 50,
        questions_count: 50,
        difficulty_level: 'Easy',
      },
      {
        id: 'pub-mock-3',
        title: 'SSC CGL Tier-1 — General Awareness Master Drill',
        description: 'Curated MCQs on Indian Economy, History, Science & Current Affairs.',
        exam_category: 'SSC CGL',
        subject_name: 'General Awareness',
        duration_minutes: 30,
        total_marks: 50,
        questions_count: 25,
        difficulty_level: 'Hard',
      },
      {
        id: 'pub-mock-4',
        title: 'Railway NTPC & Group D — General Science Practice',
        description: 'High-frequency Physics, Chemistry, and Biology questions with bilingual explanations.',
        exam_category: 'Railway',
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
      { id: 'gov-3', rank: 3, name: 'Pooja Tiwari', target_exam: 'SSC CGL', score: 182, accuracy: '91%', state: 'Jabalpur, MP' },
      { id: 'gov-4', rank: 4, name: 'Vikram Singh', target_exam: 'MP Police', score: 178, accuracy: '89%', state: 'Gwalior, MP' },
      { id: 'gov-5', rank: 5, name: 'Deepak Patel', target_exam: 'Railway', score: 174, accuracy: '87%', state: 'Ujjain, MP' },
    ],
  },
};

/**
 * Returns the matching Category Key for a given exam name
 */
export function getCategoryForExam(targetExam: string): 'Engineering' | 'Medical' | 'Central' | 'Government' {
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
  return 'Government';
}
