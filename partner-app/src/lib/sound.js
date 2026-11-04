// Sound utility for Partner App order notifications
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Unlock audio context on any user gesture (tap/click anywhere in app)
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

// User preference for sound in localStorage
const SOUND_STORAGE_KEY = 'amaze_partner_sound_enabled';

export function isSoundEnabled() {
  try {
    const val = localStorage.getItem(SOUND_STORAGE_KEY);
    return val === null ? true : val === 'true'; // Default to enabled
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled) {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {}
}

/**
 * Synthesizes a crisp, clear 3-tone operational order alert chime.
 * Tone sequence: 587Hz (D5) -> 880Hz (A5) -> 1175Hz (D6) repeated twice.
 */
function playSynthesizedChime() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const tones = [
    { freq: 587.33, start: 0, duration: 0.14 },
    { freq: 880.00, start: 0.15, duration: 0.14 },
    { freq: 1174.66, start: 0.30, duration: 0.35 },
    // Repeat after brief pause
    { freq: 587.33, start: 0.72, duration: 0.14 },
    { freq: 880.00, start: 0.87, duration: 0.14 },
    { freq: 1174.66, start: 1.02, duration: 0.50 },
  ];

  tones.forEach(({ freq, start, duration }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle'; // Smooth, warm chime tone
    osc.frequency.setValueAtTime(freq, now + start);

    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(0.4, now + start + 0.02); // attack
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration); // decay

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + start);
    osc.stop(now + start + duration);
  });
}

/**
 * Plays the incoming order alert sound.
 * Tries HTML5 Audio with WAV file first; falls back seamlessly to Web Audio synthesis.
 */
export function playOrderNotificationSound() {
  if (!isSoundEnabled()) return;

  try {
    const audio = new Audio('/sounds/order-chime.wav');
    audio.volume = 0.9;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('[Sound] HTML5 audio play prevented, falling back to Web Audio synthesis:', err);
        playSynthesizedChime();
      });
    }
  } catch (err) {
    playSynthesizedChime();
  }
}
