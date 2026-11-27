// test/e2e/lanMultiplayer.spec.js
// E2E LAN: servidor local + 2 clientes simultáneos (navegador real). El host inicia una partida con bots, ambos
// saltan del avión, aterrizan y juegan 30 s (movimiento, salto, disparo y botín). Se verifica:
//   1) cero errores de consola / excepciones de página en los clientes y cero errores en el servidor;
//   2) sin desincronización permanente: parados, la posición predicha del cliente converge a la del servidor;
//   3) presupuesto: tráfico WebSocket < 30 KB/s por cliente y frame time p99 estable.
// Ejecutar: npm run test:e2e   (usa el Chrome instalado; PW_CHANNEL=chromium para el navegador de Playwright)

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// E2E_ROOT permite correr la misma prueba contra otra copia del juego (p. ej. main) para comparar métricas
const ROOT = process.env.E2E_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ACTIVE_PLAY_MS = 30_000;
// Presupuesto de red por cliente (KB/s). E2E_NET_BUDGET_KBPS permite medir otras configuraciones sin editar la prueba.
const NET_BUDGET_KBPS = Number(process.env.E2E_NET_BUDGET_KBPS) || 30;
const SETTLE_DISTANCE_M = 0.35; // parado, cliente y servidor deben coincidir a menos de esto
const MAX_MOVING_P95_ERROR_M = 3.0; // en movimiento la latencia separa ambas posiciones; acotado
const CONVERGE_TIMEOUT_MS = 5000; // tiempo máximo para que parado converja la predicción
const FREEZE_MS = 1000; // fotograma considerado congelón
const MAX_FREEZES = 2; // tolerancia: 2 clientes con GPU compartida en el mismo equipo

// Errores conocidos del entorno de prueba que no son fallos del juego
const IGNORED_CONSOLE = [
  /favicon\.ico/, // el cliente no declara favicon
  /Data frame received after close/ // cierre del WebSocket al terminar la prueba
];

function startServer() {
  const port = 3300 + Math.floor(Math.random() * 600);
  const proc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const log = { stdout: '', stderr: '', exitCode: null };
  proc.stdout.on('data', (d) => { log.stdout += d; });
  proc.stderr.on('data', (d) => { log.stderr += d; });
  proc.on('exit', (code) => { log.exitCode = code; });
  return { proc, port, log };
}

async function waitForHealth(port) {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('el servidor no respondió /health');
}

// Instrumenta una página: errores, tráfico WebSocket (CDP), frame times, snapshots autoritativos y botín recogido
async function openClient(browser, port, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = `${m.text()} @ ${m.location().url}`;
    if (!IGNORED_CONSOLE.some((re) => re.test(text))) errors.push(`console.error: ${text}`);
  });
  const traffic = { counting: false, sent: 0, received: 0 };
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketFrameSent', (e) => { if (traffic.counting) traffic.sent += Buffer.byteLength(e.response.payloadData); });
  cdp.on('Network.webSocketFrameReceived', (e) => { if (traffic.counting) traffic.received += Buffer.byteLength(e.response.payloadData); });

  await page.goto(`http://localhost:${port}/?debug`);
  await page.waitForFunction(() => Boolean(window.__cocoro?.net?.socket), null, { timeout: 180_000 });
  await page.evaluate(() => {
    const c = window.__cocoro;
    const e2e = (window.__e2e = { lastMe: null, pickups: 0, shots: 0, frames: [], drawCalls: [], recording: false });
    c.net.socket.on('world_tick', (s) => {
      const me = s.players?.[c.net.selfId];
      if (me) e2e.lastMe = { x: me.x, y: me.y, z: me.z, state: me.state, t: performance.now() };
    });
    c.net.socket.on('loot_picked', (d) => {
      if (d.playerId === c.net.selfId) e2e.pickups++;
      (e2e.pickLog ||= []).push(d.playerId === c.net.selfId ? 'yo' : d.playerId);
    });
    c.net.socket.on('shot_fired', (d) => { if (d.shooterId === c.net.selfId) e2e.shots++; });
    let last = performance.now();
    const tick = (now) => {
      if (e2e.recording) {
        e2e.frames.push(now - last);
        e2e.drawCalls.push(c.renderer.info.render.calls);
      }
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.fill('#nickname-input', name);
  await page.click('#btn-join-lobby', { timeout: 120_000 });
  await page.waitForSelector('#waiting-panel:not(.hidden)', { timeout: 120_000 });
  return { context, page, errors, traffic, name };
}

const playerState = (page) => page.evaluate(() => window.__cocoro.localPlayer.state);

// Salta del avión (Espacio cuando la fase de juego lo permite) y espera a tocar suelo (o agua)
async function dropToGround(page) {
  for (let i = 0; i < 90 && (await playerState(page)) === 'plane'; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(1000);
  }
  expect(await playerState(page)).not.toBe('plane');
  await page.waitForFunction(
    () => ['ground', 'swimming'].includes(window.__cocoro.localPlayer.state) || window.__cocoro.localPlayer.isSwimming,
    null,
    { timeout: 120_000, polling: 250 }
  );
}

// Distancia cliente (predicción) vs servidor (último snapshot autoritativo)
const syncError = (page) =>
  page.evaluate(() => {
    const p = window.__cocoro.localPlayer;
    const me = window.__e2e.lastMe;
    if (!me) return null;
    return Math.hypot(p.x - me.x, p.y - me.y, p.z - me.z);
  });

async function settledSyncError(page) {
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space']) await page.keyboard.up(k);
  await page.mouse.up();
  // Parado, la reconciliación debe llevar cliente y servidor al mismo punto. Se espera hasta CONVERGE_TIMEOUT_MS:
  // un empujón puntual (p. ej. un bot encima) se corrige; una desincronía permanente no converge nunca.
  const start = Date.now();
  let err = null;
  while (Date.now() - start < CONVERGE_TIMEOUT_MS) {
    await page.waitForTimeout(250);
    err = await syncError(page);
    if (err !== null && err < SETTLE_DISTANCE_M && Date.now() - start >= 1000) break;
  }
  return err;
}

// Orienta la vista hacia el botín más cercano que nadie más tenga más cerca (los bots también lo buscan).
// Con los puños equipados cualquier botín se recoge automáticamente al pasar por encima.
const aimAtNearestLoot = (page) =>
  page.evaluate(() => {
    const c = window.__cocoro;
    const p = c.localPlayer;
    const others = [...c.net.getRemoteEntityList()].map((e) => ({ x: e.x, z: e.z }));
    let best = null;
    let bestD = Infinity;
    for (const item of c.world.lootItemsData.values()) {
      const d = Math.hypot(item.x - p.x, item.z - p.z);
      const contested = others.some((o) => Math.hypot(item.x - o.x, item.z - o.z) < d - 2);
      if (!contested && d < bestD) { bestD = d; best = item; }
    }
    if (!best) return null;
    // W avanza en (sin(yaw), cos(yaw)): ver client/js/player/controller.js
    p.yaw = Math.atan2(best.x - p.x, best.z - p.z);
    // Mirar al objeto: así el sensor [E] del HUD lo detecta si está a alcance manual (3.6 m)
    const eyeY = p.y + 1.64;
    p.pitch = Math.max(-1.2, Math.min(0.4, Math.atan2(best.y + 0.16 - eyeY, Math.max(0.3, bestD))));
    return bestD;
  });

test('LAN: 2 clientes + bots, 30 s de juego sin errores, sincronizados y dentro de presupuesto', async ({ browser }) => {
  const server = startServer();
  const clients = [];
  try {
    await waitForHealth(server.port);
    clients.push(await openClient(browser, server.port, 'HostE2E'));
    clients.push(await openClient(browser, server.port, 'InvitadoE2E'));
    const [host] = clients;

    // El host configura 2 bots y arranca la partida LAN (sin rellenar con bots extra)
    await host.page.selectOption('#bot-count-select', '2');
    await host.page.waitForTimeout(500);
    await host.page.click('#btn-start-match');
    for (const c of clients) {
      await c.page.waitForFunction(() => window.__cocoro.localPlayer.active, null, { timeout: 120_000 });
    }

    // En headless no hay Pointer Lock real: se marca como concedido para que el ratón dispare y mire
    await Promise.all(clients.map((c) => dropToGround(c.page)));
    for (const c of clients) await c.page.evaluate(() => { window.__cocoro.localPlayer.pointerLocked = true; });

    const landingErrors = [];
    for (const c of clients) landingErrors.push(await settledSyncError(c.page));

    // ---------- 30 s de juego activo en ambos clientes a la vez ----------
    for (const c of clients) {
      c.traffic.counting = true;
      await c.page.evaluate(() => { window.__e2e.recording = true; });
    }
    const t0 = Date.now();
    const movingErrors = clients.map(() => []);
    const playOne = async (c, idx) => {
      while (Date.now() - t0 < ACTIVE_PLAY_MS) {
        const elapsed = Date.now() - t0;
        if (elapsed < ACTIVE_PLAY_MS * 0.55) {
          // Fase botín: caminar/correr hacia el botín más cercano
          const d = await aimAtNearestLoot(c.page);
          if (process.env.E2E_DEBUG) console.log(c.name, 'botín a', d?.toFixed(1), JSON.stringify(await c.page.evaluate(() => { const p = window.__cocoro.localPlayer; return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), yaw: +p.yaw.toFixed(2), st: p.state, mm: p.moveMode }; })));
          if (d !== null && d < 3.4) await c.page.keyboard.press('KeyE');
          await c.page.keyboard.down('KeyW');
          if (d !== null && d > 8) await c.page.keyboard.down('ShiftLeft');
          else await c.page.keyboard.up('ShiftLeft');
          await c.page.waitForTimeout(400);
        } else {
          // Fase combate: moverse en zigzag, saltar, mirar y disparar
          await c.page.keyboard.up('ShiftLeft');
          await c.page.keyboard.down('KeyW');
          await c.page.keyboard.down(elapsed % 2000 < 1000 ? 'KeyA' : 'KeyD');
          await c.page.mouse.move(640 + ((elapsed / 7) % 120) - 60, 360);
          await c.page.mouse.down();
          await c.page.waitForTimeout(150);
          await c.page.mouse.up();
          await c.page.keyboard.press('Space');
          await c.page.waitForTimeout(250);
          await c.page.keyboard.up('KeyA');
          await c.page.keyboard.up('KeyD');
        }
        const err = await syncError(c.page);
        if (err !== null) movingErrors[idx].push(err);
      }
    };
    await Promise.all(clients.map(playOne));
    const playedSec = (Date.now() - t0) / 1000;
    for (const c of clients) {
      c.traffic.counting = false;
      await c.page.evaluate(() => { window.__e2e.recording = false; });
    }

    // ---------- Verificaciones ----------
    const report = [];
    for (const [i, c] of clients.entries()) {
      const settled = await settledSyncError(c.page);
      const stats = await c.page.evaluate((FREEZE_MS_IN_PAGE) => {
        const f = [...window.__e2e.frames].sort((a, b) => a - b);
        const half = Math.floor(window.__e2e.frames.length / 2);
        const p99 = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * 0.99))] || 0; };
        const dc = [...window.__e2e.drawCalls].sort((a, b) => a - b);
        return {
          frames: f.length,
          p50: f[Math.floor(f.length * 0.5)] || 0,
          p99: p99(f),
          p99FirstHalf: p99(window.__e2e.frames.slice(0, half)),
          p99SecondHalf: p99(window.__e2e.frames.slice(half)),
          maxFrame: f[f.length - 1] || 0,
          freezes: f.filter((x) => x > FREEZE_MS_IN_PAGE).length,
          drawCallsP95: dc[Math.floor(dc.length * 0.95)] || 0,
          drawCallsMax: dc[dc.length - 1] || 0,
          pickups: window.__e2e.pickups,
          pickLog: (window.__e2e.pickLog || []).slice(0, 12),
          shots: window.__e2e.shots,
          state: window.__cocoro.localPlayer.state,
          alive: window.__cocoro.localPlayer.alive,
          hp: window.__cocoro.localPlayer.hp,
          swimming: Boolean(window.__cocoro.localPlayer.isSwimming),
          serverState: window.__e2e.lastMe?.state ?? null
        };
      }, FREEZE_MS);
      const kbps = (c.traffic.sent + c.traffic.received) / 1024 / playedSec;
      const moving = [...movingErrors[i]].sort((a, b) => a - b);
      const movingP95 = moving[Math.floor(moving.length * 0.95)] ?? 0;
      report.push({ cliente: c.name, kbps: +kbps.toFixed(2), kbpsBajada: +(c.traffic.received / 1024 / playedSec).toFixed(2), kbpsSubida: +(c.traffic.sent / 1024 / playedSec).toFixed(2), syncAterrizaje: landingErrors[i], syncFinal: settled, syncMovP95: +movingP95.toFixed(3), ...stats });
    }
    console.log('Métricas E2E:\n' + JSON.stringify(report, null, 2));

    for (const r of report) {
      // 2) desincronización permanente
      expect(r.syncAterrizaje, `${r.cliente}: desincronía tras aterrizar`).toBeLessThan(SETTLE_DISTANCE_M);
      expect(r.syncFinal, `${r.cliente}: desincronía al final`).toBeLessThan(SETTLE_DISTANCE_M);
      expect(r.syncMovP95, `${r.cliente}: error de predicción en movimiento`).toBeLessThan(MAX_MOVING_P95_ERROR_M);
      // 3) presupuesto de red y frame time estable (sin degradación entre la 1ª y la 2ª mitad ni congelones repetidos)
      expect(r.kbps, `${r.cliente}: tráfico de red`).toBeLessThan(NET_BUDGET_KBPS);
      expect(r.frames, `${r.cliente}: fotogramas medidos`).toBeGreaterThan(60);
      expect(r.p99SecondHalf, `${r.cliente}: p99 se degradó`).toBeLessThan(r.p99FirstHalf * 1.6 + 10);
      expect(r.freezes, `${r.cliente}: congelones (> ${FREEZE_MS} ms)`).toBeLessThanOrEqual(MAX_FREEZES);
    }
    // El juego realmente ocurrió: hubo disparos y se recogió botín
    expect(report.reduce((a, r) => a + r.shots, 0), 'disparos registrados por el servidor').toBeGreaterThan(0);
    expect(report.reduce((a, r) => a + r.pickups, 0), 'botín recogido').toBeGreaterThan(0);

    // 1) cero errores en clientes y servidor
    for (const c of clients) expect(c.errors, `${c.name}: errores de consola`).toEqual([]);
    expect(server.log.exitCode, 'el servidor sigue vivo').toBeNull();
    expect(server.log.stderr, 'stderr del servidor').toBe('');
  } finally {
    for (const c of clients) await c.context.close().catch(() => {});
    server.proc.kill();
  }
});
