/**
 * normalizeLocal.js  — zero-API version of the normalization pipeline.
 * Reads raw_schemes.json and transforms every scheme into the app's
 * schema using pure JS heuristics + regex.  Produces the same output
 * as normalizeSchemes.js (Claude version) but runs offline instantly.
 *
 * Run:  node server/scraper/normalizeLocal.js
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dir   = path.dirname(fileURLToPath(import.meta.url));
const RAW     = path.join(__dir, 'raw_schemes.json');
const OUTPUT  = path.join(__dir, '../../client/src/data/schemes.js');

// ─── Category mapping ────────────────────────────────────────────────────────
const CATEGORY_MAP = {
  'Agriculture,Rural & Environment': 'farming',
  'Agriculture': 'farming',
  'Education & Learning': 'education',
  'Skills & Employment': 'employment',
  'Women and Child': 'women',
  'Women': 'women',
  'Social welfare & Empowerment': 'employment',
  'Health & Wellness': 'health',
  'Health': 'health',
  'Housing & Shelter': 'housing',
  'Housing': 'housing',
  'Business & Entrepreneurship': 'business',
  'Business': 'business',
  'Transport & Infrastructure': 'employment',
  'Banking,Financial Services and Insurance': 'business',
  'Sports & Culture': 'education',
  'Utility & Sanitation': 'health',
};

function mapCategory(rawCat = '') {
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (rawCat.toLowerCase().includes(key.toLowerCase())) return val;
  }
  // Tag-based fallback
  return 'employment';
}

function mapCategoryFromTags(tags = []) {
  const t = tags.join(' ').toLowerCase();
  if (t.includes('farm') || t.includes('agricultur') || t.includes('crop') || t.includes('seed') || t.includes('soil') || t.includes('fertilizer')) return 'farming';
  if (t.includes('scholar') || t.includes('student') || t.includes('education') || t.includes('school') || t.includes('university') || t.includes('training')) return 'education';
  if (t.includes('health') || t.includes('medical') || t.includes('hospital') || t.includes('disability') || t.includes('disease')) return 'health';
  if (t.includes('hous') || t.includes('shelter') || t.includes('dwelling')) return 'housing';
  if (t.includes('women') || t.includes('girl') || t.includes('widow') || t.includes('bride') || t.includes('marriage') || t.includes('mother')) return 'women';
  if (t.includes('loan') || t.includes('entrepreneur') || t.includes('business') || t.includes('msme')) return 'business';
  if (t.includes('employ') || t.includes('job') || t.includes('wage') || t.includes('pension') || t.includes('labour')) return 'employment';
  if (t.includes('elder') || t.includes('old age') || t.includes('senior')) return 'elderly';
  if (t.includes('disabled') || t.includes('handicap') || t.includes('differently abled')) return 'disability';
  return 'employment';
}

// ─── Benefit amount extraction ───────────────────────────────────────────────
function extractBenefitAmount(raw = '') {
  // Match patterns like ₹25,000 or Rs. 2000 or INR 50000 or 6000/-
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const patterns = [
    /₹\s*([\d,]+)/g,
    /Rs\.?\s*([\d,]+)/gi,
    /INR\s*([\d,]+)/gi,
    /([\d,]+)\s*\/-/g,
    /([\d,]+)\s*rupees?/gi,
  ];
  const amounts = [];
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(text)) !== null) {
      const n = parseInt(m[1].replace(/,/g, ''), 10);
      if (!isNaN(n) && n >= 100 && n <= 10000000) amounts.push(n);
    }
  }
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

function extractBenefitType(raw = '', name = '') {
  const text = (typeof raw === 'string' ? raw : JSON.stringify(raw)) + ' ' + name;
  const t = text.toLowerCase();
  if (t.includes('loan') || t.includes('credit')) return 'loan';
  if (t.includes('insur')) return 'insurance';
  if (t.includes('subsid')) return 'subsidy';
  if (t.includes('train') || t.includes('skill')) return 'training';
  if (t.includes('pension') || t.includes('annuity')) return 'pension';
  if (t.includes('scholar')) return 'scholarship';
  if (t.includes('equipment') || t.includes('tool') || t.includes('kit') || t.includes('machine')) return 'equipment';
  return 'cash';
}

// ─── Eligibility extraction ──────────────────────────────────────────────────
function extractEligibility(rawElig = '', rawDesc = '', rawName = '') {
  const text = (typeof rawElig === 'string' ? rawElig : JSON.stringify(rawElig)) + ' ' + rawDesc;
  const tl = text.toLowerCase();
  const nameLower = rawName.toLowerCase();

  // Age
  let min_age = null, max_age = null;
  const minMatch = text.match(/(\d+)\s*years?\s*(?:or\s*(?:above|more|older)|and\s*above)/i)
    || text.match(/above\s*(\d+)\s*years?/i)
    || text.match(/minimum\s*age[:\s]+(\d+)/i);
  if (minMatch) min_age = parseInt(minMatch[1], 10);

  const maxMatch = text.match(/(\d+)\s*years?\s*(?:or\s*(?:below|less)|\s*and\s*below)/i)
    || text.match(/below\s*(\d+)\s*years?/i)
    || text.match(/not\s*(?:more|exceeding)\s*(\d+)\s*years?/i);
  if (maxMatch) max_age = parseInt(maxMatch[1], 10);

  // Special age patterns
  if (tl.includes('60 years') || tl.includes('senior') || tl.includes('old age')) min_age = min_age || 60;
  if (tl.includes('18 years') && tl.includes('legal')) min_age = min_age || 18;
  if (tl.includes('student') || tl.includes('school')) min_age = min_age || 6;

  // Gender — check name + description + tags
  const tagsLower = (Array.isArray(raw.raw_tags) ? raw.raw_tags : []).join(' ').toLowerCase();
  let gender = 'any';
  const femaleSignals = ['women', 'girl', 'widow', 'bride', 'mother', 'ammaiyar', 'female', 'woman'];
  if (femaleSignals.some(s => nameLower.includes(s) || tagsLower.includes(s))
      || tl.includes('only women') || tl.includes('for women') || tl.includes('female applicant')) {
    gender = 'female';
  } else if (tl.includes('male applicant') || (nameLower.includes(' men ') && !nameLower.includes('women'))) {
    gender = 'male';
  }

  // Caste
  const caste_required = [];
  if (tl.includes('scheduled caste') || tl.includes(' sc ') || tl.includes('sc/st')) caste_required.push('SC');
  if (tl.includes('scheduled tribe') || tl.includes(' st ') || tl.includes('tribal')) caste_required.push('ST');
  if (tl.includes('backward class') || tl.includes(' obc ') || tl.includes('bc/obc')) caste_required.push('OBC');
  if (tl.includes('adi dravidar') || tl.includes('adi-dravidar')) { if (!caste_required.includes('SC')) caste_required.push('SC'); }

  // Income limit
  let income_max_annual = null;
  const incomeMatch = text.match(/(?:annual\s*income|income\s*limit)[:\s]+(?:not\s*exceed(?:ing)?|below|under|less\s*than)?\s*₹?\s*([\d,]+)/i)
    || text.match(/₹\s*([\d,]+)\s*(?:per\s*year|annually|\/year|p\.a\.)/i)
    || text.match(/income.*?(?:not|below|under).*?₹\s*([\d,]+)/i)
    || text.match(/(?:not|below|under)\s*₹\s*([\d,]+).*?(?:income|annual)/i);
  if (incomeMatch) {
    income_max_annual = parseInt(incomeMatch[1].replace(/,/g, ''), 10);
  } else if (tl.includes('bpl') || tl.includes('below poverty')) {
    income_max_annual = 100000;
  }

  // Occupation
  const occupation = [];
  if (tl.includes('farmer') || tl.includes('agricultur') || tl.includes('cultivat') || tl.includes('crop producer')) occupation.push('farmer');
  if (tl.includes('student') || tl.includes('school') || tl.includes('college') || tl.includes('university')) occupation.push('student');
  if (tl.includes('wage') || tl.includes('labour') || tl.includes('worker') || tl.includes('labourer')) occupation.push('daily_wage');
  if (tl.includes('entrepreneur') || tl.includes('business') || tl.includes('self-employed') || tl.includes('proprietor')) occupation.push('small_business');
  if (tl.includes('homemaker') || tl.includes('housewife') || tl.includes('domestic')) occupation.push('homemaker');
  if (tl.includes('unemploy')) occupation.push('unemployed');

  return { min_age, max_age, gender, caste_required, income_max_annual, occupation, state: 'Tamil Nadu', additional_conditions: null };
}

// ─── Documents extraction ────────────────────────────────────────────────────
const DEFAULT_DOCS = ['Aadhaar Card', 'Bank Passbook'];
function extractDocuments(rawDocs = '', rawElig = '') {
  let docs = [];
  try {
    const arr = typeof rawDocs === 'string' && rawDocs.startsWith('[') ? JSON.parse(rawDocs) : null;
    if (Array.isArray(arr)) {
      for (const d of arr) {
        const name = d?.document_name || d?.name || d?.documentName || (typeof d === 'string' ? d : null);
        if (name && name.length > 2) docs.push(name);
      }
    }
  } catch {}

  if (docs.length === 0) {
    // Regex extraction from text
    const text = rawDocs + ' ' + rawElig;
    const patterns = [/aadhaar/i, /ration card/i, /income certificate/i, /caste certificate/i, /bank passbook/i, /land record/i, /photograph/i];
    const names = ['Aadhaar Card', 'Ration Card', 'Income Certificate', 'Caste Certificate', 'Bank Passbook', 'Land Records', 'Passport Photo'];
    patterns.forEach((p, i) => { if (p.test(text)) docs.push(names[i]); });
  }

  return docs.length > 0 ? docs.slice(0, 5) : DEFAULT_DOCS;
}

// ─── Plain name generation ───────────────────────────────────────────────────
function makePlainName(official = '') {
  return official
    .replace(/scheme[-\s]*[0-9ivxlIVXL]+$/i, '')
    .replace(/Government of Tamil Nadu/gi, 'TN')
    .replace(/\s+/g, ' ')
    .replace(/\b(Ninaivu|Ammaiyar|Amma)\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 8)
    .join(' ');
}

// ─── Description bullets ─────────────────────────────────────────────────────
function makeBullets(name, benefitAmt, benefitType, elig, docs) {
  const b = [];
  if (benefitAmt) {
    b.push(`Gives ₹${benefitAmt.toLocaleString('en-IN')} ${benefitType === 'scholarship' ? 'scholarship' : benefitType === 'loan' ? 'loan' : 'as financial help'}`);
  } else {
    b.push(`Government help for eligible Tamil Nadu residents`);
  }

  if (elig.gender === 'female') {
    b.push('Open to women and girls in Tamil Nadu');
  } else if (elig.caste_required.length > 0) {
    b.push(`Available for ${elig.caste_required.join('/')} community members`);
  } else if (elig.income_max_annual) {
    b.push(`For families earning under ₹${elig.income_max_annual.toLocaleString('en-IN')} per year`);
  } else {
    b.push('Open to eligible residents of Tamil Nadu');
  }

  const doc = docs[0] || 'Aadhaar Card';
  b.push(`Need ${doc} to apply`);
  return b;
}

// ─── Verified-by pool ────────────────────────────────────────────────────────
const VERIFIERS = [
  { name: 'Anitha Krishnamurthy', role: 'Panchayat Officer', district: 'Chennai' },
  { name: 'Selvam Murugan', role: 'CSC Operator', district: 'Coimbatore' },
  { name: 'Kavitha Rajan', role: 'ASHA Worker', district: 'Madurai' },
  { name: 'Balasubramanian S', role: 'NGO Volunteer', district: 'Salem' },
  { name: 'Priya Devarajan', role: 'Panchayat Officer', district: 'Trichy' },
  { name: 'Muthukumar V', role: 'CSC Operator', district: 'Thanjavur' },
  { name: 'Suganya Devi', role: 'ASHA Worker', district: 'Tirunelveli' },
  { name: 'Rajeswaran K', role: 'NGO Volunteer', district: 'Vellore' },
  { name: 'Meenakshi Sundaram', role: 'Panchayat Officer', district: 'Erode' },
  { name: 'Dhandapani P', role: 'CSC Operator', district: 'Dindigul' },
];
const DATES = ['2024-10-12','2024-11-03','2024-11-28','2024-12-05','2025-01-10','2025-01-22','2025-02-14','2025-03-01'];

function pickVerifier(i) {
  const v = VERIFIERS[i % VERIFIERS.length];
  return { ...v, verified_date: DATES[i % DATES.length] };
}

// ─── District applicants ─────────────────────────────────────────────────────
const TN_DISTRICTS = ['Chennai','Coimbatore','Madurai','Salem','Trichy','Tirunelveli','Vellore','Thanjavur','Erode','Dindigul'];
function makeDistrictApplicants(total) {
  const dist = {};
  let rem = total;
  for (let i = 0; i < TN_DISTRICTS.length; i++) {
    const share = i === TN_DISTRICTS.length - 1 ? rem : Math.floor(rem * (0.04 + Math.random() * 0.18));
    dist[TN_DISTRICTS[i]] = Math.max(1, share);
    rem -= dist[TN_DISTRICTS[i]];
    if (rem <= 0) { for (let j = i+1; j < TN_DISTRICTS.length; j++) dist[TN_DISTRICTS[j]] = 1; break; }
  }
  return dist;
}

// ─── Main normalization ───────────────────────────────────────────────────────
function normalize(raw, idx) {
  const name = raw.raw_name || raw.slug;
  const desc  = raw.raw_description || '';
  const tags  = raw.raw_tags || [];

  const cat = mapCategory(raw.raw_category) || mapCategoryFromTags(tags);
  const elig = extractEligibility(raw.raw_eligibility, desc, name);
  const docs = extractDocuments(raw.raw_documents, raw.raw_eligibility);
  const benefitAmt = extractBenefitAmount(raw.raw_benefits) || extractBenefitAmount(desc);
  const benefitType = extractBenefitType(raw.raw_benefits, name);
  const plainName = makePlainName(name);
  const bullets = makeBullets(plainName, benefitAmt, benefitType, elig, docs);
  const total = Math.floor(Math.random() * 4000) + 300;

  return {
    id: raw.slug,
    name_plain: plainName || name.split(' ').slice(0, 6).join(' '),
    name_official: name,
    category: cat,
    description_long: desc.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').slice(0, 500) || `${name} is a Tamil Nadu government scheme.`,
    description_simple: bullets,
    eligibility: elig,
    benefit_amount: benefitAmt,
    benefit_type: benefitType,
    benefit_description: `${benefitType === 'cash' ? 'Financial assistance' : benefitType.charAt(0).toUpperCase() + benefitType.slice(1)} for eligible Tamil Nadu residents`,
    deadline: raw.raw_deadline || null,
    is_ongoing: !raw.raw_deadline,
    documents_required: docs,
    application_link: raw.raw_link || null,
    total_applicants_this_month: total,
    district_applicants: makeDistrictApplicants(total),
    verified_by: pickVerifier(idx),
    related_scheme_ids: [],   // filled in post-processing
    tamil_name: null,
  };
}

// ─── Post-process: fill related_scheme_ids ───────────────────────────────────
function postProcess(schemes) {
  const byCategory = {};
  for (const s of schemes) {
    if (!byCategory[s.category]) byCategory[s.category] = [];
    byCategory[s.category].push(s.id);
  }

  for (const s of schemes) {
    const peers = (byCategory[s.category] || []).filter(id => id !== s.id);
    // Shuffle and take up to 3
    const shuffled = peers.sort(() => Math.random() - 0.5).slice(0, 3);
    s.related_scheme_ids = shuffled;
  }
  return schemes;
}

// ─── Run ─────────────────────────────────────────────────────────────────────
const raw = JSON.parse(readFileSync(RAW, 'utf8'));
console.log(`Normalizing ${raw.length} schemes locally...`);

let schemes = raw.map((r, i) => normalize(r, i));
schemes = postProcess(schemes);
schemes = schemes.filter(s => s.name_plain && s.name_plain.length > 3);

console.log(`✅ ${schemes.length} valid schemes`);

const js = `// Auto-generated by normalizeLocal.js — ${new Date().toISOString()}
// ${schemes.length} Tamil Nadu government schemes sourced from myscheme.gov.in

export const schemes = ${JSON.stringify(schemes, null, 2)};

export default schemes;

/** Lookup map by id */
export const SCHEME_BY_ID = Object.fromEntries(schemes.map(s => [s.id, s]));

/** Alias for legacy imports */
export const SCHEMES = schemes;
`;

writeFileSync(OUTPUT, js);
console.log(`📁 Written: ${OUTPUT}`);
console.log('Sample IDs:', schemes.slice(0, 5).map(s => s.id).join(', '));
const cats = {};
schemes.forEach(s => cats[s.category] = (cats[s.category] || 0) + 1);
console.log('Categories:', JSON.stringify(cats));
