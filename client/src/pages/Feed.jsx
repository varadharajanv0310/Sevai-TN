import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useVault } from '../hooks/useVault.js';
import { useEligibility } from '../hooks/useEligibility.js';
import { useLanguage } from '../hooks/useLanguage.js';
import SchemeCard from '../components/SchemeCard.jsx';
import FuzzyMatchCard from '../components/FuzzyMatchCard.jsx';
import { t } from '../data/strings.js';
import { formatRupees } from '../utils/formatters.js';
import { DISTRICTS } from '../data/districts.js';

// Category display labels (en + ta)
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

export default function Feed() {
  const { vault } = useVault();
  const { lang, setLang } = useLanguage();
  const { confirmed, fuzzy, totalEstimatedValue, topCategory } = useEligibility(vault);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const districtLabel = DISTRICTS.find((d) => d.id === vault.district);
  const districtStr = districtLabel ? (lang === 'ta' ? districtLabel.ta : districtLabel.en) : '';

  const catLabel = CATEGORY_LABELS[topCategory];
  const catIcon  = CATEGORY_ICONS[topCategory] || '📋';

  return (
    <div className="min-h-full pb-24 bg-brand-bg">
      {/* Hero header */}
      <header className="bg-brand-green text-white px-5 pt-6 pb-8 rounded-b-3xl shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs opacity-80">{t('app_name', lang)}</div>
            <div className="text-sm opacity-90">
              {vault.name
                ? lang === 'ta'
                  ? `வணக்கம், ${vault.name}`
                  : `Hello, ${vault.name}`
                : lang === 'ta'
                ? 'வணக்கம்'
                : 'Hello'}
              {districtStr && <span> · {districtStr}</span>}
            </div>
          </div>
          <button
            onClick={() => setLang(lang === 'ta' ? 'en' : 'ta')}
            className="!min-h-0 !min-w-0 text-xs bg-white/15 rounded-full px-3 py-1.5"
          >
            {lang === 'ta' ? 'EN' : 'த'}
          </button>
        </div>

        {/* Count + value */}
        <div className="mt-5">
          <div className="text-xs opacity-80 uppercase tracking-widest">
            {lang === 'ta' ? 'உங்களுக்கு தகுதியானவை' : 'You qualify for'}
          </div>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-5xl font-black text-brand-saffron">{confirmed.length}</span>
            <span className="text-sm opacity-90">
              {lang === 'ta' ? 'திட்டங்கள்' : 'schemes'} · {formatRupees(totalEstimatedValue)}
              <span className="text-xs opacity-70">{t('wow_per_year', lang)}</span>
            </span>
          </div>
        </div>

        {/* Top-category insight pill */}
        {catLabel && confirmed.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-4 inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-1.5 text-xs"
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

      {/* Loading shimmer */}
      {loading ? (
        <div className="px-5 py-10 text-center">
          <div className="inline-flex items-center gap-3 text-brand-muted">
            <span className="inline-flex gap-1">
              <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse" />
              <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse [animation-delay:300ms]" />
            </span>
            {t('loading_schemes', lang)}
          </div>
        </div>
      ) : (
        <>
          {/* ── Confirmed schemes ── */}
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
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.3 }}
              >
                <SchemeCard scheme={scheme} vault={vault} lang={lang} score={score} />
              </motion.div>
            ))}
          </section>

          {/* ── Fuzzy "You might also qualify" section ── */}
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
