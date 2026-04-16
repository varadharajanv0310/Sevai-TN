import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { t, tf } from '../data/strings.js';
import { SCHEME_BY_ID } from '../data/schemes.js';

const stages = ['submitted', 'under_review', 'final'];

export default function StatusTimeline({ app, lang }) {
  const scheme = SCHEME_BY_ID[app.scheme_id];
  const nav = useNavigate();
  if (!scheme) return null;

  const isApproved = app.status === 'approved';
  const isRejected = app.status === 'rejected';
  const isReview = app.status === 'under_review' || (!isApproved && !isRejected);

  const nodes = [
    {
      key: 'submitted',
      label: t('status_submitted', lang),
      reached: true,
      color: 'brand-green',
    },
    {
      key: 'under_review',
      label: t('status_under_review', lang),
      reached: isReview || isApproved || isRejected,
      color: isRejected ? 'brand-amber' : 'brand-green',
    },
    {
      key: 'final',
      label: isApproved ? t('status_approved', lang) : isRejected ? t('status_rejected', lang) : t('status_under_review', lang),
      reached: isApproved || isRejected,
      color: isApproved ? 'brand-green' : isRejected ? 'brand-amber' : 'gray',
    },
  ];

  const plainCopy = isApproved
    ? tf('status_plain_approved', lang, { name: scheme.name_plain })
    : isRejected
    ? tf('status_plain_rejected', lang, { name: scheme.name_plain, reason: app.reject_reason || (lang === 'ta' ? 'வருமான சான்றிதழ் இல்லை' : 'Income certificate missing') })
    : tf('status_plain_review', lang, { name: scheme.name_plain });

  // Mock SMS — Tamil or English depending on user's language
  const shortName = scheme.name_plain.split(' ').slice(0, 4).join(' ');
  const amt = scheme.benefit_amount ? `₹${scheme.benefit_amount.toLocaleString('en-IN')}` : '';
  const smsMock = isApproved
    ? lang === 'ta'
      ? `உங்கள் ${shortName} விண்ணப்பம் அங்கீகரிக்கப்பட்டது.${amt ? ` ${amt} 7 நாட்களில் உங்கள் கணக்கில் வரவு வைக்கப்படும்.` : ''}`
      : `Your ${shortName} application is approved.${amt ? ` ${amt} will be credited to your account within 7 days.` : ''}`
    : isRejected
    ? lang === 'ta'
      ? `உங்கள் ${shortName} விண்ணப்பத்திற்கு கூடுதல் ஆவணங்கள் தேவை. மீண்டும் சமர்ப்பிக்கவும்.`
      : `Your ${shortName} application needs additional documents. Please resubmit with required docs.`
    : lang === 'ta'
    ? `உங்கள் ${shortName} விண்ணப்பம் செயலில் உள்ளது. 5-7 நாட்களில் அறிவிக்கப்படும்.`
    : `Your ${shortName} application is under review. You will receive an update in 5-7 days.`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0">
          <h3 className="font-bold text-lg text-brand-ink leading-tight">{scheme.name_plain}</h3>
          <div className="text-xs text-brand-muted mt-0.5">{scheme.name_official}</div>
        </div>
      </div>

      {/* Vertical timeline */}
      <div className="relative pl-6">
        <div className="absolute left-2 top-2 bottom-2 w-[2px] bg-gray-200" />
        {nodes.map((n, i) => (
          <div key={n.key} className="relative mb-4 last:mb-0">
            <div
              className={`absolute -left-[22px] top-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center text-white text-[11px] ${
                n.reached
                  ? n.color === 'brand-green'
                    ? 'bg-brand-green border-brand-green'
                    : 'bg-brand-amber border-brand-amber'
                  : 'bg-white border-gray-300'
              }`}
            >
              {n.reached && i < nodes.length - 1 ? '✓' : ''}
              {n.reached && i === nodes.length - 1 && isApproved && '✓'}
              {n.reached && i === nodes.length - 1 && isRejected && '!'}
            </div>
            <div className={`text-sm font-semibold ${n.reached ? 'text-brand-ink' : 'text-gray-400'}`}>
              {n.label}
            </div>
          </div>
        ))}
      </div>

      {/* Plain-language status sentence */}
      <div
        className={`mt-3 rounded-xl p-3 text-sm ${
          isApproved ? 'bg-brand-green/10 text-brand-green-dark' : isRejected ? 'amber-banner' : 'bg-gray-50 text-brand-ink'
        }`}
      >
        {plainCopy}
      </div>

      {/* Mock SMS preview */}
      <div className="mt-3 bg-gray-900 text-white rounded-xl p-3">
        <div className="text-[10px] uppercase tracking-widest opacity-70 mb-1">
          {t('mock_sms_label', lang)}
        </div>
        <div className="text-sm font-mono leading-snug">{smsMock}</div>
      </div>

      {/* Fix & resubmit */}
      {isRejected && (
        <button
          onClick={() => nav(`/apply/${scheme.id}`)}
          className="btn-saffron w-full mt-3"
        >
          {t('fix_resubmit', lang)}
        </button>
      )}
    </motion.div>
  );
}
