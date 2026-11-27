// test/audioEngine.test.js
// Tests unitarios del motor Web Audio: planificador lookahead, límite de 24 voces,
// offset aleatorio de ruido y espacialización estéreo direccional.

import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_CONFIG } from '../shared/mapData.js';
import { SoundEngine, computeStereoPan } from '../client/js/audio/audio.js';

function createMockAudioContext() {
  const events = {
    oscStarts: [],
    bufferStarts: [],
    stoppedNodes: [],
    stereoPans: []
  };

  const makeParam = (initial = 0, onSet = null) => ({
    value: initial,
    setValueAtTime(val, t) {
      this.value = val;
      onSet?.(val, t);
    },
    linearRampToValueAtTime(val) {
      this.value = val;
    },
    exponentialRampToValueAtTime(val) {
      this.value = val;
    },
    setTargetAtTime(val) {
      this.value = val;
    },
    cancelScheduledValues() {}
  });

  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    destination: {},
    events,
    resume() {
      this.state = 'running';
    },
    createGain() {
      return {
        gain: makeParam(1),
        connect() {}
      };
    },
    createOscillator() {
      const node = {
        type: 'sine',
        frequency: makeParam(440),
        onended: null,
        connect() {},
        start(when = 0) {
          events.oscStarts.push(when);
        },
        stop(when = 0) {
          events.stoppedNodes.push({ kind: 'osc', when, node });
        }
      };
      return node;
    },
    createBuffer(channels, length, sampleRate) {
      const arr = new Float32Array(length);
      return {
        duration: length / sampleRate,
        getChannelData: () => arr
      };
    },
    createBufferSource() {
      const node = {
        buffer: null,
        playbackRate: makeParam(1),
        onended: null,
        connect() {},
        start(when = 0, offset = 0, duration = 0) {
          events.bufferStarts.push({ when, offset, duration });
        },
        stop(when = 0) {
          events.stoppedNodes.push({ kind: 'buf', when, node });
        }
      };
      return node;
    },
    createBiquadFilter() {
      return {
        type: 'bandpass',
        Q: { value: 1 },
        frequency: makeParam(1000),
        connect() {}
      };
    },
    createStereoPanner() {
      return {
        pan: makeParam(0, (val) => events.stereoPans.push(val)),
        connect() {}
      };
    }
  };

  return ctx;
}

test('AUDIO_CONFIG establece el límite de 24 voces y ventana lookahead', () => {
  assert.equal(AUDIO_CONFIG.maxVoices, 24);
  assert.ok(AUDIO_CONFIG.scheduleAheadTimeSec > 0);
  assert.ok(AUDIO_CONFIG.lookaheadIntervalMs > 0);
});

test('planificador lookahead programa pasos musicales precisos sobre AudioContext.currentTime sin derivar', () => {
  const mockCtx = createMockAudioContext();
  const engine = new SoundEngine(AUDIO_CONFIG);
  engine.init(mockCtx);
  engine.stopAmbientMusic(); // Controlamos el avance manualmente en el test

  engine.nextMusicNoteTime = 0;
  mockCtx.currentTime = 0;
  const s1 = engine.pumpMusicScheduler();
  assert.equal(s1, 1); // [0.00] cae dentro de [0, 0.12)
  assert.ok(Math.abs(engine.nextMusicNoteTime - AUDIO_CONFIG.musicStepDurationSec) < 1e-9);

  // Avanzar reloj de hardware a 0.20 s -> horizonte 0.32 s: programa el paso en 0.26 s y deja next en 0.52 s
  mockCtx.currentTime = 0.20;
  const s2 = engine.pumpMusicScheduler();
  assert.equal(s2, 1);
  assert.ok(Math.abs(engine.nextMusicNoteTime - 0.52) < 1e-9);

  engine.dispose();
});

test('gestor de polifonía aplica límite estricto de 24 voces robando la voz más lejana/antigua', () => {
  const mockCtx = createMockAudioContext();
  const engine = new SoundEngine(AUDIO_CONFIG);
  engine.init(mockCtx);
  engine.stopAmbientMusic();

  // Disparar 20 ráfagas de rifle (cada tiro genera 2 voces = 40 voces solicitadas en t=1.0s)
  mockCtx.currentTime = 1.0;
  for (let i = 0; i < 20; i++) {
    const dist = i === 3 ? 180 : 12 + i;
    engine.playShot('rifle', dist, { x: 10 + i, y: 0, z: 5 });
    assert.ok(
      engine.activeVoices.length <= AUDIO_CONFIG.maxVoices,
      `Superó el tope de 24 voces: ${engine.activeVoices.length}`
    );
  }
  assert.equal(engine.activeVoices.length, 24);
  // La voz lejana a 180m debe haber sido robada antes que las cercanas
  assert.equal(engine.activeVoices.some((v) => v.distance === 180), false);

  engine.dispose();
});

test('playFilteredNoise aplica offsets aleatorios variados sobre noiseBuffer evitando efecto metralleta', () => {
  const mockCtx = createMockAudioContext();
  const engine = new SoundEngine(AUDIO_CONFIG);
  engine.init(mockCtx);
  engine.stopAmbientMusic();

  mockCtx.events.bufferStarts.length = 0;
  for (let i = 0; i < 12; i++) {
    mockCtx.currentTime = 2.0 + i * 0.08;
    engine.playShot('smg', 5, { x: 4, y: 0, z: 3 });
  }

  const offsets = mockCtx.events.bufferStarts.map((b) => b.offset);
  assert.equal(offsets.length, 12);
  const uniqueOffsets = new Set(offsets.map((v) => v.toFixed(4)));
  assert.ok(uniqueOffsets.size >= 8, 'Los disparos deben arrancar desde offsets aleatorios distintos del buffer');
  for (const off of offsets) {
    assert.ok(off >= 0 && off < AUDIO_CONFIG.noiseBufferDurationSec);
  }

  engine.dispose();
});

test('computeStereoPan y playShot espacializan correctamente izquierda, centro y derecha según yaw de cámara', () => {
  // Oyente en (0,0) mirando hacia +Z (yaw = 0): derecha es -X, izquierda es +X
  const panRight = computeStereoPan(0, 0, 0, -20, 0);
  const panLeft = computeStereoPan(0, 0, 0, 20, 0);
  const panFront = computeStereoPan(0, 0, 0, 0, 25);
  const panSelf = computeStereoPan(10, 10, 0.7, 10.05, 10.02);

  assert.ok(panRight > 0.85, `Fuente a la derecha debe panear positivo (+1): ${panRight}`);
  assert.ok(panLeft < -0.85, `Fuente a la izquierda debe panear negativo (-1): ${panLeft}`);
  assert.equal(Math.abs(panFront) < 1e-6, true);
  assert.equal(panSelf, 0);

  // Verificar integración con StereoPannerNode en SoundEngine
  const mockCtx = createMockAudioContext();
  const engine = new SoundEngine(AUDIO_CONFIG);
  engine.init(mockCtx);
  engine.stopAmbientMusic();

  engine.updateListener(0, 1.6, 0, 0);
  mockCtx.events.stereoPans.length = 0;
  engine.playShot('pistol', 25, { x: -25, y: 1.5, z: 0 });
  assert.ok(mockCtx.events.stereoPans.length >= 1);
  assert.ok(mockCtx.events.stereoPans[0] > 0.85);

  engine.dispose();
});
