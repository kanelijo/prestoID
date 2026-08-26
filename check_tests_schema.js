global.WebSocket = class {};
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfoefxfvyexwvftxeol.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZm9lZnhmdnlleHd2ZnR4ZW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjUxNzAsImV4cCI6MjA5NjYwMTE3MH0._9n1MdVU8E3RIb722dm7o4X2M2vIkr-kesRcTNKeEQ4'
);

async function testColumns() {
  console.log('--- Testing profiles columns ---');
  const { error: err1 } = await supabase.from('profiles').select('business_id').limit(1);
  console.log('profiles.business_id exists:', !err1 || err1.code !== 'PGRST204');
  const { error: err2 } = await supabase.from('profiles').select('institute_id').limit(1);
  console.log('profiles.institute_id exists:', !err2 || err2.code !== 'PGRST204');

  console.log('--- Testing tests columns ---');
  const { error: err3 } = await supabase.from('tests').select('business_id').limit(1);
  console.log('tests.business_id exists:', !err3 || err3.code !== 'PGRST204');
  const { error: err4 } = await supabase.from('tests').select('institute_id').limit(1);
  console.log('tests.institute_id exists:', !err4 || err4.code !== 'PGRST204');

  console.log('--- Testing question_banks columns ---');
  const { error: err5 } = await supabase.from('question_banks').select('business_id').limit(1);
  console.log('question_banks.business_id exists:', !err5 || err5.code !== 'PGRST204');
  const { error: err6 } = await supabase.from('question_banks').select('institute_id').limit(1);
  console.log('question_banks.institute_id exists:', !err6 || err6.code !== 'PGRST204');
}

testColumns();
