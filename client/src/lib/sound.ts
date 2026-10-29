// Tiny notification sound generated with the Web Audio API — no asset files.
// A soft two-note "pop" played when a new direct message arrives.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

// Resumes the (initially suspended) AudioContext on the first user gesture so
// later programmatic sounds are allowed by the browser's autoplay policy.
export function primeAudioOnInteraction() {
  if (typeof window === 'undefined') return;
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

export function soundsMuted(): boolean {
  return localStorage.getItem('soundsMuted') === '1';
}

export function setSoundsMuted(muted: boolean) {
  localStorage.setItem('soundsMuted', muted ? '1' : '0');
}

export function playMessageSound() {
  if (soundsMuted()) return;
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    const now = c.currentTime;
    // Two ascending sine notes for a pleasant chime.
    [
      { freq: 660, at: 0 },
      { freq: 880, at: 0.09 },
    ].forEach(({ freq, at }) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.14, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.2);
      osc.connect(gain).connect(c.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.22);
    });
  } catch {
    // Audio not available — ignore.
  }
}
