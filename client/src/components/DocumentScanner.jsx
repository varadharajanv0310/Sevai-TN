/**
 * DocumentScanner.jsx
 * Live camera capture → /api/extract-document → auto-fills vault fields.
 * Ported from mridah-shivakumar/Sevai-TN_with_camera_integration.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function DocumentScanner({ onDataExtracted, lang = 'en', autoOpen = false, onClose }) {
  const [isOpen, setIsOpen] = useState(autoOpen);
  const [isCasting, setIsCasting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  // Enumerate cameras on mount
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((devs) => {
      const v = devs.filter((d) => d.kind === 'videoinput');
      setDevices(v);
      if (v.length > 0) setSelectedDeviceId(v[0].deviceId);
    });
  }, []);

  // Auto-open when prop changes
  useEffect(() => {
    if (autoOpen && selectedDeviceId) openCamera(selectedDeviceId);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, selectedDeviceId]);

  const openCamera = async (deviceId) => {
    setIsOpen(true);
    setErrorMsg(null);
    setIsCasting(false);
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(
          deviceId ? { video: { deviceId: { exact: deviceId } } } : { video: true },
        );
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch { /* interrupted */ }
      }
    } catch (err) {
      console.error('Camera error:', err);
      setErrorMsg(
        lang === 'ta' ? 'கேமரா அணுகல் மறுக்கப்பட்டது.' : 'Camera access denied or unavailable.',
      );
      setIsCasting(false);
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsCasting(false);
  };

  const cancelScanner = () => {
    stopStream();
    setIsOpen(false);
    setErrorMsg(null);
    onClose?.();
  };

  const handleSwitchCamera = (e) => {
    stopStream();
    setSelectedDeviceId(e.target.value);
    openCamera(e.target.value);
  };

  const captureAndExtract = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Image = canvas.toDataURL('image/jpeg', 0.8);

    stopStream();
    setIsExtracting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image }),
      });
      if (!res.ok) throw new Error('extraction_failed');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setIsExtracting(false);
      setIsOpen(false);
      onDataExtracted?.(data, base64Image);
    } catch (err) {
      console.error('Extraction error:', err);
      setIsExtracting(false);
      setIsOpen(false);
      onDataExtracted?.({}, base64Image); // still mark doc done even if extraction fails
    }
  };

  // ── Closed state: show trigger button ────────────────────────────────────
  if (!isOpen) {
    return (
      <button
        onClick={() => openCamera(selectedDeviceId)}
        className="w-full flex items-center justify-center gap-3 p-3 rounded-xl bg-gradient-to-r from-brand-green to-brand-green-dark text-white shadow active:scale-95 transition-transform text-sm font-semibold"
      >
        <span className="text-xl">📸</span>
        <div className="text-left">
          <div className="font-bold">{lang === 'ta' ? 'ஸ்மார்ட் ஸ்கேன்' : 'Smart Scan'}</div>
          <div className="text-xs opacity-80">
            {lang === 'ta' ? 'கேமரா மூலம் தானாக நிரப்பு' : 'Auto-fill using camera'}
          </div>
        </div>
      </button>
    );
  }

  // ── Extracting state ─────────────────────────────────────────────────────
  if (isExtracting) {
    return (
      <div className="rounded-2xl overflow-hidden bg-brand-bg border border-gray-200 h-52 flex flex-col items-center justify-center gap-3">
        <div className="text-4xl animate-bounce">📄</div>
        <div className="font-bold text-brand-ink text-center">
          {lang === 'ta' ? 'தரவை பிரித்தெடுக்கிறது...' : 'Extracting data...'}
        </div>
        <div className="text-xs text-brand-muted text-center max-w-[220px]">
          {lang === 'ta' ? 'செயற்கை நுண்ணறிவு ஆவணத்தைப் படிக்கிறது' : 'AI is reading your document'}
        </div>
      </div>
    );
  }

  // ── Live camera view ─────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl overflow-hidden bg-black shadow-xl border border-gray-800">
      <canvas ref={canvasRef} className="hidden" />

      <div className="bg-black text-white p-3">
        {/* Header */}
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {lang === 'ta' ? 'கேமரா நேரடி காட்சி' : 'Live Camera'}
          </h3>
          <button
            onClick={cancelScanner}
            className="bg-white/20 hover:bg-white/30 rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Video feed */}
        <div className="relative rounded-xl overflow-hidden bg-gray-900 border border-white/10">
          {!isCasting && !errorMsg && (
            <div className="absolute inset-0 flex items-center justify-center h-40">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onPlay={() => setIsCasting(true)}
            className={`w-full h-auto max-h-[45vh] object-cover ${errorMsg ? 'hidden' : 'block'}`}
          />
          {/* Document guide overlay */}
          {isCasting && !errorMsg && (
            <div className="absolute inset-0 border-2 border-dashed border-white/40 m-5 rounded-lg shadow-[0_0_0_999px_rgba(0,0,0,0.45)] pointer-events-none" />
          )}
          {errorMsg && (
            <div className="p-8 text-center text-red-400 bg-red-400/10 h-40 flex items-center justify-center">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Camera selector (multi-camera devices) */}
        {devices.length > 1 && (
          <div className="mt-3 px-1">
            <label className="text-xs text-white/60 block mb-1">
              {lang === 'ta' ? 'கேமரா தேர்வு:' : 'Select camera:'}
            </label>
            <select
              value={selectedDeviceId}
              onChange={handleSwitchCamera}
              className="w-full bg-gray-800 text-white border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
            >
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Capture button */}
        <div className="mt-4 flex justify-center pb-1">
          {errorMsg ? (
            <button
              onClick={() => openCamera(selectedDeviceId)}
              className="px-6 py-2 bg-white/10 rounded-full font-bold text-sm"
            >
              {lang === 'ta' ? 'மீண்டும் முயற்சிக்கவும்' : 'Try Again'}
            </button>
          ) : (
            <button
              onClick={captureAndExtract}
              disabled={!isCasting}
              className="bg-white text-black font-bold h-16 w-16 rounded-full flex items-center justify-center shadow-[0_0_0_4px_rgba(255,255,255,0.3)] active:scale-95 transition-transform disabled:opacity-50"
              aria-label={lang === 'ta' ? 'படம் எடு' : 'Capture'}
            >
              <span className="text-2xl">📷</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
