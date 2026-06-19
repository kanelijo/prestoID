import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://nhfoefxfvyexwvftxeol.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZm9lZnhmdnlleHd2ZnR4ZW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjUxNzAsImV4cCI6MjA5NjYwMTE3MH0._9n1MdVU8E3RIb722dm7o4X2M2vIkr-kesRcTNKeEQ4');

async function run() {
  const { data, error } = await supabase.from('students').select('*').limit(1);
  if (error) console.error("Select Error:", error);
  else console.log("Columns in students:", data.length > 0 ? Object.keys(data[0]) : "No rows");
  
  const { data: d2, error: e2 } = await supabase.from('institutes').select('*').limit(1);
  console.log("Institutes table exists:", !e2);
  
  const { data: d3, error: e3 } = await supabase.from('coachings').select('*').limit(1);
  console.log("Coachings table exists:", !e3);
}
run();
