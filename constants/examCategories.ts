export interface ExamCategoryConfig {
  key: string;
  name: string;
  exams: string[];
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
  },

  Engineering: {
    key: 'Engineering',
    name: 'Engineering Entrance',
    exams: ['ALL', 'JEE Main', 'JEE Advanced', 'GATE', 'BITSAT'],
  },

  Medical: {
    key: 'Medical',
    name: 'Medical Entrance',
    exams: ['ALL', 'NEET UG', 'NEET PG', 'AIIMS'],
  },

  Central: {
    key: 'Central',
    name: 'Central Entrance & Law',
    exams: ['ALL', 'CUET [UG/PG]', 'CLAT', 'IPMAT', 'CAT', 'NDA/CDS'],
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
  if (norm.includes('neet') || norm.includes('medical') || norm.includes('aiims') || norm.includes('ini-cet')) {
    return 'Medical';
  }
  if (norm.includes('cuet') || norm.includes('clat') || norm.includes('ipmat') || norm.includes('cat') || norm.includes('nda') || norm.includes('cds') || norm.includes('law') || norm.includes('central')) {
    return 'Central';
  }
  if (norm.includes('board') || norm.includes('class 10') || norm.includes('class 12') || norm.includes('pcm') || norm.includes('pcb') || norm.includes('commerce') || norm.includes('arts') || norm.includes('cbse') || norm.includes('mp board')) {
    return 'Board';
  }
  return 'Government';
}
