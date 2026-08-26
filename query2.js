global.WebSocket = class {};
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://nhfoefxfvyexwvftxeol.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZm9lZnhmdnlleHd2ZnR4ZW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjUxNzAsImV4cCI6MjA5NjYwMTE3MH0._9n1MdVU8E3RIb722dm7o4X2M2vIkr-kesRcTNKeEQ4'
);
async function run() {
  const { data: tests, error: testErr } = await supabase.from('tests').select('*');
  const { data: businesses, error: bizErr } = await supabase.from('businesses').select('*');
  const { data: submissions, error: subErr } = await supabase.from('test_submissions').select('*');
  console.log('Businesses:', businesses);
  console.log('Tests:', tests);
  console.log('Submissions:', submissions);
}
run();
