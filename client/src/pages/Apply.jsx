import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SCHEME_BY_ID } from '../data/schemes.js';
import { useVault } from '../hooks/useVault.js';
import { useLanguage } from '../hooks/useLanguage.js';
import { t } from '../data/strings.js';
import { addApplication } from '../utils/applications.js';
import { appendAudit } from '../utils/sahayakMock.js';
import { DISTRICTS } from '../data/districts.js';
import SuccessAnimation from '../components/SuccessAnimation.jsx';
import CrossSchemeChain from '../components/CrossSchemeChain.jsx';
import { speakImperative } from '../hooks/useTTS.js';
import { verifyDocument } from '../utils/documentVerifier.js';
import { useVoiceTranscript } from '../hooks/useVoiceTranscript.js';
import { createRecorder } from '../utils/speechUtils.js';

// ── Typewriter animation ─────────────────────────────────────────────────────
function TypewriterText({ text, speed = 150 }) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    setDisplayed('');
    if (!text) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(String(text).slice(0, i));
      if (i >= String(text).length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return (
    <span>
      {displayed}
      {displayed.length < String(text || '').length && (
        <span className="animate-pulse opacity-60">|</span>
      )}
    </span>
  );
}

export default function Apply() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const isSahayak = search.get('sahayak') === '1';
  const scheme = SCHEME_BY_ID[id];
  const { vault: ownVault, setVault } = useVault();
  const vault = useMemo(() => {
    if (!isSahayak) return ownVault;
    try {
      return JSON.parse(sessionStorage.getItem('sevai_sahayak_beneficiary') || '{}');
    } catch {
      return ownVault;
    }
  }, [isSahayak, ownVault]);
  const { lang } = useLanguage();
  const nav = useNavigate();

  const [docs, setDocs] = useState({});
  const [docErrors, setDocErrors] = useState({}); // { [docName]: verifyResult }
  const [showOCR, setShowOCR] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showRelated, setShowRelated] = useState(false);
  const startRef = useRef(Date.now());
  const elapsedRef = useRef(0);

  // ── Voice fill state ─────────────────────────────────────────────────────
  const [voiceFillActive, setVoiceFillActive] = useState(false);
  const [voiceFillTranscribing, setVoiceFillTranscribing] = useState(false);
  const [voiceHeard, setVoiceHeard] = useState('');
  const [liveFields, setLiveFields] = useState({}); // { fieldKey: animatedValue }
  const [greenFlash, setGreenFlash] = useState(new Set());
  const recorderRef = useRef(null);
  const voiceTx = useVoiceTranscript();

  if (!scheme) {
    return <div className="p-6 text-center">Scheme not found</div>;
  }

  const districtLabel = DISTRICTS.find((d) => d.id === vault.district);

  // Fields to display — check liveFields for animated override
  const fields = [
    { key: 'name',          label: lang === 'ta' ? 'பெயர்'            : 'Name',          value: liveFields.name    ?? vault.name    ?? (lang === 'ta' ? 'உள்ளிடப்படவில்லை' : 'Not set'), animated: 'name' in liveFields },
    { key: 'age',           label: lang === 'ta' ? 'வயது'             : 'Age',           value: liveFields.age     ?? (vault.age     ?? '—'),                                                animated: 'age' in liveFields },
    { key: 'gender',        label: lang === 'ta' ? 'பாலினம்'           : 'Gender',        value: vault.gender || '—',                                                                       animated: false },
    { key: 'district',      label: lang === 'ta' ? 'மாவட்டம்'         : 'District',      value: liveFields.district ?? (districtLabel ? (lang === 'ta' ? districtLabel.ta : districtLabel.en) : vault.district || '—'), animated: 'district' in liveFields },
    { key: 'caste',         label: lang === 'ta' ? 'சாதி'             : 'Caste',         value: vault.caste || '—',                                                                        animated: false },
    { key: 'annual_income', label: lang === 'ta' ? 'ஆண்டு வருமானம்'  : 'Annual income', value: liveFields.annual_income ?? (vault.annual_income ? `₹${vault.annual_income.toLocaleString('en-IN')}` : '—'), animated: 'annual_income' in liveFields },
    { key: 'occupation',    label: lang === 'ta' ? 'வேலை'             : 'Occupation',    value: liveFields.occupation ?? (vault.occupation || '—'),                                        animated: 'occupation' in liveFields },
  ];

  // ── Document verification ───────────────────────────────────────────────
  const handleDoc = async (docName, file) => {
    if (!file) return;
    setShowOCR(docName);
    setDocErrors((e) => { const next = { ...e }; delete next[docName]; return next; });

    const result = await verifyDocument(file);
    setShowOCR(null);

    if (!result.valid) {
      navigator.vibrate?.([200, 100, 200]);
      speakImperative(result.tamil_message, lang);
      setDocErrors((e) => ({ ...e, [docName]: result }));
    } else {
      speakImperative(lang === 'ta' ? 'ஆவணம் சரியாக உள்ளது' : 'Document looks good', lang);
      setDocs((d) => ({ ...d, [docName]: { name: file.name || 'captured.jpg', verified: true } }));
    }
  };

  const allDocsDone = scheme.documents_required.every((d) => docs[d]);

  // ── Voice fill ─────────────────────────────────────────────────────────
  const startVoiceFill = async () => {
    if (!recorderRef.current) recorderRef.current = createRecorder();
    setVoiceFillActive(true);
    setVoiceHeard('');
    voiceTx.reset();
    try {
      await recorderRef.current.start();
      voiceTx.start(lang);
    } catch {
      setVoiceFillActive(false);
    }
  };

  const stopVoiceFill = async () => {
    voiceTx.stop();
    setVoiceFillActive(false);
    setVoiceFillTranscribing(true);
    const blob = await recorderRef.current?.stop();

    const transcript = voiceTx.transcript;
    setVoiceHeard(transcript);

    try {
      const fd = new FormData();
      if (blob) fd.append('audio', blob, 'audio.webm');
      fd.append('language', lang);
      fd.append('field', 'profile');
      fd.append('text', transcript);
      const res = await fetch('/api/extract-intent', { method: 'POST', body: fd });
      const data = await res.json();

      // data.fields = { name, age, occupation, district, annual_income }
      const extracted = data.fields || {};
      setVoiceFillTranscribing(false);

      // Animate each extracted field with typewriter
      const animDelay = {};
      Object.entries(extracted).forEach(([key, val]) => {
        if (val == null || val === '') return;
        const display = key === 'annual_income'
          ? `₹${Number(val).toLocaleString('en-IN')}`
          : String(val);
        setTimeout(() => {
          setLiveFields((prev) => ({ ...prev, [key]: display }));
          // After typewriter completes, flash green then persist to vault
          setTimeout(() => {
            setGreenFlash((prev) => new Set([...prev, key]));
            setTimeout(() => setGreenFlash((prev) => { const n = new Set(prev); n.delete(key); return n; }), 1200);
            setVault({ [key]: key === 'age' || key === 'annual_income' ? Number(val) : val });
          }, display.length * 155 + 200);
        }, animDelay[key] || 0);
      });
      // Stagger animations
      let delay = 0;
      Object.keys(extracted).forEach((k) => { if (extracted[k] != null) { animDelay[k] = delay; delay += 300; } });
    } catch {
      setVoiceFillTranscribing(false);
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (submitting) return;
    setSubmitting(true);
    elapsedRef.current = Math.round((Date.now() - startRef.current) / 1000);
    addApplication({
      scheme_id: scheme.id,
      submitted_at: Date.now(),
      status: 'under_review',
      documents: Object.keys(docs),
      by_sahayak: isSahayak,
    });
    if (isSahayak) {
      appendAudit({ sahayak_action: 'submitted_application', scheme_id: scheme.id, beneficiary_id: vault.id });
    }
    setShowSuccess(true);
  };

  const onSuccessDone = () => { setShowSuccess(false); setShowRelated(true); };

  return (
    <div className="min-h-full pb-28 bg-brand-bg">
      <header className="bg-brand-green text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <button onClick={() => nav(-1)} className="!min-h-0 !min-w-0 p-2 -ml-2">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
            <path d="M15.5 4l-8 8 8 8 1.4-1.4L10.3 12l6.6-6.6z" />
          </svg>
        </button>
        <div className="flex-1 truncate">
          <div className="font-semibold leading-tight">{scheme.name_plain}</div>
          <div className="text-[11px] opacity-80">
            {isSahayak
              ? (lang === 'ta' ? 'உதவியாளர் முறையில் விண்ணப்பிக்கிறது' : 'Applying via Sahayak mode')
              : (lang === 'ta' ? 'தானாக நிரப்பப்பட்டுள்ளது' : 'Pre-filled from your profile')}
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* ── Voice Fill button ── */}
        <button
          onClick={voiceFillActive ? stopVoiceFill : startVoiceFill}
          disabled={voiceFillTranscribing}
          className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-colors ${
            voiceFillActive
              ? 'bg-red-500 text-white animate-pulse'
              : voiceFillTranscribing
              ? 'bg-gray-100 text-brand-muted'
              : 'bg-brand-saffron/15 text-brand-saffron-dark border-2 border-brand-saffron/30'
          }`}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3zM5 11a1 1 0 112 0 5 5 0 0010 0 1 1 0 112 0 7 7 0 01-6 6.92V21h-2v-3.08A7 7 0 015 11z" />
          </svg>
          {voiceFillTranscribing
            ? (lang === 'ta' ? 'பதிவு செயலாகுகிறது...' : 'Processing...')
            : voiceFillActive
            ? (lang === 'ta' ? 'நிறுத்து & நிரப்பு' : 'Stop & fill form')
            : (lang === 'ta' ? '🎤 குரலால் நிரப்பு' : '🎤 Fill by voice')}
        </button>

        {/* "Heard" confirmation bubble */}
        <AnimatePresence>
          {voiceHeard && !voiceFillActive && !voiceFillTranscribing && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-brand-green/10 rounded-xl px-4 py-2 text-sm text-brand-green-dark flex gap-2 items-start"
            >
              <span>🎤</span>
              <span>
                <span className="font-semibold">{lang === 'ta' ? 'கேட்டது:' : 'Heard:'}</span>{' '}
                &ldquo;{voiceHeard}&rdquo;
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Live transcript during voice fill ── */}
        <AnimatePresence>
          {voiceFillActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-gray-900 text-white rounded-xl px-4 py-3 text-sm flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
              <span className="flex-1 font-mono">
                {voiceTx.transcript || (lang === 'ta' ? 'பேசுங்கள்...' : 'Speak now...')}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Review section ── */}
        <section className="card">
          <h2 className="text-lg font-bold mb-3">{t('apply_review_title', lang)}</h2>
          <dl className="grid grid-cols-2 gap-3">
            {fields.map((f) => (
              <div
                key={f.key}
                className={`transition-all duration-300 rounded-lg p-1 ${
                  greenFlash.has(f.key) ? 'ring-2 ring-brand-green bg-brand-green/5' : ''
                }`}
              >
                <dt className="text-[11px] text-brand-muted uppercase tracking-wide">{f.label}</dt>
                <dd className="text-sm font-semibold text-brand-ink mt-0.5 break-words">
                  {f.animated
                    ? <TypewriterText text={String(f.value)} speed={150} />
                    : String(f.value)}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 text-[11px] text-brand-green flex items-center gap-1.5">
            <span>🔒</span>
            <span>{t('device_only', lang)}</span>
          </div>
        </section>

        {/* ── Documents ── */}
        <section className="card">
          <h2 className="text-lg font-bold mb-3">{t('apply_document_title', lang)}</h2>
          <div className="space-y-2">
            {scheme.documents_required.map((d) => {
              const done = !!docs[d];
              const err = docErrors[d];
              return (
                <div key={d}>
                  <label
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors cursor-pointer ${
                      done ? 'border-brand-green bg-brand-green/5' : err ? 'border-brand-amber bg-brand-amber/5' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div
                      className={`w-11 h-11 rounded-xl grid place-items-center text-xl ${
                        done ? 'bg-brand-green text-white' : err ? 'bg-brand-amber/20' : 'bg-gray-100'
                      }`}
                    >
                      {done ? '✓' : err ? '⚠' : '📷'}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{d}</div>
                      {done ? (
                        <div className="text-[11px] text-brand-green font-medium flex items-center gap-1">
                          <span>✓</span>
                          <span>{lang === 'ta' ? 'சரிபார்க்கப்பட்டது (offline)' : 'Verified offline ✓'}</span>
                        </div>
                      ) : err ? (
                        <div className="text-[11px] text-brand-amber-dark">
                          {lang === 'ta' ? err.tamil_message : err.english_message}
                        </div>
                      ) : (
                        <div className="text-[11px] text-brand-muted">{t('apply_tap_photo', lang)}</div>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleDoc(d, e.target.files?.[0])}
                      className="hidden"
                    />
                  </label>
                  {/* Retake button on error */}
                  {err && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-1 flex justify-end"
                    >
                      <label className="text-xs bg-brand-amber text-white font-semibold rounded-lg px-3 py-1.5 cursor-pointer">
                        {lang === 'ta' ? '📷 மீண்டும் எடு' : '📷 Retake'}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => handleDoc(d, e.target.files?.[0])}
                          className="hidden"
                        />
                      </label>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Submit ── */}
        <button
          disabled={submitting}
          onClick={handleSubmit}
          className={`w-full btn-primary ${!allDocsDone ? 'opacity-70' : ''}`}
        >
          {submitting ? (lang === 'ta' ? 'சமர்ப்பிக்கிறது...' : 'Submitting...') : t('apply_submit', lang)}
        </button>
        {!allDocsDone && (
          <p className="text-xs text-brand-muted text-center">
            {lang === 'ta'
              ? 'ஆவணங்கள் இல்லாவிட்டாலும் சமர்ப்பிக்கலாம் — பின்னர் சேர்க்கலாம்'
              : 'You can submit without photos — add them later'}
          </p>
        )}
      </div>

      {/* OCR processing overlay */}
      <AnimatePresence>
        {showOCR && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 grid place-items-center"
          >
            <div className="bg-white rounded-2xl p-6 max-w-xs mx-4 text-center">
              <div className="text-4xl mb-2">📄</div>
              <div className="text-base font-semibold mb-1">
                {lang === 'ta' ? 'ஆவணத்தை சரிபார்க்கிறது...' : 'Checking document...'}
              </div>
              <div className="text-xs text-brand-green flex items-center justify-center gap-1 mb-2">
                <span>📴</span>
                <span>{lang === 'ta' ? 'இணைய இணைப்பு தேவையில்லை' : 'Verified offline — no internet needed'}</span>
              </div>
              <div className="text-xs text-brand-muted">{showOCR}</div>
              <div className="mt-3 h-1 bg-gray-100 rounded overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1.2 }}
                  className="h-full bg-brand-green"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success animation */}
      {showSuccess && (
        <SuccessAnimation
          schemeName={scheme.name_plain}
          elapsedSeconds={elapsedRef.current}
          lang={lang}
          onDone={onSuccessDone}
        />
      )}

      {/* Post-submit cross-scheme chain */}
      {showRelated && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-40 bg-black/40 grid place-items-end"
          onClick={() => nav('/applications')}
        >
          <motion.div
            initial={{ y: 300 }}
            animate={{ y: 0 }}
            transition={{ type: 'spring', damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl p-5 w-full max-w-lg mx-auto space-y-4"
          >
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto" />
            <div className="text-center">
              <div className="text-3xl mb-2">🎉</div>
              <h3 className="text-xl font-bold">
                {lang === 'ta' ? 'விண்ணப்பம் சமர்ப்பிக்கப்பட்டது' : 'Application submitted'}
              </h3>
              <p className="text-sm text-brand-muted mt-1">{scheme.name_plain}</p>
            </div>
            <CrossSchemeChain schemeId={scheme.id} vault={vault} lang={lang} variant="single" />
            <button onClick={() => nav('/applications')} className="btn-secondary w-full">
              {lang === 'ta' ? 'விண்ணப்பங்களைக் காண்' : 'See my applications'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
