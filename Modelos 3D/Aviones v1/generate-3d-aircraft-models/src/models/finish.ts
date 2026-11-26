import * as T from "three";
import { hullSampler, parametricPatch, type LoftStation } from "./surfaces";

let atlas: T.CanvasTexture | null = null;
const decals = new Map<string, T.MeshStandardMaterial>();

export function skinAtlas() {
  if (atlas || typeof document === "undefined") return atlas;
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#eeeeec";
  c.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 92;
  const rand = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
  const line = (x: number, y: number, x1: number, y1: number) => {
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x1, y1);
    c.strokeStyle = "#788083";
    c.lineWidth = 1.6;
    c.stroke();
    c.beginPath();
    c.moveTo(x + 1.6, y + 1.6);
    c.lineTo(x1 + 1.6, y1 + 1.6);
    c.strokeStyle = "#fafaf9";
    c.lineWidth = 1;
    c.stroke();
    const len = Math.hypot(x1 - x, y1 - y);
    for (let d = 7; d < len; d += 12) {
      const rx = x + ((x1 - x) * d) / len + ((y1 - y) / len) * 3.8,
        ry = y + ((y1 - y) * d) / len - ((x1 - x) / len) * 3.8;
      c.fillStyle = "#a0a4a4";
      c.beginPath();
      c.arc(rx, ry, 1.45, 0, Math.PI * 2);
      c.fill();
    }
  };
  for (let x = 0; x < 2048; x += 256) {
    for (let y = 0; y < 1024; y += 256) {
      const k = 231 + Math.floor(rand() * 6);
      c.fillStyle = `rgb(${k},${k},${k - 1})`;
      c.fillRect(x + 1, y + 1, 255, 255);
      if (rand() > 0.48) line(x, y + 156, x + 256, y + 156);
      if (rand() > 0.76) {
        c.strokeStyle = "#9a9e9e";
        c.lineWidth = 2;
        c.beginPath();
        c.roundRect(x + 26, y + 43, 84, 54, 6);
        c.stroke();
        c.fillStyle = "#aaaead";
        c.fillRect(x + 64, y + 47, 12, 3);
        for (let j = 0; j < 5; j++) {
          c.fillStyle = "#9a9f9e";
          c.fillRect(x + 32 + j * 12, y + 105, 7, 3);
        }
      }
    }
    line(x, 0, x, 1024);
  }
  for (const y of [0, 256, 512, 768]) line(0, y, 2048, y);
  for (let i = 0; i < 38000; i++) {
    c.fillStyle = `rgba(51,57,60,${rand() * 0.065})`;
    c.fillRect(rand() * 2048, rand() * 1024, 1.5, 1);
  }
  atlas = new T.CanvasTexture(canvas);
  atlas.colorSpace = T.SRGBColorSpace;
  atlas.wrapS = atlas.wrapT = T.RepeatWrapping;
  atlas.anisotropy = 4;
  return atlas;
}

export function marking(
  text: string,
  width: number,
  height: number,
  light = false,
) {
  const key = `${text}/${light}`;
  let material = decals.get(key);
  if (!material) {
    let map: T.CanvasTexture | null = null;
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = 768;
      canvas.height = 256;
      const c = canvas.getContext("2d")!;
      c.fillStyle = light ? "#c5c9bd" : "#262c2d";
      c.textAlign = "center";
      c.textBaseline = "middle";
      if (text === "insignia") {
        c.fillRect(60, 100, 648, 56);
        c.beginPath();
        c.arc(384, 128, 100, 0, Math.PI * 2);
        c.fill();
        c.globalCompositeOperation = "destination-out";
        c.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i * Math.PI) / 5 - Math.PI / 2,
            r = i % 2 ? 36 : 90;
          c.lineTo(384 + Math.cos(a) * r, 128 + Math.sin(a) * r);
        }
        c.closePath();
        c.fill();
      } else {
        const lines = text.split("\n");
        c.font = "bold 108px Arial";
        lines.forEach((l, i) =>
          c.fillText(l, 384, 128 + (i - (lines.length - 1) / 2) * 106, 735),
        );
      }
      map = new T.CanvasTexture(canvas);
      map.colorSpace = T.SRGBColorSpace;
      map.anisotropy = 4;
    }
    material = new T.MeshStandardMaterial({
      map,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      roughness: 0.72,
      side: T.DoubleSide,
    });
    decals.set(key, material);
  }
  const m = new T.Mesh(new T.PlaneGeometry(width, height), material);
  m.renderOrder = 2;
  m.name = "Livery";
  return m;
}

export function addMark(
  parent: T.Object3D,
  text: string,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  rotation = Math.PI / 2,
  light = false,
) {
  const m = marking(text, w, h, light);
  m.position.set(x, y, z);
  m.rotation.y = rotation;
  parent.add(m);
  return m;
}

export function skinMark(
  parent: T.Object3D,
  sections: LoftStation[],
  text: string,
  z: number,
  angle: number,
  width: number,
  arc: number,
  side = 1,
) {
  const at = hullSampler(sections),
    decal = marking(text, 1, 1);
  decal.geometry.dispose();
  decal.geometry = parametricPatch(
    (u, v) => {
      const a = side * (angle + (0.5 - v) * arc),
        s = z + side * (0.5 - u) * width;
      const p = at(s, a),
        normal = at(s + 0.001, a)
          .sub(at(s - 0.001, a))
          .cross(at(s, a + 0.001).sub(at(s, a - 0.001)))
          .normalize();
      return p.addScaledVector(normal, 0.003);
    },
    12,
    5,
  ) as T.PlaneGeometry;
  parent.add(decal);
}
