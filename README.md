# Batalla en el Cocora — Battle Royale 3D Low-Poly (Colombia · LAN)

Battle Royale multijugador en 3D con estética **Low-Poly Estilizada y Orgánica**, proporciones métricas realistas (**personaje de `1.80 m`**) y ambientación colombiana en el **Valle del Cocora y Salento (Quindío)**. Funciona al **100% en el navegador a 60 FPS** con cero assets externos (geometrías procedurales Three.js, shaders de viento en GPU y sintetizador Web Audio API).

---

## Características Principales

- **Optimización Extrema Three.js (60+ FPS Estables y Cero Fugas WebGL):** Importación limpia por `importmap` local, **14 lotes `THREE.InstancedMesh`** (vegetación, rocas, 6 tipos de coberturas tácticas y las 44 nubes), **Object Pooling** de partículas/trazadores con cero asignaciones `new THREE.*` en `animate()`, sombras locales `1024×1024` centradas en el jugador, limpieza profunda `dispose()` al reiniciar ronda y servidor autoritativo a **`20 Hz`** desacoplado con interpolación `Vector3.lerp` + `Quaternion.slerp`.
- **Estética Low-Poly Orgánica, Nivelación Exacta y Cobertura Táctica:** Terreno continuo de **`640 × 640 metros`** con terrazas niveladas y cimientos macizos de piedra bajo **25 edificios de 1, 2 y 3 pisos + azoteas transitables**, **4 puentes elevados** con rampas continuas sobre el Río Quindío, **6 casas en ruinas**, **3 cuevas rocosas iluminadas** y **6 categorías de cobertura táctica sólida** (muros bajos de piedra/adobe, sacos de café, barriles, carretas cafeteras, cercas y troncos caídos).
- **Naturaleza Exuberante y Tormenta Opresiva:** Más de **1,900 instancias** en distribución aleatoria orgánica (cero cuadrículas), **Palmas de Cera frondosas de 16 hojas**, **44 nubes dispersas al azar**, arbustos altos de sigilo (`C`) y **neblina dinámica de tormenta (`THREE.FogExp2`)** con partículas flotantes y viñeta progresiva.
- **Caída Libre de 10 Segundos (~200 m) y Daño por Caída:** Despliegue aéreo a **`198 m`** sobre el valle con **~10 segundos completos de caída libre** (`~16–17.5 m/s`) antes de abrir el paracaídas automáticamente a **`25 m`** del suelo (el paracaídas anula el daño; caídas libres en tierra `>4.5 m` aplican daño progresivo `10–65 HP` y `>14 m` son letales).
- **Arsenal Completo de 5 Armas + Curación Canalizada (2.0 s):**
  1. **Pistola Táctica 9mm** (`1`) — Semiautomática precisa y recarga rápida.
  2. **Escopeta de Corredera** (`2`) — Cono de 8 perdigones devastador a corta distancia.
  3. **Subfusil SMG** (`3`) — Alta cadencia de fuego y máxima movilidad.
  4. **Fusil de Asalto AK/M4** (`4`) — Equilibrado para media y larga distancia.
  5. **Rifle de Francotirador** (`5`) — Daño crítico letal y **Mira Telescópica 8X** (`Clic Derecho`).
  - **Botiquín** (`+50 HP`, `H`) y **Vendas Rápidas** (`+20 HP`, `G`/`Q`): canalización de **`2.0 segundos`** con animación 3D de vendaje a dos manos, barra de progreso en HUD, partículas verdes y cancelación si esprintas o disparas.
- **Bots Configurables y Fauna Silvestre Letal:** Selector en el Lobby de dificultad (**Fácil por defecto**, Normal, Difícil) y cantidad de bots (**`0` a `8`**), además de **Osos de Anteojos reforzados (`185 HP`, `42 dmg`, triple botín de alto valor)**, Jaguares, Chigüiros y Cóndores.

---

## Instalación y Ejecución Rápida

1. Instala **Node.js v18+**.
2. Instala las dependencias en la carpeta del proyecto:
   ```bash
   npm install
   ```
3. Inicia el servidor:
   ```bash
   npm start
   ```
4. Abre tu navegador en **`http://localhost:3000`**.

Para usar un puerto distinto (por ejemplo `8080`):
- **PowerShell (Windows):**
  ```powershell
  $env:PORT=8080; npm start
  ```
- **Linux / macOS:**
  ```bash
  PORT=8080 npm start
  ```

---

## Cómo Jugar en Red Local (Wi-Fi / LAN) con Amigos

El servidor escucha automáticamente en **`0.0.0.0`** (todas las interfaces de red) y detecta tu dirección IPv4 local al arrancar:

1. **Conecta todas las computadoras a la misma red Wi-Fi o cableada (LAN).**
2. En la computadora anfitriona (Host), ejecuta `npm start`. Verás en la terminal un bloque como este:
   ```text
   -> En esta computadora:    http://localhost:3000
   -> En tu Red Wi-Fi / LAN:  http://192.168.1.45:3000  (Wi-Fi)
   ```
   *(Esta misma dirección aparece también arriba en la pantalla del Lobby).*
3. **Permiso en el Firewall de Windows (si otros equipos no cargan la página):**
   - Al ejecutar `npm start` por primera vez, acepta la ventana de **Firewall de Windows Defender** marcando **Redes privadas** (y públicas si tu Wi-Fi está configurado así).
   - O abre el puerto TCP `3000` ejecutando en PowerShell como Administrador:
     ```powershell
     New-NetFirewallRule -DisplayName "Batalla en el Cocora LAN" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
     ```
4. **En las demás computadoras de la casa/oficina**, abre Chrome, Edge o Firefox y entra directamente a la URL impresa (ej. `http://192.168.1.45:3000`).
5. Ingresen sus apodos: todos aparecerán en la misma **Sala de Espera**. Pueden elegir **0 Bots (Solo Humanos LAN)** o combinar jugadores reales con **Bots IA** en dificultad Fácil/Normal/Difícil.

---

## Controles del Juego

| Acción | Tecla / Ratón |
| :--- | :--- |
| **Moverse** | `W` `A` `S` `D` o Flechas |
| **Parkour (*Vaulting*) / Saltar** | `W` + `Espacio` frente a cercas, rocas, troncos o ventanas |
| **Recoger Objeto / Abrir-Cerrar Puertas** | `E` (además de recolección automática de munición/consumibles) |
| **Sprint (Correr)** | `Shift` |
| **Agacharse / Sigilo en Arbustos** | `C` |
| **Derrape Táctico (*Slide*)** | `Shift + W` + `C` o `Ctrl` |
| **Saltar del Avión / Paracaídas Manual / Saltar** | `Espacio` o `F` |
| **Disparar / Atacar con Machete** | `Clic Izquierdo` |
| **Apuntar (ADS) / Mira Telescópica Sniper** | `Clic Derecho` (mantener) |
| **Seleccionar Armas de Fuego** | `1` Pistola · `2` Escopeta · `3` SMG · `4` Fusil · `5` Sniper *(o Rueda del ratón)* |
| **Equipar Machete Corto** | `0` o `` ` `` |
| **Recargar Arma** | `R` |
| **Usar Botiquín (+50 HP)** | `H` |
| **Usar Venda Rápida (+20 HP)** | `G` o `Q` |
| **Alternar Cámara (3ra Persona / 1ra Persona)** | `V` |
| **Nadar** | Entra al río y muévete con `W` `A` `S` `D`; `Shift` nada más rápido pero gasta el doble de aliento |
| **Silenciar / Activar Audio** | `M` o botón superior derecho |

### Nado y ahogamiento
- Con el agua por la cintura se **vadea** (más lento); en agua profunda se **nada** a flote, con el arma guardada (no se puede disparar, curar, agacharse ni saltar).
- Nadar gasta **aliento** (barra azul sobre la salud): ~25 s nadando normal, ~14 s nadando rápido. Fuera del agua se recupera en ~4 s.
- Con el aliento agotado te **ahogas**: pierdes 10 HP por segundo hasta salir del río.
