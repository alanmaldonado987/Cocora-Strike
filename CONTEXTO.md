# CONTEXTO TÉCNICO Y ARQUITECTÓNICO — BATALLA EN EL COCORA (`Cocora-Strike`)

> Documento de referencia técnica verificado directamente contra el código fuente actual del repositorio (`package.json`, `eslint.config.js`, `shared/`, `server/`, `client/`, `Modelos 3D/` y `test/`).

---

## 1. Resumen y Stack Tecnológico

### Descripción del Proyecto
**Batalla en el Cocora** (`cocora-royale-voxel` v`1.0.0`) es un videojuego multijugador **Battle Royale 3D en el navegador** ambientado en el **Valle del Cocora y el municipio de Salento (Quindío, Colombia)**. Combina dirección de arte **Cel-Shaded / Low-Poly orgánica** con modelado procedural PBR de alta precisión para armamento y aeronaves, operando en **escala métrica real (`1 unidad = 1.00 m`, altura de personaje = `1.80 m`)**. Soporta partidas en **Red Local (LAN / Wi-Fi)** entre jugadores humanos, partidas en solitario y partidas mixtas con **Bots IA configurables (`0` a `8`)**.

### Stack Tecnológico y Versiones Exactas
- **Entorno de Ejecución (Servidor):**
  - **Node.js:** motor requerido `>=18` en `package.json` (verificado en entorno actual con Node `v24.16.0`), configurado como **ES Modules nativos** (`"type": "module"`).
  - **Express:** `^4.21.2` en `package.json` (`4.22.3` instalada en `package-lock.json`) — servidor HTTP para archivos estáticos, módulos compartidos, modelos 3D, dependencias vendorizadas de Three.js y endpoint de diagnóstico `GET /health`.
  - **Socket.IO (Servidor):** `^4.8.1` en `package.json` (`4.8.4` instalada) — transporte en tiempo real con `cors: { origin: '*' }`, simulación autoritativa desacoplada a **`20 Hz` (`TICK_RATE = 20`, `TICK_DT = 0.05 s`)**, sanitización estricta de payloads y limitador de tasa por evento (`RateLimiter`).
- **Motor Gráfico, Cliente y Audio (Navegador, Cero Bundler en Runtime):**
  - **Three.js:** `^0.170.0` (`0.170.0` instalada) — importada limpiamente en el cliente mediante `<script type="importmap">` apuntando a rutas locales servidas desde `node_modules`:
    - `"three"` -> `/vendor/three/three.module.js`
    - `"three/addons/"` -> `/vendor/three-addons/`
  - **Addons oficiales de Three.js utilizados en runtime (`Modelos 3D/cocoraModels.js`, `Modelos 3D/armasV1.js`, `Modelos 3D/avionesShared.js`):**
    - `BufferGeometryUtils.js` (`mergeGeometries`)
    - `RoundedBoxGeometry.js`
    - `TextGeometry.js` y `FontLoader.js` (carga `Modelos 3D/helvetiker_bold.typeface.json` para el monumento 3D `"COCORA"`)
    - `GLTFLoader.js` y `OBJLoader.js` (cargadores integrados en `loadExternalModelFile()` para archivos opcionales `.glb`, `.gltf` y `.obj`)
  - **Renderizado WebGL:** `THREE.WebGLRenderer` (`antialias: true`, `powerPreference: 'high-performance'`, `pixelRatio <= 1.5`, `SRGBColorSpace`, sombras dinámicas `THREE.PCFSoftShadowMap` de `2048×2048` y niebla exponencial `THREE.FogExp2`).
  - **Audio Procedural:** **Web Audio API** nativa (`SoundEngine` en `client/js/audio.js`) con osciladores, buffers de ruido blanco y filtros `BiquadFilter` sintetizados en tiempo real (cero archivos de audio externos).
  - **Interfaz y Texturas 2D:** HTML5 + CSS3 (`client/index.html`, `client/style.css`), Pointer Lock API y HTML5 `<canvas>` 2D para el minimapa táctico (`176×176 px`) y la generación procedural de texturas PBR/toon (con fallback `THREE.DataTexture` cuando se ejecuta en Node durante los tests).
- **Calidad de Código y Pruebas Automatizadas (`devDependencies`):**
  - **ESLint:** `eslint` `^9.39.5`, `@eslint/js` `^9.39.5` y `globals` `^17.14.0` (`eslint.config.js` en formato Flat Config, ECMAScript 2023).
  - **Suite de Tests:** runner nativo `node:test` + `node:assert/strict` (`45` pruebas automatizadas distribuidas en `8` archivos bajo `test/`).
  - **Scripts NPM (`package.json`):**
    - `npm start` -> `node server/index.js`
    - `npm run dev` -> `node --watch server/index.js`
    - `npm run lint` -> `eslint .`
    - `npm test` -> `node --test`
    - `npm run check` -> `npm run lint && npm test`

### Configuración de Puerto y Red Local (LAN / Wi-Fi)
- **Host y Puerto:** `server/index.js` escucha explícitamente en `HOST = '0.0.0.0'` (todas las interfaces IPv4 disponibles) y `PORT = Number(process.env.PORT) || 3000`.
- **Detección Automática de IPs LAN:** `getLocalIPv4Addresses()` inspecciona `os.networkInterfaces()`, descarta interfaces internas (`127.0.0.1`) y ordena las direcciones IPv4 priorizando redes domésticas `192.168.x.x`, luego `10.x.x.x` y finalmente otras subredes.
- **Rutas HTTP Expuestas por Express (`server/index.js`):**
  - `GET /` y estáticos raíz -> `client/`
  - `GET /shared/*` -> `shared/` (mismo código determinista ejecutado en Node y navegador)
  - `GET /Modelos 3D/*` y `GET /Modelos%203D/*` -> `Modelos 3D/`
  - `GET /vendor/three/*` -> `node_modules/three/build/`
  - `GET /vendor/three-addons/*` -> `node_modules/three/examples/jsm/`
  - `GET /socket.io/socket.io.js` -> cliente Socket.IO servido automáticamente por el servidor
  - `GET /health` -> devuelve JSON `{ status: 'ok', phase, players, botDifficulty, lanUrls }`.

---

## 2. Estructura de Carpetas y Archivos Actual

### Árbol Completo de Directorios y Archivos del Proyecto

```text
Cocora-Strike/
├── .gitignore
├── CONTEXTO.md
├── README.md
├── eslint.config.js
├── package.json
├── package-lock.json
├── client/
│   ├── index.html
│   ├── style.css
│   └── js/
│       ├── audio.js
│       ├── groundCover.js
│       ├── interpolation.js
│       ├── main.js
│       ├── network.js
│       ├── player.js
│       └── world.js
├── server/
│   ├── index.js
│   ├── gameRoom.js
│   ├── validation.js
│   └── room/
│       ├── bots.js
│       ├── combat.js
│       ├── constants.js
│       ├── interactables.js
│       ├── lagCompensation.js
│       ├── lobby.js
│       ├── loot.js
│       ├── playerActions.js
│       ├── storm.js
│       ├── swimming.js
│       └── wildlife.js
├── shared/
│   ├── config.js
│   ├── mapData.js
│   ├── mapGen.js
│   ├── math.js
│   ├── physics.js
│   └── spatial.js
├── Modelos 3D/
│   ├── ac130Transport.js
│   ├── ah64Wreck.js
│   ├── armasV1.js
│   ├── avionesShared.js
│   ├── ch47Transport.js
│   ├── cocoraModels.js
│   ├── helvetiker_bold.typeface.json
│   ├── Animación v1/
│   │   └── create-detailed-3d-models.zip
│   ├── Animación v2/
│   │   └── create-detailed-3d-models/
│   │       ├── CONTEXTO.md
│   │       ├── index.html
│   │       ├── package.json
│   │       ├── package-lock.json
│   │       ├── tsconfig.json
│   │       ├── vite.config.ts
│   │       └── src/
│   │           ├── App.tsx, index.css, main.tsx, store.ts
│   │           ├── assets/helvetiker_bold.typeface.json
│   │           ├── components/ (ControlPanel.tsx, Sidebar.tsx, ui.tsx)
│   │           ├── game/ (core.ts, fx.tsx, GameView.tsx, HUD.tsx, Player.tsx)
│   │           ├── three/
│   │           │   ├── ClippingManager.tsx, exporters.ts, helpers.tsx, toon.tsx, Viewer.tsx
│   │           │   └── models/
│   │           │       ├── AK47.tsx, Bear.tsx, Character.tsx, ColonialHouse.tsx, Fauna.tsx
│   │           │       ├── FullScene.tsx, Helicopter.tsx, index.ts, Props.tsx, StoneBridge.tsx, WaxPalm.tsx
│   │           │       └── character/ (parts.ts, rig.ts)
│   │           ├── utils/cn.ts
│   │           └── __tests__/ (character.test.tsx, export.test.tsx, models.test.tsx)
│   ├── Armas v1/
│   │   └── generate-threejs-weapon-models/
│   │       ├── index.html, package.json, package-lock.json, tsconfig.json, vite.config.ts
│   │       └── src/
│   │           ├── App.tsx, index.css, main.tsx
│   │           ├── components/WeaponViewport.tsx
│   │           ├── utils/cn.ts
│   │           └── weapons/
│   │               ├── geometryHelpers.ts, index.ts, materials.ts, types.ts
│   │               └── models/ (assaultRifle.ts, classicRifle.ts, pistol.ts, revolver.ts, shotgun.ts, smg.ts, sniperRifle.ts)
│   └── Aviones v1/
│       └── generate-3d-aircraft-models/
│           ├── MODELADO.md, index.html, package.json, package-lock.json, tsconfig.json, vite.config.ts
│           ├── public/
│           │   ├── aeroforge.svg
│           │   └── previews/ (*.webp de 8 aeronaves)
│           ├── scripts/ (render-assets.ts, verify-models.mjs, fixtures/original-pivots.json)
│           └── src/
│               ├── App.tsx, appPresentation.ts, index.css, main.tsx
│               ├── components/ (ModelViewer3D.tsx, studioScene.ts)
│               ├── utils/cn.ts
│               └── models/
│                   ├── airplanes.ts, cockpits.ts, details.ts, finish.ts, helicopters.ts
│                   ├── index.ts, materials.ts, partBuilders.ts, propulsion.ts, renderBatches.ts, surfaces.ts, types.ts
│                   └── vehicles/
│                       ├── A10Warthog.ts, AC130Gunship.ts, AH64Apache.ts, AH6LittleBird.ts
│                       └── BiplaneScout.ts, CH47Chinook.ts, F22Raptor.ts, Ka52Alligator.ts
└── test/
    ├── armasV1.test.js
    ├── avionesV1.test.js
    ├── gameRoom.test.js
    ├── interpolation.test.js
    ├── lagCompensation.test.js
    ├── shared.test.js
    ├── swimming.test.js
    └── validation.test.js
```

### Responsabilidades y Exportaciones por Archivo

#### Raíz y Configuración
| Archivo | Responsabilidad Exacta | Exportaciones / Configuración Clave |
| :--- | :--- | :--- |
| `package.json` | Metadatos del paquete ESM, dependencias (`express`, `socket.io`, `three`), scripts de ejecución/validación. | Scripts `start`, `dev`, `lint`, `test`, `check`. |
| `eslint.config.js` | Reglas ESLint Flat Config para servidor (Node), cliente (`browser` + `io`) y `shared`; excluye `node_modules/**` y las subcarpetas fuente `Modelos 3D/*/**`. | Configuración por defecto de ESLint v9. |
| `README.md` | Guía rápida de instalación, red LAN/Firewall y tabla de controles para usuarios finales. | Documentación de usuario (ver nota de actualización pendiente en Sección 5). |

#### Módulo Determinista Compartido (`shared/`)
| Archivo | Responsabilidad Exacta | Clases / Funciones / Constantes Exportadas |
| :--- | :--- | :--- |
| `shared/mapData.js` | Fachada (*barrel file*) consumida por servidor y cliente bajo la misma semilla. | Re-exporta `config.js`, `math.js`, `spatial.js`, `mapGen.js` y `physics.js`. |
| `shared/config.js` | Todas las constantes de balance, dimensiones métricas, agua/laguna, nado, armas, botín, bots, tormenta, daño por caída, curación, derrape, aeronaves, paracaídas y fauna. | `CELL_SIZE`, `BLOCK_SIZE`, `GRID_SIZE`, `WORLD_SIZE`, `WORLD_HALF`, `WATER_LEVEL`, `RIVER_CENTER_DEPTH`, `RIVER_EDGE_DEPTH`, `RIVER_FORD_DEPTH`, `LAGOON_CONFIG`, `SWIM_CONFIG`, `DEFAULT_MAP_SEED`, `PLAYER_RADIUS`, `PLAYER_HEIGHT`, `PLAYER_CROUCH_HEIGHT`, `PLAYER_SLIDE_HEIGHT`, `PLAYER_EYE_HEIGHT`, `PLAYER_CROUCH_EYE_HEIGHT`, `PLAYER_SLIDE_EYE_HEIGHT`, `SURFACE`, `BLOCK`, `WEAPON_SLOTS`, `WEAPONS`, `LOOT_TYPES`, `BOT_DIFFICULTIES`, `STORM_PHASES`, `STORM_CLOSED_DPS`, `FALL_DAMAGE_CONFIG`, `computeFallDamage()`, `HEAL_CONFIG`, `SLIDE_CONFIG`, `TRANSPORT_AIRCRAFT_TYPES`, `CABIN_DISEMBARK_MS`, `PARACHUTE_CONFIG`, `WILDLIFE_TYPES`, `getJumpHeightFactor()`, `computeTargetDescentSpeed()`. |
| `shared/math.js` | PRNG determinista Mulberry32, ruido fractal 2D (`fbm2D`), conversión grilla/mundo y perfil continuo del Río Quindío + Laguna Andina. | `createRNG()`, `hash2D()`, `smoothstep()`, `valueNoise2D()`, `fbm2D()`, `gridToWorldX()`, `gridToWorldZ()`, `worldToGridX()`, `worldToGridZ()`, `getRiverCenterWorldX()`, `getWaterChannelAt()`, `getWaterProfileAt()`, `distToSegment()`. |
| `shared/spatial.js` | Estructuras de partición espacial 2D para evitar solapamientos al poblar props y acelerar consultas de colisión/raycast. | `SpatialExclusionGrid`, `SpatialCollisionIndex` (`addBox`, `addCylinder`, `queryNear`, `querySegmentXZ`). |
| `shared/mapGen.js` | Generador procedural completo del mapa de `640×640 m`: topografía, río y desembocadura suavizada, 10 POIs, 3 montañas, 3 cuevas, 4 puentes, 26 estructuras multinivel, 6 ruinas, monumento COCORA, zona de impacto del AH-64D, cráter, coberturas tácticas, vegetación orgánica, botín y fauna. | `generateCocoraMap(seed)` (devuelve el objeto `map` con grillas, listas de entidades, `colliders` y consultas `getTerrainHeightAt`, `getGroundHeightAt`, `getFloorBelowY`, `isInWater`, `isConcealedInBush`, `findSafeLootPlacement`, etc.). |
| `shared/physics.js` | Cinemática compartida cliente/servidor: flotabilidad/nado, colisión deslizante horizontal contra cajas/cilindros, separación suave entre entidades, gravedad/escaleras/rampas, detección de obstáculos (`senseObstacleAhead`), parkour (`findVaultableObstacle`) y raycast analítico 3D (`raycastVoxels`, `hasLineOfSight`). | `getWaterDepthAt()`, `isSwimmingAt()`, `getSwimFloatY()`, `resolveSlidingHorizontal()`, `applyEntitySeparation()`, `stepCharacterPhysics()`, `senseObstacleAhead()`, `findVaultableObstacle()`, `raycastVoxels()`, `hasLineOfSight()`. |

#### Servidor Autoritativo (`server/`)
| Archivo | Responsabilidad Exacta | Clases / Funciones / Mixins Exportados |
| :--- | :--- | :--- |
| `server/index.js` | Arranque de Express + HTTP + Socket.IO en `0.0.0.0:3000`, rutas estáticas, endpoint `/health`, detección de IPs LAN y envoltura segura de eventos Socket.IO con `RateLimiter` + `sanitizers`. | Ejecutable principal del servidor (`npm start`). |
| `server/validation.js` | Sanitización de todos los mensajes entrantes del cliente, eliminación de caracteres de control/bidi en apodos, cubetas de tokens (`RateLimiter`) y presupuesto anti-teletransporte (`consumeMoveBudget`). | `sanitizeName()`, `sanitizers`, `RATE_LIMITS`, `RateLimiter`, `MAX_HORIZONTAL_SPEED`, `consumeMoveBudget()`. |
| `server/gameRoom.js` | Estado central de la partida, bucle autoritativo `tick()` a `20 Hz` (cuenta regresiva del lobby, vuelo de aeronave y progreso de desembarco en cabina, curación, recarga, auto-loot, bots, fauna, tormenta, historial de compensación de latencia y emisión de `world_tick`), serialización y mezcla de `server/room/*.js`. | `GameRoom`. |
| `server/room/constants.js` | Frecuencia del servidor (`20 Hz`), nombres de bots colombianos y normalización angular. | `BOT_NAMES`, `TICK_RATE`, `TICK_DT`, `normalizeAngle()`. |
| `server/room/lobby.js` | Ingreso/salida de jugadores humanos, modo espectador si la partida ya inició (`joined_midgame`), gestión de bots (`0–8`), preferencia de aeronave (`auto`/`ac130`/`ch47`), auto-arranque a los `10 s` con `>= 2` humanos, `startGame()` y `resetToLobby()`. | `lobbyMethods`. |
| `server/room/playerActions.js` | Secuencia de desembarco en bodega (`handlePlayerJump` -> `completePlaneExit`), apertura de paracaídas, derrape, validación de movimiento (`handlePlayerInput`), daño por caída, cambio de arma, recarga y curación canalizada de `2.0 s`. | `playerActionsMethods`. |
| `server/room/combat.js` | Disparo autoritativo con compensación de latencia (`executeAuthoritativeShot`), dispersión de perdigones, headshots (`>= 74%` de la altura), daño a puertas/ventanas/fauna/jugadores, alerta sonora a bots (`< 42 m`) y chigüiros (`< 16 m`), drops al morir y condición de victoria (`checkWinCondition`). | `combatMethods`. |
| `server/room/interactables.js` | Índice, serialización, apertura/cierre de puertas (`[E]`), daño/destrucción de puertas (`90 HP`) y rotura de cristales de ventanas. | `interactablesMethods`. |
| `server/room/loot.js` | Generación inicial de suministros (spawns fijos + `65` aleatorios), drops en pares/listas sobre suelo seguro, validación de alcance/línea de visión y recolección (`applyLootToPlayer`). | `lootMethods`. |
| `server/room/bots.js` | IA completa de bots: salto escalonado desde aeronave, planeo hacia POIs, apertura de puertas, curación automática, búsqueda de armas/munición/botiquines en su misma cota, cruce inteligente del río por puentes/vados, evasión con bigotes (`steerWithWhiskers`), strafe, derrape en `hard` y escape del agua con poco aliento. | `botsMethods`. |
| `server/room/wildlife.js` | Aparición inicial, máquina de estados (`peaceful`, `hostile`, `fleeing`, `aerial`), ataques cuerpo a cuerpo de depredadores (`bear`, `jaguar`), huida de tímidos (`capybara`), vuelo orbital (`condor`) y drops de botín al ser abatidos. | `wildlifeMethods`. |
| `server/room/storm.js` | Inicialización y progresión de las `5` fases de tormenta (`waiting` -> `shrinking` -> `closed`) y aplicación de daño por segundo fuera del círculo seguro. | `stormMethods`. |
| `server/room/lagCompensation.js` | Historial circular de posiciones de `1000 ms` para jugadores y fauna, rebobinado acotado hasta `MAX_REWIND_MS = 300 ms`. | `MAX_REWIND_MS`, `positionAt()`, `resolveRewindTime()`, `lagCompensationMethods`. |
| `server/room/swimming.js` | Consumo/regeneración autoritativa de aliento (`breath`) y daño continuo por ahogamiento (`drownDps = 10`). | `swimmingMethods`. |

#### Cliente WebGL 3D e Interfaz (`client/`)
| Archivo | Responsabilidad Exacta | Clases / Funciones Exportadas |
| :--- | :--- | :--- |
| `client/index.html` | Estructura DOM de las 3 pantallas (`#lobby-screen`, `#hud-screen`, `#gameover-screen`), `importmap` de Three.js, mira telescópica 8X, minimapa, barras de salud/aliento/curación/recarga y 8 ranuras de armas (`0`–`7`). | Documento HTML principal. |
| `client/style.css` | Estilos visuales del Lobby, HUD táctico, mira dinámica por arma/ADS, overlay óptico de francotirador, animaciones de daño flotante, viñeta de tormenta y tabla de clasificación. | Hoja de estilos CSS. |
| `client/js/main.js` | Orquestador del cliente: inicializa `THREE.WebGLRenderer`, `SoundEngine`, precarga de modelos, `VoxelWorld`, `LocalPlayerController` y `NetworkManager`; ejecuta precalentamiento adaptativo de GPU (`warmUpGpu`, `queueMapWarmUp`), actualiza el HUD, renderiza el minimapa a `20 Hz` y corre el bucle `animate()`. | Punto de entrada ESM del navegador (expone `window.__cocoro` con `?debug`). |
| `client/js/world.js` | Construcción y actualización visual del mundo 3D: malla de terreno con colores por vértice, agua animada del río/laguna, estructuras coloniales multinivel fusionadas por celdas de `64 m` (`mergeStaticStructures`), `GroundCover`, lotes `InstancedMesh` con viento en GPU, doble aeronave de desembarco (`AC-130J` / `CH-47F`), sitio de impacto del `AH-64D` con atmósfera dinámica `< 45 m`, tormenta y pools de partículas/luces. | `VoxelWorld`. |
| `client/js/player.js` | Creación de avatares articulados (`createVoxelAvatar`) con IK analítico de brazos (`solveArmIK`), animaciones de locomoción/nado/sigilo/derrape/curación/bodega, controlador local (`LocalPlayerController`) con cámara 1ra/3ra persona anti-clipping (`CAMERA_COLLISION_OFFSET = 0.30 m`), viewmodel 1ra persona (`fpRig`) y físicas predictivas. | `getSharedToonGradient()`, `AVATAR_COLORS`, `CAMERA_COLLISION_OFFSET`, `createDetailedWeaponMesh()`, `createVoxelAvatar()`, `LocalPlayerController`. |
| `client/js/network.js` | Cliente Socket.IO, gestión del ciclo de vida de avatares remotos (`remotePlayers`), anclaje jerárquico en `cabinBayGroup` durante el vuelo/desembarco, interpolación continua de snapshots a `60+ FPS` y envío de `player_input` cada `45 ms`. | `NetworkManager`. |
| `client/js/interpolation.js` | Reloj sincronizado con adaptación suave al jitter (`ServerClock`, retardo `80–250 ms`) y buffer circular por entidad (`SnapshotBuffer`) con extrapolación corta (`120 ms`) y corte por teletransporte (`20 m`). | `INTERP_DELAY_MS`, `MAX_EXTRAPOLATION_MS`, `TELEPORT_DISTANCE`, `MIN_INTERP_DELAY_MS`, `MAX_INTERP_DELAY_MS`, `lerpAngle()`, `ServerClock`, `SnapshotBuffer`, `createSampleOut()`. |
| `client/js/groundCover.js` | Cobertura densa de matas de pasto y parches de flores silvestres generada bajo demanda en bloques de `24×24 m` (`<= 2` tiles/frame) dentro de un radio de `72 m` cuando el jugador está a `< 45 m` del suelo. | `GroundCover`. |
| `client/js/audio.js` | Motor de audio procedural Web Audio API: música ambiental andina suave y efectos para las 8 armas, pasos (tierra/agua), chapuzón, brazadas, ahogamiento, parkour, puertas, vidrios, derrape, rugidos de fauna, paracaídas, hitmarker, caída, curación y victoria. | `SoundEngine`. |

#### Módulos de Modelos 3D Integrados (`Modelos 3D/`) y Carpetas Fuente
| Ruta | Estado de Integración | Responsabilidad y Contenido |
| :--- | :--- | :--- |
| `Modelos 3D/cocoraModels.js` | **Integrado en runtime** | Port ESM de los modelos de entorno y personaje (`Animación v2`): rig humanoide Paisa (`buildExternalCharacterRig`) + `solveArmIK()`, Casa Colonial reparada (tejas cálidas con normales limpias + ventanas con cristal `opacity: 0.35, depthWrite: false`), Puente de Piedra limpio (`buildCleanStoneBridge`), Palma de Cera, Cafeto, Rocas erosionadas/cantos rodados, Cerca rural, Botiquín 3D, Monumento `"COCORA"` + Cóndor y mallas articuladas de Oso, Cóndor y Danta/Chigüiro, además de `preloadExternalModelAssets()` y `loadExternalModelFile()`. |
| `Modelos 3D/helvetiker_bold.typeface.json` | **Integrado en runtime** | Fuente vectorial 3D precargada vía `fetch` por `cocoraModels.js` para extruir las letras del monumento `"COCORA"`. |
| `Modelos 3D/armasV1.js` | **Integrado en runtime** | Port ESM completo de las **7 armas de fuego** de `"Armas v1"` (`pistol`, `revolver`, `shotgun`, `smg`, `assault_rifle`, `rifle`, `sniper`) con biblioteca de materiales/texturas PBR procedurales, anclajes métricos (`muzzleTip`, `muzzleFlash`, `slideMesh`, `magMesh`, `forendGripPos`) y caché compartida de `BufferGeometry`/materiales. |
| `Modelos 3D/avionesShared.js` | **Integrado en runtime** | Núcleo matemático y PBR compartido de `"Aviones v1"`: `hullSampler` Hermite, `createLoftedFuselage`, `createWingGeometry` NACA, `clipGeometry` para recortar aberturas reales en cascos, `createAirfoilBladeGeometry`, `TelescopicPiston`, `bakeRigidAircraftBatches` y caché GPU compartida. |
| `Modelos 3D/ac130Transport.js` | **Integrado en runtime** | Modelo completo del avión de desembarco **AC-130J Ghostrider** (`AC130_SCALE = 2.55`) con cabina tripulada, bodega abierta (`cabinBayGroup`), 4 turbohélices AE 2100D3 de 6 palas, rampa hidráulica con pistones, GAU-12 25mm + M102 105mm, `sampleDisembarkLocalPose()` y `update()`. |
| `Modelos 3D/ch47Transport.js` | **Integrado en runtime** | Modelo completo del helicóptero de desembarco **CH-47F Chinook** (`CH47_SCALE = 2.55`) con rotores en tándem contrarrotatorios articulados (`swashplates` + `pitch links`), bodega abierta (`cabinBayGroup`), rampa hidráulica trasera, 2 M134 Miniguns en ventanas laterales, `sampleDisembarkLocalPose()` y `update()`. |
| `Modelos 3D/ah64Wreck.js` | **Integrado en runtime** | Sitio de impacto del **AH-64D Apache Longbow siniestrado** (`AH64_SCALE = 2.15`): fuselaje principal semi-enterrado en cráter con brasas, cabina tándem dañada, rotor de 4 palas dobladas/partidas + domo Longbow, cañón M230 30mm, sección de cola separada, 5 fragmentos metálicos dispersos, 4 penachos de fuego y `update()`. |
| `Modelos 3D/Animación v1/`, `Animación v2/`, `Armas v1/`, `Aviones v1/` | **Referencia / Fuente (no ejecutados en runtime)** | Proyectos independientes en React + TypeScript + Vite utilizados como catálogo de origen para portar los módulos ESM anteriores. En `Aviones v1/.../vehicles/` permanecen además 5 modelos de referencia no conectados al juego (`A10Warthog`, `AH6LittleBird`, `BiplaneScout`, `F22Raptor`, `Ka52Alligator`). |

#### Suite de Pruebas (`test/`)
| Archivo | Cobertura Verificada |
| :--- | :--- |
| `test/shared.test.js` | Daño por caída, determinismo de `createRNG`, huella SHA-256 invariable de `generateCocoraMap(DEFAULT_MAP_SEED)`, puentes despejados sobre `WATER_LEVEL`, laguna nadable, rocas en 3 ejes, `raycastVoxels`, `hasLineOfSight` y slots de armas. |
| `test/swimming.test.js` | Superficie y profundidad del río, `isSwimmingAt`, gasto/recuperación de aliento, muerte por ahogamiento (`reason: 'drown'`), bloqueo de disparo/curación al nadar y anulación total de daño por caída al caer en agua profunda. |
| `test/validation.test.js` | Sanitizadores de payloads malformados/inyecciones, limpieza de caracteres invisibles/bidi (`sanitizeName`), `RateLimiter` y recorte anti-teletransporte (`consumeMoveBudget`). |
| `test/interpolation.test.js` | Camino corto angular (`lerpAngle`), interpolación/extrapolación/teletransporte en `SnapshotBuffer` y adaptación gradual al jitter en `ServerClock`. |
| `test/lagCompensation.test.js` | Interpolación histórica (`positionAt`), tope de rebobinado (`MAX_REWIND_MS = 300 ms`) y acierto autoritativo contra objetivos en movimiento usando `viewTime`. |
| `test/gameRoom.test.js` | Simulación completa de partida con bots a `20 Hz` verificando invariantes de salud/coordenadas y recorte de apodos en lobby. |
| `test/armasV1.test.js` | Configuración de las 7 armas en slots/botín, construcción 3D sin `NaN`, caché compartida de geometrías/materiales y flujo de recolección/equipamiento/disparo en `GameRoom`. |
| `test/avionesV1.test.js` | Jerarquía 3D, cristales `opacity: 0.35` (`depthWrite: false`) y caché GPU en `AC-130J`, `CH-47F` y `AH-64D`, más transición autoritativa `sit -> stand -> walk_cabin -> ramp_jump -> skydiving`. |

---

## 3. Arquitectura de Red y Contratos Socket.IO

### Modelo de Sincronización, Seguridad y Compensación de Latencia
1. **Desacoplamiento `20 Hz` / `60+ FPS`:** `GameRoom.tick()` ejecuta la simulación autoritativa cada `50 ms` y difunde `world_tick` con marca temporal `t = Date.now()`. El cliente envía `player_input` como máximo cada `45 ms` (`~22 Hz`) y renderiza entidades remotas y fauna ~`100 ms` en el pasado (`ServerClock` + `SnapshotBuffer`, adaptándose entre `80 ms` y `250 ms` según el jitter medido).
2. **Compensación de Latencia (*Lag Compensation*):** Al disparar, el cliente adjunta `viewTime` (`lastRenderTime` del `ServerClock`). El servidor rebobina las posiciones de jugadores y animales hasta ese instante (acotado a `MAX_REWIND_MS = 300 ms` sobre un historial de `1000 ms`) para resolver impactos exactamente donde el tirador veía el blanco.
3. **Protección del Servidor (`server/validation.js`):** Todo evento entrante pasa por `RateLimiter` (`burstSeconds = 1.5`) y `sanitizers[event]` antes de invocar `GameRoom`, aislando excepciones con `try/catch` y aplicando presupuesto horizontal de movimiento (`consumeMoveBudget`: `20 m/s` en suelo, `26 m/s` en paracaídas, `32 m/s` en caída libre).

### Eventos `Cliente -> Servidor` (17 eventos + `disconnect`)

| Evento | Límite (`msg/s`) | Payload Enviado (`Cliente -> Servidor`) | Comportamiento en el Servidor |
| :--- | :---: | :--- | :--- |
| `join_lobby` | `3` | `{ name: string }` | Limpia caracteres invisibles/bidi, recorta a 16 chars y registra al jugador (en `lobby` o como espectador `joined_midgame` si ya hay partida en curso). |
| `configure_bots` | `6` | `{ botDifficulty?: 'easy'\|'normal'\|'hard', botCount?: number (0..8), aircraftType?: 'auto'\|'ac130'\|'ch47' }` | Ajusta dificultad, sincroniza cantidad de bots en sala y guarda preferencia de aeronave de transporte. |
| `add_bot` | `6` | *(sin payload)* | Añade 1 bot IA adicional a la sala de espera (hasta un máximo de 8). |
| `clear_bots` | `4` | *(sin payload)* | Elimina todos los bots IA dejando `desiredBotCount = 0` (modo solo humanos LAN). |
| `start_game` | `2` | `{ autoFillBots?: boolean, botDifficulty?: string, botCount?: number, aircraftType?: string }` | Genera nueva semilla de mapa, crea aeronave (`AC-130J` o `CH-47F`), tormenta, botín y fauna, sienta a todos los participantes en la bodega e inicia `phase = 'playing'`. |
| `player_jump` | `6` | *(sin payload)* | En `plane`: inicia la secuencia de desembarco por bodega (`CABIN_DISEMBARK_MS = 1400 ms`). En `skydiving` o `ground` con altura libre `>= 6.0 m`: despliega el paracaídas (`parachuting`). |
| `player_input` | `40` | `{ x: number, y: number, z: number, yaw: number, pitch: number, onGround: boolean, state: 'ground'\|'skydiving'\|'parachuting'\|'plane'\|'swimming', animWalk: number, moveMode: string, isSliding: boolean, isCrouching: boolean, isSwimming: boolean, isVaulting: boolean }` | Valida límites del mundo, recorta velocidad con `consumeMoveBudget`, resuelve colisiones, actualiza nado/paracaídas y aplica daño por caída al aterrizar en seco. |
| `player_slide` | `6` | `{ active: boolean }` | Activa/desactiva estado de derrape táctico en tierra y notifica `player_slid` a los demás clientes. |
| `player_shoot` | `30` | `{ origin: {x,y,z}, dir: {x,y,z}, weapon?: string, viewTime?: number }` | Valida cadencia, munición y línea de visión del origen (`<= 2.1 m` de los ojos), ejecuta raycast con compensación de latencia contra mundo, jugadores, fauna, puertas y ventanas. |
| `player_reload` | `6` | *(sin payload)* | Inicia temporizador autoritativo de recarga (`reloadMs` del arma equipada) si falta munición en el cargador y hay `reserveAmmo > 0`. |
| `player_switch_weapon` | `12` | `{ weapon: 'fists'\|'pistol'\|'revolver'\|'shotgun'\|'smg'\|'assault_rifle'\|'rifle'\|'sniper' }` | Cambia el arma equipada si el slot está desbloqueado y cancela recargas en curso. |
| `player_heal` | `6` | `{ itemType: 'medkit'\|'bandage' }` | Inicia canalización de curación de `2000 ms` si el jugador está en tierra, fuera del agua y con `hp < maxHp`. |
| `player_cancel_heal` | `6` | *(sin payload)* | Cancela inmediatamente la curación canalizada activa del jugador. |
| `player_pickup` | `15` | `{ lootId: string\|number }` | Recoge manualmente (`[E]`, alcance `3.6 m`) un objeto de botín cercano del mapa. |
| `player_interact_door` | `8` | `{ doorId: string\|number }` | Abre o cierra una puerta intacta situada a `<= 3.8 m` horizontales y `<= 2.4 m` verticales, alternando su collider físico. |
| `player_break_window` | `10` | `{ windowId: string\|number }` | Rompe el cristal de una ventana situada a `<= 4.2 m` (usado al atravesar ventanas mediante parkour/vaulting). |
| `reset_lobby` | `2` | *(sin payload)* | Reinicia la sala a `phase = 'lobby'`, restaura jugadores/bots y emite `returned_to_lobby`. |
| `disconnect` | *(nativo)* | *(evento nativo Socket.IO)* | Remueve al jugador; si estaba vivo en partida emite `player_eliminated` (`reason: 'disconnect'`), evalúa `checkWinCondition()` y reinicia la sala si quedan `0` humanos. |

### Eventos `Servidor -> Cliente` (26 eventos activos)

| Evento | Alcance | Payload Recibido (`Servidor -> Cliente`) |
| :--- | :---: | :--- |
| `network_info` | Unicast (al conectar) | `{ port: number, lanUrls: string[] }` |
| `lobby_joined` | Unicast | `{ selfId: string, phase: 'lobby'\|'playing'\|'ended' }` |
| `lobby_state` | Broadcast | `{ phase: string, players: Array<{id, name, isBot, colorIdx, spectating}>, botCount: number, botDifficulty: string, aircraftType: 'auto'\|'ac130'\|'ch47', countdown: number\|null }` |
| `game_started` | Broadcast | `{ seed: number, plane: PlaneState, storm: StormState, loot: LootItem[], doors: DoorState[], brokenWindows: string[], wildlife: WildlifeState[], players: Record<string, PlayerSnapshot>, botDifficulty: string }` |
| `joined_midgame` | Unicast | `{ selfId: string, seed: number, loot: LootItem[], doors: DoorState[], brokenWindows: string[], wildlife: WildlifeState[], storm: StormState, plane: PlaneState\|null, botDifficulty: string }` |
| `world_tick` | Broadcast (`20 Hz`) | `{ t: number, players: Record<string, PlayerSnapshot>, wildlife: WildlifeState[], plane: PlaneState\|null, storm: {centerX, centerZ, radius, targetRadius, state, timer, phaseIndex, dps}, aliveCount: number }` |
| `player_cabin_disembark` | Broadcast | `{ playerId: string, seatIndex: number, durationMs: number }` |
| `player_jumped` | Broadcast | En apertura de paracaídas: `{ playerId: string, state: 'parachuting' }`. Al saltar de la rampa: `{ playerId: string, state: 'skydiving', jumpAltitude: number, x: number, y: number, z: number }` *(emitido por el servidor; ver nota en Sección 5)*. |
| `player_slid` | Broadcast | `{ playerId: string, x: number, y: number, z: number, yaw: number }` |
| `loot_spawned` | Broadcast | `{ items: Array<{id: string, type: string, x: number, y: number, z: number, onFlatStructure: boolean}> }` |
| `loot_picked` | Broadcast | `{ lootId: string, type: string, playerId: string, hp: number, medkits: number, bandages: number, equipped: string, weapons: Record<string, {unlocked: boolean, mag: number}>, reserveAmmo: number }` |
| `door_state_changed` | Broadcast | `{ doorId: string, isOpen: boolean, hp: number, destroyed: boolean, x: number, y: number, z: number }` |
| `window_broken` | Broadcast | `{ windowId: string, x: number, y: number, z: number }` |
| `shot_fired` | Broadcast | `{ shooterId: string, weapon: string, origin: {x,y,z}, endPoint: {x,y,z}, extraEnds: Array<{x,y,z}>, hitPlayer: boolean, mag: number, reserveAmmo: number }` |
| `player_damaged` | Broadcast | `{ targetId: string, targetName: string, attackerId: string\|null, damage: number, hp: number, maxHp: number, isHeadshot: boolean, source: string, hitPoint: {x,y,z} }` |
| `player_eliminated` | Broadcast | `{ victimId: string, victimName: string, killerId?: string\|null, killerName: string, reason: string }` |
| `wildlife_hit` | Broadcast | `{ animalId: string, species: string, speciesName: string, attackerId: string\|null, damage: number, hp: number, maxHp: number, hitPoint: {x,y,z} }` |
| `wildlife_aggro` | Broadcast | `{ animalId: string, species: string, speciesName: string, targetId: string, x: number, y: number, z: number }` |
| `wildlife_attack` | Broadcast | `{ animalId: string, species: string, targetId: string, x: number, y: number, z: number }` |
| `wildlife_killed` | Broadcast | `{ animalId: string, species: string, speciesName: string, killerId: string\|null, killerName: string }` |
| `reload_complete` | Unicast (`to(p.id)`) | `{ weapon: string, weapons: Record<string, {unlocked: boolean, mag: number}>, reserveAmmo: number }` |
| `heal_started` | Unicast (`to(socketId)`) | `{ playerId: string, itemType: 'medkit'\|'bandage', durationMs: number }` |
| `heal_cancelled` | Unicast (`to(p.id)`) | `{ playerId: string }` |
| `player_healed` | Unicast (`to(p.id)`) | `{ hp: number, medkits: number, bandages: number, itemType: 'medkit'\|'bandage' }` |
| `game_over` | Broadcast | `{ winnerId: string\|null, winnerName: string, winnerKills: number, ranking: Array<{id, name, isBot, kills, placement}> }` |
| `returned_to_lobby` | Broadcast | *(sin payload)* |

#### Estructuras de Sub-Objetos Serializados en `game_started` y `world_tick`
- **`PlaneState`:** `{ active: boolean, aircraftType: 'ac130'|'ch47', label: string, x: number, y: number, z: number, vx: number, vz: number, yaw: number, speed: number, elapsed: number, maxDuration: number }`.
- **`PlayerSnapshot` (`serializePlayers()`):** `{ id, name, isBot, colorIdx, seatIndex, cabinProgress, alive, hp, maxHp, kills, state, x, y, z, yaw, pitch, onGround, animWalk, moveMode, isSliding, isCrouching, jumpAltitude, equipped, mag, reserveAmmo, medkits, bandages, isSwimming, breath, isHealing, healingItem, reloading, unlockedWeapons: { pistol, revolver, shotgun, smg, assault_rifle, rifle, sniper } }`.
- **`WildlifeState` (`serializeWildlife()`):** `{ id, species, x, y, z, yaw, hp, maxHp, aiState, pose, animPhase }`.

---

## 4. Funcionalidades y Mecánicas Implementadas (Estado Actual)

### Mapa y Entorno (`640 × 640 metros`)
- **Dimensiones y Topografía:** Malla continua de `321×321` vértices (`GRID_SIZE = 320`, `CELL_SIZE = 2.0 m`, coordenadas `-320 m` a `+320 m`), generada determinísticamente por semilla (`DEFAULT_MAP_SEED = 202699`) con 12 tipos de superficie (`SURFACE`: valle, montaña, terraza cafetera, sendero de tierra, acantilado rocoso, arena de río, lecho de río, adoquín colonial, tierra maderera, piedra de ruinas, roca de cueva y tierra calcinada).
- **Puntos de Interés (10 POIs), Montañas y Cuevas:**
  - **10 POIs conectados por 21 tramos de senderos:** *Salento* (plaza nivelada con fuente y 13 edificios), *Finca El Ocaso*, *Finca La Palma*, *Campamento Maderero* (con pilas de troncos escalables), *Bodega del Río*, *Puesto Vigía Norte*, *Fortín del Sur*, *Caserío La Quebrada*, *Ruinas Andinas* (altar + 8 columnas precolombinas) y *Mirador del Cocora*.
  - **3 Cumbres Escarpadas:** *Cerro Morrogacho* (`+33 m`), *Peñón del Cóndor* (`+35 m`) y *Farallón Cafetero* (`+31 m`).
  - **3 Cuevas Rocosas Explorables:** *Cueva del Cóndor*, *Gruta de Morrogacho* y *Túnel del Farallón*, con piso nivelado, `4.1 m` de altura interior libre (sin colisión de cabeza) y botín garantizado de alto nivel.
- **Río Quindío Elevado, Desembocadura/Laguna Nadable y Puentes de Piedra:**
  - Superficie de agua elevada a `WATER_LEVEL = 12.4 m` integrada suavemente con las praderas ribereñas (`~1.0–1.6 m` sobre el nivel del agua, con suavizado laplaciano en las orillas), profundidad central de `2.55 m` y **2 vados transitables a pie** (`z = -128` y `z = 122`, profundidad `0.72 m`).
  - **Laguna / Desembocadura Andina Nadable** en el sur (`z = 194` a `296`, centro en `z = 252`, espejo de agua de `~86 × 78 m` y profundidad máxima de `3.45 m`).
  - **4 Puentes Arqueados de Piedra** (`z = -192, -64, 56, 186`) nivelados a `deckY = Math.max(WATER_LEVEL + 2.4, Math.max(leftGround, rightGround) + 1.2)` con rampas suaves de `7.5 m`, pretiles laterales y pilares sólidos.
- **Arquitectura Multinivel, Monumento COCORA y Zona de Impacto del AH-64D:**
  - **26 construcciones** (`addMultilevelBuilding`) de **1, 2 y 3 niveles** (`3.60 m` por piso) más **azoteas tácticas con parapetos** y **6 casas en ruinas**, todas asentadas sobre terrazas niveladas y cimientos macizos de piedra (cero puertas flotantes o hundidas), con escaleras interiores alternadas, balcones y mobiliario paisa interior (camas, mesas, sillas, alacenas, cuadros y lámparas).
  - **Monumento 3D `"COCORA"`** sobre colina empedrada en `(4, -88)` con letras extruidas sobre basamento transitable y escultura de **Cóndor Andino** posado sobre la `"R"`.
  - **Helicóptero de Ataque AH-64D Apache Siniestrado** en `(8.2, -33.5)` con sección de cola partida en `(-1.4, -29.2)`, 5 fragmentos metálicos reconocibles alrededor de un cráter ennegrecido con brasas, colliders cilíndricos suaves alineados y un segundo **Cráter Profundo de Explosión** frente a Salento en `(2, 2)` (`radio = 11.2 m`, `profundidad = 2.65 m`).
- **Iluminación, Sombras y Atmósfera Dinámica (Tormenta + Zona de Impacto):**
  - Luz direccional solar cálida con sombras suaves `PCFSoftShadowMap` (`2048×2048`) cuyo frustum sigue dinámicamente al jugador local, más presupuesto dinámico de hasta `4` luces puntuales activas (`MAX_ACTIVE_POINT_LIGHTS = 4`) para cuevas, interiores e incendio del helicóptero.
  - **Transición atmosférica en Zona de Impacto (`< 45 m`):** interpola suavemente el color/intensidad de las luces ambiental y solar y la densidad/color de `THREE.FogExp2` hacia tonos cálidos ámbar-humo con **190 partículas flotantes de ceniza y pavesas**, restaurando el clima normal del valle al alejarse.
  - **Tormenta Eléctrica de 5 Fases (`STORM_PHASES`):** cierre progresivo del radio seguro (`365 m -> 245 m -> 160 m -> 92 m -> 38 m -> 0 m`) con daño escalonado (`1 -> 2 -> 5 -> 8 -> 10 -> 12 HP/s`), domo energético 3D, transición a niebla púrpura densa, partículas suspendidas y viñeta en HUD.

### Jugabilidad y Físicas
- **Ciclo de Partida y Desembarco Aéreo Animado:**
  - Sala de espera (`lobby`) con selección de apodo, dificultad/cantidad de bots, selector de aeronave (`Alternar`, `AC-130J Ghostrider`, `CH-47F Chinook`) y cuenta regresiva automática de `10 s` al reunirse `>= 2` humanos (además de modo espectador automático `joined_midgame` para quienes entran con la partida iniciada).
  - Mientras `state === 'plane'`, los avatares 3D del jugador local, jugadores LAN remotos y bots son hijos reales del `THREE.Group` local de la bodega (`cabinBayGroup`), sentados en las bancas laterales con 3 modos de cámara (`[V]`: cabina 3ra persona, asiento 1ra persona y exterior panorámica).
  - Al pulsar `Espacio`/`F` (o al cumplirse el `jumpDelay` de cada bot), se ejecuta la secuencia animada de `1.4 s` (`sit` -> `stand` ~`0.35 s` -> `walk_cabin` por el pasillo central -> `ramp_jump` en el borde de la rampa hidráulica), desacoplándose al espacio global de `scene` con inercia frontal (`0.42 * planeVelocity`).
- **Caída Libre de ~10 Segundos y Paracaídas (`PARACHUTE_CONFIG`):**
  - Vuelo a `~196 m` sobre el valle central, descenso en caída libre entre `15.0` y `17.5 m/s` (modificable inclinando la vista en picada `+3.4 m/s` o planeo `-2.0 m/s`), apertura manual desde `>= 6 m` de altura libre o **apertura automática a `25 m` del suelo**, seguida de descenso controlado con paracaídas (`7.6–8.6 m/s`). Permite re-desplegar el paracaídas al saltar desde acantilados, azoteas o puentes altos (`>= 6 m`).
- **Locomoción, Parkour, Derrape, Sigilo, Nado y Daño por Caída:**
  - **Cámara Dual (`[V]`):** 3ra persona estilizada sobre el hombro con sistema anti-clipping por raycast + bigotes (`CAMERA_COLLISION_OFFSET = 0.30 m`) y 1ra persona táctica con brazos/arma en una escena superpuesta (`fpRig`) que evita atravesar muros.
  - **Parkour / *Vaulting* (`W + Espacio`):** supera automáticamente obstáculos de `0.42 m` a `1.38 m` (cercas, muros bajos, rocas, sacos, barriles, carretas, troncos, parapetos y alféizares de ventanas, rompiendo el cristal automáticamente al saltar hacia el interior).
  - **Derrape Táctico (`Shift + W + C/Ctrl`):** deslizamiento de `0.9 s` (`cooldown = 1.5 s`, velocidad inicial `12.6 m/s` con aceleración adicional cuesta abajo) y partículas de polvo.
  - **Sigilo en Arbustos (`C`):** agacharse o derrapar dentro de cualquiera de los ~290 arbustos altos activa el estado de ocultamiento (`🌿 OCULTO EN ARBUSTO`) y reduce el rango de detección visual de los bots a solo `14 m`.
  - **Nado y Ahogamiento (`SWIM_CONFIG`):** vadeo ralentizado (`0.68x`) en aguas someras y nado automático cuando la profundidad supera `1.25 m` (arma guardada, sin disparo ni curación). Consume barra de **Aliento** (`100` pts: ~`25 s` normal a `3.4 m/s`, ~`14 s` rápido con `Shift` a `4.8 m/s`, regeneración en `~4 s` fuera del agua); al llegar a `0` inflige `10 HP/s` de ahogamiento (`reason: 'drown'`).
  - **Daño por Caída (`FALL_DAMAGE_CONFIG`):** `<= 3.2 m` sin daño; de `3.2 m` a `14.0 m` daño progresivo entre `12` y `68 HP`; `> 14.0 m` daño letal (`100 HP`). Aterrizar con paracaídas o caer desde cualquier altura en agua profunda nadable (`> 1.25 m`) inflige **`0` daño por caída**.
  - **Curación Canalizada (`2.0 s`) e Interactuables:** **Botiquín** (`[H]`, `+50 HP`, máx. 3) y **Vendas Rápidas** (`[G]`/`[Q]`, `+20 HP`, máx. 5, 1 inicial al desplegarse) con animación de vendaje a dos manos, velocidad reducida (`0.45x`) y cancelación automática si esprintas, saltas, derrapas, disparas o nadas. Puertas coloniales de `90 HP` abribles con `[E]` o destructibles a tiros, y ventanas de cristal rompibles.

### Arsenal (`"Armas v1"`), Fauna Silvestre e IA de Bots

#### Catálogo Completo de Armas Configuradas (`shared/config.js` + `Modelos 3D/armasV1.js`)
| Slot / Tecla | ID Interno | Nombre en Juego | Daño Base | Perdigones | Mult. Headshot | Cadencia (`ms`) | Cargador / Inicio | Recarga (`ms`) | Alcance (`m`) | Modo / FOV ADS |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `0` / `` ` `` | `fists` | Machete Cafetero | `28` | `1` | `1.3x` | `420` | `∞` | `0` | `2.7` | Semi · `68°` |
| `1` | `pistol` | Pistola Semiautomática 9mm | `24` | `1` | `1.6x` | `210` | `15` / `+30` | `1050` | `115` | Semi · `58°` |
| `2` | `revolver` | Revólver Clásico .357 | `44` | `1` | `1.85x` | `430` | `6` / `+18` | `1680` | `145` | Semi · `54°` |
| `3` | `shotgun` | Escopeta de Corredera 12G | `13` (`×8 = 104`) | `8` | `1.35x` | `780` | `6` / `+18` | `1950` | `42` | Semi · `60°` |
| `4` | `smg` | Subfusil Compacto MP-9 | `13` | `1` | `1.45x` | `75` | `32` / `+64` | `1320` | `95` | Auto · `58°` |
| `5` | `assault_rifle` | Rifle de Asalto M4-T | `19` | `1` | `1.6x` | `96` | `30` / `+60` | `1560` | `265` | Auto · `46°` |
| `6` | `rifle` | Fusil Clásico AK-M | `21` | `1` | `1.55x` | `112` | `30` / `+60` | `1720` | `250` | Auto · `48°` |
| `7` | `sniper` | Rifle de Francotirador .338 | `76` (`152` HS) | `1` | `2.0x` | `1150` | `5` / `+15` | `2250` | `540` | Semi · `22°` (Mira 8X) |

#### Fauna Silvestre Colombiana (`WILDLIFE_TYPES`)
- **Oso de Anteojos (`bear` — 8 ejemplares):** Depredador (`185 HP`, velocidad de persecución `9.6 m/s`, zarpazo de **`42 HP`** cada `1000 ms` al ser provocado durante `18 s`). Al morir suelta triple botín de alto valor: `['sniper', 'medkit', 'ammo']`.
- **Jaguar Colombiano (`jaguar` — 7 ejemplares):** Depredador ágil (`95 HP`, persecución `9.2 m/s`, ataque de `19 HP` cada `880 ms`). Suelta `['rifle', 'bandage']`.
- **Chigüiro (`capybara` — 12 ejemplares ribereños):** Tímido (`50 HP`, huye a `7.8 m/s` al recibir daño o escuchar disparos a `< 16 m`). Suelta `['bandage']`.
- **Cóndor de los Andes (`condor` — 6 ejemplares):** Aéreo (`70 HP`, planea en órbitas amplias a `>= 28 m` sobre el relieve). Suelta `['sniper', 'medkit']`.

#### Inteligencia Artificial de Bots (`BOT_DIFFICULTIES` + `server/room/bots.js`)
- **3 Niveles de Dificultad:**
  - `easy` (*Fácil*, por defecto): reacción `1500 ms`, dispersión `3.4x`, multiplicador de daño `0.55x`, visión `72 m`.
  - `normal` (*Normal*): reacción `720 ms`, dispersión `1.75x`, daño `0.82x`, visión `105 m`.
  - `hard` (*Difícil*): reacción `260 ms`, dispersión `0.92x`, daño `1.0x`, visión `145 m` y uso táctico de derrapes (`slide`).
- **Navegación y Decisiones:** Desembarco escalonado hacia POIs aleatorios, rotación hacia el centro de la tormenta, búsqueda de cruces seguros del río por puentes o vados (`resolveRiverCrossingWaypoint`), apertura automática de puertas cerradas cercanas, recolección priorizada de armas/munición/curaciones en su misma cota (`±4 m`), curación autónoma bajo cobertura, combate con *strafing* lateral a distancia óptima por arma, detección de atascos (`stuckTimer`) con salto/evasión y escape hacia la orilla si su aliento en el agua baja de `55`.

### Interfaz (HUD) y Optimización de Rendimiento (`60 FPS`)
- **Elementos Activos del HUD:** Minimapa circular `176×176` con terreno pre-horneado, barrido radar, cono de visión, ruta de la aeronave y círculos blanco/púrpura de tormenta; pastillas superiores `VIVOS` y `BAJAS`; `killfeed` contextual por causa de muerte; banners dinámicos de aeronave/altitud/velocidad y alerta de tormenta; mira central adaptable + hitmarker (normal y crítico) + superposición de **Óptica Cóndor 8X** para el francotirador; números de daño flotantes proyectados de 3D a 2D; barra temporal de salud del enemigo/animal impactado; aviso contextual `[E]` para puertas y botín; barras de salud, aliento, curación canalizada y recarga; contadores de botiquines/vendas y **8 casillas de armas (`0`–`7`)** con silueta SVG dinámica.
- **Técnicas de Optimización WebGL Aplicadas:**
  - **`THREE.InstancedMesh` masivo:** agrupa palmas de cera (troncos y copas), árboles de niebla, arbustos de sigilo, cafetos, helechos, hierba alta, peñascos andinos, cantos rodados, espuma del río, muros de piedra, sacos de café, barriles, carretas, cercas, troncos caídos, mobiliario interior (camas, mesas, sillas, alacenas, cuadros, lámparas) y las 44 nubes volumétricas, animando el viento directamente en el *vertex shader* (`onBeforeCompile`).
  - **Cobertura vegetal por bloques (`GroundCover`):** genera matas de pasto y flores bajo demanda en celdas de `24 m` (`<= 2` celdas/frame) solo a `< 72 m` del jugador y libera las lejanas (`> 200 m`).
  - **Fusión espacial de geometrías estáticas:** `mergeStaticStructures()` consolida muros, techos, cimientos, puentes, monumento y partes estáticas del AH-64D por material en celdas de `64 m`, congelando matrices (`matrixAutoUpdate = false`); `armasV1.js` y `avionesShared.js` hornean sub-mallas rígidas por material y cachean geometrías/materiales en memoria compartida protegida contra `dispose()` prematuro.
  - **Object Pooling y Cero Basura (GC) en `animate()`:** pools preasignados para humo, fuego, chispas, 190 cenizas/pavesas del impacto, trazadores balísticos, ondas de agua, polvo de derrape y partículas de curación, reutilizando vectores/matrices temporales a nivel de módulo.
  - **Precalentamiento Adaptativo de GPU y Presupuesto de Render:** `warmUpGpu()` (`renderer.compile`) + `queueMapWarmUp()` (`6–48` objetos por fotograma según el tiempo de frame) eliminan tirones al saltar del avión o abrir el paracaídas; `updateRenderBudget()` limita luces puntuales activas a las `4` más cercanas y recorta sombras/objetos pequeños lejanos manteniendo **Frustum Culling** en GPU y simulación de movimiento 100% desacoplada de la cámara.

---

## 5. Pendientes, Bugs Conocidos y Siguientes Pasos

1. **Depuración de subcarpetas de referencia dentro de `"Modelos 3D/"` (Optimización de Repositorio):**
   - Las subcarpetas `Modelos 3D/Animación v1/create-detailed-3d-models.zip`, `Modelos 3D/Animación v2/create-detailed-3d-models/`, `Modelos 3D/Armas v1/generate-threejs-weapon-models/` y `Modelos 3D/Aviones v1/generate-3d-aircraft-models/` son visores independientes en React/TypeScript/Vite usados como referencia de autoría (excluidos en `eslint.config.js` con `'Modelos 3D/*/**'`). El juego en producción solo importa los archivos `.js` y `.json` ubicados directamente en la raíz de `Modelos 3D/`. Extraer esas subcarpetas de referencia a un repositorio/directorio externo de herramientas reducirá notablemente el peso del repositorio.
2. **Limpieza de código legado (*dead code*) tras las migraciones a `"Armas v1"` y `"Aviones v1"`:**
   - En `Modelos 3D/cocoraModels.js`, las funciones exportadas `createExternalAK47Mesh()` y `buildExternalHelicopterWreck()` quedaron sin consumidores activos tras integrarse `Modelos 3D/armasV1.js` y `Modelos 3D/ah64Wreck.js`.
   - En `client/js/player.js`, `createDetailedWeaponMesh()` delega inmediatamente todas las armas de fuego a `createArmasV1WeaponMesh()`, por lo que los bloques procedurales antiguos debajo del bloque de `"fists"` (machete) ya no se ejecutan y pueden retirarse para simplificar el archivo.
   - En `client/js/world.js`, la especie `capybara` (*Chigüiro*) reutiliza actualmente el constructor visual `populateExternalTapirModel()` de `cocoraModels.js`; crear una malla dedicada de chigüiro alineará al 100% la silueta visual con su nombre en el servidor.
3. **5 aeronaves del catálogo `"Aviones v1"` disponibles sin conectar (Expansión de Gameplay):**
   - En `Modelos 3D/Aviones v1/generate-3d-aircraft-models/src/models/vehicles/` existen otros 5 modelos procedurales (`A10Warthog.ts`, `AH6LittleBird.ts`, `BiplaneScout.ts`, `F22Raptor.ts` y `Ka52Alligator.ts`) que pueden portarse en futuras iteraciones como entregas aéreas de suministros (*airdrops*), pasadas ambientales sobre el valle o helicópteros ligeros explorables.
4. **Mejoras Prioritarias de Red, Espectador y Escalabilidad Multijugador:**
   - **Suscripción cliente a `player_jumped`:** `server/room/playerActions.js` emite `player_jumped` al abrir paracaídas o saltar de la rampa, pero `client/js/network.js` aún no registra `s.on('player_jumped')` (resuelve el cambio de estado vía `world_tick`). Conectarlo permitirá disparar audio posicional 3D de apertura de paracaídas para jugadores remotos cercanos.
   - **Cámara de espectador interactiva:** Quienes ingresan con `joined_midgame` o mueren en partida quedan con cámara libre/estática; añadir cambio de cámara entre sobrevivientes (`Clic` / `[Espacio]` para seguir a jugadores vivos) mejorará la experiencia post-eliminación.
   - **Reconciliación explícita de posición del jugador local:** Si el servidor recorta el avance de un cliente mediante `consumeMoveBudget` (por pérdida brusca de paquetes en Wi-Fi), el servidor corrige `p.x / p.z` internamente pero el cliente local no reconcilia su propia coordenada desde `world_tick`; agregar reconciliación suave cuando la divergencia supere un umbral (`> 2.5 m`) evitará desincronizaciones puntuales.
   - **Soporte Multi-Sala (`RoomManager`):** `server/index.js` instancia actualmente una única sala global (`const room = new GameRoom(io)`). Encapsular múltiples instancias de `GameRoom` por código de sala permitirá varias partidas simultáneas en un mismo servidor.
5. **Actualización de `README.md`:**
   - `README.md` conserva referencias a la versión previa de 5 armas (`1`–`5`) y sombras `1024×1024`; conviene sincronizarlo con `CONTEXTO.md` para reflejar los **8 slots (`0` Machete + `1`–`7` Armas v1)**, el selector `AC-130J` / `CH-47F`, el `AH-64D` siniestrado y la laguna nadable.
