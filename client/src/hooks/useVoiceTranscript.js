/**
 * useVoiceTranscript — Live Web Speech API transcript hook.
 * Shows interim results word-by-word while the user speaks.
 * Falls back gracefully if SpeechRecognition is unavailable.
 */
import { useState, useRef, useCallback } from 'react';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

export function useVoiceTranscript() {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const recRef = useRef(null);

  const isSupported = !!SR;

  const start = useCallback((lang = 'ta') => {
    if (!SR) return false;
    // Stop any running instance first
    recRef.current?.abort();

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang === 'ta' ? 'ta-IN' : 'en-IN';
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += text + ' ';
        else interim += text;
      }
      setTranscript((prev) => (final ? prev + final : prev + interim).trimStart());
      if (final) setFinalTranscript((prev) => (prev + final).trim());
    };

    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);

    try {
      rec.start();
      recRef.current = rec;
      setIsListening(true);
      setTranscript('');
      setFinalTranscript('');
      return true;
    } catch {
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setFinalTranscript('');
  }, []);

  return { transcript, finalTranscript, isListening, isSupported, start, stop, reset };
}
