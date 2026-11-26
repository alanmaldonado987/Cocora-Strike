import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { AIRCRAFT_CATALOG } from "../models";
import { applyVisualMode } from "../models/materials";
import { prepareRenderBatches } from "../models/renderBatches";
import type {
  AnimatedPart,
  BuiltModelResult,
  PartCategory,
  VehicleController,
} from "../models/types";
import { frameObject, studioFloor, studioLighting } from "./studioScene";

export type ViewMode = "single" | "fleet";
export type CameraView = "Perspectiva" | "Frontal" | "Lateral" | "Superior";
export interface ViewerHandle {
  zoom: (factor: number) => void;
  reset: () => void;
}
export interface GeometryStats {
  triangleCount: number;
  meshCount: number;
  materialCount: number;
  /** True when the visible vehicle exposes the articulated rig contract. */
  interactive: boolean;
}
interface Props {
  selectedId: string;
  viewMode: ViewMode;
  activeCategory: PartCategory | null;
  wireframe: boolean;
  animateParts: boolean;
  autoRotate: boolean;
  cameraView: CameraView;
  pan: boolean;
  throttle: number;
  doorsOpen: boolean;
  firing: boolean;
  onSelectFromScene: (id: string) => void;
  onStatsUpdate: (stats: GeometryStats) => void;
  onReady: (ok: boolean) => void;
}

export const ModelViewer3D = forwardRef<ViewerHandle, Props>(
  function ModelViewer3D(props, ref) {
    const mount = useRef<HTMLDivElement>(null),
      axis = useRef<SVGSVGElement>(null);
    const latest = useRef(props);
    latest.current = props;
    const runtime = useRef<{
      load: () => void;
      style: () => void;
      reset: () => void;
      zoom: (n: number) => void;
      mechanics: () => void;
    } | null>(null);
    const [ready, setReady] = useState(false),
      [error, setError] = useState(false),
      [retry, setRetry] = useState(0);
    useImperativeHandle(
      ref,
      () => ({
        zoom: (n) => runtime.current?.zoom(n),
        reset: () => runtime.current?.reset(),
      }),
      [],
    );

    useEffect(() => {
      const container = mount.current!;
      let dispose: (() => void) | undefined;
      const start = requestAnimationFrame(() => {
        let renderer: T.WebGLRenderer;
        try {
          renderer = new T.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: "high-performance",
          });
        } catch {
          setError(true);
          latest.current.onReady(false);
          return;
        }
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
        renderer.setClearColor(0x000000, 0);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = T.PCFShadowMap;
        container.appendChild(renderer.domElement);
        const scene = new T.Scene(),
          camera = new T.PerspectiveCamera(31, 1, 0.06, 250);
        const { environment, key } = studioLighting(scene, renderer);
        const floor = studioFloor();
        scene.add(floor.group);
        const models = new T.Group();
        scene.add(models);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.09;
        controls.minDistance = 1.7;
        controls.maxDistance = 90;
        controls.maxPolarAngle = Math.PI * 0.499;
        controls.rotateSpeed = 0.65;
        controls.panSpeed = 0.7;
        controls.zoomSpeed = 0.8;
        controls.autoRotateSpeed = 0.82;
        const cache = new Map<string, BuiltModelResult>();
        let controllers: VehicleController[] = [];
        const applyMechanics = (c: VehicleController) => {
          c.setThrottle(latest.current.throttle);
          c.setDoorsOpen(latest.current.doorsOpen);
          c.setFiring(latest.current.firing);
        };
        let animation: AnimatedPart[] = [],
          dirty = true,
          first = true,
          raf = 0,
          last = 0,
          elapsed = 0;
        let transition: { position: T.Vector3; target: T.Vector3 } | null =
          null;
        const redraw = () => {
          dirty = true;
        };
        controls.addEventListener("change", redraw);
        const cancelGlide = () => {
          transition = null;
        };
        controls.addEventListener("start", cancelGlide);
        const style = () => {
          applyVisualMode(
            models,
            latest.current.activeCategory,
            latest.current.wireframe,
          );
          dirty = true;
        };
        const reset = (snap = false) => {
          if (!models.children.length) return;
          const fleet = latest.current.viewMode === "fleet";
          const preset = latest.current.cameraView;
          const direction =
            fleet || preset === "Perspectiva"
              ? undefined
              : preset === "Frontal"
                ? new T.Vector3(0, 0.04, 1)
                : preset === "Lateral"
                  ? new T.Vector3(1, 0.025, 0)
                  : new T.Vector3(0, 1, 0.0001);
          const dest = frameObject(
            models,
            camera.aspect,
            camera.fov,
            false,
            fleet,
            direction,
          );
          controls.maxDistance = Math.max(
            90,
            dest.position.distanceTo(dest.target) * 1.8,
          );
          if (
            snap ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ) {
            camera.position.copy(dest.position);
            controls.target.copy(dest.target);
            controls.update();
            transition = null;
          } else transition = dest;
          dirty = true;
        };
        const load = () => {
          models.clear();
          animation = [];
          controllers = [];
          const fleet = latest.current.viewMode === "fleet";
          const defs = fleet
            ? AIRCRAFT_CATALOG
            : AIRCRAFT_CATALOG.filter(
                (a) => a.id === latest.current.selectedId,
              );
          let triangleCount = 0,
            meshCount = 0;
          const materials = new Set<T.Material>();
          defs.forEach((def, i) => {
            let model = cache.get(def.id);
            if (!model) {
              model = def.build();
              prepareRenderBatches(model);
              cache.set(def.id, model);
            }
            model.group.userData.aircraftId = def.id;
            model.group.position.set(
              fleet ? ((i % 4) - 1.5) * 9.1 : 0,
              0,
              fleet ? (i < 4 ? -4.7 : 4.7) : 0,
            );
            model.group.rotation.y = fleet ? 0.35 : 0;
            models.add(model.group);
            triangleCount += model.triangleCount;
            meshCount += model.meshCount;
            // Articulated rigs drive their own pivots (RPM inertia, doors, guns).
            if (model.controller) {
              controllers.push(model.controller);
              applyMechanics(model.controller);
            } else animation.push(...model.animatedParts);
            model.group.traverse((o) => {
              if (o instanceof T.Mesh)
                materials.add(o.userData.baseMaterial || o.material);
            });
          });
          floor.shadow.visible = !fleet;
          const extent = fleet ? 24 : 7;
          Object.assign(key.shadow.camera, {
            left: -extent,
            right: extent,
            top: extent,
            bottom: -extent,
          });
          key.shadow.camera.updateProjectionMatrix();
          latest.current.onStatsUpdate({
            triangleCount,
            meshCount,
            materialCount: materials.size,
            interactive: !fleet && controllers.length > 0,
          });
          style();
          reset(first);
          first = false;
        };
        const zoom = (n: number) => {
          transition = null;
          const offset = camera.position.clone().sub(controls.target);
          camera.position
            .copy(controls.target)
            .add(
              offset.multiplyScalar(
                T.MathUtils.clamp(
                  offset.length() * n,
                  controls.minDistance,
                  controls.maxDistance,
                ) / offset.length(),
              ),
            );
          controls.update();
          dirty = true;
        };
        runtime.current = {
          load,
          style,
          reset: () => reset(),
          zoom,
          mechanics: () => controllers.forEach(applyMechanics),
        };
        const resize = () => {
          const w = container.clientWidth,
            h = container.clientHeight;
          if (!w || !h) return;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          reset(true);
          dirty = true;
        };
        resize();
        load();
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        const down = new T.Vector2(),
          ray = new T.Raycaster();
        const pointerDown = (e: PointerEvent) => {
          down.set(e.clientX, e.clientY);
        };
        const pointerUp = (e: PointerEvent) => {
          if (
            latest.current.viewMode !== "fleet" ||
            Math.hypot(down.x - e.clientX, down.y - e.clientY) > 4
          )
            return;
          const r = container.getBoundingClientRect();
          ray.setFromCamera(
            new T.Vector2(
              ((e.clientX - r.left) / r.width) * 2 - 1,
              1 - ((e.clientY - r.top) / r.height) * 2,
            ),
            camera,
          );
          let hit: T.Object3D | null =
            ray.intersectObjects(models.children, true)[0]?.object || null;
          while (hit && !hit.userData.aircraftId) hit = hit.parent;
          if (hit) latest.current.onSelectFromScene(hit.userData.aircraftId);
        };
        // The cursor's ground hit becomes the turret target.
        const ground = new T.Plane(new T.Vector3(0, 1, 0), 0),
          aimPoint = new T.Vector3();
        const pointerMove = (e: PointerEvent) => {
          if (!controllers.length || latest.current.viewMode !== "single") return;
          const r = container.getBoundingClientRect();
          ray.setFromCamera(
            new T.Vector2(
              ((e.clientX - r.left) / r.width) * 2 - 1,
              1 - ((e.clientY - r.top) / r.height) * 2,
            ),
            camera,
          );
          if (ray.ray.intersectPlane(ground, aimPoint))
            controllers.forEach((c) => c.aimTurrets(aimPoint));
        };
        const canvas = renderer.domElement;
        canvas.addEventListener("pointermove", pointerMove);
        canvas.addEventListener("pointerdown", pointerDown);
        canvas.addEventListener("pointerup", pointerUp);
        const lost = (e: Event) => {
          e.preventDefault();
          setError(true);
          setReady(false);
          latest.current.onReady(false);
        };
        canvas.addEventListener("webglcontextlost", lost);
        const q = new T.Quaternion(),
          vec = new T.Vector3();
        const updateAxes = () => {
          if (!axis.current) return;
          q.copy(camera.quaternion).invert();
          [0, 1, 2].forEach((i) => {
            vec
              .set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0)
              .applyQuaternion(q);
            const line = axis.current!.children[i].children[0],
              label = axis.current!.children[i].children[1];
            line.setAttribute("x2", `${32 + 21 * vec.x}`);
            line.setAttribute("y2", `${32 - 21 * vec.y}`);
            label.setAttribute("x", `${32 + 28 * vec.x}`);
            label.setAttribute("y", `${35 - 28 * vec.y}`);
          });
        };
        const tick = (time: number) => {
          raf = requestAnimationFrame(tick);
          const dt = Math.min((time - last) / 1000 || 0, 0.05);
          last = time;
          if (document.hidden || renderer.getContext().isContextLost()) return;
          controls.autoRotate = latest.current.autoRotate;
          controls.mouseButtons.LEFT = latest.current.pan
            ? T.MOUSE.PAN
            : T.MOUSE.ROTATE;
          if (transition) {
            const k = 1 - Math.exp(-10 * dt);
            camera.position.lerp(transition.position, k);
            controls.target.lerp(transition.target, k);
            if (camera.position.distanceTo(transition.position) < 0.007) {
              camera.position.copy(transition.position);
              controls.target.copy(transition.target);
              transition = null;
            }
            dirty = true;
          }
          if (latest.current.animateParts) {
            elapsed += dt;
            for (const part of animation) {
              if (part.mode === "pulse")
                part.object.scale[part.axis] =
                  (part.baseValue ?? 1) +
                  Math.sin(elapsed * part.speed) * (part.amplitude ?? 0.12);
              else if (part.mode === "oscillate")
                part.object.rotation[part.axis] =
                  (part.baseValue ?? 0) +
                  Math.sin(elapsed * part.speed) * (part.amplitude ?? 0.2);
              else part.object.rotation[part.axis] += part.speed * dt;
            }
            for (const c of controllers) c.update(dt);
            dirty = true;
          }
          controls.update(dt);
          if (dirty) {
            renderer.render(scene, camera);
            updateAxes();
            dirty = false;
          }
        };
        controls.update();
        renderer.render(scene, camera);
        updateAxes();
        setReady(true);
        setError(false);
        latest.current.onReady(true);
        raf = requestAnimationFrame(tick);
        dispose = () => {
          cancelAnimationFrame(raf);
          observer.disconnect();
          controls.dispose();
          runtime.current = null;
          canvas.removeEventListener("pointermove", pointerMove);
          canvas.removeEventListener("pointerdown", pointerDown);
          canvas.removeEventListener("pointerup", pointerUp);
          canvas.removeEventListener("webglcontextlost", lost);
          const geometries = new Set<T.BufferGeometry>();
          cache.forEach((b) =>
            b.group.traverse((o) => {
              if (o instanceof T.Mesh) geometries.add(o.geometry);
            }),
          );
          geometries.forEach((g) => g.dispose());
          floor.group.traverse((o) => {
            if (o instanceof T.Mesh) {
              o.geometry.dispose();
              o.material.dispose();
            }
          });
          environment.dispose();
          key.shadow.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
          canvas.remove();
        };
      });
      return () => {
        cancelAnimationFrame(start);
        dispose?.();
      };
    }, [retry]);
    useEffect(() => {
      runtime.current?.load();
    }, [props.selectedId, props.viewMode]);
    useEffect(() => {
      runtime.current?.style();
    }, [props.activeCategory, props.wireframe]);
    useEffect(() => {
      runtime.current?.reset();
    }, [props.cameraView]);
    useEffect(() => {
      runtime.current?.mechanics();
    }, [props.throttle, props.doorsOpen, props.firing]);

    return (
      <>
        {!ready && (
          <img
            className="model-poster"
            src={`/previews/${props.selectedId}-studio.webp`}
            alt="Vista renderizada del modelo seleccionado"
          />
        )}
        <div
          ref={mount}
          className={`canvas-mount ${ready ? "is-ready" : ""} ${props.pan ? "pan-tool" : ""}`}
          role="img"
          aria-label="Modelo 3D interactivo. Arrastra para orbitar; utiliza la rueda para acercar."
        />
        {error && (
          <div className="render-notice">
            Vista previa estática. WebGL no está disponible.{" "}
            <button
              onClick={() => {
                setError(false);
                setRetry((n) => n + 1);
              }}
            >
              Reintentar
            </button>
          </div>
        )}
        <svg
          ref={axis}
          className="axis-gizmo"
          viewBox="0 0 64 64"
          aria-label="Ejes de la escena"
        >
          {["X", "Y", "Z"].map((v, i) => (
            <g key={v} color={["#c4776d", "#91a67c", "#7998ba"][i]}>
              <line
                x1="32"
                y1="32"
                x2="32"
                y2="32"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <text x="32" y="32" fill="currentColor" textAnchor="middle">
                {v}
              </text>
            </g>
          ))}
          <circle cx="32" cy="32" r="2.5" fill="#9ca1a3" />
        </svg>
      </>
    );
  },
);
