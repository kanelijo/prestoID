global.WebSocket = class {};
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfoefxfvyexwvftxeol.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZm9lZnhmdnlleHd2ZnR4ZW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjUxNzAsImV4cCI6MjA5NjYwMTE3MH0._9n1MdVU8E3RIb722dm7o4X2M2vIkr-kesRcTNKeEQ4'
);

async function check() {
  try {
    const { data: cols, error } = await supabase
      .from('columns') // Wait, does postgrest expose information_schema?
      // Postgrest does not expose information_schema directly unless it's in the API schema.
      // But it does expose a schema cache!
      // Let's try querying information_schema via RPC, or just inspect columns by catching errors.
      .select('*')
      .eq('table_name', 'students');
    
    console.log('Cols:', error ? error.message : cols);
  } catch (err) {
    console.error('Error:', err);
  }
}

// Since Postgrest does not expose information_schema by default, let's query the tables
// and trigger a dummy select on columns we want to test! E.g. business_id vs institute_id.
// If it fails with "column does not exist", we know it is wrong.
async function testColumns() {
  console.log('--- Testing students columns ---');
  const { error: err1 } = await supabase.from('students').select('business_id').limit(1);
  console.log('students.business_id exists:', !err1 || err1.code !== 'PGRST204');
  if (err1) console.log('students.business_id error:', err1.message);

  const { error: err2 } = await supabase.from('students').select('institute_id').limit(1);
  console.log('students.institute_id exists:', !err2 || err2.code !== 'PGRST204');
  if (err2) console.log('students.institute_id error:', err2.message);

  console.log('--- Testing community_posts columns ---');
  const { error: err3 } = await supabase.from('community_posts').select('business_id').limit(1);
  console.log('community_posts.business_id exists:', !err3 || err3.code !== 'PGRST204');
  if (err3) console.log('community_posts.business_id error:', err3.message);

  const { error: err4 } = await supabase.from('community_posts').select('institute_id').limit(1);
  console.log('community_posts.institute_id exists:', !err4 || err4.code !== 'PGRST204');
  if (err4) console.log('community_posts.institute_id error:', err4.message);

  const { error: err5 } = await supabase.from('community_posts').select('target_batches').limit(1);
  console.log('community_posts.target_batches exists:', !err5 || err5.code !== 'PGRST204');
  if (err5) console.log('community_posts.target_batches error:', err5.message);
}

testColumns();
