import * as T from "three";
import { AIRCRAFT_CATALOG } from "../src/models";
import { studioLighting, frameObject } from "../src/components/studioScene";

// Run in a WebGL-capable browser. Library images are renders of the actual assets.
export function renderAssets() {
  const renderer = new T.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1.4);
  renderer.setClearColor(0, 0);
  const scene = new T.Scene(),
    { environment } = studioLighting(scene, renderer);
  const result: Record<string, string> = {};
  for (const def of AIRCRAFT_CATALOG) {
    const model = def.build().group;
    scene.add(model);
    for (const large of [false, true]) {
      const w = large ? 1260 : 340,
        h = large ? 630 : 150;
      renderer.setSize(w, h);
      const cam = new T.PerspectiveCamera(31, w / h, 0.05, 100);
      const frame = frameObject(model, w / h, 31, !large);
      cam.position.copy(frame.position);
      cam.lookAt(frame.target);
      renderer.render(scene, cam);
      let image = renderer.domElement;
      if (!large) {
        const c = document.createElement("canvas");
        c.width = image.width;
        c.height = image.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const px = ctx.getImageData(0, 0, c.width, c.height).data;
        let x0 = c.width,
          y0 = c.height,
          x1 = 0,
          y1 = 0;
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++)
            if (px[(y * c.width + x) * 4 + 3] > 8) {
              x0 = Math.min(x0, x);
              y0 = Math.min(y0, y);
              x1 = Math.max(x1, x);
              y1 = Math.max(y1, y);
            }
        const out = document.createElement("canvas");
        out.width = x1 - x0 + 11;
        out.height = y1 - y0 + 9;
        out
          .getContext("2d")!
          .drawImage(
            c,
            x0,
            y0,
            x1 - x0 + 1,
            y1 - y0 + 1,
            5,
            4,
            x1 - x0 + 1,
            y1 - y0 + 1,
          );
        image = out;
      }
      result[def.id + (large ? "-studio" : "")] = image
        .toDataURL("image/webp", 0.95)
        .split(",")[1];
    }
    scene.remove(model);
    model.traverse((o) => {
      if (o instanceof T.Mesh) o.geometry.dispose();
    });
  }
  renderer.dispose();
  environment.dispose();
  renderer.forceContextLoss();
  return result;
}
