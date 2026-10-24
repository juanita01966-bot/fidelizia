// Web Audio API Procedural Pure Synthesis (Zero external MP3 dependencies)
// Conforme a los estándares estéticos canónicos de Juan Pablo Orozco

class SoundEngine {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Sonido de Escaneo Exitoso: Arpegio pentatónico cristalino
  playScanSuccess() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(528, now); // Frecuencia Solfeggio 528 Hz
    osc1.frequency.exponentialRampToValueAtTime(1056, now + 0.15);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(792, now + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(1584, now + 0.22);

    gainNode.gain.setValueAtTime(0.2, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.05);
    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);

    this.triggerHaptic([40]);
  }

  // Sonido al ganar un sello
  playStampEarned() {
    this.playScanSuccess();
  }

  // Sonido de Alerta Antifraude: Tritono disonante de advertencia
  playFraudAlert() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(220, now);
    osc1.frequency.setValueAtTime(200, now + 0.1);

    osc2.type = 'square';
    osc2.frequency.setValueAtTime(311.13, now); // Tritono (diabolus in musica)
    osc2.frequency.setValueAtTime(282.8, now + 0.1);

    gainNode.gain.setValueAtTime(0.25, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);

    this.triggerHaptic([100, 50, 100, 50, 200]);
  }

  // Fanfarria de Canje de Premio: Escala ascendente triunfal
  playRedeemCelebration() {
    const ctx = this.getContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, index) => {
      const now = ctx.currentTime + index * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    });

    this.triggerHaptic([50, 30, 80, 40, 150]);
  }

  // Micro-click táctil para interacción en botones y calendarios
  playKeyboardClick() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.035);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.035);
    this.triggerHaptic([15]);
  }

  playClick() {
    this.playKeyboardClick();
  }

  private triggerHaptic(pattern: number[]) {
    if (typeof window !== 'undefined' && 'navigator' in window && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignorar si no está soportado o bloqueado por el navegador
      }
    }
  }
}

export const soundEngine = new SoundEngine();
