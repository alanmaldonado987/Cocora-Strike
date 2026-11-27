// client/js/ui/minimap.js
// Minimapa táctico 176x176: terreno horneado una vez por mapa en un canvas fuera de pantalla y, cada 50 ms,
// tormenta, barrido de radar, avión y flecha del jugador encima.

import { WATER_LEVEL, GRID_SIZE, WORLD_HALF, SURFACE } from '/shared/mapData.js';

/**
 * @param {object} deps
 * @param {HTMLCanvasElement} deps.canvas canvas visible del HUD
 * @param {object} deps.world VoxelWorld (planeMesh)
 * @param {object} deps.localPlayer LocalPlayerController
 * @param {() => object|null} deps.getStormState estado actual de la tormenta
 * @param {() => object|null} deps.getPlaneState estado actual del avión
 */
export function createMinimap({ canvas, world, localPlayer, getStormState, getPlaneState }) {
  const ui = { minimapCanvas: canvas };
  const minimapBg = document.createElement('canvas');
  minimapBg.width = 176;
  minimapBg.height = 176;
  const minimapCtx = ui.minimapCanvas.getContext('2d');

  function bakeMinimapTerrain(mapData) {
    const ctx = minimapBg.getContext('2d');
    const size = minimapBg.width;
    ctx.clearRect(0, 0, size, size);

    const V = GRID_SIZE + 1;
    const cell = size / GRID_SIZE;

    for (let gz = 0; gz < GRID_SIZE; gz += 2) {
      for (let gx = 0; gx < GRID_SIZE; gx += 2) {
        const surf = mapData.surfaceGrid[gz * V + gx];
        const h = mapData.heightGrid[gz * V + gx];

        if (surf === SURFACE.RIVER_BED) ctx.fillStyle = WATER_LEVEL - h > 2.65 ? '#0e8aa8' : '#18b8d4';
        else if (surf === SURFACE.RIVER_SAND) ctx.fillStyle = '#ded09c';
        else if (surf === SURFACE.DIRT_TRAIL) ctx.fillStyle = '#b58250';
        else if (surf === SURFACE.SCORCHED_EARTH) ctx.fillStyle = '#382c25';
        else if (surf === SURFACE.LUMBER_EARTH) ctx.fillStyle = '#8b5e34';
        else if (surf === SURFACE.RUINS_STONE) ctx.fillStyle = '#78716c';
        else if (surf === SURFACE.CAVE_ROCK) ctx.fillStyle = '#475569';
        else if (surf === SURFACE.COFFEE_TERRACE) ctx.fillStyle = '#5a4b2c';
        else if (surf === SURFACE.TOWN_COBBLESTONE) ctx.fillStyle = '#94a3b8';
        else if (surf === SURFACE.ROCK_CLIFF) ctx.fillStyle = '#64748b';
        else if (h >= 24) ctx.fillStyle = '#256035';
        else ctx.fillStyle = '#3ca346';

        ctx.fillRect(gx * cell, gz * cell, Math.ceil(cell * 2), Math.ceil(cell * 2));
      }
    }

    const toPx = (val) => ((val + WORLD_HALF) / (WORLD_HALF * 2)) * size;

    // Puentes arqueados de piedra
    ctx.fillStyle = '#cbd5e1';
    for (const br of mapData.bridges) {
      const bw = Math.max(8, ((br.totalHalf || br.spanHalf) * 2 / (WORLD_HALF * 2)) * size);
      ctx.fillRect(toPx(br.x) - bw * 0.5, toPx(br.z) - 2, bw, 4);
    }

    // Monumento COCORA
    if (mapData.cocoraMonument) {
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(toPx(mapData.cocoraMonument.x) - 5, toPx(mapData.cocoraMonument.z) - 2, 10, 4);
    }

    // Helicóptero estrellado
    if (mapData.helicopterWreck) {
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(toPx(mapData.helicopterWreck.x), toPx(mapData.helicopterWreck.z), 3.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Casas Paisas
    ctx.fillStyle = '#ea580c';
    for (const b of mapData.buildings) {
      const bw = Math.max(3, (b.w / (WORLD_HALF * 2)) * size);
      const bd = Math.max(3, (b.d / (WORLD_HALF * 2)) * size);
      ctx.fillRect(toPx(b.x) - bw * 0.5, toPx(b.z) - bd * 0.5, bw, bd);
    }

    // Retícula sutil tipo radar
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size * 0.5, 0);
    ctx.lineTo(size * 0.5, size);
    ctx.moveTo(0, size * 0.5);
    ctx.lineTo(size, size * 0.5);
    ctx.arc(size * 0.5, size * 0.5, size * 0.30, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawMinimap(elapsedSec = 0) {
    const stormState = getStormState();
    const planeState = getPlaneState();
    const size = ui.minimapCanvas.width;
    minimapCtx.drawImage(minimapBg, 0, 0);

    const toMapCoord = (worldVal) => ((worldVal + WORLD_HALF) / (WORLD_HALF * 2)) * size;

    if (stormState) {
      const cx = toMapCoord(stormState.centerX);
      const cz = toMapCoord(stormState.centerZ);
      const r = (stormState.radius / (WORLD_HALF * 2)) * size;
      const tr = (stormState.targetRadius / (WORLD_HALF * 2)) * size;

      // Sombreado púrpura de la tormenta exterior en el minimapa
      minimapCtx.save();
      minimapCtx.beginPath();
      minimapCtx.rect(0, 0, size, size);
      minimapCtx.arc(cx, cz, Math.max(1, r), 0, Math.PI * 2, true);
      minimapCtx.fillStyle = 'rgba(126, 34, 206, 0.36)';
      minimapCtx.fill();
      minimapCtx.restore();

      minimapCtx.strokeStyle = 'rgba(255,255,255,0.65)';
      minimapCtx.lineWidth = 1.2;
      minimapCtx.beginPath();
      minimapCtx.arc(cx, cz, Math.max(1, tr), 0, Math.PI * 2);
      minimapCtx.stroke();

      minimapCtx.strokeStyle = '#c084fc';
      minimapCtx.lineWidth = 2.4;
      minimapCtx.beginPath();
      minimapCtx.arc(cx, cz, Math.max(1, r), 0, Math.PI * 2);
      minimapCtx.stroke();
    }

    // Línea sutil de barrido radar
    const sweepAng = elapsedSec * 1.4;
    minimapCtx.strokeStyle = 'rgba(74, 222, 128, 0.25)';
    minimapCtx.lineWidth = 1.4;
    minimapCtx.beginPath();
    minimapCtx.moveTo(size * 0.5, size * 0.5);
    minimapCtx.lineTo(size * 0.5 + Math.cos(sweepAng) * size * 0.5, size * 0.5 + Math.sin(sweepAng) * size * 0.5);
    minimapCtx.stroke();

    if (planeState && planeState.active && world.planeMesh.visible) {
      const px = toMapCoord(world.planeMesh.position.x);
      const pz = toMapCoord(world.planeMesh.position.z);
      minimapCtx.fillStyle = '#facc15';
      minimapCtx.beginPath();
      minimapCtx.arc(px, pz, 4, 0, Math.PI * 2);
      minimapCtx.fill();
    }

    if (localPlayer.active && localPlayer.alive) {
      const mx = toMapCoord(localPlayer.x);
      const mz = toMapCoord(localPlayer.z);
      minimapCtx.save();
      minimapCtx.translate(mx, mz);
      minimapCtx.rotate(-localPlayer.yaw + Math.PI);

      // Cono de visión + Flecha direccional blanca con borde oscuro
      minimapCtx.fillStyle = 'rgba(250, 204, 21, 0.20)';
      minimapCtx.beginPath();
      minimapCtx.moveTo(0, 0);
      minimapCtx.lineTo(-9, -18);
      minimapCtx.lineTo(9, -18);
      minimapCtx.closePath();
      minimapCtx.fill();

      minimapCtx.fillStyle = '#ffffff';
      minimapCtx.strokeStyle = '#090d16';
      minimapCtx.lineWidth = 1.8;
      minimapCtx.beginPath();
      minimapCtx.moveTo(0, -6.5);
      minimapCtx.lineTo(5.2, 5.2);
      minimapCtx.lineTo(0, 2.6);
      minimapCtx.lineTo(-5.2, 5.2);
      minimapCtx.closePath();
      minimapCtx.fill();
      minimapCtx.stroke();
      minimapCtx.restore();
    }
  }

  return { bake: bakeMinimapTerrain, draw: drawMinimap };
}
