// Egyptian-themed Audio Manager using Web Audio API
// All sounds are synthesized for instant, premium playback

class AudioManagerClass {
  private audioContext: AudioContext | null = null;
  private isMuted: boolean = false;
  private ambientNode: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  private masterGain: GainNode | null = null;

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
    }
    // Resume context if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  private getMasterGain(): GainNode {
    this.getContext();
    return this.masterGain!;
  }

  get muted(): boolean {
    return this.isMuted;
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 1, this.audioContext?.currentTime || 0);
    }
    if (muted && this.ambientNode) {
      this.stopAmbient();
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  // Soft gold chime for UI clicks
  playClick(): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.getMasterGain());

    osc.start(now);
    osc.stop(now + 0.12);
  }

  // Subtle stone/piece movement sound
  playPieceMove(): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Low thud + slide
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(180, now);
    osc1.frequency.exponentialRampToValueAtTime(80, now + 0.15);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(120, now);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.getMasterGain());

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.18);
    osc2.stop(now + 0.18);
  }

  // Domino tap sound - slightly sharper click
  playDominoTap(): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.Q.setValueAtTime(2, now);

    osc.type = 'square';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.05);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.getMasterGain());

    osc.start(now);
    osc.stop(now + 0.08);
  }

  // Realistic dice shake and roll
  playDiceRoll(): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Multiple rapid taps to simulate dice bouncing
    const bounces = [0, 0.05, 0.12, 0.2, 0.3, 0.42, 0.55];
    const volumes = [0.15, 0.12, 0.1, 0.08, 0.06, 0.04, 0.03];

    bounces.forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = 'highpass';
      filter.frequency.setValueAtTime(200 + Math.random() * 300, now + delay);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150 + Math.random() * 100, now + delay);
      osc.frequency.exponentialRampToValueAtTime(80, now + delay + 0.04);

      gain.gain.setValueAtTime(volumes[i], now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.06);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.getMasterGain());

      osc.start(now + delay);
      osc.stop(now + delay + 0.06);
    });

    // Final settle sound
    setTimeout(() => {
      if (this.isMuted) return;
      const settleOsc = ctx.createOscillator();
      const settleGain = ctx.createGain();

      settleOsc.type = 'sine';
      settleOsc.frequency.setValueAtTime(100, ctx.currentTime);

      settleGain.gain.setValueAtTime(0.05, ctx.currentTime);
      settleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

      settleOsc.connect(settleGain);
      settleGain.connect(this.getMasterGain());

      settleOsc.start(ctx.currentTime);
      settleOsc.stop(ctx.currentTime + 0.1);
    }, 600);
  }

  // Win chime - melodic Egyptian-inspired sequence
  playWinChime(): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Egyptian-inspired pentatonic notes (D minor pentatonic)
    const notes = [293.66, 349.23, 392.00, 440.00, 523.25, 587.33];
    const delays = [0, 0.1, 0.2, 0.3, 0.5, 0.7];
    const durations = [0.3, 0.25, 0.25, 0.3, 0.4, 0.6];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delays[i]);

      // Add slight vibrato for mystical feel
      const vibrato = ctx.createOscillator();
      const vibratoGain = ctx.createGain();
      vibrato.frequency.setValueAtTime(5, now);
      vibratoGain.gain.setValueAtTime(3, now);
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);
      vibrato.start(now + delays[i]);
      vibrato.stop(now + delays[i] + durations[i]);

      gain.gain.setValueAtTime(0, now + delays[i]);
      gain.gain.linearRampToValueAtTime(0.12, now + delays[i] + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delays[i] + durations[i]);

      osc.connect(gain);
      gain.connect(this.getMasterGain());

      osc.start(now + delays[i]);
      osc.stop(now + delays[i] + durations[i]);
    });
  }

  // Desert wind ambient loop
  playAmbient(): void {
    if (this.isMuted || this.ambientNode) return;
    const ctx = this.getContext();

    // Create brown noise for wind effect
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5; // Amplify
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    // Low frequency oscillator for mystical hum
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.2, ctx.currentTime);

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(50, ctx.currentTime);

    // Filter for wind sound
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    // Mystical drone
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.setValueAtTime(55, ctx.currentTime); // Low A

    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0.03, ctx.currentTime);

    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.setValueAtTime(0.04, ctx.currentTime);

    noise.connect(filter);
    filter.connect(this.ambientGain);
    drone.connect(droneGain);
    droneGain.connect(this.ambientGain);
    this.ambientGain.connect(this.getMasterGain());

    noise.start();
    drone.start();
    lfo.start();

    // Store reference for stopping
    this.ambientNode = drone;
    (this.ambientNode as any)._noise = noise;
    (this.ambientNode as any)._lfo = lfo;
  }

  stopAmbient(): void {
    if (this.ambientNode) {
      try {
        this.ambientNode.stop();
        (this.ambientNode as any)._noise?.stop();
        (this.ambientNode as any)._lfo?.stop();
      } catch (e) {
        // Already stopped
      }
      this.ambientNode = null;
      this.ambientGain = null;
    }
  }

  isAmbientPlaying(): boolean {
    return this.ambientNode !== null;
  }
}

// Singleton instance
export const AudioManager = new AudioManagerClass();
