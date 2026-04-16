/**
 * documentVerifier.js — Offline document image quality checker.
 * All processing happens in a Canvas element — ZERO network calls.
 * Works with WiFi disabled.
 */

export const verifyDocument = async (imageFile) => {
  return new Promise((resolve) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;

      // ── Check 1: Brightness ──────────────────────────────────────────────
      let totalBrightness = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        totalBrightness += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      }
      const avgBrightness = totalBrightness / (pixels.length / 4);

      if (avgBrightness < 40) {
        return resolve({
          valid: false,
          issue: 'too_dark',
          tamil_message: 'படம் இருட்டாக உள்ளது. நல்ல வெளிச்சத்தில் எடுங்கள்',
          english_message: 'Image too dark. Take in better lighting',
        });
      }
      if (avgBrightness > 220) {
        return resolve({
          valid: false,
          issue: 'too_bright',
          tamil_message: 'படம் மிகவும் வெளிச்சமாக உள்ளது. நேரடி ஒளியை தவிர்க்கவும்',
          english_message: 'Image overexposed. Avoid direct light',
        });
      }

      // ── Check 2: Blur detection via Laplacian variance ───────────────────
      let laplacianSum = 0;
      const w = canvas.width;
      for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = (y * w + x) * 4;
          const gray = pixels[idx];
          const laplacian = Math.abs(
            -pixels[((y - 1) * w + x) * 4] -
              pixels[((y + 1) * w + x) * 4] -
              pixels[(y * w + x - 1) * 4] -
              pixels[(y * w + x + 1) * 4] +
              4 * gray,
          );
          laplacianSum += laplacian;
        }
      }
      const blurScore = laplacianSum / (canvas.width * canvas.height);

      if (blurScore < 8) {
        return resolve({
          valid: false,
          issue: 'blurry',
          tamil_message: 'படம் மங்கலாக உள்ளது. நிலையாக பிடித்து மீண்டும் எடுங்கள்',
          english_message: 'Image is blurry. Hold steady and retake',
        });
      }

      // ── Check 3: Aspect ratio ────────────────────────────────────────────
      const ratio = canvas.width / canvas.height;
      if (ratio < 0.5 || ratio > 2.5) {
        return resolve({
          valid: false,
          issue: 'wrong_orientation',
          tamil_message: 'ஆவணம் முழுவதும் தெரியவில்லை. மீண்டும் சரிசெய்து எடுங்கள்',
          english_message: 'Document not fully visible. Reframe and retake',
        });
      }

      // ── Check 4: Minimum resolution ──────────────────────────────────────
      if (canvas.width < 400 || canvas.height < 300) {
        return resolve({
          valid: false,
          issue: 'too_small',
          tamil_message: 'படம் மிகவும் சிறியது. ஆவணத்தை அருகில் சென்று எடுங்கள்',
          english_message: 'Move closer to the document',
        });
      }

      // ── All checks passed ─────────────────────────────────────────────────
      resolve({
        valid: true,
        tamil_message: 'ஆவணம் சரியாக உள்ளது ✓',
        english_message: 'Document looks good ✓',
        metrics: { brightness: Math.round(avgBrightness), sharpness: Math.round(blurScore * 10) / 10 },
      });

      URL.revokeObjectURL(img.src);
    };

    img.onerror = () =>
      resolve({
        valid: false,
        issue: 'load_error',
        tamil_message: 'படம் திறக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்',
        english_message: 'Could not load image. Please try again',
      });

    img.src = URL.createObjectURL(imageFile);
  });
};
