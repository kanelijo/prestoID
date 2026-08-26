global.WebSocket = class {};
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfoefxfvyexwvftxeol.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZm9lZnhmdnlleHd2ZnR4ZW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjUxNzAsImV4cCI6MjA5NjYwMTE3MH0._9n1MdVU8E3RIb722dm7o4X2M2vIkr-kesRcTNKeEQ4'
);

async function check() {
  try {
    console.log('--- CHECKING BUSINESS ---');
    const { data: business, error: busError } = await supabase
      .from('businesses')
      .select('*')
      .eq('organization_id', 'AIO-DUFU')
      .maybeSingle();

    if (busError) {
      console.error('Business Query Error:', busError.message);
      return;
    }
    
    if (!business) {
      console.log('Business NOT found with organization_id: AIO-DUFU');
      // Let's print all businesses to see what exists
      const { data: allB } = await supabase.from('businesses').select('*');
      console.log('All businesses in DB:', allB);
      return;
    }
    
    console.log('Business Found:', business);

    console.log('\n--- CHECKING STUDENT WITH PASSCODE ---');
    // Query students table directly without filtering user_id to see if it exists
    const { data: student, error: studError } = await supabase
      .from('students')
      .select('*')
      .eq('business_id', business.id)
      .eq('secret_code', 'S7F4UR')
      .maybeSingle();

    if (studError) {
      console.error('Student Query Error:', studError.message);
      return;
    }

    if (!student) {
      console.log('Student NOT found with secret_code S7F4UR and business_id', business.id);
      // Let's print all students under this business
      const { data: allS } = await supabase.from('students').select('*').eq('business_id', business.id);
      console.log(`All students under business ${business.id}:`, allS);
      return;
    }

    console.log('Student Found:', student);

  } catch (err) {
    console.error('Error running check:', err);
  }
}

check();
