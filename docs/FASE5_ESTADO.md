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
- [x] `net/` — network.js, interpolation.js, prediction.js (prediction = métodos de reconciliación mezclados en `LocalPlayerController` vía `core/mixin.js`)
- [x] `audio/` — audio.js
- [x] `ui/` — hud.js, minimap.js, lobby.js, killfeed.js (+ `elements.js` con el mapa de nodos DOM y `hudUpdater.js` movido desde `client/js/`)
- [x] `core/` — loop.js (paso fijo), quality.js, input.js (+ `mixin.js`; el paso fijo SIM_DT=1/60 sigue en el controlador del jugador y se documenta en `loop.js`)
- [x] `player/` — avatar.js, animation.js, viewmodel.js, camera.js, controller.js, weapons.js (métodos del controlador repartidos como mixins; `animate` del avatar vía `createAvatarAnimator`)
- [x] `world/` — terrain.js, foliage.js, structures.js, water.js, sky.js, lights.js, effects.js, loot.js, wildlife.js, materials.js (+ `common.js` hoja con temporales, `aircraft.js` para el avión y `groundCover.js` movido)

### 2. Shared (`shared/`)
- [x] `protocol.js` (ids de mensajes, cuantización)
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
| net | `client/js/net/{network,interpolation,prediction}.js`, `client/js/core/mixin.js`; imports en `main.js`, `world.js`, `player.js` y tests | 82 pruebas; humo OK |
| audio | `client/js/audio.js` → `client/js/audio/audio.js`; imports en `main.js` y `test/audioEngine.test.js` | 82 pruebas |
| ui | `client/js/ui/{elements,hud,hudUpdater,minimap,lobby,killfeed}.js` (fábricas con dependencias inyectadas); `main.js` delega HUD, minimapa, killfeed, lobby y pantalla final; `test/hudPerf.test.js` | 82 pruebas; humo OK |
| core | `client/js/core/{loop,quality,input}.js`; `main.js` usa `createRenderer`, `createGpuWarmUp`, `createFrameLoop`; `bindInputs`/`clearActiveInputs`/`requestRawPointerLock` salen de `player.js` | 82 pruebas; humo OK |
| player | `client/js/player.js` → `client/js/player/{avatar,animation,viewmodel,camera,controller,weapons,avatarPerf}.js`; `damp` unificado en `shared/math.js`; imports en `main.js`, `net/network.js`, `ui/lobby.js`, `world.js`, `test/playerZeroAlloc.test.js` | 82 pruebas; humo OK (salto, paracaídas, W, cambio de cámara) |
| world | `client/js/world.js` → `client/js/world/{world,common,materials,water,foliage,groundCover,lights,sky,terrain,structures,aircraft,loot,wildlife,effects}.js`; constructor delega en `initSharedMaterialCache()`; `damp` desde `shared/math.js` | 82 pruebas; humo OK |
| protocol | `shared/protocol.js` (C2S/S2C congelados + `quantize`), `test/protocol.test.js`; eventos en `server/index.js`, `server/validation.js`, `server/gameRoom.js`, `server/room/*.js`, `client/js/net/network.js` | 86 pruebas; humo OK; mismos strings en cable |
