# FASE 5 — Modularización Arquitectónica y Validación E2E (bitácora)

Rama: `fase-5-modularizacion` (sale de `main` en `e7f9bb6`, con Fases 1 a 4 integradas).
Regla: **extraer y organizar código sin cambiar comportamiento**. Un dominio por commit, `npm run check` antes de cada commit.

## Cómo retomar

1. `git checkout fase-5-modularizacion && git log --oneline main..HEAD` para ver los dominios ya hechos.
2. Revisar el checklist de abajo: el primer `[ ]` es el siguiente paso.
3. Verificación por commit:
   - `npm run check` (lint + pruebas unitarias; incluye `test/importGraph.test.js`, que valida que todos los
     imports locales del cliente, `shared/`, `server/` y `Modelos 3D/` resuelvan y que los nombres existan).
   - Prueba de humo en navegador (cliente real con Chrome local): servidor + lobby + partida solo, sin
     `pageerror` (ignorar `favicon.ico` 404 y "user gesture is required to request Pointer Lock", que son
     propios del modo headless). Línea base: ~116 draw calls en partida, HUD activo.
4. E2E: `npm run test:e2e` (Playwright con el Chrome instalado en el equipo, sin descargar navegadores).

## Línea base (antes de tocar código)

- `npm run check`: 81 pruebas en verde, lint sin errores.
- Archivos monolíticos: `client/js/world.js` (3253 líneas), `client/js/player.js` (2531), `shared/mapGen.js` (1878),
  `client/js/main.js` (1361), `shared/physics/playerController.js` (915), `client/js/audio.js` (782).

## Checklist

### 0. Infraestructura
- [x] Bitácora `docs/FASE5_ESTADO.md`
- [x] `test/importGraph.test.js` (guardia de rutas tras mover archivos)
- [x] `npm test` limitado a `test/*.test.js` (para que `node --test` no recoja `test/e2e/`), script `test:e2e`
- [x] `@playwright/test` como devDependency

### 1. Cliente (`client/js/`)
- [ ] `net/` — network.js, interpolation.js, prediction.js
- [ ] `audio/` — audio.js
- [ ] `ui/` — hud.js, minimap.js, lobby.js, killfeed.js
- [ ] `core/` — loop.js (paso fijo), quality.js, input.js
- [ ] `player/` — avatar.js, animation.js, viewmodel.js, camera.js, controller.js, weapons.js
- [ ] `world/` — terrain.js, foliage.js, structures.js, water.js, sky.js, lights.js, effects.js, loot.js, wildlife.js, materials.js

### 2. Shared (`shared/`)
- [ ] `protocol.js` (ids de mensajes, cuantización)
- [ ] `physics/` — collision.js, raycast.js, playerController.js, vault.js
- [ ] `map/` — terrain.js, buildings.js, props.js, pois.data.js
- [ ] Constantes congeladas (`Object.freeze`) para estados (`'ground'`, `'skydiving'`, `moveMode`, …) en `shared/config.js`
- [ ] Fábrica/registro único de armas en `/shared`
- [ ] `// @ts-check` + JSDoc en todo `/shared`

### 3. E2E
- [ ] `test/e2e/lanMultiplayer.spec.js`: 2 clientes, partida con bots desde el host, 30 s de juego
      (movimiento, salto, disparo, loot); cero errores de consola/servidor; sin desincronización permanente;
      < 30 KB/s por cliente y frame time p99 estable.

### 4. Cierre
- [ ] `npm run check` y E2E al 100 %
- [ ] `git checkout main && git merge fase-5-modularizacion`

## Registro de commits

| Dominio | Archivos creados / modificados | Notas |
|---|---|---|
| Infraestructura | `docs/FASE5_ESTADO.md`, `test/importGraph.test.js`, `package.json` | 82 pruebas en verde |
