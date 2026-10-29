// A real ringtone synthesised with the Web Audio API (no asset files):
//   - incoming: the classic dual-tone (440 Hz + 480 Hz) ring cadence,
//     1s ring / 2s pause, looping.
//   - outgoing: a quieter ringback (low single tone), 1s on / 3s off.
// Both loop until stopped, and survive the browser autoplay policy because the
// AudioContext is resumed on use (the user has interacted with the page).

let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let activeNodes: AudioNode[] = [];

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

// Plays one ring burst made of the given frequencies for `duration` seconds.
function burst(freqs: number[], duration: number, volume: number) {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  for (const freq of freqs) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.05);
    gain.gain.setValueAtTime(volume, now + duration - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + duration + 0.05);
    activeNodes.push(osc, gain);
  }
}

export function startRingtone(kind: 'incoming' | 'outgoing') {
  stopRingtone();
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});

  const ring = () => {
    if (kind === 'incoming') burst([440, 480], 1.0, 0.16);
    else burst([400], 1.0, 0.08);
  };
  ring();
  // Incoming rings every 3s; outgoing ringback every 4s.
  timer = setInterval(ring, kind === 'incoming' ? 3000 : 4000);
}

export function stopRingtone() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  for (const node of activeNodes) {
    try {
      (node as OscillatorNode).stop?.();
    } catch {
      /* already stopped */
    }
    try {
      node.disconnect();
    } catch {
      /* already disconnected */
    }
  }
  activeNodes = [];
}
