/**
 * MockS Portal Scraper Config
 * Defines target URLs, CSS selectors, and PDF link patterns
 * for each official exam portal.
 */

const SCRAPER_CONFIGS = [
  {
    id: 'mppsc',
    name: 'MPPSC Official Portal',
    baseUrl: 'https://mppsc.mp.gov.in',
    noticesUrl: 'https://mppsc.mp.gov.in/Notifications',
    exam_category: 'MPPSC',
    selectors: {
      noticeRows: 'table.table tr',
      titleCell: 'td:nth-child(2)',
      linkCell: 'td:nth-child(3) a',
      dateCell: 'td:nth-child(1)',
    },
    pdfLinkPattern: /\.pdf$/i,
    rateLimit_ms: 2000,
  },
  {
    id: 'nta_jee',
    name: 'NTA JEE Main Portal',
    baseUrl: 'https://jeemain.nta.nic.in',
    noticesUrl: 'https://jeemain.nta.nic.in/webinfo/Public/Home/GetCurrentNews',
    exam_category: 'JEE Main',
    selectors: {
      noticeItems: '.news-list li',
      titleLink: 'a',
      dateSpan: '.date',
    },
    pdfLinkPattern: /\.pdf$/i,
    rateLimit_ms: 3000,
  },
  {
    id: 'nta_neet',
    name: 'NTA NEET UG Portal',
    baseUrl: 'https://neet.nta.nic.in',
    noticesUrl: 'https://neet.nta.nic.in/webinfo/Public/Home/GetCurrentNews',
    exam_category: 'NEET UG',
    selectors: {
      noticeItems: '.news-list li',
      titleLink: 'a',
      dateSpan: '.date',
    },
    pdfLinkPattern: /\.pdf$/i,
    rateLimit_ms: 3000,
  },
  {
    id: 'ssc',
    name: 'SSC Official Portal',
    baseUrl: 'https://ssc.nic.in',
    noticesUrl: 'https://ssc.nic.in/portal/notification',
    exam_category: 'SSC CGL',
    selectors: {
      noticeRows: '#accordion .panel',
      titleEl: '.panel-title a',
      linkEl: '.panel-body a[href$=".pdf"]',
    },
    pdfLinkPattern: /\.pdf$/i,
    rateLimit_ms: 2500,
  },
  {
    id: 'rrb_ntpc',
    name: 'RRB (Railway Recruitment Board)',
    baseUrl: 'https://www.rrbcdg.gov.in',
    noticesUrl: 'https://www.rrbcdg.gov.in/latest-news.html',
    exam_category: 'Railway',
    selectors: {
      noticeItems: '.marqueecontent a',
    },
    pdfLinkPattern: /\.pdf$/i,
    rateLimit_ms: 2000,
  },
];

module.exports = { SCRAPER_CONFIGS };
