global.WebSocket = class {};
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://nhfoefxfvyexwvftxeol.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZm9lZnhmdnlleHd2ZnR4ZW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjUxNzAsImV4cCI6MjA5NjYwMTE3MH0._9n1MdVU8E3RIb722dm7o4X2M2vIkr-kesRcTNKeEQ4');

async function run() {
  const { data: cols, error: err } = await supabase
    .from('payments')
    .select('id, amount, status, transaction_id, payment_date, created_at, business_id, student_id')
    .limit(1);
    
  console.log("Querying payments columns (with business_id):");
  if (err) {
    console.log("Error details:", err);
  } else {
    console.log("Success! Columns exist.", cols);
  }
}

run();
