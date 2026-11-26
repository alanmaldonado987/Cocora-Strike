import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { BuiltModelResult } from "./types";

// Keep the authoring tree and every animated pivot. Only opaque leaves sharing
// a material and a rigid parent space get an additional, batched draw mesh.
export function prepareRenderBatches(model: BuiltModelResult) {
  if (model.group.userData.batched) return;
  model.group.updateWorldMatrix(true, true);
  const pivots = new Set<T.Object3D>([
    ...model.animatedParts.map((p) => p.object),
    ...(model.controller?.dynamicObjects ?? []),
  ]);
  const buckets = new Map<
    string,
    { anchor: T.Object3D; meshes: T.Mesh[]; material: T.Material }
  >();
  model.group.traverse((o) => {
    if (
      !(o instanceof T.Mesh) ||
      o instanceof T.InstancedMesh ||
      o.children.length ||
      pivots.has(o) ||
      Array.isArray(o.material) ||
      o.material.transparent
    )
      return;
    let anchor = o.parent!;
    while (
      anchor.parent &&
      anchor.parent.userData.partCategory === o.userData.partCategory &&
      !pivots.has(anchor)
    )
      anchor = anchor.parent;
    const key = `${anchor.uuid}/${o.material.uuid}/${Object.keys(o.geometry.attributes).sort().join(",")}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { anchor, meshes: [], material: o.material };
      buckets.set(key, bucket);
    }
    bucket.meshes.push(o);
  });
  for (const { anchor, meshes, material } of buckets.values()) {
    if (meshes.length < 2) continue;
    const inverse = anchor.matrixWorld.clone().invert();
    const inputs = meshes.map((mesh) => {
      const geometry = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      geometry.applyMatrix4(
        new T.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld),
      );
      return geometry;
    });
    const geometry = mergeGeometries(inputs);
    inputs.forEach((g) => g.dispose());
    if (!geometry) continue;
    const batch = new T.Mesh(geometry, material);
    batch.name = `Surface pass: ${material.name || "paint"}`;
    batch.userData = {
      partCategory: meshes[0].userData.partCategory,
      baseMaterial: material,
      renderBatch: true,
    };
    batch.castShadow = true;
    batch.receiveShadow = true;
    anchor.add(batch);
    for (const mesh of meshes) {
      mesh.visible = false;
      mesh.userData.renderSource = true;
    }
  }
  model.group.userData.batched = true;
}
