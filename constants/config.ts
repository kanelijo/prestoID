export const APP_CONFIG = {
  name: 'MockS',
  version: '1.0.0',
  supabaseUrl: 'http://35.234.211.3:8000',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE',
  geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
  defaultAbsentAlertTime: '20:00',
  feeReminderDates: [15, -1], // 15th and last day
  maxStudentsFreePlan: 50,
};

export const BATCHES_DEFAULT = [
  'MPPSC',
  'SSC',
  'VYAPAM',
  'Railway',
  'Banking',
  'UPSC',
  'State PSC',
  'Other',
];
