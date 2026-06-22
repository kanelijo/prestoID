global.WebSocket = class {};
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfoefxfvyexwvftxeol.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZm9lZnhmdnlleHd2ZnR4ZW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjUxNzAsImV4cCI6MjA5NjYwMTE3MH0._9n1MdVU8E3RIb722dm7o4X2M2vIkr-kesRcTNKeEQ4'
);

async function check() {
  try {
    const { data: posts, error } = await supabase
      .from('community_posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching posts:', error.message);
      return;
    }

    console.log('--- ALL POSTS IN DB ---');
    console.log('Count:', posts.length);
    posts.forEach(p => {
      console.log(`ID: ${p.id}`);
      console.log(`  business_id: ${p.business_id}`);
      console.log(`  author_name: ${p.author_name}`);
      console.log(`  category: ${p.category}`);
      console.log(`  text: "${p.text}"`);
      console.log(`  created_at: ${p.created_at}`);
      console.log(`  target_batches: ${JSON.stringify(p.target_batches)}`);
      console.log(`  likes: ${p.likes}`);
      console.log(`  liked_by: ${JSON.stringify(p.liked_by)}`);
      console.log(`  comments: ${JSON.stringify(p.comments)}`);
      console.log('-----------------------');
    });

  } catch (err) {
    console.error('Error:', err);
  }
}

check();
