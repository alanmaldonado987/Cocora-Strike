import * as T from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export const heroDirection = new T.Vector3(1.35, 0.39, 0.69).normalize();

export function studioLighting(scene: T.Scene, renderer: T.WebGLRenderer) {
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const pmrem = new T.PMREMGenerator(renderer),
    room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.43;
  scene.add(new T.HemisphereLight(0xcbd9eb, 0x3d4146, 0.55));
  const key = new T.DirectionalLight(0xf6f2e9, 3.05);
  key.position.set(-4, 7, 5);
  scene.add(key);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {
    left: -7,
    right: 7,
    top: 7,
    bottom: -7,
    near: 0.1,
    far: 37,
  });
  key.shadow.normalBias = 0.012;
  key.shadow.bias = -0.00025;
  key.shadow.radius = 3;
  const rim = new T.DirectionalLight(0xbecde3, 1.26);
  rim.position.set(2, 3, -7);
  scene.add(rim);
  const fill = new T.DirectionalLight(0xc8d3e0, 0.4);
  fill.position.set(7, 1, 4);
  scene.add(fill);
  return { environment, key };
}

export function studioFloor() {
  const group = new T.Group();
  const plane = new T.Mesh(
    new T.PlaneGeometry(140, 140),
    new T.ShadowMaterial({ opacity: 0.25, depthWrite: false }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.018;
  plane.receiveShadow = true;
  group.add(plane);
  const grid = new T.Mesh(
    new T.PlaneGeometry(140, 140),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader:
        "varying vec2 p; void main(){vec4 wp=modelMatrix*vec4(position,1.);p=wp.xz;gl_Position=projectionMatrix*viewMatrix*wp;}",
      fragmentShader: `varying vec2 p;
      void main(){vec2 cell=p/1.04;vec2 g=abs(fract(cell-.5)-.5)/fwidth(cell);
      float line=1.-min(min(g.x,g.y),1.);float fade=exp(-dot(p,p)*.0068);
      gl_FragColor=vec4(.54,.56,.58,line*fade*.16);}`,
    }),
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = -0.019;
  group.add(grid);
  const shadow = new T.Mesh(
    new T.PlaneGeometry(4.6, 8.5),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader:
        "varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec2 v;void main(){vec2 p=(v-.5)*2.;gl_FragColor=vec4(.015,.016,.018,exp(-5.4*dot(p,p))*.52);}",
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.016;
  group.add(shadow);
  return { group, grid, shadow };
}

// Fit projected vertices, not a bounding sphere: long wings and tandem rotors stay in frame.
export function frameObject(
  root: T.Object3D,
  aspect: number,
  fov: number,
  thumbnail = false,
  fleet = false,
  direction?: T.Vector3,
) {
  root.updateWorldMatrix(true, true);
  const dir =
    direction?.clone().normalize() ??
    (fleet ? new T.Vector3(0.24, 0.8, 1).normalize() : heroDirection.clone());
  const right = new T.Vector3(0, 1, 0).cross(dir).normalize(),
    up = dir.clone().cross(right).normalize();
  const projected: T.Vector3[] = [],
    bounds = new T.Box3(),
    p = new T.Vector3();
  root.traverseVisible((o) => {
    if (!(o instanceof T.Mesh)) return;
    const pos = o.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i += pos.count > 1000 ? 5 : 2) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const q = new T.Vector3(p.dot(right), p.dot(up), p.dot(dir));
      projected.push(q);
      bounds.expandByPoint(q);
    }
  });
  const center = bounds.getCenter(new T.Vector3());
  const tan = Math.tan(T.MathUtils.degToRad(fov * 0.5));
  const fracX = thumbnail ? 0.96 : 0.91,
    fracY = thumbnail ? 0.96 : aspect < 1 ? 0.64 : 0.79;
  let d = 0;
  for (const p of projected)
    d = Math.max(
      d,
      Math.abs(p.x - center.x) / (tan * aspect * fracX) + p.z - center.z,
      Math.abs(p.y - center.y) / (tan * fracY) + p.z - center.z,
    );
  const target = right
    .multiplyScalar(center.x)
    .addScaledVector(up, center.y + (thumbnail ? 0 : d * tan * 0.055))
    .addScaledVector(dir, center.z);
  return { target, position: target.clone().addScaledVector(dir, d) };
}
