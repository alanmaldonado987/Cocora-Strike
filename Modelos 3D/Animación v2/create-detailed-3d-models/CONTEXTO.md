# CONTEXTO — Cocora 3D (Taller de Modelos + Modo Juego)

Registro técnico de lo construido. Stack: **React 19 + Vite 7 + Tailwind 4 + three r187 + @react-three/fiber 9 + drei 10 + zustand 5**.
El build (`npm run build`) genera un **único `dist/index.html` estático** (vite-plugin-singlefile).

> **Sobre las rutas pedidas** (`client/js/player.js`, `client/js/world.js`, `shared/mapData.js`, `server/gameRoom.js`…): este proyecto no usa esa estructura cliente/servidor. Cada pilar se implementó en su equivalente:
>
> | Pedido | Implementado en |
> |---|---|
> | `client/js/player.js` → `createDetailedAvatar` | `src/three/models/Character.tsx` + `character/parts.ts` + `character/rig.ts` |
> | Controlador del jugador | `src/game/Player.tsx` |
> | `client/js/world.js` / `main.js` | `src/three/models/FullScene.tsx`, `src/game/GameView.tsx` |
> | `shared/mapData.js` | `LAYOUT` en `FullScene.tsx` + `src/game/core.ts` (obstáculos, objetos, zona) |
> | `client/index.html` + `style.css` (HUD) | `src/game/HUD.tsx` (Tailwind) |

---

## 1. Personaje principal (réplica de la ilustración)

**Archivos:** `src/three/models/Character.tsx`, `src/three/models/character/parts.ts`, `src/three/models/character/rig.ts`

- **Altura 1,80 m** (1,81 m con sombrero). Medidas en `DIM`: cadera 0,965 m, muslo 0,45, espinilla 0,40, brazo 0,30, antebrazo 0,27.
- **Geometría estilizada:** perfiles torneados (`LatheGeometry`) para torso, cintura, brazos, muslos y pantorrillas (con gemelo); esferas escaladas para cráneo, mandíbula y articulaciones; botas `ExtrudeGeometry` (perfil lateral con puntera) + **suela marcada con 7 tacos**, caña y cordones.
- **Sombrero vueltiao:** ala torneada que **sube en el borde** (perfil antihorario => normales correctas) y copa abombada; **textura canvas de "pintas" en bandas** (zigzag, rombos, dientes, franjas negras) con fibra trenzada; **cinta oscura** en la copa.
- **Ruana:** dos paneles (delante/detrás) generados como **cascarón paramétrico con grosor real de 12 mm** (`shellGeometry`): caen desde la línea de hombros hasta medio muslo, quedan **abiertos a los lados** para los brazos, con **franjas negras triples** abajo, franjas verticales laterales y **45 flecos** por panel. Los paneles se balancean con la zancada.
- **Mochila táctica** oliva (`#556b2f` / `#4b5320`): cuerpo redondeado (`RoundedBoxGeometry`), tapa superior y frontal, **2 correas negras con hebillas**, **2 bolsillos con solapa**, 2 bolsillos laterales, saco de dormir con amarres. **Tirantes** extruidos a lo largo de una curva calculada sobre la superficie de la ruana (pasan por encima de ella hasta el pecho) + cinta de esternón.
- **Rostro:** piel cálida, ojos con iris, **cejas definidas**, nariz, orejas, **barba corta, bigote y patillas**, pelo bajo el sombrero.
- **Manos articuladas:** palma + 4 dedos de 2 falanges + pulgar, cerrados en puño de agarre.

### Rigging jerárquico
```
root → hips (pelvis, cinturón)
        ├─ hipL → kneeL → ankleL (bota)      ├─ hipR → kneeR → ankleR
        └─ spine (cintura)
             ├─ weaponMount (AK-47 + fogonazo)   ├─ botiquín de curación   ├─ paracaídas
             └─ chest (torso, cuello de ruana, ruana F/B, mochila, tirantes)
                  ├─ neck → head (rostro, sombrero)
                  ├─ shoulderL → elbowL → handL      └─ shoulderR → elbowR → handR
```
- **IK analítico de 2 huesos** (`solveArm`) con vector polo por estado: **mano derecha en la empuñadura, izquierda en el guardamanos** (error < 3 cm verificado por pruebas en los 9 estados con fusil).
- **Mezcla suave:** amortiguación exponencial independiente del framerate (`dampPose`, k=16 en locomoción, 9 en el resto); el montaje del arma usa `lerp` + `slerp`; las manos interpolan al cambiar de modo (rifle/paracaídas/curación).
- **Cero asignaciones** en el bucle: vectores, cuaterniones y matrices temporales a nivel de módulo.

### Estados de animación (`CharState`)
| Estado | Detalle |
|---|---|
| `idle` | guardia baja, respiración del pecho y mochila, balanceo de rodillas |
| `aim` | postura escalonada, giro de pecho, mejilla en la culata, *aimPitch* |
| `walk` / `sprint` | ciclo completo cadera-rodilla-tobillo (despegue de puntera), rebote y giro de pelvis, torso inclinado al correr, fusil cruzado (*high port*), ruana/mochila balanceándose |
| `jump` | anticipación (visor), rodillas recogidas según `vy` |
| `fall` | caída libre en posición de paracaidista |
| `parachute` | manos en las bandas, piernas colgando, dosel a rayas con cuerdas |
| `vault` | pose de la referencia: pierna flexionada sobre la cerca, la otra impulsando, torso inclinado lateralmente; 0,45 s, mezclado con el sprint por `sin(πp)` |
| `slide` | cadera baja, torso atrás, pierna delantera extendida y trasera flexionada; polvo; se puede disparar |
| `heal` | 2 s, botiquín entre ambas manos, partículas verdes ascendentes |
| disparo | retroceso del arma hacia el hombro + cabeceo + fogonazo con luz puntual |

En el visor se ven como **11 variantes** del modelo "Campesino armado".

## 2. Estilo cel-shading (todo el proyecto)
**Archivo:** `src/three/toon.tsx`
- `MeshToonMaterial` con **rampa de 4 tonos** (`DataTexture`, filtro *nearest*).
- **Contorno de grosor constante en píxeles**: casco invertido (`BackSide`) desplazado en espacio de pantalla vía `onBeforeCompile`, con **normales soldadas** (`mergeVertices`) para que no se abra en aristas duras; compatible con `InstancedMesh`.
- `ToonCtx` permite alternar **Cel-shading / PBR** desde el panel; `Prim` (todas las primitivas) y `TP` (personaje) lo respetan.
- Los contornos llevan `noExport`/`noCap` (no se exportan ni interfieren con las tapas de corte). Al exportar, los materiales toon se convierten a `MeshStandardMaterial`.
- `OutlineMinCtx`: en el juego el entorno solo contornea piezas ≥ 25 cm (rendimiento).

## 3. Escenario, sombras y niebla
- **Sombras:** luz solar cálida, `mapSize 2048²`, `bias -0.0004`, `normalBias 0.04`, `radius 3`, **frustum de ±22 m que sigue al jugador**. *Nota:* en three r187 `PCFSoftShadowMap` fue retirado (redirige a `PCFShadowMap`, que ya filtra suave), así que se usa `PCFShadowMap` + `shadow.radius`.
- **Niebla `FogExp2`** gris-azulada que **transiciona a púrpura densa** al acercarse/entrar en la tormenta (y se aclara con la altitud durante el salto). Cúpula de cielo lavanda y cordillera brumosa de fondo.

## 4. Valle del Cocora
- **Monumento COCORA:** texto 3D biselado, **sendero empedrado** y **escultura de cóndor con alas desplegadas sobre la R**; 3 cóndores vivos planeando.
- **Palmas de cera:** `PalmField` con **`InstancedMesh`** (tronco anillado, base, cogollo y copas de 19 frondas por semilla) con contorno instanciado y **vaivén por viento** actualizado por instancia sin asignaciones.
- **Río** turquesa animado y **puente de piedra en arco** nivelado (tablero a +1,06 m, conectado a ambas orillas; transitable en el juego).
- **Pueblo:** casas de 1–2 pisos con **zócalo apoyado en el punto más alto de su huella** (`houseBase`) → sin huecos con el terreno.
- **Helicóptero** partido con fuego/humo (pool fijo de esferas reutilizadas), **cráter** con anillo de rocas expulsadas, cercas con pilares de piedra, cafetos, oso de anteojos.

## 5. Modo juego (un jugador)
**Archivos:** `src/game/core.ts`, `Player.tsx`, `GameView.tsx`, `fx.tsx`, `HUD.tsx`
- **Salto desde avión a 195 m**: gravedad 15,5 m/s², velocidad terminal 22 m/s ⇒ **~10 s de caída libre** (verificado en prueba). `Espacio` abre el paracaídas (descenso 4,2 m/s). **Daño por caída** sin paracaídas: `(impacto − 13) × 4,2`.
- **Controles:** WASD, `Shift`+W correr, `Espacio` saltar / **vaulting** (al correr frente a cerca, rocas bajas o la cola del helicóptero; 0,45 s sin perder velocidad), `C`/`Ctrl` **derrape**, `H` **curar 2 s** (+40 HP, consume botiquín), `E` recoger botiquín (máx. 3), munición con **auto-pickup**, clic disparar (600 RPM, hitscan por marcha de rayo), clic derecho apuntar, `R` recargar (1,6 s).
- **Colisiones** círculo vs. cajas orientadas (casas, helicóptero, monumento, cerca, rocas, palmas, pretiles).
- **Osos de anteojos (IA):** deambulan; se **provocan** al recibir un disparo o si te acercas a < 2,6 m; cargan a 4,3 m/s (más lento que tu sprint) y dan un **zarpazo de 40 HP** (cooldown 1,4 s); 150 HP; matar uno suma **BAJAS**.
- **Tormenta:** zona segura que se encoge de 34 m a 9 m (empieza a los 25 s), 3 HP/s fuera; muro púrpura visible.
- **VIVOS:** empieza en 14 y baja con eliminaciones simuladas; ganas al quedar 1.
- **Object pooling:** 420 partículas en **un solo `InstancedMesh`** en anillo (polvo, humo, chispas, curación, sangre, astillas, agua) + 40 **trazadores** instanciados. Audio procedural WebAudio (sin archivos).

## 6. HUD (calcado de la referencia)
Minimapa (terreno, río, sendero, casas, monumento, tormenta púrpura, flecha, osos cercanos) + `VIVOS/BAJAS` arriba a la izquierda; `VIVOS/BAJAS` + botón de audio arriba a la derecha; mira central; aviso `[E] RECOGER BOTIQUÍN` y barra verde **SALUD 85/100**; panel **FUSIL ANDINO AK-47** con silueta y munición **25/75**. Valores iniciales idénticos a la imagen. Extras: caída/altitud, aviso de tormenta, barra de curación/recarga, viñeta de daño, menú/pausa/fin.

## 7. Rendimiento
- Medido: escena completa ≈ 700 mallas; personaje 129 mallas / 57 k triángulos. En el juego el entorno reduce contornos a piezas grandes.
- Sin `new THREE.*` dentro de los bucles de animación (personaje, jugador, partículas, palmas, osos).

## 8. Red / Socket.IO — **no aplicable en este build**
El entregable es un HTML estático de un solo archivo: **no hay servidor** donde ejecutar `server/index.js`/`gameRoom.js`, así que no existe sincronización Socket.IO que verificar. El modo juego es **un jugador** con rivales simulados. Para hacerlo multijugador: un servidor Node + Socket.IO autoritativo que reciba `{pos, bodyYaw, CharCtrl}` a ~20 Hz y reenvíe a la sala; en el cliente, un `Character` por jugador remoto alimentado con su `CharCtrl` interpolado (la API ya está desacoplada para ello).

## 9. Pendiente / fuera de alcance en esta iteración
- **Interiores amoblados, puertas con `E` y ventanas rompibles:** las casas siguen siendo volúmenes sólidos (no hay interiores transitables).
- Controles táctiles para móvil.

## 10. Pruebas (`npx vitest run`)
59 pruebas: render/animación de los 15 modelos y todas sus variantes, gestor de cortes y explosionado, exportación OBJ/STL/GLB, **agarre IK por estado**, altura del personaje, contornos toon vs PBR, colisión y vaulting de la cerca, puente nivelado, zona que se encoge, **simulación de caída libre de ~10 s con daño** y aterrizaje con paracaídas.
