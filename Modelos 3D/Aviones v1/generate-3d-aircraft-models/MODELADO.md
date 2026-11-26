# Aeroforge: modelos procedurales

Los ocho constructores se encuentran en `src/models/vehicles/`. Los puntos de entrada de `airplanes.ts`, `helicopters.ts` y el catálogo conservan su API. Cada constructor devuelve un `THREE.Group`, sus referencias animadas y el recuento de geometría de autoría.

## Construcción

- `surfaces.ts`: fuselajes por secciones interpoladas, carenados, perfiles alares, geometrías de revolución y normales continuas en la costura UV.
- `cockpits.ts`: aperturas en la piel, cristales físicos con opacidad 0,35, marcos, asientos, tripulantes, palancas y consolas emisivas. En las cabinas integradas, los paños de vidrio sustituyen a la superficie metálica.
- `propulsion.ts`: palas torsionadas con estrechamiento y punteras pintadas por vértice, góndolas perfiladas y bujes de revolución.
- `finish.ts` y `details.ts`: atlas procedural compartido, remaches, juntas, marcas conformadas a la piel, compuertas, rejillas y antenas.
- `renderBatches.ts`: agrupación de superficies opacas por material, componente y pivote. La geometría de autoría permanece en su jerarquía; el visor dibuja las agrupaciones en lugar de duplicar las superficies.

Cada unidad conserva sus seis grupos funcionales y la orientación longitudinal +Z. Los rotores y hélices mantienen sus ejes, velocidades y pivotes. Las rampas conservan su pose original: el proyecto de partida no incluía una secuencia animada de apertura ni una simulación de disparo.

## Comprobación

```sh
npm install
npm run dev
```

```sh
node scripts/verify-models.mjs
npx tsc --noEmit
npm run build
```

La prueba de modelos comprueba los ocho constructores, sus 24 referencias animadas, índices válidos, atributos finitos, materiales PBR, cabinas transparentes y categorías completas. También comprueba que la agrupación no cambie los triángulos ni las transformaciones mundiales de los pivotes. Los recuentos del inspector corresponden a los modelos de autoría, no a una estimación de FPS.

Las imágenes de `public/previews/` son renderizados de los propios modelos. `scripts/render-assets.ts` permite regenerarlas en un navegador con WebGL 2. No se necesitan modelos, texturas ni fuentes remotas para ejecutar el visor.