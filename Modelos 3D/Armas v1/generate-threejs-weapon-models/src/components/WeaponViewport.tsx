import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  createWeaponMaterialLibrary,
  WEAPON_CATALOG,
  WeaponId,
  WeaponMaterialLibrary,
  WeaponModelResult,
} from '../weapons';

export interface WeaponStatsSummary {
  triangleCount: number;
  meshCount: number;
  parts: { id: string; label: string }[];
  lengthCm: number;
}

interface WeaponViewportProps {
  weaponId: WeaponId;
  exploded: boolean;
  wireframe: boolean;
  autoRotate: boolean;
  hoveredPartId: string | null;
  resetCounter: number;
  onModelLoaded: (stats: WeaponStatsSummary) => void;
}

export function WeaponViewport({
  weaponId,
  exploded,
  wireframe,
  autoRotate,
  hoveredPartId,
  resetCounter,
  onModelLoaded,
}: WeaponViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Mutable refs for animation loop synchronization without tearing down WebGL
  const explodedRef = useRef(exploded);
  const autoRotateRef = useRef(autoRotate);
  const wireframeRef = useRef(wireframe);
  const hoveredPartRef = useRef<string | null>(hoveredPartId);

  explodedRef.current = exploded;
  autoRotateRef.current = autoRotate;
  wireframeRef.current = wireframe;
  hoveredPartRef.current = hoveredPartId;

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const materialsRef = useRef<WeaponMaterialLibrary | null>(null);
  const currentModelRef = useRef<WeaponModelResult | null>(null);
  const floorGroupRef = useRef<THREE.Group | null>(null);
  const targetCameraPosRef = useRef<THREE.Vector3 | null>(null);
  const targetControlsTargetRef = useRef<THREE.Vector3 | null>(null);
  const explodeProgressRef = useRef(0);

  // Helper to apply wireframe & hover-highlight cleanly
  const syncMaterialVisuals = () => {
    const model = currentModelRef.current;
    const materials = materialsRef.current;
    if (!model || !materials) return;

    const activeHover = hoveredPartRef.current;
    const isWireframe = wireframeRef.current;

    for (const part of model.parts) {
      const isHighlighted = activeHover !== null && part.id === activeHover;
      part.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (!obj.userData.baseMaterial) {
            obj.userData.baseMaterial = obj.material;
          }
          const baseMat = obj.userData.baseMaterial as THREE.Material;
          const nextMat = isHighlighted ? materials.getHighlightMaterial(baseMat) : baseMat;
          if (obj.material !== nextMat) {
            obj.material = nextMat;
          }
          if (
            nextMat instanceof THREE.MeshStandardMaterial ||
            nextMat instanceof THREE.MeshPhysicalMaterial
          ) {
            nextMat.wireframe = isWireframe;
          }
        }
      });
    }
  };

  // 1. Initialize Three.js Studio Scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      34,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.08,
      120
    );
    camera.position.set(1.2, 0.8, 4.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Procedural Studio PMREM Environment Reflections (zero external textures)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.82;

    // 3-Point Studio Lighting calibrated for dark gunmetal, chrome & varnished wood
    const hemiLight = new THREE.HemisphereLight('#dce6f5', '#2a2e38', 0.55);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#fff8ee', 2.35);
    keyLight.position.set(6, 9, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.camera.left = -8;
    keyLight.shadow.camera.right = 8;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    // Cool rim light separating metallic contours from the charcoal backdrop
    const rimLight = new THREE.DirectionalLight('#a8ccff', 1.45);
    rimLight.position.set(-7, 5, -7);
    scene.add(rimLight);

    // Soft under-fill to reveal trigger guards, rails & receivers cleanly
    const fillLight = new THREE.DirectionalLight('#dfe7f3', 0.72);
    fillLight.position.set(-5, -3, 6);
    scene.add(fillLight);

    // Subtle grounded studio shadow catcher + faint radial scale ring
    const floorGroup = new THREE.Group();
    const shadowPlaneGeom = new THREE.PlaneGeometry(36, 36);
    shadowPlaneGeom.rotateX(-Math.PI / 2);
    const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.34 });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeom, shadowPlaneMat);
    shadowPlane.receiveShadow = true;
    floorGroup.add(shadowPlane);

    const ringGeom = new THREE.RingGeometry(2.95, 2.98, 72);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#94a3b8',
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    });
    const studioRing = new THREE.Mesh(ringGeom, ringMat);
    studioRing.position.y = 0.002;
    floorGroup.add(studioRing);

    scene.add(floorGroup);
    floorGroupRef.current = floorGroup;

    // Shared weapon PBR material library
    const materials = createWeaponMaterialLibrary();
    materialsRef.current = materials;

    // Smooth interactive OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = true;
    controls.autoRotate = autoRotateRef.current;
    controls.autoRotateSpeed = 1.05;
    controls.maxPolarAngle = Math.PI * 0.88;
    controlsRef.current = controls;

    // Cancel smooth reset lerp immediately when the user grabs the camera
    const onControlStart = () => {
      targetCameraPosRef.current = null;
      targetControlsTargetRef.current = null;
    };
    controls.addEventListener('start', onControlStart);

    // Responsive ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // Main render loop
    let animId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);

      controls.autoRotate = autoRotateRef.current;

      // Smooth camera transition on model change or camera reset
      if (targetCameraPosRef.current && targetControlsTargetRef.current) {
        const alpha = 1 - Math.exp(-7 * dt);
        camera.position.lerp(targetCameraPosRef.current, alpha);
        controls.target.lerp(targetControlsTargetRef.current, alpha);
        if (
          camera.position.distanceTo(targetCameraPosRef.current) < 0.015 &&
          controls.target.distanceTo(targetControlsTargetRef.current) < 0.015
        ) {
          camera.position.copy(targetCameraPosRef.current);
          controls.target.copy(targetControlsTargetRef.current);
          targetCameraPosRef.current = null;
          targetControlsTargetRef.current = null;
        }
      }

      // Smooth exploded-view animation along each part's anatomical offset vector
      const targetExplode = explodedRef.current ? 1 : 0;
      const model = currentModelRef.current;
      if (model) {
        const diff = targetExplode - explodeProgressRef.current;
        if (Math.abs(diff) > 0.0005) {
          explodeProgressRef.current += diff * (1 - Math.exp(-9 * dt));
        } else {
          explodeProgressRef.current = targetExplode;
        }

        const t = explodeProgressRef.current;
        for (const part of model.parts) {
          part.group.position.set(
            part.basePosition.x + part.explodeOffset.x * t,
            part.basePosition.y + part.explodeOffset.y * t,
            part.basePosition.z + part.explodeOffset.z * t
          );
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.dispose();

      if (currentModelRef.current) {
        scene.remove(currentModelRef.current.root);
        currentModelRef.current.dispose();
        currentModelRef.current = null;
      }

      shadowPlaneGeom.dispose();
      shadowPlaneMat.dispose();
      ringGeom.dispose();
      ringMat.dispose();
      materials.dispose();
      envTarget.dispose();
      roomEnv.dispose();
      pmremGenerator.dispose();
      renderer.dispose();

      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // 2. Build & swap 3D weapon model when weaponId changes
  useEffect(() => {
    const scene = sceneRef.current;
    const materials = materialsRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const floorGroup = floorGroupRef.current;
    if (!scene || !materials || !camera || !controls) return;

    // Dispose previous weapon cleanly
    if (currentModelRef.current) {
      scene.remove(currentModelRef.current.root);
      currentModelRef.current.dispose();
      currentModelRef.current = null;
    }

    const definition =
      WEAPON_CATALOG.find((w) => w.id === weaponId) ?? WEAPON_CATALOG[0];
    const model = definition.build(materials);
    currentModelRef.current = model;
    scene.add(model.root);

    // Sync explode immediately to current toggle state cleanly on swap
    explodeProgressRef.current = explodedRef.current ? 1 : 0;
    for (const part of model.parts) {
      part.group.position.set(
        part.basePosition.x + part.explodeOffset.x * explodeProgressRef.current,
        part.basePosition.y + part.explodeOffset.y * explodeProgressRef.current,
        part.basePosition.z + part.explodeOffset.z * explodeProgressRef.current
      );
    }

    // Position floor shadow catcher cleanly beneath the weapon bounding box
    if (floorGroup) {
      floorGroup.position.y = -model.dimensions.y * 0.5 - 0.55;
      const ringScale = Math.max(0.65, model.dimensions.x * 0.24);
      floorGroup.children[1]?.scale.set(ringScale, 1, ringScale);
    }

    // Configure dynamic camera bounds & smooth hero 3/4 view angle
    const d = model.defaultCameraDistance;
    controls.minDistance = d * 0.32;
    controls.maxDistance = d * 2.8;

    targetCameraPosRef.current = new THREE.Vector3(d * 0.28, d * 0.16, d * 0.96);
    targetControlsTargetRef.current = new THREE.Vector3(0, 0, 0);

    // Apply current wireframe / hover settings
    syncMaterialVisuals();

    // Report real geometry metrics upward
    onModelLoaded({
      triangleCount: model.triangleCount,
      meshCount: model.meshCount,
      parts: model.parts.map((p) => ({ id: p.id, label: p.label })),
      lengthCm: Math.round(model.dimensions.x * 10),
    });
  }, [weaponId, onModelLoaded]);

  // 3. Reset camera smoothly when requested
  useEffect(() => {
    if (resetCounter === 0) return;
    const model = currentModelRef.current;
    if (!model) return;
    const d = model.defaultCameraDistance;
    targetCameraPosRef.current = new THREE.Vector3(d * 0.28, d * 0.16, d * 0.96);
    targetControlsTargetRef.current = new THREE.Vector3(0, 0, 0);
  }, [resetCounter]);

  // 4. Sync wireframe and hover part highlighting
  useEffect(() => {
    syncMaterialVisuals();
  }, [wireframe, hoveredPartId]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full cursor-grab active:cursor-grabbing"
      aria-label="Visor interactivo 3D de modelos de armas"
    />
  );
}
