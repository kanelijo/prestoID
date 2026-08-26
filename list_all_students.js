global.WebSocket = class {};
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfoefxfvyexwvftxeol.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZm9lZnhmdnlleHd2ZnR4ZW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjUxNzAsImV4cCI6MjA5NjYwMTE3MH0._9n1MdVU8E3RIb722dm7o4X2M2vIkr-kesRcTNKeEQ4'
);

async function list() {
  try {
    console.log('--- FETCHING ALL STUDENTS ---');
    const { data: students, error } = await supabase
      .from('students')
      .select('*');

    if (error) {
      console.error('Error fetching students:', error.message);
      return;
    }

    console.log('Total students in DB:', students.length);
    students.forEach((s, idx) => {
      console.log(`[${idx}] ID: ${s.id} | Name: ${s.name} | Business ID: ${s.business_id} | Code: ${s.secret_code} | User ID: ${s.user_id}`);
    });

  } catch (err) {
    console.error('Error:', err);
  }
}

list();
