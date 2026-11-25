# CONTEXTO.md — Arquitectura Técnica, Dirección de Arte Cel-Shaded y Optimización (`Batalla en el Cocora` v6.0)

## 1. Dirección de Arte Cel-Shaded / Low-Poly Orgánico y Sombras Dinámicas (`2048×2048`)
- **Materiales Toon con Contorno Estilizado:**
  - Textura escalonada compartida de 4 tonos (`getSharedToonGradient()` en `client/js/player.js`) aplicada sobre `THREE.MeshToonMaterial` y reforzada con oscurecimiento de borde (*rim outline*) en `onBeforeCompile` (`createCelToonMaterial` y `createWindFoliageMaterial` en `client/js/world.js`), además de contornos *inverted-hull* (`THREE.BackSide`) en el sombrero vueltiao, ruana, cabeza y mochila del personaje y en las letras del monumento.
- **Sombras Solares Cálidas (`PCFSoftShadowMap` `2048×2048`):**
  - `DirectionalLight` cálida (`#fff2c4`, intensidad `1.48`) con `shadow.mapSize = 2048×2048`, `shadow.bias = -0.00045`, `shadow.normalBias = 0.032` y frustum ortográfico local (`±92 m`) centrado dinámicamente en el jugador.
  - `castShadow` y `receiveShadow` habilitados en el terreno, casas paisas, puentes arqueados de piedra, palmas de cera, cercas, rocas, animales, el helicóptero estrellado, el monumento COCORA y los personajes.
- **Niebla Atmosférica Andina (`THREE.FogExp2`):**
  - Neblina gris-azulada suave (`#b6d0e4`, densidad base `0.00155`) que aporta profundidad a las montañas lejanas del Valle del Cocora y transiciona suavemente hacia niebla púrpura oscura (`#261338`, hasta `0.0265`) con partículas flotantes al acercarse o entrar en la tormenta.

## 2. Diseño del Escenario y Monumento `"COCORA"` con Cóndor
- **Monumento 3D `"COCORA"` + Escultura de Cóndor Andino (`shared/mapData.js`, `client/js/world.js`):**
  - Ubicado en la colina prominente central (`x = 4, z = -88`) conectada por sendero empedrado, con basamento escalonado transitable, letras monumentales 3D **`C-O-C-O-R-A`** (`4.4 m` de alto con contorno cel-shaded) y una escultura de **Cóndor Andino con las alas desplegadas (`5.2 m` de envergadura)** posado sobre la letra **`"R"`**, acompañado de cóndores vivos planeando en círculos sobre el valle.
- **Palmas de Cera Esbeltas, Río con Espuma y Puente Arqueado de Piedra:**
  - Palmas de Cera de tronco curvo con `11` segmentos anillados y `16` frondas arqueadas mecidas por viento en GPU (`InstancedMesh`).
  - Río azul-turquesa animado con rocas en el cauce rodeadas de anillos de **espuma blanca animada** (`riverFoam` en `InstancedMesh`) y **4 puentes arqueados de piedra** con arcos de mampostería, pretiles y rampas niveladas sin hundimientos (`Math.max(WATER_LEVEL + 2.4, Math.max(izq, der) + 1.2 m)`).

## 3. Puntos de Interés Tácticos, Puertas/Cristales Dinámicos e Interiores
- **Pueblo Paisa de 2 y 3 Niveles sin Huecos:**
  - Terrazas niveladas sobre `maxFootprintH` con cimiento/zócalo macizo de piedra, fachadas blancas/crema, balcones de madera torneada y techos inclinados de teja de barro.
  - **Puertas interactivas y destructibles (`map.doors`):** Abrir/cerrar con **`E`** (`player_interact_door` -> `door_state_changed`, giro suave interpolado y habilitación/deshabilitación del colisionador) o destruir a disparos (`90 HP`, astillas de madera recicladas del *Object Pool*). Los bots también abren puertas cerradas automáticamente.
  - **Ventanas de cristal rompibles (`map.windows`):** Paneles translúcidos que estallan en fragmentos brillantes (`window_broken`) al recibir disparos o al atravesarlas mediante *Parkour Vaulting*.
  - **Interiores variados en `InstancedMesh`:** Camas con cobija paisa, mesas, sillas, alacenas, cuadros en las paredes, lámparas colgantes e iluminación interior cálida (`PointLight`).
- **Helicóptero Militar Estrellado en Llamas y Cráter de Explosión:**
  - Restos de helicóptero verde militar partido en dos secciones en la explanada central (`x = 8.2, z = -33.5` cabina inclinada con aspas dobladas y `x = -1.4, z = -29.2` cola separada), emitiendo humo oscuro ascendente, llamas y chispas desde el **Object Pool** (`220` partículas reutilizables).
  - **Cráter profundo de explosión** frente al pueblo (`x = 2, z = 2`, superficie quemada `SURFACE.SCORCHED_EARTH` y anillo de rocas) como trinchera natural con suministros.
  - **Cercas de madera con postes de piedra** a lo largo de los senderos, cafetales con granos rojos, helechos y troncos partidos.

## 4. Personaje Paisa, Parkour (*Vaulting*) y Dinámicas de Juego
- **Avatar Paisa Detallado (`client/js/player.js`):** Sombrero vueltiao trenzado blanco/negro, **ruana/poncho blanco con franjas negras**, pantalón oscuro, botas tácticas y **mochila militar verde** en la espalda.
- **Parkour *Vaulting* (`W + Espacio`):** `findVaultableObstacle()` detecta cercas, muros bajos, rocas, troncos y marcos de ventanas (`0.42 m – 1.38 m`); ejecuta un salto fluido de `0.42 s` apoyando la mano izquierda y pasando las piernas de lado sin perder impulso (rompiendo el cristal si salta por una ventana cerrada).
- **Looteo Automático y Contextual `[E]`:** Munición y consumibles se recogen automáticamente al pasar cerca (`<= 1.75 m`), mientras que apuntar o acercarse (`<= 3.45 m`) muestra **`[E] RECOGER FUSIL ANDINO AK-47`** / **`[E] RECOGER BOTIQUÍN`** sobre la barra de salud para recolección manual inmediata (`player_pickup`).
- **Caída de ~10 s, Daño por Caída (`>3.2 m`), Curación de `2.0 s` y Oso Letal:** Avión a `196 m` (~`10 s` de caída libre antes del paracaídas a `25 m`), daño real al saltar desde segundos pisos (`3.6 m+`), puentes altos o barrancos, curación canalizada de `2.0 s` con animación a dos manos y Osos de Anteojos que infligen **`42 HP`** por ataque.

## 5. Interfaz HUD de Referencia y Rendimiento a 60 FPS
- **HUD Exacto (`client/index.html`, `client/style.css`, `client/js/main.js`):**
  1. **Superior izquierda:** Minimapa circular con radar, norte, río turquesa, monumento COCORA, zona púrpura de tormenta y flecha direccional con cono de visión.
  2. **Superior derecha:** Contadores limpios `VIVOS: X` y `BAJAS: X` junto al botón de audio.
  3. **Centro:** Mira finísima de 4 líneas abiertas + punto central (`#crosshair`) y aviso `[E] RECOGER...` sobre la barra de salud.
  4. **Centro inferior:** Barra de **SALUD** verde brillante con contorno oscuro y contador `85/100` + chips de botiquín/vendas.
  5. **Inferior derecha:** Panel de arma con nombre en mayúsculas (ej. `FUSIL ANDINO AK-47`), silueta SVG dinámica, barra de carga y contador grande `25/75`.
- **Cero Asignaciones en `animate()`:** `21` lotes `THREE.InstancedMesh`, `220` partículas y `36` trazadores en *Object Pool*, y liberación profunda `disposeObjectTree()` al reiniciar partida.
