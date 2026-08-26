const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
supabase.from('tests').select('*').limit(1).then(({data, error}) => {
  if (error) console.error('Error:', error);
  else if (data && data.length > 0) console.log(Object.keys(data[0]));
  else console.log('No tests found');
});
