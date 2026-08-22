const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');

const supabaseUrl = 'https://nhfoefxfvyexwvftxeol.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZm9lZnhmdnlleHd2ZnR4ZW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjUxNzAsImV4cCI6MjA5NjYwMTE3MH0._9n1MdVU8E3RIb722dm7o4X2M2vIkr-kesRcTNKeEQ4';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data, error } = await supabase.from('tests').insert({
    title: '500-User Load Test (Simulated)',
    status: 'scheduled',
    duration_minutes: 60,
    positive_marks: 4,
    negative_marks: 1
  }).select('id').single();

  if (error) {
    console.error("Error creating test:", error);
    process.exit(1);
  }
  console.log(data.id);
}
run();
