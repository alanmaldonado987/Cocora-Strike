// client/js/audio.js
// Sintetizador Web Audio API ligero (cero archivos externos):
// - 5 perfiles acústicos de armas (Pistola, Escopeta + pump, SMG, Fusil AR, Francotirador + eco)
// - Sonido canalizado de vendaje/botiquín (2.0s cancelable) e impacto contundente por caída de altura

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.bandageTimers = [];
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.75;
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.masterGain);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.18;
    this.musicGain.connect(this.masterGain);

    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 1.6);
    this.noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.startAmbientMusic();
  }

  toggleMute() {
    this.init();
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.75, this.ctx.currentTime, 0.03);
    }
    return this.muted;
  }

  startAmbientMusic() {
    if (this.musicTimer || !this.ctx) return;

    const melodyPattern = [
      220.0, 329.63, 261.63, 392.0, 440.0, 329.63, 293.66, 392.0,
      261.63, 329.63, 392.0, 523.25, 440.0, 392.0, 329.63, 293.66
    ];
    const bassPattern = [110.0, 110.0, 130.81, 130.81, 146.83, 146.83, 164.81, 130.81];

    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || this.muted) return;
      const now = this.ctx.currentTime;
      const step = this.musicStep++;

      const freq = melodyPattern[step % melodyPattern.length];
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 0.25);

      if (step % 2 === 0) {
        const bFreq = bassPattern[(step >> 1) % bassPattern.length];
        const bOsc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();
        bOsc.type = 'sine';
        bOsc.frequency.setValueAtTime(bFreq, now);
        bGain.gain.setValueAtTime(0.001, now);
        bGain.gain.linearRampToValueAtTime(0.17, now + 0.02);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
        bOsc.connect(bGain);
        bGain.connect(this.musicGain);
        bOsc.start(now);
        bOsc.stop(now + 0.38);
      }

      if (step % 2 === 1 && this.noiseBuffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 5200;
        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.035, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        src.connect(filter);
        filter.connect(nGain);
        nGain.connect(this.musicGain);
        src.start(now);
        src.stop(now + 0.06);
      }
    }, 260);
  }

  playShot(weaponId = 'pistol', distance = 0) {
    if (!this.ctx || this.muted) return;
    const maxHear = weaponId === 'sniper' ? 380 : 220;
    const atten = Math.max(0.04, 1 - distance / maxHear);
    const now = this.ctx.currentTime;

    if (weaponId === 'fists') {
      this.playFilteredNoise(0.11, 1450, 620, 0.28 * atten);
      return;
    }

    if (weaponId === 'shotgun') {
      this._playPunchOsc('sawtooth', 125, 28, 0.22, 0.58 * atten);
      this.playFilteredNoise(0.24, 980, 220, 0.68 * atten);
      if (distance < 35) {
        setTimeout(() => {
          if (!this.muted) this.playFilteredNoise(0.06, 2600, 1400, 0.16 * atten);
        }, 230);
      }
      return;
    }

    if (weaponId === 'smg') {
      this._playPunchOsc('triangle', 275, 68, 0.065, 0.34 * atten);
      this.playFilteredNoise(0.07, 2600, 780, 0.38 * atten);
      return;
    }

    if (weaponId === 'sniper') {
      this._playPunchOsc('sawtooth', 155, 24, 0.34, 0.65 * atten);
      this.playFilteredNoise(0.38, 2800, 190, 0.72 * atten);
      const echoOsc = this.ctx.createOscillator();
      const echoGain = this.ctx.createGain();
      echoOsc.type = 'sine';
      echoOsc.frequency.setValueAtTime(95, now + 0.16);
      echoOsc.frequency.exponentialRampToValueAtTime(34, now + 0.55);
      echoGain.gain.setValueAtTime(0.22 * atten, now + 0.16);
      echoGain.gain.exponentialRampToValueAtTime(0.001, now + 0.56);
      echoOsc.connect(echoGain);
      echoGain.connect(this.sfxGain);
      echoOsc.start(now + 0.16);
      echoOsc.stop(now + 0.58);
      return;
    }

    if (weaponId === 'rifle') {
      this._playPunchOsc('sawtooth', 175, 42, 0.12, 0.46 * atten);
      this.playFilteredNoise(0.13, 1650, 440, 0.52 * atten);
      return;
    }

    this._playPunchOsc('triangle', 225, 52, 0.085, 0.40 * atten);
    this.playFilteredNoise(0.09, 2300, 560, 0.44 * atten);
  }

  _playPunchOsc(type, startFreq, endFreq, duration, volume) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.01);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playFilteredNoise(duration, startFreq, endFreq, volume) {
    if (!this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(70, endFreq), now + duration);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  // Sonido rítmico de vendaje / aplicación de botiquín durante los 2.0 segundos
  playBandagingStart() {
    this.stopBandaging();
    if (!this.ctx || this.muted) return;

    const rustleSteps = [0, 440, 900, 1380];
    for (const delayMs of rustleSteps) {
      const tid = setTimeout(() => {
        if (!this.ctx || this.muted) return;
        this.playFilteredNoise(0.24, 2100, 950, 0.20);
        this._playPunchOsc('sine', 380, 510, 0.09, 0.08);
      }, delayMs);
      this.bandageTimers.push(tid);
    }
  }

  stopBandaging() {
    while (this.bandageTimers.length > 0) {
      clearTimeout(this.bandageTimers.pop());
    }
  }

  // Sonido contundente de impacto contra el suelo por caída de altura (>4.5m)
  playFallImpact(damage = 25) {
    if (!this.ctx || this.muted) return;
    const scale = Math.min(1.3, 0.65 + damage / 90);
    this._playPunchOsc('sine', 98, 22, 0.28, 0.58 * scale);
    this._playPunchOsc('triangle', 160, 36, 0.20, 0.38 * scale);
    this.playFilteredNoise(0.22, 720, 160, 0.52 * scale);
  }

  playFootstep(inWater = false) {
    if (!this.ctx || this.muted) return;
    if (inWater) {
      this.playFilteredNoise(0.09, 1850, 880, 0.17);
    } else {
      this.playFilteredNoise(0.055, 340, 140, 0.13);
    }
  }

  playVault() {
    if (!this.ctx || this.muted) return;
    this.playFilteredNoise(0.16, 950, 420, 0.24);
    this._playPunchOsc('triangle', 165, 72, 0.11, 0.22);
  }

  playDoorToggle(isOpen = true, distance = 0) {
    if (!this.ctx || this.muted) return;
    const atten = Math.max(0.05, 1 - distance / 55);
    this._playPunchOsc('triangle', isOpen ? 190 : 250, isOpen ? 290 : 120, 0.14, 0.24 * atten);
    this.playFilteredNoise(0.10, 820, 340, 0.18 * atten);
  }

  playDoorBreak(distance = 0) {
    if (!this.ctx || this.muted) return;
    const atten = Math.max(0.05, 1 - distance / 95);
    this._playPunchOsc('sawtooth', 145, 36, 0.26, 0.48 * atten);
    this.playFilteredNoise(0.28, 1250, 220, 0.52 * atten);
  }

  playGlassBreak(distance = 0) {
    if (!this.ctx || this.muted) return;
    const atten = Math.max(0.05, 1 - distance / 85);
    const now = this.ctx.currentTime;
    this.playFilteredNoise(0.22, 5400, 1900, 0.36 * atten);
    [2450, 3180, 3890].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.028);
      g.gain.setValueAtTime(0.16 * atten, now + idx * 0.028);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.028 + 0.11);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now + idx * 0.028);
      osc.stop(now + idx * 0.028 + 0.12);
    });
  }

  playSlide(distance = 0) {
    if (!this.ctx || this.muted) return;
    const atten = Math.max(0.08, 1 - distance / 90);
    this.playFilteredNoise(0.62, 1350, 320, 0.36 * atten);
    this._playPunchOsc('triangle', 140, 52, 0.35, 0.18 * atten);
  }

  playAnimalAlert(species = 'bear', distance = 0) {
    if (!this.ctx || this.muted) return;
    const atten = Math.max(0.08, 1 - distance / 140);
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    if (species === 'bear') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(135, now);
      osc.frequency.linearRampToValueAtTime(92, now + 0.22);
      osc.frequency.exponentialRampToValueAtTime(58, now + 0.55);
      this.playFilteredNoise(0.48, 420, 180, 0.32 * atten);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.linearRampToValueAtTime(165, now + 0.16);
      osc.frequency.exponentialRampToValueAtTime(85, now + 0.42);
      this.playFilteredNoise(0.36, 950, 320, 0.34 * atten);
    }

    g.gain.setValueAtTime(0.32 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.56);
  }

  playParachuteOpen() {
    if (!this.ctx || this.muted) return;
    this.playFilteredNoise(0.45, 350, 1650, 0.42);
  }

  playHitmarker(isHeadshot = false) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isHeadshot ? 2150 : 1480, now);
    if (isHeadshot) osc.frequency.setValueAtTime(2650, now + 0.045);
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playDamage() {
    if (!this.ctx || this.muted) return;
    this._playPunchOsc('sine', 125, 38, 0.18, 0.45);
  }

  playPickup() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.055);
      g.gain.setValueAtTime(0.24, now + idx * 0.055);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.12);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.13);
    });
  }

  playReload() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    [0, 0.14].forEach((offset, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(i === 0 ? 440 : 620, now + offset);
      g.gain.setValueAtTime(0.14, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.045);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.05);
    });
  }

  playVictory() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + i * 0.09);
      g.gain.setValueAtTime(0.28, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.45);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.46);
    });
  }
}
