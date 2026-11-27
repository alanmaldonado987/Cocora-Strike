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
- [x] `physics/` — collision.js, raycast.js, playerController.js, vault.js
- [x] `map/` — terrain.js, buildings.js, props.js, pois.data.js (generateCocoraMap encadena buildTerrain → buildStructures → createGroundQueries → buildProps en el orden original del RNG)
- [x] Constantes congeladas (`Object.freeze`) para estados (`'ground'`, `'skydiving'`, `moveMode`, …) en `shared/config.js` (cámara del cliente y `bannerMode` del HUD quedan como strings locales de la vista, no son estado de juego)
- [x] Fábrica/registro único de armas en `/shared`
- [x] `// @ts-check` + JSDoc en todo `/shared` (`npm run typecheck`; sin código TypeScript)

### 3. E2E
- [x] `test/e2e/lanMultiplayer.spec.js`: 2 clientes, partida con bots desde el host, 30 s de juego (con `E2E_NET_BUDGET_KBPS=200` pasa al 100 %; con 30 KB/s falla igual que `main`)
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
| physics | `shared/physics.js` → `shared/physics/{collision,raycast,vault}.js`; `playerController.js` y `mapGen.js` importan de los nuevos módulos; barril `mapData.js` actualizado (+ protocol) | 86 pruebas; humo OK |
| map | `shared/mapGen.js` (orquestador) → `shared/map/{terrain,buildings,props,pois.data}.js`; `test/mapFingerprint.test.js` + `test/fixtures/mapFingerprint.golden.json` (huella del mapa previo a la Fase 5, 3 semillas) | 89 pruebas; mapa bit a bit idéntico |
| estados | `shared/config.js` (+ PLAYER_STATE, MOVE_MODE, GAME_PHASE, STORM_STATE, WILDLIFE_STATE); ~260 sustituciones vía AST en client/server/shared; `test/stateEnums.test.js` | 91 pruebas; humo OK |
| armas | `shared/weapons.js` (WEAPON_IDS, WEAPON_REGISTRY, createWeaponInventory, serialize/applyUnlockedWeapons); reemplaza los 3 inventarios a mano de `server/gameRoom.js`, `client/js/main.js` y `client/js/player/controller.js`; `test/weaponRegistry.test.js` | 94 pruebas; humo OK |
| tipos | `// @ts-check` en los 16 archivos de `shared/`, 42 bloques JSDoc (funciones exportadas + typedef `CocoraMap`), `tsconfig.shared.json`, `typescript` como devDependency solo para verificar; `npm run check` = lint + typecheck + tests | 94 pruebas; tsc sin errores |
| e2e | `test/e2e/lanMultiplayer.spec.js`, `playwright.config.js`, `eslint.config.js`, `.gitignore`; `client/js/core/input.js`: se captura el rechazo del fallback de Pointer Lock (promesa sin manejar cuando la partida la inicia otro jugador) | 94 pruebas; E2E en verde salvo el tope de 30 KB/s (ver Hallazgos) |

## Hallazgos de la E2E (preexistentes, también en `main`)

Medido con la misma prueba contra una copia de `main` (`E2E_ROOT=<copia> npm run test:e2e`) y contra esta rama:

| Métrica (2 clientes + 2 bots, mismo equipo) | `main` | `fase-5-modularizacion` |
|---|---|---|
| Tráfico WebSocket por cliente | ~165 KB/s | ~107–165 KB/s (varía con la fauna viva) |
| Draw calls (p95, en suelo) | 2 273–2 561 | 1 529–3 143 |
| Desincronía parado (cliente vs servidor) | < 1 mm | < 4 cm |
| Errores de consola / servidor | 1 promesa de Pointer Lock sin manejar | 0 |

- El `world_tick` pesa ~8.3 KB a 20 Hz: fauna ~5.2 KB (33 animales con todos sus campos en cada tick) y jugadores ~0.63 KB c/u (37 claves).
  Bajar de 30 KB/s requiere cambiar el protocolo (no es una extracción sin cambio de comportamiento): campos estáticos
  de la fauna una sola vez, interés por distancia por cliente y snapshots más compactos.
- No existe un preset de calidad "Baja" en el código; las draw calls dependen de la vista (en caída libre se ve todo el mapa).
