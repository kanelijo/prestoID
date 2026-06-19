export const APP_CONFIG = {
  name: 'PrestoID',
  version: '1.0.0',
  supabaseUrl: 'https://nhfoefxfvyexwvftxeol.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZm9lZnhmdnlleHd2ZnR4ZW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjUxNzAsImV4cCI6MjA5NjYwMTE3MH0._9n1MdVU8E3RIb722dm7o4X2M2vIkr-kesRcTNKeEQ4',
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
