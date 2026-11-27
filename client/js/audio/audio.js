// client/js/audio/audio.js
// Sintetizador Web Audio API en tiempo real (cero archivos externos):
// - Planificador lookahead sobre reloj de hardware (AudioContext.currentTime) sin jitter de setInterval
// - Gestor de polifonía con límite estricto de 24 voces (robo de la voz más lejana/antigua)
// - Offset aleatorio en noiseBuffer y micro-variación de pitch para eliminar efecto metralleta robótico
// - Espacialización direccional (StereoPannerNode / PannerNode) relativa a la cámara del jugador

const DEFAULT_AUDIO_CFG = {
  maxVoices: 24,
  musicStepDurationSec: 0.26,
  lookaheadIntervalMs: 40,
  scheduleAheadTimeSec: 0.12,
  noiseBufferDurationSec: 1.6,
  spatialNearRefDist: 1.8,
  maxPanAbs: 0.94
};

const MELODY_PATTERN = [
  220.0, 329.63, 261.63, 392.0, 440.0, 329.63, 293.66, 392.0,
  261.63, 329.63, 392.0, 523.25, 440.0, 392.0, 329.63, 293.66
];
const BASS_PATTERN = [110.0, 110.0, 130.81, 130.81, 146.83, 146.83, 164.81, 130.81];
const BANDAGE_RUSTLE_OFFSETS_SEC = [0, 0.44, 0.90, 1.38];
const GLASS_CHIME_FREQS = [2450, 3180, 3890];
const PICKUP_NOTES = [523.25, 659.25, 783.99];
const RELOAD_OFFSETS = [0, 0.14];
const VICTORY_NOTES = [523.25, 659.25, 783.99, 1046.5];

/**
 * Calcula el valor de paneo estéreo [-maxPanAbs, +maxPanAbs] respecto a la posición y orientación (yaw)
 * de la cámara del oyente en coordenadas del mundo (+Z adelante con yaw=0, -X derecha, +X izquierda).
 */
export function computeStereoPan(
  listenerX,
  listenerZ,
  listenerYaw,
  sourceX,
  sourceZ,
  nearRefDist = DEFAULT_AUDIO_CFG.spatialNearRefDist,
  maxPanAbs = DEFAULT_AUDIO_CFG.maxPanAbs
) {
  const dx = sourceX - listenerX;
  const dz = sourceZ - listenerZ;
  const dist = Math.hypot(dx, dz);
  if (!Number.isFinite(dist) || dist < 0.2) return 0;

  // Vector derecha de la cámara: forward = (sin(yaw), 0, cos(yaw)) => right = forward x up = (-cos(yaw), 0, sin(yaw))
  const rightX = -Math.cos(listenerYaw);
  const rightZ = Math.sin(listenerYaw);
  const rawPan = (dx * rightX + dz * rightZ) / dist;
  const nearScale = Math.min(1, dist / Math.max(0.1, nearRefDist));
  const pan = rawPan * nearScale;
  return Math.max(-maxPanAbs, Math.min(maxPanAbs, pan));
}

export class SoundEngine {
  constructor(config = DEFAULT_AUDIO_CFG) {
    this.cfg = { ...DEFAULT_AUDIO_CFG, ...config };
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;
    this.muted = false;

    // Estado del planificador lookahead de música ambiental
    this.musicTimer = null;
    this.musicStep = 0;
    this.nextMusicNoteTime = 0;

    // Registro de polifonía activa (tope estricto de 24 voces)
    this.activeVoices = [];
    this.activeBandageVoices = [];

    // Estado espacial del oyente (cámara local)
    this.listenerX = 0;
    this.listenerY = 0;
    this.listenerZ = 0;
    this.listenerYaw = 0;
  }

  init(customCtx = null) {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        this.ctx.resume();
      }
      return;
    }

    if (customCtx) {
      this.ctx = customCtx;
    } else {
      const g = typeof window !== 'undefined' ? window : globalThis;
      const AudioCtx = g.AudioContext || g.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.75;
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.masterGain);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.18;
    this.musicGain.connect(this.masterGain);

    const sampleRate = this.ctx.sampleRate || 44100;
    const length = Math.floor(sampleRate * this.cfg.noiseBufferDurationSec);
    this.noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.startAmbientMusic();
  }

  dispose() {
    this.stopAmbientMusic();
    this.stopBandaging();
    this.activeVoices.length = 0;
  }

  updateListener(x, y, z, yaw) {
    if (Number.isFinite(x)) this.listenerX = x;
    if (Number.isFinite(y)) this.listenerY = y;
    if (Number.isFinite(z)) this.listenerZ = z;
    if (Number.isFinite(yaw)) this.listenerYaw = yaw;
  }

  toggleMute() {
    this.init();
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.75, this.ctx.currentTime, 0.03);
    }
    return this.muted;
  }

  // ==================== PLANIFICADOR LOOKAHEAD DE MÚSICA AMBIENTAL ====================

  startAmbientMusic() {
    if (this.musicTimer || !this.ctx) return;
    this.nextMusicNoteTime = this.ctx.currentTime + 0.03;
    this.musicTimer = setInterval(() => {
      this.pumpMusicScheduler();
    }, this.cfg.lookaheadIntervalMs);
  }

  stopAmbientMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /**
   * Programa anticipadamente todas las notas que caen dentro de la ventana lookahead
   * usando exclusivamente el reloj de hardware AudioContext.currentTime.
   */
  pumpMusicScheduler() {
    if (!this.ctx) return 0;
    if (this.ctx.state !== 'running' || this.muted) {
      this.nextMusicNoteTime = this.ctx.currentTime + 0.03;
      return 0;
    }

    const now = this.ctx.currentTime;
    if (this.nextMusicNoteTime < now - 0.25) {
      this.nextMusicNoteTime = now + 0.01;
    }

    let scheduledSteps = 0;
    const horizon = now + this.cfg.scheduleAheadTimeSec;
    while (this.nextMusicNoteTime < horizon) {
      this._scheduleMusicStep(this.musicStep++, this.nextMusicNoteTime);
      this.nextMusicNoteTime += this.cfg.musicStepDurationSec;
      scheduledSteps++;
    }
    return scheduledSteps;
  }

  _scheduleMusicStep(step, when) {
    const freq = MELODY_PATTERN[step % MELODY_PATTERN.length];
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, when);

    gain.gain.setValueAtTime(0.001, when);
    gain.gain.linearRampToValueAtTime(0.14, when + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.24);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(when);
    osc.stop(when + 0.25);

    if (step % 2 === 0) {
      const bFreq = BASS_PATTERN[(step >> 1) % BASS_PATTERN.length];
      const bOsc = this.ctx.createOscillator();
      const bGain = this.ctx.createGain();
      bOsc.type = 'sine';
      bOsc.frequency.setValueAtTime(bFreq, when);
      bGain.gain.setValueAtTime(0.001, when);
      bGain.gain.linearRampToValueAtTime(0.17, when + 0.02);
      bGain.gain.exponentialRampToValueAtTime(0.001, when + 0.36);
      bOsc.connect(bGain);
      bGain.connect(this.musicGain);
      bOsc.start(when);
      bOsc.stop(when + 0.38);
    } else if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 5200;
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.035, when);
      nGain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
      src.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.musicGain);
      const offset = this._pickRandomNoiseOffset(0.06);
      src.start(when, offset, 0.06);
    }
  }

  // ==================== GESTOR DE VOCES (TOPE 24) Y ESPACIALIZACIÓN ====================

  _pruneFinishedVoices(now) {
    const list = this.activeVoices;
    let write = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (!v.ended && v.endTime > now) {
        list[write++] = v;
      }
    }
    list.length = write;
  }

  _acquireVoiceSlot(source, gainNode, startTime, endTime, distance = 0) {
    if (!this.ctx) return null;
    const now = this.ctx.currentTime;
    this._pruneFinishedVoices(now);

    const maxVoices = this.cfg.maxVoices;
    if (this.activeVoices.length >= maxVoices) {
      // Robar la voz más lejana; a igual distancia, robar la más antigua (menor startTime)
      let victimIdx = 0;
      let bestDist = -1;
      let oldestStart = Infinity;
      for (let i = 0; i < this.activeVoices.length; i++) {
        const v = this.activeVoices[i];
        if (v.distance > bestDist + 0.5 || (Math.abs(v.distance - bestDist) <= 0.5 && v.startTime < oldestStart)) {
          bestDist = v.distance;
          oldestStart = v.startTime;
          victimIdx = i;
        }
      }
      const victim = this.activeVoices[victimIdx];
      this._silenceVoice(victim, now);
      const last = this.activeVoices.pop();
      if (victimIdx < this.activeVoices.length) {
        this.activeVoices[victimIdx] = last;
      }
    }

    const entry = {
      source,
      gainNode,
      startTime,
      endTime,
      distance,
      ended: false
    };
    if (source && 'onended' in source) {
      source.onended = () => {
        entry.ended = true;
      };
    }
    this.activeVoices.push(entry);
    return entry;
  }

  _silenceVoice(voice, now) {
    if (!voice || voice.ended) return;
    voice.ended = true;
    try {
      if (voice.gainNode?.gain) {
        voice.gainNode.gain.cancelScheduledValues?.(now);
        voice.gainNode.gain.setValueAtTime(0.0001, now);
      }
      voice.source?.stop(now);
    } catch {
      // Ignorar si el nodo ya había finalizado en el hilo de audio
    }
  }

  _pickRandomNoiseOffset(clipDurationSec) {
    if (!this.noiseBuffer) return 0;
    const maxOffset = Math.max(0, this.noiseBuffer.duration - clipDurationSec - 0.025);
    return maxOffset > 0 ? Math.random() * maxOffset : 0;
  }

  /**
   * Conecta un nodo de ganancia de efecto hacia sfxGain pasando por un StereoPannerNode
   * (o PannerNode de respaldo) cuando existe posición mundial de la fuente sonora.
   */
  _connectSpatialTarget(node, sourcePos = null) {
    if (!this.ctx || !sourcePos || !Number.isFinite(sourcePos.x) || !Number.isFinite(sourcePos.z)) {
      node.connect(this.sfxGain);
      return 0;
    }

    const pan = computeStereoPan(
      this.listenerX,
      this.listenerZ,
      this.listenerYaw,
      sourcePos.x,
      sourcePos.z,
      this.cfg.spatialNearRefDist,
      this.cfg.maxPanAbs
    );

    if (Math.abs(pan) < 0.01) {
      node.connect(this.sfxGain);
      return 0;
    }

    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, this.ctx.currentTime);
      node.connect(panner);
      panner.connect(this.sfxGain);
      return pan;
    }

    if (typeof this.ctx.createPanner === 'function') {
      const panner = this.ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.setPosition(pan, 0, 1 - Math.abs(pan));
      node.connect(panner);
      panner.connect(this.sfxGain);
      return pan;
    }

    node.connect(this.sfxGain);
    return 0;
  }

  // ==================== EFECTOS DE COMBATE Y AMBIENTE ====================

  playShot(weaponId = 'pistol', distance = 0, sourcePos = null) {
    if (!this.ctx || this.muted) return;
    const maxHear = weaponId === 'sniper' ? 380 : 220;
    if (distance > maxHear) return;
    const atten = Math.max(0.04, 1 - distance / maxHear);
    const now = this.ctx.currentTime;
    // Ligera variación orgánica de tono (+/-4%) para evitar timbre idéntico en ráfagas automáticas
    const pitchJitter = 0.96 + Math.random() * 0.08;
    const spatialPos = distance > 0.25 ? sourcePos : null;

    if (weaponId === 'fists') {
      this.playFilteredNoise(0.11, 1450 * pitchJitter, 620, 0.28 * atten, {
        when: now,
        distance,
        sourcePos: spatialPos,
        playbackRate: pitchJitter
      });
      return;
    }

    if (weaponId === 'shotgun') {
      this._playPunchOsc('sawtooth', 125 * pitchJitter, 28, 0.22, 0.58 * atten, {
        when: now,
        distance,
        sourcePos: spatialPos
      });
      this.playFilteredNoise(0.24, 980 * pitchJitter, 220, 0.68 * atten, {
        when: now,
        distance,
        sourcePos: spatialPos,
        playbackRate: pitchJitter
      });
      if (distance < 35) {
        // Pump de corredera programado directamente en el reloj de hardware (sin setTimeout)
        this.playFilteredNoise(0.06, 2600, 1400, 0.16 * atten, {
          when: now + 0.23,
          distance,
          sourcePos: spatialPos,
          playbackRate: 0.97 + Math.random() * 0.06
        });
      }
      return;
    }

    if (weaponId === 'smg') {
      this._playPunchOsc('triangle', 275 * pitchJitter, 68, 0.065, 0.34 * atten, {
        when: now,
        distance,
        sourcePos: spatialPos
      });
      this.playFilteredNoise(0.07, 2600 * pitchJitter, 780, 0.38 * atten, {
        when: now,
        distance,
        sourcePos: spatialPos,
        playbackRate: pitchJitter
      });
      return;
    }

    if (weaponId === 'sniper') {
      this._playPunchOsc('sawtooth', 155 * pitchJitter, 24, 0.34, 0.65 * atten, {
        when: now,
        distance,
        sourcePos: spatialPos
      });
      this.playFilteredNoise(0.38, 2800 * pitchJitter, 190, 0.72 * atten, {
        when: now,
        distance,
        sourcePos: spatialPos,
        playbackRate: pitchJitter
      });
      const echoOsc = this.ctx.createOscillator();
      const echoGain = this.ctx.createGain();
      echoOsc.type = 'sine';
      echoOsc.frequency.setValueAtTime(95, now + 0.16);
      echoOsc.frequency.exponentialRampToValueAtTime(34, now + 0.55);
      echoGain.gain.setValueAtTime(0.22 * atten, now + 0.16);
      echoGain.gain.exponentialRampToValueAtTime(0.001, now + 0.56);
      echoOsc.connect(echoGain);
      this._connectSpatialTarget(echoGain, spatialPos);
      this._acquireVoiceSlot(echoOsc, echoGain, now + 0.16, now + 0.58, distance);
      echoOsc.start(now + 0.16);
      echoOsc.stop(now + 0.58);
      return;
    }

    if (weaponId === 'revolver') {
      this._playPunchOsc('sawtooth', 168 * pitchJitter, 34, 0.19, 0.54 * atten, {
        when: now,
        distance,
        sourcePos: spatialPos
      });
      this.playFilteredNoise(0.20, 1850 * pitchJitter, 310, 0.60 * atten, {
        when: now,
        distance,
        sourcePos: spatialPos,
        playbackRate: pitchJitter
      });
      return;
    }

    if (weaponId === 'assault_rifle') {
      this._playPunchOsc('sawtooth', 215 * pitchJitter, 52, 0.10, 0.43 * atten, {
        when: now,
        distance,
        sourcePos: spatialPos
      });
      this.playFilteredNoise(0.11, 2150 * pitchJitter, 520, 0.48 * atten, {
        when: now,
        distance,
        sourcePos: spatialPos,
        playbackRate: pitchJitter
      });
      return;
    }

    if (weaponId === 'rifle') {
      this._playPunchOsc('sawtooth', 175 * pitchJitter, 42, 0.12, 0.46 * atten, {
        when: now,
        distance,
        sourcePos: spatialPos
      });
      this.playFilteredNoise(0.13, 1650 * pitchJitter, 440, 0.52 * atten, {
        when: now,
        distance,
        sourcePos: spatialPos,
        playbackRate: pitchJitter
      });
      return;
    }

    this._playPunchOsc('triangle', 225 * pitchJitter, 52, 0.085, 0.40 * atten, {
      when: now,
      distance,
      sourcePos: spatialPos
    });
    this.playFilteredNoise(0.09, 2300 * pitchJitter, 560, 0.44 * atten, {
      when: now,
      distance,
      sourcePos: spatialPos,
      playbackRate: pitchJitter
    });
  }

  _playPunchOsc(type, startFreq, endFreq, duration, volume, opts = null) {
    if (!this.ctx) return null;
    const when = opts?.when ?? this.ctx.currentTime;
    const distance = opts?.distance ?? 0;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), when + duration);
    g.gain.setValueAtTime(Math.max(0.001, volume), when);
    g.gain.exponentialRampToValueAtTime(0.001, when + duration + 0.01);
    osc.connect(g);
    this._connectSpatialTarget(g, opts?.sourcePos || null);
    const voice = this._acquireVoiceSlot(osc, g, when, when + duration + 0.02, distance);
    osc.start(when);
    osc.stop(when + duration + 0.02);
    return voice;
  }

  playFilteredNoise(duration, startFreq, endFreq, volume, opts = null) {
    if (!this.ctx || !this.noiseBuffer) return null;
    const when = opts?.when ?? this.ctx.currentTime;
    const distance = opts?.distance ?? 0;
    const playbackRate = opts?.playbackRate ?? (0.95 + Math.random() * 0.10);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    if (src.playbackRate) {
      src.playbackRate.value = playbackRate;
    }

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(startFreq, when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(70, endFreq), when + duration);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.001, volume), when);
    g.gain.exponentialRampToValueAtTime(0.001, when + duration);

    src.connect(filter);
    filter.connect(g);
    this._connectSpatialTarget(g, opts?.sourcePos || null);

    const clipDur = duration + 0.02;
    const randomOffset = this._pickRandomNoiseOffset(clipDur * playbackRate);
    const voice = this._acquireVoiceSlot(src, g, when, when + clipDur, distance);
    src.start(when, randomOffset, clipDur);
    return voice;
  }

  // Sonido rítmico de vendaje / botiquín programado en AudioContext.currentTime (cancelable sin setTimeout)
  playBandagingStart() {
    this.stopBandaging();
    if (!this.ctx || this.muted) return;

    const now = this.ctx.currentTime;
    for (let i = 0; i < BANDAGE_RUSTLE_OFFSETS_SEC.length; i++) {
      const when = now + BANDAGE_RUSTLE_OFFSETS_SEC[i];
      const v1 = this.playFilteredNoise(0.24, 2100, 950, 0.20, { when, distance: 0 });
      const v2 = this._playPunchOsc('sine', 380, 510, 0.09, 0.08, { when, distance: 0 });
      if (v1) this.activeBandageVoices.push(v1);
      if (v2) this.activeBandageVoices.push(v2);
    }
  }

  stopBandaging() {
    const now = this.ctx ? this.ctx.currentTime : 0;
    while (this.activeBandageVoices.length > 0) {
      const v = this.activeBandageVoices.pop();
      this._silenceVoice(v, now);
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

  playSplash(strength = 1) {
    if (!this.ctx || this.muted) return;
    const s = Math.max(0.4, Math.min(1.4, strength));
    this.playFilteredNoise(0.42, 2400, 260, 0.34 * s);
    this._playPunchOsc('sine', 180, 60, 0.18, 0.16 * s);
  }

  playSwimStroke() {
    if (!this.ctx || this.muted) return;
    this.playFilteredNoise(0.26, 1500, 520, 0.14);
  }

  playDrowning() {
    if (!this.ctx || this.muted) return;
    this._playPunchOsc('sine', 420, 140, 0.16, 0.12);
    this.playFilteredNoise(0.2, 700, 220, 0.16);
  }

  playVault() {
    if (!this.ctx || this.muted) return;
    this.playFilteredNoise(0.16, 950, 420, 0.24);
    this._playPunchOsc('triangle', 165, 72, 0.11, 0.22);
  }

  playDoorToggle(isOpen = true, distance = 0, sourcePos = null) {
    if (!this.ctx || this.muted || distance > 55) return;
    const atten = Math.max(0.05, 1 - distance / 55);
    const opts = { distance, sourcePos };
    this._playPunchOsc('triangle', isOpen ? 190 : 250, isOpen ? 290 : 120, 0.14, 0.24 * atten, opts);
    this.playFilteredNoise(0.10, 820, 340, 0.18 * atten, opts);
  }

  playDoorBreak(distance = 0, sourcePos = null) {
    if (!this.ctx || this.muted || distance > 95) return;
    const atten = Math.max(0.05, 1 - distance / 95);
    const opts = { distance, sourcePos };
    this._playPunchOsc('sawtooth', 145, 36, 0.26, 0.48 * atten, opts);
    this.playFilteredNoise(0.28, 1250, 220, 0.52 * atten, opts);
  }

  playGlassBreak(distance = 0, sourcePos = null) {
    if (!this.ctx || this.muted || distance > 85) return;
    const atten = Math.max(0.05, 1 - distance / 85);
    const now = this.ctx.currentTime;
    this.playFilteredNoise(0.22, 5400, 1900, 0.36 * atten, { when: now, distance, sourcePos });
    for (let idx = 0; idx < GLASS_CHIME_FREQS.length; idx++) {
      const freq = GLASS_CHIME_FREQS[idx];
      const when = now + idx * 0.028;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, when);
      g.gain.setValueAtTime(0.16 * atten, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.11);
      osc.connect(g);
      this._connectSpatialTarget(g, sourcePos);
      this._acquireVoiceSlot(osc, g, when, when + 0.12, distance);
      osc.start(when);
      osc.stop(when + 0.12);
    }
  }

  playSlide(distance = 0, sourcePos = null) {
    if (!this.ctx || this.muted || distance > 90) return;
    const atten = Math.max(0.08, 1 - distance / 90);
    const opts = { distance, sourcePos };
    this.playFilteredNoise(0.62, 1350, 320, 0.36 * atten, opts);
    this._playPunchOsc('triangle', 140, 52, 0.35, 0.18 * atten, opts);
  }

  playAnimalAlert(species = 'bear', distance = 0, sourcePos = null) {
    if (!this.ctx || this.muted || distance > 140) return;
    const atten = Math.max(0.08, 1 - distance / 140);
    const now = this.ctx.currentTime;
    const opts = { when: now, distance, sourcePos };

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    if (species === 'bear') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(135, now);
      osc.frequency.linearRampToValueAtTime(92, now + 0.22);
      osc.frequency.exponentialRampToValueAtTime(58, now + 0.55);
      this.playFilteredNoise(0.48, 420, 180, 0.32 * atten, opts);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.linearRampToValueAtTime(165, now + 0.16);
      osc.frequency.exponentialRampToValueAtTime(85, now + 0.42);
      this.playFilteredNoise(0.36, 950, 320, 0.34 * atten, opts);
    }

    g.gain.setValueAtTime(0.32 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(g);
    this._connectSpatialTarget(g, sourcePos);
    this._acquireVoiceSlot(osc, g, now, now + 0.56, distance);
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
    this._acquireVoiceSlot(osc, g, now, now + 0.12, 0);
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
    for (let idx = 0; idx < PICKUP_NOTES.length; idx++) {
      const f = PICKUP_NOTES[idx];
      const when = now + idx * 0.055;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, when);
      g.gain.setValueAtTime(0.24, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
      osc.connect(g);
      g.connect(this.sfxGain);
      this._acquireVoiceSlot(osc, g, when, when + 0.13, 0);
      osc.start(when);
      osc.stop(when + 0.13);
    }
  }

  playReload() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < RELOAD_OFFSETS.length; i++) {
      const when = now + RELOAD_OFFSETS[i];
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(i === 0 ? 440 : 620, when);
      g.gain.setValueAtTime(0.14, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
      osc.connect(g);
      g.connect(this.sfxGain);
      this._acquireVoiceSlot(osc, g, when, when + 0.05, 0);
      osc.start(when);
      osc.stop(when + 0.05);
    }
  }

  playVictory() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < VICTORY_NOTES.length; i++) {
      const f = VICTORY_NOTES[i];
      const when = now + i * 0.09;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, when);
      g.gain.setValueAtTime(0.28, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.45);
      osc.connect(g);
      g.connect(this.sfxGain);
      this._acquireVoiceSlot(osc, g, when, when + 0.46, 0);
      osc.start(when);
      osc.stop(when + 0.46);
    }
  }
}
