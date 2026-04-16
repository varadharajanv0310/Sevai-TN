import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useVault } from '../hooks/useVault.js';
import { useEligibility } from '../hooks/useEligibility.js';
import { useLanguage } from '../hooks/useLanguage.js';
import SchemeCard from '../components/SchemeCard.jsx';
import FuzzyMatchCard from '../components/FuzzyMatchCard.jsx';
import { t } from '../data/strings.js';
import { formatRupees } from '../utils/formatters.js';
import { DISTRICTS } from '../data/districts.js';
import { getRelevantAlerts, requestNotificationPermission } from '../utils/alertEngine.js';
import { SCHEMES } from '../data/schemes.js';

const CATEGORY_LABELS = {
  farming:    { en: 'Farming',    ta: 'விவசாயம்'     },
  education:  { en: 'Education',  ta: 'கல்வி'         },
  health:     { en: 'Health',     ta: 'சுகாதாரம்'     },
  housing:    { en: 'Housing',    ta: 'வீட்டுவசதி'    },
  women:      { en: 'Women',      ta: 'மகளிர்'        },
  employment: { en: 'Employment', ta: 'வேலைவாய்ப்பு'  },
  business:   { en: 'Business',   ta: 'வணிகம்'        },
  elderly:    { en: 'Elderly',    ta: 'முதியோர்'      },
  disability: { en: 'Disability', ta: 'மாற்றுத்திறன்' },
};

const CATEGORY_ICONS = {
  farming: '🌾', education: '📚', health: '🏥', housing: '🏠',
  women: '👩', employment: '💼', business: '🏪', elderly: '🧓',
  disability: '♿',
};

export default function Feed({ onAlertsChange }) {
  const { vault } = useVault();
  const { lang, setLang } = useLanguage();
  const { confirmed, fuzzy, totalEstimatedValue, topCategory } = useEligibility(vault);
  const [loading, setLoading] = useState(true);

  const [alerts, setAlerts] = useState([]);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const schemeRefs = useRef({});

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!vault || loading) return;
    const lastChecked = new Date(vault.alerts_last_checked || 0);
    const found = getRelevantAlerts(SCHEMES, vault, lastChecked);
    setAlerts(found);
    onAlertsChange?.(found.length);
    if (found.length > 0) requestNotificationPermission();
  }, [loading, vault]);

  const districtLabel = DISTRICTS.find((d) => d.id === vault.district);
  const districtStr = districtLabel ? (lang === 'ta' ? districtLabel.ta : districtLabel.en) : '';

  const catLabel = CATEGORY_LABELS[topCategory];
  const catIcon  = CATEGORY_ICONS[topCategory] || '📋';

  return (
    <div className="min-h-[100dvh] pb-24 bg-brand-white">
      {/* Hero header — new white bento style */}
      <header className="bg-white px-6 pt-8 pb-6 border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-brand-blue tracking-widest uppercase mb-1">{t('app_name', lang)}</div>
            <div className="text-xl font-black tracking-tight text-brand-ink">
              {vault.name
                ? lang === 'ta' ? `வணக்கம், ${vault.name}` : `Hello, ${vault.name}`
                : lang === 'ta' ? 'வணக்கம்' : 'Hello'}
              {districtStr && <span className="text-gray-400 font-medium"> · {districtStr}</span>}
            </div>
          </div>
          <button
            onClick={() => setLang(lang === 'ta' ? 'en' : 'ta')}
            className="text-xs font-bold bg-gray-100 text-brand-ink rounded-full px-4 py-2 hover:bg-gray-200 transition-colors"
          >
            {lang === 'ta' ? 'EN' : 'தமிழ்'}
          </button>
        </div>

        {/* Bento counter widget */}
        <div className="mt-6 flex bg-gray-50 rounded-[20px] p-5 items-center gap-5 border border-gray-100 shadow-sm">
          <div className="w-16 h-16 bg-[#1A1A1A] text-white rounded-2xl flex items-center justify-center text-3xl font-black shadow-inner shadow-black/50">
            {confirmed.length}
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              {lang === 'ta' ? 'திட்டங்கள் | மொத்தம்' : 'Schemes | Total Value'}
            </div>
            <div className="text-2xl font-black text-[#007AFF] tracking-tighter leading-none">
              {formatRupees(totalEstimatedValue)}
              <span className="text-[11px] text-gray-500 font-bold ml-1.5 tracking-wider uppercase">{t('wow_per_year', lang)}</span>
            </div>
          </div>
        </div>

        {/* Top-category insight pill */}
        {catLabel && confirmed.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-4 inline-flex items-center gap-2 bg-gray-100 rounded-full px-4 py-1.5 text-xs text-brand-ink"
          >
            <span>{catIcon}</span>
            <span>
              {lang === 'ta'
                ? `உங்கள் திட்டங்களில் பெரும்பாலானவை ${catLabel.ta} துறையில்`
                : `Most of your schemes are in ${catLabel.en}`}
            </span>
          </motion.div>
        )}
      </header>

      {/* Dismissable alert banner */}
      {alerts.length > 0 && !alertDismissed && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mt-3 bg-brand-amber/15 border border-brand-amber rounded-2xl px-4 py-3 flex items-center gap-3"
        >
          <span className="text-xl">⚠️</span>
          <div className="flex-1 text-sm text-brand-ink">
            <span className="font-bold">
              {lang === 'ta'
                ? `${alerts.length} திட்டங்கள் இந்த வாரம் காலாவதியாகும்`
                : `${alerts.length} scheme${alerts.length > 1 ? 's' : ''} expiring this week`}
            </span>
            {' — '}
            <button
              className="underline !min-h-0 !min-w-0 text-brand-green font-semibold"
              onClick={() => {
                const firstId = alerts[0]?.scheme?.id;
                if (firstId && schemeRefs.current[firstId]) {
                  schemeRefs.current[firstId].scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
            >
              {lang === 'ta' ? 'காண்க' : 'tap to see'}
            </button>
          </div>
          <button
            className="!min-h-0 !min-w-0 text-brand-muted text-lg"
            onClick={() => { setAlertDismissed(true); onAlertsChange?.(0); }}
          >
            ✕
          </button>
        </motion.div>
      )}

      {/* Loading shimmer */}
      {loading ? (
        <div className="px-5 py-10 text-center">
          <div className="inline-flex items-center gap-3 text-brand-muted">
            <span className="inline-flex gap-1">
              <span className="w-2 h-2 rounded-full bg-brand-blue animate-pulse" />
              <span className="w-2 h-2 rounded-full bg-brand-blue animate-pulse [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-brand-blue animate-pulse [animation-delay:300ms]" />
            </span>
            {t('loading_schemes', lang)}
          </div>
        </div>
      ) : (
        <>
          {/* Confirmed schemes */}
          <section className="px-4 py-4 space-y-3">
            <h2 className="text-sm font-bold text-brand-muted uppercase tracking-wide px-1">
              {lang === 'ta' ? 'பரிந்துரைக்கப்பட்டவை' : 'Recommended for you'}
            </h2>

            {confirmed.length === 0 && (
              <div className="amber-banner">
                {lang === 'ta'
                  ? 'உங்கள் சுயவிவரத்திற்கு பொருந்தும் திட்டங்கள் கிடைக்கவில்லை.'
                  : 'No schemes match your profile yet.'}
              </div>
            )}

            {confirmed.map(({ scheme, score }, idx) => (
              <motion.div
                key={scheme.id}
                ref={el => { schemeRefs.current[scheme.id] = el; }}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.3 }}
              >
                <SchemeCard
                  scheme={scheme}
                  vault={vault}
                  lang={lang}
                  score={score}
                  highlight={alerts.some(a => a.scheme?.id === scheme.id)}
                />
              </motion.div>
            ))}
          </section>

          {/* Fuzzy "You might also qualify" section */}
          {fuzzy.length > 0 && (
            <section className="px-4 py-2 pb-4 space-y-3">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="flex items-center gap-2 px-1 pt-2"
              >
                <span className="text-brand-saffron-dark text-base">◈</span>
                <h2 className="text-sm font-bold text-brand-saffron-dark uppercase tracking-wide">
                  {lang === 'ta' ? 'நீங்களும் தகுதியடையலாம்' : 'You might also qualify'}
                </h2>
              </motion.div>

              <p className="text-xs text-brand-muted px-1 -mt-1">
                {lang === 'ta'
                  ? 'சிறு மாற்றங்களுடன் இந்த திட்டங்களுக்கு விண்ணப்பிக்கலாம்'
                  : 'Small changes could make you eligible for these'}
              </p>

              {fuzzy.map(({ scheme, fuzzy: f }, idx) => (
                <motion.div
                  key={scheme.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + idx * 0.06, duration: 0.3 }}
                  className="border-2 border-dashed border-brand-saffron/40 rounded-2xl overflow-hidden"
                >
                  <FuzzyMatchCard entry={{ scheme, fuzzy: f }} vault={vault} lang={lang} />
                </motion.div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
