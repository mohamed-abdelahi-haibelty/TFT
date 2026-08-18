/**
 * Tiny Web Audio beeps for scan feedback (task 14: "audible/visual success
 * feedback") — synthesized, not an asset file, so there's nothing to load or
 * fail to load. Every call is wrapped defensively: a tablet with audio
 * blocked or an unsupported browser should never break scanning.
 */

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  return sharedContext;
}

function beep(frequency: number, durationMs: number, startDelayMs = 0): void {
  try {
    const ctx = getContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.08;

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    const start = ctx.currentTime + startDelayMs / 1000;
    const end = start + durationMs / 1000;
    gain.gain.setValueAtTime(0.08, start);
    gain.gain.exponentialRampToValueAtTime(0.001, end);

    oscillator.start(start);
    oscillator.stop(end);
  } catch {
    // Audio is a nicety here, never a requirement — swallow and move on.
  }
}

export function playScanSuccess(): void {
  beep(880, 90);
}

export function playScanError(): void {
  beep(220, 130);
  beep(220, 130, 160);
}
