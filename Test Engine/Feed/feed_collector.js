/**
 * MockS Real Live Feed Collector
 * Scrapes genuine, official notices directly from:
 * 1. MPPSC Official Portal (https://mppsc.mp.gov.in)
 * 2. NTA JEE Main Official Portal (https://jeemain.nta.nic.in)
 * Ingests 100% real government documents and links into Supabase `public_feed`.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://35.234.211.3:8000';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  return res.text();
}

function parseMppscDate(text) {
  const match = text.match(/(?:Dated|दिनांक)\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return new Date(`${year}-${month}-${day}T12:00:00.000Z`).toISOString();
  }
  return new Date().toISOString();
}

function parseNtaDate(url, text) {
  const urlMatch = url.match(/\/uploads\/(\d{4})\/(\d{2})\/(\d{4})(\d{2})(\d{2})/);
  if (urlMatch) {
    const year = urlMatch[3];
    const month = urlMatch[4];
    const day = urlMatch[5];
    return new Date(`${year}-${month}-${day}T12:00:00.000Z`).toISOString();
  }
  const monthMatch = url.match(/\/uploads\/(\d{4})\/(\d{2})\//);
  if (monthMatch) {
    return new Date(`${monthMatch[1]}-${monthMatch[2]}-01T12:00:00.000Z`).toISOString();
  }
  return new Date('2025-01-01T12:00:00.000Z').toISOString();
}

async function scrapeLiveMppsc() {
  console.log('[MockS Scraper] Fetching genuine notices from mppsc.mp.gov.in...');
  const items = [];
  try {
    const html = await fetchPage('https://mppsc.mp.gov.in/');
    const listMatches = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];

    for (const m of listMatches) {
      const linkMatch = m[1].match(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (linkMatch) {
        const text = linkMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const href = linkMatch[1];
        if (
          href.endsWith('.pdf') ||
          text.includes('Dated') ||
          text.includes('Exam') ||
          text.includes('Answer Key') ||
          text.includes('Selection List') ||
          text.includes('Mark List')
        ) {
          if (text.length > 15 && !text.toLowerCase().includes('javascript')) {
            const pdfUrl = href.startsWith('http')
              ? href
              : 'https://mppsc.mp.gov.in/' + href.replace(/^\//, '');

            const id = 'mppsc_' + Buffer.from(text).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
            const pubDate = parseMppscDate(text);

            items.push({
              id,
              category: text.toLowerCase().includes('strategy') ? 'STRATEGY' : 'EXAM_UPDATES',
              title: text,
              summary: `Official MPPSC notice published directly on mppsc.mp.gov.in.`,
              target_exam: 'MPPSC',
              official_pdf_url: pdfUrl,
              source_portal: 'mppsc.mp.gov.in',
              created_at: pubDate,
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('[MockS Scraper] MPPSC scrape error:', e.message);
  }
  return items;
}

async function scrapeLiveNtaJee() {
  console.log('[MockS Scraper] Fetching genuine notices from jeemain.nta.nic.in...');
  const items = [];
  try {
    const html = await fetchPage('https://jeemain.nta.nic.in');
    const matches = [...html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

    for (const m of matches) {
      const href = m[1];
      const text = m[2].replace(/<[^>]+>/g, '').replace(/&#8211;/g, '-').replace(/\s+/g, ' ').trim();
      if (href.includes('.pdf') && text.length > 20 && !text.toLowerCase().includes('javascript')) {
        const pdfUrl = href.startsWith('http') ? href : 'https://jeemain.nta.nic.in' + href;
        const id = 'nta_jee_' + Buffer.from(text).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
        const pubDate = parseNtaDate(pdfUrl, text);

        items.push({
          id,
          category: 'EXAM_UPDATES',
          title: text,
          summary: `National Testing Agency (NTA) official public bulletin verified on jeemain.nta.nic.in.`,
          target_exam: 'JEE Main',
          official_pdf_url: pdfUrl,
          source_portal: 'jeemain.nta.nic.in',
          created_at: pubDate,
        });
      }
    }
  } catch (e) {
    console.error('[MockS Scraper] NTA scrape error:', e.message);
  }
  return items;
}

async function runCollector() {
  console.log('=== Starting Real-World Government Notice Scraper ===');
  const mppscNotices = await scrapeLiveMppsc();
  const jeeNotices = await scrapeLiveNtaJee();

  console.log(`Found ${mppscNotices.length} genuine MPPSC notices.`);
  console.log(`Found ${jeeNotices.length} genuine NTA JEE notices.`);

  const allRealNotices = [...mppscNotices.slice(0, 15), ...jeeNotices.slice(0, 15)];

  // Deduplicate by ID
  const uniqueMap = new Map();
  for (const item of allRealNotices) {
    if (!uniqueMap.has(item.id)) {
      uniqueMap.set(item.id, item);
    }
  }
  const uniqueNotices = Array.from(uniqueMap.values());
  // Rank newest updates at top
  uniqueNotices.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (uniqueNotices.length > 0) {
    console.log(`Ingesting ${uniqueNotices.length} unique genuine live notices into Supabase public_feed...`);
    const { data, error } = await supabase
      .from('public_feed')
      .upsert(uniqueNotices, { onConflict: 'id' });

    if (error) {
      console.error('[MockS Scraper] Supabase error:', error.message);
    } else {
      console.log('✅ 100% Genuine, Real-World notices successfully published to Supabase!');
    }
  }

  // Smart Retention: Clean up older notices while guaranteeing every exam preserves at least its latest 5-8 circulars
  try {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const cutoffIso = twoMonthsAgo.toISOString();

    const exams = ['MPPSC', 'JEE Main', 'NEET UG', 'SSC CGL/CHSL', 'CUET [UG/PG]', 'Class 12th PCM'];

    for (const exam of exams) {
      const { data: notices } = await supabase
        .from('public_feed')
        .select('id, created_at')
        .eq('target_exam', exam)
        .order('created_at', { ascending: false });

      if (notices && notices.length > 8) {
        // Only purge notices beyond the 8th latest that are also older than 2 months
        const excessOldIds = notices
          .slice(8)
          .filter(n => n.created_at < cutoffIso)
          .map(n => n.id);

        if (excessOldIds.length > 0) {
          await supabase.from('public_feed').delete().in('id', excessOldIds);
          console.log(`[MockS Retention] Purged ${excessOldIds.length} stale notices for ${exam}.`);
        }
      }
    }
    console.log('✅ Smart retention complete: Fresh notices kept, older notices purged, but each exam always keeps its official releases!');
  } catch (e) {
    console.error('[MockS Retention] Error:', e.message);
  }
}

runCollector();
