const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');

// Default values, replace with actual if not found in .env
const supabaseUrl = 'https://nhfoefxfvyexwvftxeol.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZm9lZnhmdnlleHd2ZnR4ZW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjUxNzAsImV4cCI6MjA5NjYwMTE3MH0._9n1MdVU8E3RIb722dm7o4X2M2vIkr-kesRcTNKeEQ4';

async function run() {
  const TEST_ID = process.argv[2];
  const NUM_STUDENTS = parseInt(process.argv[3]) || 500;

  let targetTestId = TEST_ID;

  // We only need one supabase client for database calls
  const mainClient = createClient(supabaseUrl, supabaseAnonKey);

  if (!targetTestId) {
    console.log("No Test ID provided, fetching the latest scheduled/live test...");
    const { data: tests, error } = await mainClient
      .from('tests')
      .select('id, title, status')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !tests || tests.length === 0) {
      console.error("Could not find any tests.", error);
      process.exit(1);
    }
    targetTestId = tests[0].id;
    console.log(`Found Test: ${tests[0].title} (${tests[0].status}) - ID: ${targetTestId}`);
  }

  console.log(`\n🚀 Starting load test for ${NUM_STUDENTS} students on Test ID: ${targetTestId}`);

  let connectedCount = 0;
  const clients = [];

  const BATCH_SIZE = 25;
  for (let i = 0; i < NUM_STUDENTS; i += BATCH_SIZE) {
    const batchPromises = [];
    for (let j = 0; j < BATCH_SIZE && i + j < NUM_STUDENTS; j++) {
      const studentIndex = i + j;
      const botId = `bot_student_${studentIndex}_${Date.now()}`;
      
      const client = createClient(supabaseUrl, supabaseAnonKey);
      clients.push(client);

      const topicName = `public:tests:id=eq.${targetTestId}`;
      const channel = client.channel(topicName, {
        config: { presence: { key: botId } }
      });

      const p = new Promise((resolve) => {
        const timer = setTimeout(() => {
          resolve(); // Resolve anyway on timeout so next batch continues
        }, 3000);

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timer);
            try {
              await channel.track({
                user_id: botId,
                name: `Bot Student ${studentIndex + 1}`,
                avatar: null,
                status: 'waiting',
                online_at: new Date().toISOString(),
              });
              connectedCount++;
              if (connectedCount % 25 === 0 || connectedCount === NUM_STUDENTS) {
                console.log(`✅ ${connectedCount}/${NUM_STUDENTS} students connected and waiting in lobby...`);
              }
            } catch (err) {}
            resolve();
          }
        });
      });
      batchPromises.push(p);
    }
    await Promise.all(batchPromises);
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n🎉 All ${NUM_STUDENTS} students are now connected and tracking presence!`);
  console.log(`Open the teacher dashboard for Test ID: ${targetTestId} to verify.`);
  console.log(`\nPress Ctrl+C to disconnect all students and exit.`);

  // Listen for 'live' status to change them to 'writing'
  mainClient.channel(`public:tests:id=eq.${targetTestId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tests', filter: `id=eq.${targetTestId}` }, (payload) => {
      if (payload.new && payload.new.status === 'live') {
        console.log(`\n🔥 Test went LIVE! Switching all ${NUM_STUDENTS} students to 'writing' status...`);
        // We need to update presence for all clients
        let updatedCount = 0;
        clients.forEach((client, index) => {
           const ch = client.getChannels()[0]; // The only channel
           if (ch) {
             ch.track({
               user_id: `bot_student_${index}_*`, // this is just a placeholder, we use the original state
               name: `Bot Student ${index}`,
               avatar: null,
               status: 'writing',
               online_at: new Date().toISOString(),
             }).then(() => {
               updatedCount++;
               if (updatedCount % 50 === 0) {
                 console.log(`📝 ${updatedCount}/${NUM_STUDENTS} students are now writing...`);
               }
             });
           }
        });
      } else if (payload.new && payload.new.status === 'completed') {
        console.log(`\n🛑 Test was ENDED! Submitting for all ${NUM_STUDENTS} students...`);
        // Simulate submitting the test
        clients.forEach((client, index) => {
           const ch = client.getChannels()[0];
           if (ch) {
             ch.track({
               user_id: `bot_student_${index}_*`,
               name: `Bot Student ${index}`,
               avatar: null,
               status: 'submitted',
               online_at: new Date().toISOString(),
             });
           }
        });
      }
    })
    .subscribe();

}

run().catch(console.error);
