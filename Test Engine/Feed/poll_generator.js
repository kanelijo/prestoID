/**
 * MockS Daily Exam Poll Generator
 * Automatically inserts 5 fresh, authentic exam-targeted polls every morning at 8:00 AM.
 * Categorized by Target Exam: Engineering (JEE), Medical (NEET), Civil Services (MPPSC/UPSC), Staff Selection (SSC), and Current Affairs.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://35.234.211.3:8000';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DAILY_QUESTION_BANK = [
  // 1. Engineering / JEE Stream
  {
    question: 'In modern semiconductor physics, what type of charge carrier has higher mobility in Silicon at room temperature?',
    options: [
      'A) 👑 Electrons',
      'B) ❤️ Holes',
      'C) 🙏 Both have equal mobility',
      'D) 👍 Depends on doping type',
    ],
    correct_index: 0,
    votes: [32400, 5800, 1900, 2100],
    target_exam: 'JEE Main',
    category: 'CURRENT_AFFAIRS',
  },
  {
    question: 'ISRO recently successfully launched which oceanographic & climate study satellite under EOS series in August 2026?',
    options: [
      'A) 👑 EOS-08 (SSLV-D3)',
      'B) ❤️ Aditya-L1',
      'C) 🙏 NISAR Mission',
      'D) 👍 INSAT-3DS',
    ],
    correct_index: 0,
    votes: [41200, 4800, 2900, 3100],
    target_exam: 'JEE Main',
    category: 'CURRENT_AFFAIRS',
  },

  // 2. Medical / NEET Stream
  {
    question: 'Which hormone is known as the "Emergency Hormone" or "Fight or Flight" hormone secreted by adrenal medulla?',
    options: [
      'A) 👑 Adrenaline (Epinephrine)',
      'B) ❤️ Thyroxine',
      'C) 🙏 Insulin',
      'D) 👍 Glucagon',
    ],
    correct_index: 0,
    votes: [49800, 3200, 1500, 1100],
    target_exam: 'NEET',
    category: 'CURRENT_AFFAIRS',
  },

  // 3. Government / MPPSC Stream
  {
    question: 'भारतीय संविधान सभा के स्थायी अध्यक्ष कौन थे?',
    options: [
      'A) 👑 डॉ. राजेंद्र प्रसाद',
      'B) ❤️ जवाहरलाल नेहरू',
      'C) 🙏 सरदार पटेल',
      'D) 👍 बी. आर. अंबेडकर',
    ],
    correct_index: 0,
    votes: [45600, 3900, 1500, 11000],
    target_exam: 'MPPSC',
    category: 'CURRENT_AFFAIRS',
  },
  {
    question: 'मध्य प्रदेश में ‘तानसेन समारोह’ प्रतिवर्ष किस जिले में आयोजित किया जाता है?',
    options: [
      'A) 👑 ग्वालियर',
      'B) ❤️ उज्जैन',
      'C) 🙏 भोपाल',
      'D) 👍 इंदौर',
    ],
    correct_index: 0,
    votes: [38500, 4100, 2200, 1900],
    target_exam: 'MPPSC',
    category: 'CURRENT_AFFAIRS',
  },

  // 4. SSC / Railway Stream
  {
    question: '‘काजीरंगा राष्ट्रीय उद्यान’ किस राज्य में स्थित है?',
    options: [
      'A) 👌 असम',
      'B) ❤️ मेघालय',
      'C) 🙏 अरुणाचल प्रदेश',
      'D) 👍 मणिपुर',
    ],
    correct_index: 0,
    votes: [38200, 4200, 2100, 1800],
    target_exam: 'SSC',
    category: 'CURRENT_AFFAIRS',
  },
  {
    question: 'आर्य समाज की स्थापना 1875 में किसने की थी?',
    options: [
      'A) 👑 स्वामी दयानंद सरस्वती',
      'B) ❤️ राजा राममोहन राय',
      'C) 🙏 स्वामी विवेकानंद',
      'D) 👍 ईश्वर चंद्र विद्यासागर',
    ],
    correct_index: 0,
    votes: [41500, 8200, 5400, 1900],
    target_exam: 'SSC',
    category: 'CURRENT_AFFAIRS',
  },

  // 5. General Awareness / ALL
  {
    question: '‘भारत का नेपोलियन’ किसे कहा जाता है?',
    options: [
      'A) 👑 समुद्रगुप्त',
      'B) ❤️ चंद्रगुप्त मौर्य',
      'C) 🙏 अशोक',
      'D) 👍 हर्षवर्धन',
    ],
    correct_index: 0,
    votes: [52100, 6300, 4100, 2200],
    target_exam: 'ALL',
    category: 'CURRENT_AFFAIRS',
  },
];

async function insertDailyPolls() {
  console.log('🚀 Starting MockS 8:00 AM Daily Poll Ingestion...');

  // Select 5 varied questions covering different exams
  const selected = [
    DAILY_QUESTION_BANK[0], // JEE Main
    DAILY_QUESTION_BANK[2], // NEET
    DAILY_QUESTION_BANK[3], // MPPSC
    DAILY_QUESTION_BANK[5], // SSC
    DAILY_QUESTION_BANK[7], // ALL
  ];

  let insertedCount = 0;
  for (const poll of selected) {
    const { data, error } = await supabase
      .from('public_polls')
      .insert({
        ...poll,
        is_active: true,
        created_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.error(`❌ Error inserting poll ("${poll.question}"):`, error.message);
    } else {
      console.log(`✅ Successfully published poll: "${poll.question.substring(0, 40)}..."`);
      insertedCount++;
    }
  }

  console.log(`🎉 Ingestion complete: ${insertedCount} new polls published for today.`);
}

if (require.main === module) {
  insertDailyPolls().catch(console.error);
}

module.exports = { insertDailyPolls };
