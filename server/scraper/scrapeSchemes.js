/**
 * scrapeSchemes.js
 * Scrapes all Tamil Nadu schemes from myscheme.gov.in via their internal API.
 * Uses Playwright browser session for auth cookies — all fetches run inside page.evaluate().
 *
 * Output: server/scraper/raw_schemes.json
 *
 * Run: node server/scraper/scrapeSchemes.js
 */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const RAW_FILE = path.join(__dir, 'raw_schemes.json');
const PROGRESS_FILE = path.join(__dir, 'scrape_progress.json');

const SEARCH_API = 'https://api.myscheme.gov.in/search/v6/schemes';
const DETAIL_API = 'https://api.myscheme.gov.in/schemes/v6/public/schemes';
const PAGE_SIZE = 20;
const DETAIL_DELAY_MS = 800; // politeness delay between detail calls

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(readFileSync(PROGRESS_FILE, 'utf8')); } catch {}
  }
  return { done_slugs: [], raw: [] };
}
function saveProgress(prog) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(prog, null, 2));
}

async function getAllSlugs(page, apiKey) {
  console.log('\n📋 Fetching all TN scheme slugs...');
  const filter = JSON.stringify([{ identifier: 'beneficiaryState', value: 'Tamil Nadu' }]);

  // First call to get total
  const first = await page.evaluate(
    async ({ api, filter, size, key }) => {
      const url = `${api}?lang=en&q=${encodeURIComponent(filter)}&keyword=&sort=&from=0&size=${size}`;
      const r = await fetch(url, { headers: { 'Accept': 'application/json', 'x-api-key': key } });
      return await r.json();
    },
    { api: SEARCH_API, filter, size: PAGE_SIZE, key: apiKey }
  );

  const total = first?.data?.hits?.page?.total || first?.data?.summary?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  console.log(`  Total TN schemes: ${total} across ${totalPages} pages`);

  const slugs = [];
  // Collect from first response
  const firstHits = first?.data?.hits?.items || first?.data?.hits || [];
  firstHits.forEach(h => {
    const slug = h.fields?.slug || h.slug;
    const name = h.fields?.schemeName || h.schemeName || '';
    const category = h.fields?.schemeCategory?.[0] || '';
    const brief = h.fields?.briefDescription || '';
    if (slug) slugs.push({ slug, name, category, brief, tags: h.fields?.tags || [] });
  });

  // Paginate the rest
  for (let page_num = 1; page_num < totalPages; page_num++) {
    const from = page_num * PAGE_SIZE;
    const batch = await page.evaluate(
      async ({ api, filter, from, size, key }) => {
        const url = `${api}?lang=en&q=${encodeURIComponent(filter)}&keyword=&sort=&from=${from}&size=${size}`;
        const r = await fetch(url, { headers: { 'Accept': 'application/json', 'x-api-key': key } });
        return await r.json();
      },
      { api: SEARCH_API, filter, from, size: PAGE_SIZE, key: apiKey }
    );
    const hits = batch?.data?.hits?.items || batch?.data?.hits || [];
    hits.forEach(h => {
      const slug = h.fields?.slug || h.slug;
      const name = h.fields?.schemeName || h.schemeName || '';
      const category = h.fields?.schemeCategory?.[0] || '';
      const brief = h.fields?.briefDescription || '';
      if (slug) slugs.push({ slug, name, category, brief, tags: h.fields?.tags || [] });
    });
    if (page_num % 3 === 0) {
      console.log(`  Page ${page_num}/${totalPages} — ${slugs.length} slugs so far`);
    }
    await sleep(300);
  }

  console.log(`  ✓ Got ${slugs.length} slugs`);
  return slugs;
}

async function fetchDetail(page, slug, apiKey) {
  const result = await page.evaluate(
    async ({ api, slug, key }) => {
      const headers = { 'Accept': 'application/json', 'x-api-key': key };
      const calls = [
        `${api}?slug=${slug}&lang=en`,
        `${api}?slug=${slug}&lang=en&sections=eligibilityCriteria`,
        `${api}?slug=${slug}&lang=en&sections=documents_required`,
      ];
      const responses = await Promise.allSettled(
        calls.map(async (url) => {
          const r = await fetch(url, { headers });
          if (!r.ok) return null;
          return await r.json();
        })
      );
      return responses.map(r => r.status === 'fulfilled' ? r.value : null);
    },
    { api: DETAIL_API, slug, key: apiKey }
  );

  // Merge all response sections
  const merged = { slug };
  for (const res of result) {
    if (!res?.data?.en) continue;
    Object.assign(merged, res.data.en);
  }
  return merged;
}

async function scrapeDetailFromDOM(page, slug) {
  // Fallback: navigate to the scheme page and scrape rendered DOM
  await page.goto(`https://www.myscheme.gov.in/schemes/${slug}`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(2000);

  return await page.evaluate((slug) => {
    const getText = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.innerText.trim() : '';
    };
    const getListItems = (sectionKeyword) => {
      const headings = Array.from(document.querySelectorAll('h2, h3, h4, [class*="title"], [class*="heading"]'));
      const heading = headings.find(h => h.innerText?.toLowerCase().includes(sectionKeyword.toLowerCase()));
      if (!heading) return [];
      let sibling = heading.parentElement?.nextElementSibling || heading.nextElementSibling;
      for (let i = 0; i < 5 && sibling; i++) {
        const items = Array.from(sibling.querySelectorAll('li, p')).map(e => e.innerText.trim()).filter(Boolean);
        if (items.length) return items;
        sibling = sibling.nextElementSibling;
      }
      return [];
    };

    const bodyText = document.body.innerText;
    const name = getText('h1') || bodyText.split('\n').find(l => l.length > 20 && l.length < 200) || '';

    return {
      slug,
      name,
      bodyText: bodyText.slice(0, 5000),
      benefits: getListItems('benefit'),
      eligibility: getListItems('eligibilit'),
      documents: getListItems('document'),
    };
  }, slug);
}

async function main() {
  const prog = loadProgress();
  console.log(`🌾 Sevai-Scout Scheme Scraper`);
  console.log(`   Resuming: ${prog.done_slugs.length} already scraped`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  let apiKey = null;
  page.on('request', (req) => {
    if (req.url().includes('myscheme') && req.headers()['x-api-key']) {
      apiKey = req.headers()['x-api-key'];
    }
  });

  // Load the search page to establish session
  console.log('\n🔐 Establishing session...');
  await page.goto('https://www.myscheme.gov.in/search?state=Tamil+Nadu', {
    waitUntil: 'networkidle',
    timeout: 40000,
  });
  await page.waitForTimeout(2000);
  console.log(`   Session ready. API key captured: ${!!apiKey}`);

  // Get all TN slugs
  const allSlugs = await getAllSlugs(page, apiKey);

  // Filter out already-done slugs
  const pending = allSlugs.filter(s => !prog.done_slugs.includes(s.slug));
  console.log(`\n🔍 Fetching details: ${pending.length} pending`);

  for (let i = 0; i < pending.length; i++) {
    const { slug, name, category, brief, tags } = pending[i];
    try {
      const detail = await fetchDetail(page, slug, apiKey);
      const raw = {
        slug,
        raw_name: detail.basicDetails?.schemeName || name,
        raw_description: (detail.schemeContent?.description_md || detail.schemeContent?.description || brief || '').slice(0, 2000),
        raw_category: detail.basicDetails?.schemeCategory?.map(c => c.label || c).join(', ') || category,
        raw_tags: tags,
        raw_eligibility: JSON.stringify(detail.eligibilityCriteria || detail.schemeContent?.eligibility || []).slice(0, 1500),
        raw_benefits: JSON.stringify(detail.schemeContent?.benefits || detail.schemeContent?.benefit || brief || '').slice(0, 1000),
        raw_documents: JSON.stringify(detail.documents_required || detail.applicationProcess?.documents || []).slice(0, 1000),
        raw_deadline: detail.basicDetails?.schemeCloseDate || null,
        raw_link: `https://www.myscheme.gov.in/schemes/${slug}`,
        raw_state: 'Tamil Nadu',
        source_url: `https://www.myscheme.gov.in/schemes/${slug}`,
      };

      // If API gave us nothing useful, fall back to DOM scrape
      if (!raw.raw_description && !raw.raw_eligibility && i < 10) {
        console.log(`  → API empty for ${slug}, trying DOM scrape...`);
        const dom = await scrapeDetailFromDOM(page, slug);
        raw.raw_description = dom.bodyText?.slice(0, 2000) || brief;
        raw.raw_benefits = JSON.stringify(dom.benefits || []).slice(0, 1000);
        raw.raw_eligibility = JSON.stringify(dom.eligibility || []).slice(0, 1500);
        raw.raw_documents = JSON.stringify(dom.documents || []).slice(0, 1000);
      }

      prog.raw.push(raw);
      prog.done_slugs.push(slug);

      if ((i + 1) % 10 === 0 || i === pending.length - 1) {
        saveProgress(prog);
        console.log(`  [${i + 1}/${pending.length}] Saved. Last: ${raw.raw_name?.slice(0, 50)}`);
      }
      await sleep(DETAIL_DELAY_MS);
    } catch (err) {
      console.error(`  ✗ Error on ${slug}:`, err.message);
      // Store minimal record so we can still normalize
      prog.raw.push({
        slug,
        raw_name: name,
        raw_description: brief,
        raw_category: category,
        raw_tags: tags,
        raw_eligibility: '',
        raw_benefits: '',
        raw_documents: '',
        raw_deadline: null,
        raw_link: `https://www.myscheme.gov.in/schemes/${slug}`,
        raw_state: 'Tamil Nadu',
        source_url: `https://www.myscheme.gov.in/schemes/${slug}`,
      });
      prog.done_slugs.push(slug);
      saveProgress(prog);
      await sleep(500);
    }
  }

  await browser.close();

  // Write final raw file
  const unique = prog.raw.filter((r, i, arr) => arr.findIndex(x => x.slug === r.slug) === i);
  writeFileSync(RAW_FILE, JSON.stringify(unique, null, 2));
  console.log(`\n✅ Done! ${unique.length} schemes written to raw_schemes.json`);
}

main().catch(console.error);
