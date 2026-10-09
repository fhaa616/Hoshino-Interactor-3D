// Fungsi murni (tanpa DOM / three.js) agar mudah diuji.

/** Hapus sampel lama dari array [{t,...}] */
export function pruneSamples(arr, now, keep = 2) {
  while (arr.length && now - arr[0].t > keep) arr.shift();
}

/**
 * Deteksi melambai: gerakan x bolak-balik. Zigzag dengan hysteresis `swing`
 * supaya getaran kecil diabaikan.
 */
export function detectWave(samples, now, { window = 1.0, swing = 0.06, minReversals = 3 } = {}) {
  const recent = samples.filter((s) => now - s.t <= window);
  if (recent.length < 6) return false;
  let reversals = 0, dir = 0, ext = recent[0].x;
  for (let i = 1; i < recent.length; i++) {
    const x = recent[i].x;
    if (dir === 0) {
      if (x - ext > swing) { dir = 1; ext = x; }
      else if (ext - x > swing) { dir = -1; ext = x; }
    } else if (dir === 1) {
      if (x > ext) ext = x;
      else if (ext - x > swing) { dir = -1; ext = x; reversals++; }
    } else {
      if (x < ext) ext = x;
      else if (x - ext > swing) { dir = 1; ext = x; reversals++; }
    }
  }
  return reversals >= minReversals;
}

/** Panjang lintasan tangan dalam `window` detik terakhir (satuan 0..1). */
export function pathLength(samples, now, window = 0.8) {
  const r = samples.filter((s) => now - s.t <= window);
  let sum = 0;
  for (let i = 1; i < r.length; i++) sum += Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y);
  return sum;
}

const EMOTIONS = ["neutral", "happy", "shy", "surprised", "sleepy"];

/** Pisahkan tag emosi di awal jawaban AI, contoh: "[happy] Halo Sensei!" */
export function parseEmotion(raw) {
  let text = String(raw ?? "").trim();
  let emotion = "neutral";
  const m = text.match(/^\s*\[\s*(?:emotion\s*:\s*)?([a-zA-Z]+)\s*\]\s*/);
  if (m) {
    const e = m[1].toLowerCase();
    if (EMOTIONS.includes(e)) emotion = e;
    text = text.slice(m[0].length).trim();
  }
  if (!text) text = "...";
  return { text, emotion };
}