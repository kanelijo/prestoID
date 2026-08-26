const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('tests').select('*').order('created_at', { ascending: false }).limit(2);
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
run();
