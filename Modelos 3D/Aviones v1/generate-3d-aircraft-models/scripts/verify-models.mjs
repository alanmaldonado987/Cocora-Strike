import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";

const require = createRequire(import.meta.url);
const baseline = JSON.parse(
  readFileSync(new URL("./fixtures/original-pivots.json", import.meta.url)),
);
const bundle = buildSync({
  stdin: {
    contents:
      "export { AIRCRAFT_CATALOG } from './src/models'; export { prepareRenderBatches } from './src/models/renderBatches'; export { Vector3 } from 'three';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
});
const module = { exports: {} };
new Function("exports", "require", "module", bundle.outputFiles[0].text)(
  module.exports,
  require,
  module,
);
const { AIRCRAFT_CATALOG, prepareRenderBatches, Vector3 } = module.exports;
assert.equal(AIRCRAFT_CATALOG.length, 8);
let total = 0,
  animations = 0;
for (const definition of AIRCRAFT_CATALOG) {
  const asset = definition.build(),
    categories = new Set(),
    original = baseline[definition.id];
  let crew = 0,
    glass = 0,
    tris = 0;
  assert.equal(asset.group.children.length, original.children);
  const pivots = asset.animatedParts.map((p) => ({
    axis: p.axis,
    speed: p.speed,
    mode: p.mode,
    pos: p.object.position.toArray(),
    rot: p.object.rotation.toArray(),
  }));
  assert.deepEqual(
    pivots,
    original.animations,
    `${definition.code}: animated pivot moved`,
  );
  asset.group.traverse((o) => {
    if (o.name === "Crew station") crew++;
    if (!o.isMesh) return;
    const g = o.geometry;
    for (const key of ["position", "normal", "uv"])
      assert.ok(
        g.attributes[key].array.every(Number.isFinite),
        `${definition.code}: non-finite ${key}`,
      );
    if (g.index)
      assert.ok(
        g.index.array.every((i) => i >= 0 && i < g.attributes.position.count),
      );
    assert.ok(
      o.material.isMeshStandardMaterial,
      `${definition.code}: non-PBR surface`,
    );
    if (o.material.name === "canopySmoke") {
      assert.equal(o.material.opacity, 0.35);
      assert.equal(o.material.depthWrite, false);
      glass++;
    }
    categories.add(o.userData.partCategory);
    tris +=
      ((g.index?.count ?? g.attributes.position.count) / 3) *
      (o.isInstancedMesh ? o.count : 1);
  });
  assert.equal(tris, asset.triangleCount);
  assert.ok(tris < 60000);
  assert.equal(categories.size, 6);
  assert.ok(crew > 0 && glass > 0);
  asset.group.updateWorldMatrix(true, true);
  const matrices = asset.animatedParts.map((p) =>
    p.object.matrixWorld.toArray(),
  );
  prepareRenderBatches(asset);
  asset.group.updateWorldMatrix(true, true);
  assert.deepEqual(
    asset.animatedParts.map((p) => p.object.matrixWorld.toArray()),
    matrices,
  );
  let visible = 0,
    renderedTris = 0;
  asset.group.traverseVisible((o) => {
    if (o.isMesh) {
      visible++;
      renderedTris +=
        ((o.geometry.index?.count ?? o.geometry.attributes.position.count) /
          3) *
        (o.isInstancedMesh ? o.count : 1);
    }
  });
  assert.equal(renderedTris, tris, "Batching lost or duplicated geometry");
  console.log(
    `${definition.code.padEnd(8)} ${String(tris).padStart(6)} triangles | ${asset.meshCount} authored meshes -> ${visible} draw meshes | ${pivots.length} pivots OK`,
  );
  if (asset.controller) {
    // Rig contract: doors, pistons, RPM and weapons react, then settle back.
    const c = asset.controller;
    const [ramp, door] = c.dynamicObjects;
    const rods = c.dynamicObjects.filter((o) => o.isMesh && o.material.name === "ac130Chrome");
    const rodClosed = rods.map((r) => r.scale.z);
    const spin0 = asset.animatedParts[0].object.rotation.z;
    const step = (n) => { for (let i = 0; i < n; i++) c.update(1 / 60); };
    for (const k of ["update", "setThrottle", "setDoorsOpen", "setFiring", "aimTurrets"]) assert.equal(typeof c[k], "function");
    c.setThrottle(1); c.setDoorsOpen(true); c.setFiring(true);
    c.aimTurrets(asset.group.localToWorld(new Vector3(4, 0, -1)));
    step(240);
    assert.ok(Math.abs(ramp.rotation.x + 0.7) < 0.01, "ramp did not open");
    assert.ok(door.rotation.y > 1.4, "door did not open");
    assert.ok(rods.length >= 3 && rods.every((r, i) => r.scale.z > rodClosed[i] + 0.02), "pistons did not extend");
    assert.ok(asset.animatedParts[0].object.rotation.z > spin0 + 50, "props did not spool");
    assert.ok(c.dynamicObjects.some((o) => o.position.z < -0.005), "no weapon recoil");
    c.setDoorsOpen(false); c.setFiring(false); c.setThrottle(0);
    step(600);
    assert.ok(Math.abs(ramp.rotation.x) < 1e-6 && Math.abs(door.rotation.y) < 1e-6, "doors did not close");
    rods.forEach((r, i) => assert.ok(Math.abs(r.scale.z - rodClosed[i]) < 1e-3, "piston did not retract"));
    console.log(`         rig OK: ramp, door, ${rods.length} pistons, RPM inertia, recoil`);
  }
  total += tris;
  animations += pivots.length;
}
console.log(
  `PASS: 8 models, ${total} triangles, ${animations} original animation pivots.`,
);
