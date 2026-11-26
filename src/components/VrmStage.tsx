import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRM, VRMHumanBoneName, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { CameraPreset, HuTaoEmotion, HuTaoGesture } from '../types';

interface VrmStageProps {
  vrmUrl: string;
  emotion: HuTaoEmotion;
  gesture: HuTaoGesture;
  gestureTrigger: number;
  isTalking: boolean;
  isThinking: boolean;
  cameraPreset: CameraPreset;
  elevationOffset?: number;
  onHeadPat?: () => void;
}

/**
 * Motion craft helpers modeled after `iart-ai/motion-skills`:
 * - `threejs-animation`: exponential frame-rate independent damping (`1 - Math.exp(-lambda * dt)`),
 *   `renderer.setAnimationLoop`, capped DPR, and full GPU material/texture/geometry disposal.
 * - `animation-principles`: asymmetric ease-out, overshoot (`cubic-bezier(0.34, 1.56, 0.64, 1)`),
 *   anticipation dips before jumps/spins, secondary follow-through on spine/neck/hands, and 120 BPM beat rhythm.
 * - `particle-system`: semi-implicit Euler per-particle integration with curl-like swirl + burst sparks on gestures.
 * - `shot-composition`: elevated stage pedestal + rule-of-thirds / eye-line framing so Hu Tao stands proudly above ground.
 */
function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function dampVec3(
  current: THREE.Vector3,
  target: THREE.Vector3,
  lambda: number,
  dt: number
): void {
  current.lerp(target, 1 - Math.exp(-lambda * dt));
}

function easeOutExpo(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

function easeInOutCubic(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeOutBack(t: number, overshoot = 1.56): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  const c1 = overshoot;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** Smooth bell envelope: snappy ease-out attack, hold, smooth settle */
function actionEnvelope(elapsed: number, duration: number, attackRatio = 0.2, releaseRatio = 0.3): number {
  if (elapsed <= 0 || elapsed >= duration) return 0;
  const p = elapsed / duration;
  if (p < attackRatio) {
    return easeOutBack(p / attackRatio, 1.25);
  }
  if (p > 1 - releaseRatio) {
    return easeInOutCubic((1 - p) / releaseRatio);
  }
  return 1;
}

/** Deterministic PRNG for reproducible ambient particle layout */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Full recursive GPU memory cleanup per `threejs-animation` skill */
function disposeSceneGraph(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const record = m as unknown as Record<string, unknown>;
        for (const key in record) {
          const val = record[key];
          if (val && typeof val === 'object' && (val as THREE.Texture).isTexture) {
            (val as THREE.Texture).dispose();
          }
        }
        m.dispose();
      }
    }
  });
}

interface AmbientParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  phase: number;
}

interface BurstParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

const GESTURE_DURATIONS: Record<HuTaoGesture, number> = {
  idle: 0,
  wave: 2.3,
  nod: 1.8,
  spooky: 2.7,
  bow: 2.4,
  think: 2.6,
  jump: 1.65,
  twirl: 2.3,
  dance: 4.0,
  shrug: 2.1,
};

// Base stage elevation so Hu Tao stands clearly elevated on a glowing ritual dais above the bottom UI bar
const BASE_STAGE_ELEVATION = 0.22;

export function VrmStage({
  vrmUrl,
  emotion,
  gesture,
  gestureTrigger,
  isTalking,
  isThinking,
  cameraPreset,
  elevationOffset = 0,
  onHeadPat,
}: VrmStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  // Reactive refs consumed inside the 60fps Three.js loop
  const emotionRef = useRef<HuTaoEmotion>(emotion);
  const gestureRef = useRef<{ type: HuTaoGesture; startTime: number }>({
    type: gesture,
    startTime: -10,
  });
  const talkingRef = useRef<boolean>(isTalking);
  const thinkingRef = useRef<boolean>(isThinking);
  const elevationOffsetRef = useRef<number>(elevationOffset);
  const onHeadPatRef = useRef(onHeadPat);
  const spawnBurstRef = useRef<((originY?: number) => void) | null>(null);

  const calibratedHeightsRef = useRef<{ headLocalY: number; hipsRestY: number }>({
    headLocalY: 1.18,
    hipsRestY: 0.7326,
  });

  const cameraPresetRef = useRef<CameraPreset>(cameraPreset);
  const desiredCamRef = useRef<{
    pos: THREE.Vector3;
    target: THREE.Vector3;
    transitioning: boolean;
  }>({
    pos: new THREE.Vector3(0, 1.38, 1.52),
    target: new THREE.Vector3(0, 1.24, 0),
    transitioning: true,
  });

  const computeCameraGoal = (preset: CameraPreset, stageY: number, headLocalY: number) => {
    const worldHeadY = stageY + headLocalY;
    if (preset === 'portrait') {
      return {
        pos: new THREE.Vector3(0, worldHeadY + 0.03, 0.92),
        target: new THREE.Vector3(0, worldHeadY - 0.02, 0),
      };
    }
    if (preset === 'upper') {
      // Eye-level + upper torso framed cleanly in upper two-thirds, well above bottom toolbar
      return {
        pos: new THREE.Vector3(0, worldHeadY - 0.06, 1.5),
        target: new THREE.Vector3(0, worldHeadY - 0.17, 0),
      };
    }
    // Full body: frames from above plum-blossom hat all the way down to the elevated ritual pedestal + shoes
    const centerFullY = stageY + headLocalY * 0.52;
    return {
      pos: new THREE.Vector3(0, centerFullY + 0.08, 2.52),
      target: new THREE.Vector3(0, centerFullY - 0.03, 0),
    };
  };

  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  useEffect(() => {
    gestureRef.current = { type: gesture, startTime: performance.now() / 1000 };
    if (gesture !== 'idle') {
      const stageY = BASE_STAGE_ELEVATION + elevationOffsetRef.current;
      spawnBurstRef.current?.(stageY + 0.95);
    }
  }, [gesture, gestureTrigger]);

  useEffect(() => {
    talkingRef.current = isTalking;
  }, [isTalking]);

  useEffect(() => {
    thinkingRef.current = isThinking;
  }, [isThinking]);

  useEffect(() => {
    onHeadPatRef.current = onHeadPat;
  }, [onHeadPat]);

  useEffect(() => {
    cameraPresetRef.current = cameraPreset;
    elevationOffsetRef.current = elevationOffset;
    const stageY = BASE_STAGE_ELEVATION + elevationOffset;
    const goal = computeCameraGoal(
      cameraPreset,
      stageY,
      calibratedHeightsRef.current.headLocalY
    );
    desiredCamRef.current = {
      pos: goal.pos,
      target: goal.target,
      transitioning: true,
    };
  }, [cameraPreset, elevationOffset]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let currentVrm: VRM | null = null;
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // Renderer (capped DPR per `threejs-animation`)
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Stage Root Group — elevates Hu Tao + her Wangsheng ritual dais cleanly above ground!
    const stageGroup = new THREE.Group();
    stageGroup.position.y = BASE_STAGE_ELEVATION + elevationOffsetRef.current;
    scene.add(stageGroup);

    const vrmRootHolder = new THREE.Group();
    stageGroup.add(vrmRootHolder);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      30,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      35
    );
    camera.position.copy(desiredCamRef.current.pos);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(desiredCamRef.current.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 0.65;
    controls.maxDistance = 4.5;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.minPolarAngle = Math.PI * 0.2;
    controls.enablePan = true;
    controls.update();

    const stopCamTransition = () => {
      desiredCamRef.current.transitioning = false;
    };
    controls.addEventListener('start', stopCamTransition);

    // Three-point anime + Pyro lantern lighting
    const ambientLight = new THREE.AmbientLight(0xffebe4, 1.32);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff6ed, 1.42);
    keyLight.position.set(1.6, 2.8, 2.3);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xff4d42, 1.2);
    rimLight.position.set(-1.9, 2.2, -1.7);
    scene.add(rimLight);

    const lanternLight = new THREE.PointLight(0xff9240, 1.35, 5.5);
    lanternLight.position.set(0.85, 1.55, 0.95);
    scene.add(lanternLight);

    // --- Elevated Wangsheng Crimson Lotus / Ritual Pedestal (`shot-composition` Midground Anchor) ---
    const daisGroup = new THREE.Group();
    stageGroup.add(daisGroup);

    // Pedestal cylinder base right under y=0 of stageGroup so shoes rest firmly on top (y=0)
    const baseCylGeo = new THREE.CylinderGeometry(0.56, 0.64, 0.07, 48);
    const baseCylMat = new THREE.MeshStandardMaterial({
      color: 0x260d12,
      roughness: 0.45,
      metalness: 0.35,
      emissive: new THREE.Color(0x3b0f16),
      emissiveIntensity: 0.45,
    });
    const baseCyl = new THREE.Mesh(baseCylGeo, baseCylMat);
    baseCyl.position.y = -0.036;
    daisGroup.add(baseCyl);

    // Gold trim bevel ring
    const trimTorusGeo = new THREE.TorusGeometry(0.565, 0.012, 16, 64);
    trimTorusGeo.rotateX(Math.PI / 2);
    const trimTorusMat = new THREE.MeshBasicMaterial({
      color: 0xf59e42,
      transparent: true,
      opacity: 0.72,
    });
    const trimTorus = new THREE.Mesh(trimTorusGeo, trimTorusMat);
    trimTorus.position.y = -0.002;
    daisGroup.add(trimTorus);

    // Rotating outer mystic glyph ring
    const outerRingGeo = new THREE.RingGeometry(0.63, 0.665, 64);
    outerRingGeo.rotateX(-Math.PI / 2);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: 0xe04856,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
    });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRing.position.y = 0.002;
    daisGroup.add(outerRing);

    // Soft contact shadow disc directly beneath Hu Tao's feet (grounds her visually!)
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sctx = shadowCanvas.getContext('2d');
    if (sctx) {
      const sgrad = sctx.createRadialGradient(64, 64, 6, 64, 64, 60);
      sgrad.addColorStop(0, 'rgba(8, 2, 4, 0.72)');
      sgrad.addColorStop(0.55, 'rgba(12, 3, 6, 0.32)');
      sgrad.addColorStop(1, 'rgba(12, 3, 6, 0)');
      sctx.fillStyle = sgrad;
      sctx.fillRect(0, 0, 128, 128);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const contactShadowGeo = new THREE.PlaneGeometry(0.62, 0.62);
    contactShadowGeo.rotateX(-Math.PI / 2);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    contactShadow.position.y = 0.003;
    daisGroup.add(contactShadow);

    // --- Particle Systems (`particle-system` skill: Semi-Implicit Euler + Flow Swirl + Burst Emitter) ---
    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = 64;
    spriteCanvas.height = 64;
    const ctx = spriteCanvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0, 'rgba(255, 242, 205, 1)');
      grad.addColorStop(0.35, 'rgba(255, 125, 65, 0.9)');
      grad.addColorStop(0.7, 'rgba(228, 54, 70, 0.45)');
      grad.addColorStop(1, 'rgba(224, 50, 60, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    const emberTex = new THREE.CanvasTexture(spriteCanvas);

    // 1) Continuous Ambient Swirl Embers (seeded for deterministic beauty)
    const rand = mulberry32(77077);
    const ambientCount = 60;
    const ambientState: AmbientParticle[] = [];
    const ambientPositions = new Float32Array(ambientCount * 3);
    for (let i = 0; i < ambientCount; i++) {
      const angle = rand() * Math.PI * 2;
      const r = 0.5 + rand() * 1.55;
      const p: AmbientParticle = {
        x: Math.cos(angle) * r,
        y: rand() * 2.4,
        z: Math.sin(angle) * r - 0.25,
        vx: 0,
        vy: 0.12 + rand() * 0.14,
        vz: 0,
        phase: rand() * Math.PI * 2,
      };
      ambientState.push(p);
      ambientPositions[i * 3] = p.x;
      ambientPositions[i * 3 + 1] = p.y;
      ambientPositions[i * 3 + 2] = p.z;
    }
    const ambientGeo = new THREE.BufferGeometry();
    const ambientPosAttr = new THREE.BufferAttribute(ambientPositions, 3);
    ambientPosAttr.setUsage(THREE.DynamicDrawUsage);
    ambientGeo.setAttribute('position', ambientPosAttr);

    const ambientMat = new THREE.PointsMaterial({
      size: 0.062,
      map: emberTex,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ambientPoints = new THREE.Points(ambientGeo, ambientMat);
    scene.add(ambientPoints);

    // 2) Burst Spark Pool triggered on Gestures & Head-Pats
    const maxBurst = 48;
    const burstPool: BurstParticle[] = Array.from({ length: maxBurst }, () => ({
      x: 0,
      y: -10,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 1,
    }));
    const burstPositions = new Float32Array(maxBurst * 3);
    const burstGeo = new THREE.BufferGeometry();
    const burstPosAttr = new THREE.BufferAttribute(burstPositions, 3);
    burstPosAttr.setUsage(THREE.DynamicDrawUsage);
    burstGeo.setAttribute('position', burstPosAttr);

    const burstMat = new THREE.PointsMaterial({
      size: 0.085,
      map: emberTex,
      color: 0xffb86c,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const burstPoints = new THREE.Points(burstGeo, burstMat);
    scene.add(burstPoints);

    const spawnBurst = (originY = 1.15) => {
      if (reducedMotion) return;
      let spawned = 0;
      for (let i = 0; i < maxBurst && spawned < 22; i++) {
        const bp = burstPool[i];
        if (bp.life <= 0) {
          const theta = Math.random() * Math.PI * 2;
          const speed = 0.55 + Math.random() * 0.95;
          bp.x = (Math.random() - 0.5) * 0.18;
          bp.y = originY + (Math.random() - 0.5) * 0.16;
          bp.z = (Math.random() - 0.5) * 0.18;
          bp.vx = Math.cos(theta) * speed;
          bp.vy = 0.65 + Math.random() * 1.1; // upward celebratory bias
          bp.vz = Math.sin(theta) * speed;
          bp.maxLife = 0.75 + Math.random() * 0.55;
          bp.life = bp.maxLife;
          spawned++;
        }
      }
    };
    spawnBurstRef.current = spawnBurst;

    // LookAt target
    const lookAtTarget = new THREE.Object3D();
    lookAtTarget.position.set(0, 1.45, 1.5);
    scene.add(lookAtTarget);

    const pointerNDC = { x: 0, y: 0 };
    const handlePointerMove = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerNDC.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    };
    window.addEventListener('pointermove', handlePointerMove);

    // Click / tap raycast on Hu Tao
    let pointerDownPos = { x: 0, y: 0 };
    const handlePointerDown = (ev: PointerEvent) => {
      pointerDownPos = { x: ev.clientX, y: ev.clientY };
    };
    const handlePointerUp = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - pointerDownPos.x, ev.clientY - pointerDownPos.y);
      if (dist > 6 || !currentVrm) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -(((ev.clientY - rect.top) / rect.height) * 2 - 1)
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(currentVrm.scene, true);
      if (hits.length > 0) {
        spawnBurst(stageGroup.position.y + calibratedHeightsRef.current.headLocalY);
        onHeadPatRef.current?.();
      }
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    // Load VRM 0.x / 1.0 model
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    setLoadError(null);
    setIsModelLoaded(false);
    setLoadProgress(0);

    loader.load(
      vrmUrl,
      (gltf) => {
        if (disposed) return;
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          setLoadError('File loaded, but no VRM metadata was found.');
          return;
        }

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(vrm);

        vrm.scene.traverse((obj) => {
          obj.frustumCulled = false;
        });

        // Ground-snap lowest mesh vertex cleanly to y = 0 inside vrmRootHolder
        vrm.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(vrm.scene);
        if (Number.isFinite(box.min.y)) {
          vrm.scene.position.y = -box.min.y;
        }

        // Preserve normalized hips rest Y! (Prevents sinking 0.73m through the floor!)
        const hipsNode = vrm.humanoid?.getNormalizedBoneNode('hips');
        const hipsRestY = hipsNode ? hipsNode.position.y : 0.7326;

        // Measure local head height relative to stageGroup
        vrmRootHolder.add(vrm.scene);
        stageGroup.updateMatrixWorld(true);

        let headLocalY = 1.18;
        const headNode = vrm.humanoid?.getNormalizedBoneNode('head');
        if (headNode) {
          const headWorld = new THREE.Vector3();
          headNode.getWorldPosition(headWorld);
          headLocalY = headWorld.y - stageGroup.position.y;
        }

        calibratedHeightsRef.current = { headLocalY, hipsRestY };

        if (vrm.lookAt) {
          vrm.lookAt.target = lookAtTarget;
        }

        const stageY = BASE_STAGE_ELEVATION + elevationOffsetRef.current;
        const camGoal = computeCameraGoal(cameraPresetRef.current, stageY, headLocalY);
        desiredCamRef.current = {
          pos: camGoal.pos,
          target: camGoal.target,
          transitioning: true,
        };

        currentVrm = vrm;
        setIsModelLoaded(true);
        setLoadProgress(100);
        spawnBurst(stageY + headLocalY * 0.85);
      },
      (progressEvt) => {
        if (progressEvt.total > 0) {
          setLoadProgress(Math.round((progressEvt.loaded / progressEvt.total) * 100));
        }
      },
      (err) => {
        console.error('Failed to load VRM:', err);
        if (!disposed) {
          setLoadError('Could not load Hu Tao VRM model. Check public/hutao.vrm.');
        }
      }
    );

    // Resize observer
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Smoothed bone quaternion state for artifact-free SLERP interpolation (prevents Euler gimbal inversion!)
    const smoothedQuats: Record<string, THREE.Quaternion> = {};
    const tmpTargetQuat = new THREE.Quaternion();
    const tmpTargetEuler = new THREE.Euler();
    const applyBoneDamped = (
      humanoid: VRM['humanoid'],
      boneName: VRMHumanBoneName,
      rx: number,
      ry: number,
      rz: number,
      lambda: number,
      dt: number
    ) => {
      const node = humanoid?.getNormalizedBoneNode(boneName);
      if (!node) return;
      tmpTargetEuler.set(rx, ry, rz, 'XYZ');
      tmpTargetQuat.setFromEuler(tmpTargetEuler);
      let cur = smoothedQuats[boneName];
      if (!cur) {
        cur = tmpTargetQuat.clone();
        smoothedQuats[boneName] = cur;
      } else {
        cur.slerp(tmpTargetQuat, 1 - Math.exp(-lambda * dt));
      }
      node.quaternion.copy(cur);
    };

    let smoothedHipsOffsetY = 0;
    let smoothedHipsOffsetX = 0;
    let smoothedRootSpinY = 0;

    // Expression & blink state
    const clock = new THREE.Clock();
    let nextBlinkTime = 2.0;
    let blinkStart = -1;
    const blinkDuration = 0.14;

    const currentExpWeights: Record<string, number> = {
      happy: 0,
      relaxed: 0,
      angry: 0,
      sad: 0,
      Surprised: 0,
      surprised: 0,
    };

    // Deterministic URL `?t=N` freeze support per `threejs-animation` verify contract
    const freezeParam =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('t') : null;
    const fixedTime = freezeParam !== null ? parseFloat(freezeParam) : null;

    // Render loop via `renderer.setAnimationLoop` (`threejs-animation` skill)
    renderer.setAnimationLoop(() => {
      if (disposed) return;

      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt > 0 ? rawDt : 1 / 60, 1 / 24);
      const elapsed =
        fixedTime !== null && !Number.isNaN(fixedTime) ? fixedTime : clock.elapsedTime;
      const motionScale = reducedMotion ? 0.25 : 1.0;

      // Smoothly elevate/adjust stage height if user clicks Height controls
      const targetStageY = BASE_STAGE_ELEVATION + elevationOffsetRef.current;
      stageGroup.position.y = damp(stageGroup.position.y, targetStageY, 7, dt);

      // Exponential camera damping (`threejs-animation`: dampVec with lambda = 5.5)
      if (desiredCamRef.current.transitioning) {
        dampVec3(camera.position, desiredCamRef.current.pos, 5.5, dt);
        dampVec3(controls.target, desiredCamRef.current.target, 5.5, dt);
        if (
          camera.position.distanceTo(desiredCamRef.current.pos) < 0.004 &&
          controls.target.distanceTo(desiredCamRef.current.target) < 0.004
        ) {
          desiredCamRef.current.transitioning = false;
        }
      }
      controls.update();

      // Rotate mystic ritual ring slowly (`Ambient` motion layer)
      outerRing.rotation.z = elapsed * 0.22 * motionScale;
      lanternLight.intensity = 1.3 + Math.sin(elapsed * 3.4) * 0.15;

      // 1) Integrate Ambient Flow-Field Particles (`particle-system` semi-implicit Euler)
      for (let i = 0; i < ambientCount; i++) {
        const p = ambientState[i];
        // Curl-like tangential swirl around Y axis + gentle vertical updraft
        const swirlAngle = Math.atan2(p.z + 0.25, p.x) + Math.PI * 0.55;
        const ax = Math.cos(swirlAngle) * 0.18 + Math.sin(elapsed * 1.1 + p.phase) * 0.08;
        const az = Math.sin(swirlAngle) * 0.18 + Math.cos(elapsed * 0.9 + p.phase) * 0.08;
        p.vx = (p.vx + ax * dt) * 0.96;
        p.vz = (p.vz + az * dt) * 0.96;
        p.x += p.vx * dt * motionScale;
        p.y += p.vy * dt * motionScale;
        p.z += p.vz * dt * motionScale;

        if (p.y > stageGroup.position.y + 2.15) {
          p.y = stageGroup.position.y - 0.05;
        }
        ambientPosAttr.setXYZ(i, p.x, p.y, p.z);
      }
      ambientPosAttr.needsUpdate = true;

      // 2) Integrate Burst Sparks (`particle-system` burst + gravity + air drag)
      for (let i = 0; i < maxBurst; i++) {
        const bp = burstPool[i];
        if (bp.life > 0) {
          bp.vy -= 1.85 * dt; // soft Pyro spark gravity
          bp.vx *= 0.97;
          bp.vy *= 0.98;
          bp.vz *= 0.97;
          bp.x += bp.vx * dt;
          bp.y += bp.vy * dt;
          bp.z += bp.vz * dt;
          bp.life -= dt;
          burstPosAttr.setXYZ(i, bp.x, bp.y, bp.z);
        } else {
          burstPosAttr.setXYZ(i, 0, -20, 0);
        }
      }
      burstPosAttr.needsUpdate = true;

      // Smooth Eye LookAt Target
      const baseHeadWorldY = stageGroup.position.y + calibratedHeightsRef.current.headLocalY;
      lookAtTarget.position.x = damp(
        lookAtTarget.position.x,
        pointerNDC.x * 0.48 + Math.sin(elapsed * 0.6) * 0.06,
        7,
        dt
      );
      lookAtTarget.position.y = damp(
        lookAtTarget.position.y,
        baseHeadWorldY + pointerNDC.y * 0.26,
        7,
        dt
      );

      // --- 3) Full-Body Layered VRM Choreography (`animation-principles` Primary / Secondary / Ambient) ---
      if (currentVrm && currentVrm.humanoid) {
        const humanoid = currentVrm.humanoid;
        const expManager = currentVrm.expressionManager;

        // Ambient idle cycles: 120 BPM subtle pulse (0.5s / 2Hz) + figure-8 weight transfer
        const breath = Math.sin(elapsed * 2.1) * motionScale;
        const weightShift = Math.sin(elapsed * 1.05) * motionScale;
        const secondaryLag = Math.sin(elapsed * 1.05 - 0.45) * motionScale; // Overlapping action lag!
        const microIdles = Math.sin(elapsed * 0.42) * motionScale;

        let hipsOffsetY = Math.abs(Math.sin(elapsed * 1.05)) * 0.008 * motionScale;
        let hipsOffsetX = weightShift * 0.024;
        let rootSpinY = 0;

        // Pelvis & Spine Contrapposto
        // NOTE on VRM0 + rotateVRM0(PI) normalized bone coordinate directions:
        // - Spine / Chest / Head / Neck `.x`: NEGATIVE leans FORWARD toward camera (+Z); POSITIVE leans backward (-Z).
        // - Head / Neck `.y`: NEGATIVE turns face toward viewer's right (+X); POSITIVE turns toward viewer's left (-X).
        // - Left arm (extends along +X): `.y < 0` swings FORWARD (+Z); `.z > 0` lowers arm to side; `.x > 0` twists humerus upward.
        // - Right arm (extends along -X): `.y > 0` swings FORWARD (+Z); `.z < 0` lowers arm to side; `.x > 0` twists humerus upward.
        // - UpperLeg `.x > 0` lifts thigh FORWARD (+Z); LowerLeg `.x < 0` bends knee naturally (shin backward -Z).
        let hipsRx = -0.012 * breath;
        let hipsRy = weightShift * 0.055 + microIdles * 0.04;
        let hipsRz = weightShift * 0.032;

        let spineRx = -0.018 * breath;
        let spineRy = -weightShift * 0.03;
        let spineRz = -secondaryLag * 0.028; // Counter-balance hips for natural S-curve

        let chestRx = -0.024 * breath - 0.012;
        let chestRy = Math.sin(elapsed * 0.8) * 0.03 * motionScale;
        let chestRz = -secondaryLag * 0.018;

        // Shoulders (breathing lift: left `.z < 0` lifts up, right `.z > 0` lifts up)
        let lShoulderZ = -breath * 0.022;
        let rShoulderZ = breath * 0.022;

        // Arms & Expressive Wrists (relaxed forward at sides, elbows gently bent forward +Z!)
        let lUpperRx = 0.08 + secondaryLag * 0.03;
        let lUpperRy = -0.12;
        let lUpperRz = 1.16 + breath * 0.018;
        let lLowerRx = 0;
        let lLowerRy = -0.24 - breath * 0.03;
        let lLowerRz = 0.12;
        let lHandRx = 0;
        let lHandRy = 0;
        let lHandRz = -0.08 + secondaryLag * 0.05;

        let rUpperRx = 0.08 - secondaryLag * 0.03;
        let rUpperRy = 0.12;
        let rUpperRz = -1.16 - breath * 0.018;
        let rLowerRx = 0;
        let rLowerRy = 0.24 + breath * 0.03;
        let rLowerRz = -0.12;
        let rHandRx = 0;
        let rHandRy = 0;
        let rHandRz = 0.08 - secondaryLag * 0.05;

        // Legs & Feet (natural anime stance: knees gently forward +Z, shins back -Z, feet flat!)
        let lUpLegRx = 0.04 + Math.max(0, weightShift) * 0.05;
        let lUpLegRz = -0.025 - weightShift * 0.02;
        let lLowLegRx = -0.08 - Math.max(0, weightShift) * 0.08;
        let lFootRx = 0.04 + Math.max(0, weightShift) * 0.04;

        let rUpLegRx = 0.04 + Math.max(0, -weightShift) * 0.05;
        let rUpLegRz = 0.025 - weightShift * 0.02;
        let rLowLegRx = -0.08 - Math.max(0, -weightShift) * 0.08;
        let rFootRx = 0.04 + Math.max(0, -weightShift) * 0.04;

        // Head & Neck (pointer tracking: pointer up +Y => headRx > 0; pointer right +X => headRy < 0)
        let headRx = Math.sin(elapsed * 1.4) * 0.025 * motionScale + pointerNDC.y * 0.1;
        let headRy = Math.sin(elapsed * 0.75) * 0.045 * motionScale - pointerNDC.x * 0.2;
        let headRz = secondaryLag * 0.045;

        // Thinking state pose (right hand raised forward to chin, curious head tilt)
        if (thinkingRef.current) {
          headRz = 0.14 + Math.sin(elapsed * 2.6) * 0.03;
          headRx = -0.06;
          rUpperRx = 0.55;
          rUpperRy = 0.42;
          rUpperRz = -0.78;
          rLowerRy = 1.35;
          rLowerRz = 1.15;
          rHandRy = 0.3;
        }

        // --- Active Choreographed Gestures (`animation-principles`: Anticipation -> Overshoot Action -> Follow-Through) ---
        const gType = gestureRef.current.type;
        const gDur = GESTURE_DURATIONS[gType] || 0;
        const gElapsed = performance.now() / 1000 - gestureRef.current.startTime;

        if (gType !== 'idle' && gElapsed >= 0 && gElapsed < gDur) {
          const p = gElapsed / gDur;
          const env = actionEnvelope(gElapsed, gDur, 0.18, 0.28);

          if (gType === 'wave') {
            // Enthusiastic Hu Tao "Yahoo~!" HIGH WAVE: elbow comfortably down (`y~1.0`), forearm pointing UP (`y~1.25`), palm facing camera (`+Z`)!
            const waveSwing = Math.sin(gElapsed * 12.5);
            const wristFollow = Math.sin(gElapsed * 12.5 - 0.45);
            hipsOffsetX = -0.03 * env;
            hipsRz = -0.05 * env;
            spineRz = 0.06 * env;
            spineRx -= 0.04 * env;
            rShoulderZ = 0.1 * env;
            rUpperRx = THREE.MathUtils.lerp(rUpperRx, 0.72, env); // gentle natural shoulder rotation (no sleeve twist!)
            rUpperRy = THREE.MathUtils.lerp(rUpperRy, 0.28, env); // bring elbow slightly forward (+Z)
            rUpperRz = THREE.MathUtils.lerp(rUpperRz, -0.5, env); // keep elbow below shoulder!
            rLowerRx = THREE.MathUtils.lerp(rLowerRx, -0.35, env); // supinate forearm so palm faces camera (+Z)!
            rLowerRy = THREE.MathUtils.lerp(rLowerRy, 0.78 + waveSwing * 0.3, env);
            rLowerRz = THREE.MathUtils.lerp(rLowerRz, 1.25 + waveSwing * 0.22, env); // forearm points cleanly UPWARD!
            rHandRz = wristFollow * 0.35 * env; // wrist follow-through lag!
            headRz -= 0.12 * env;
            lUpLegRx += 0.06 * env;
            lLowLegRx -= 0.12 * env;
          } else if (gType === 'spooky') {
            // Playful Boo Tao GHOST PAWS: leans FORWARD (+Z), elbows down & forward, wrists up in front, palms facing forward/down!
            const crouch = p < 0.18 ? Math.sin((p / 0.18) * Math.PI) * -0.045 : 0.02 * env;
            const ghostSway = Math.sin(gElapsed * 5.2);
            const pawFlutter = Math.sin(gElapsed * 9.0);
            hipsOffsetY += crouch;
            spineRx -= 0.14 * env; // lean FORWARD toward viewer (+Z)!
            chestRx -= 0.08 * env;
            hipsOffsetX += ghostSway * 0.045 * env;

            // Both arms forward (+Z), elbows tucked below shoulders, forearms raised in front of chest!
            lUpperRx = THREE.MathUtils.lerp(lUpperRx, 0.45, env);
            lUpperRy = THREE.MathUtils.lerp(lUpperRy, -0.45, env);
            lUpperRz = THREE.MathUtils.lerp(lUpperRz, 0.65, env);
            lLowerRx = THREE.MathUtils.lerp(lLowerRx, -0.6, env);
            lLowerRy = THREE.MathUtils.lerp(lLowerRy, -1.0, env);
            lLowerRz = THREE.MathUtils.lerp(lLowerRz, -1.25, env); // left forearm UP!

            rUpperRx = THREE.MathUtils.lerp(rUpperRx, 0.45, env);
            rUpperRy = THREE.MathUtils.lerp(rUpperRy, 0.45, env);
            rUpperRz = THREE.MathUtils.lerp(rUpperRz, -0.65, env);
            rLowerRx = THREE.MathUtils.lerp(rLowerRx, -0.6, env);
            rLowerRy = THREE.MathUtils.lerp(rLowerRy, 1.0, env);
            rLowerRz = THREE.MathUtils.lerp(rLowerRz, 1.25, env); // right forearm UP!

            // Cute drooping ghost paws facing forward & down toward the viewer!
            lHandRz = (0.55 + pawFlutter * 0.22) * env;
            rHandRz = (-0.55 + pawFlutter * 0.22) * env;
            headRz += ghostSway * 0.13 * env;
          } else if (gType === 'jump') {
            // Classic 12-principles Jump: Forward-knee crouch -> High V-arm cheer in front -> Cushioned landing
            if (p < 0.22) {
              const ap = easeInOutCubic(p / 0.22);
              hipsOffsetY -= 0.075 * ap;
              spineRx -= 0.16 * ap;
              lUpLegRx = 0.42 * ap;
              rUpLegRx = 0.42 * ap;
              lLowLegRx = -0.78 * ap;
              rLowLegRx = -0.78 * ap;
              lFootRx = 0.35 * ap;
              rFootRx = 0.35 * ap;
              lUpperRy = 0.18 * ap;
              rUpperRy = -0.18 * ap;
            } else if (p < 0.74) {
              const jp = (p - 0.22) / 0.52;
              const arc = Math.sin(jp * Math.PI);
              hipsOffsetY += 0.19 * arc;
              // Both arms raised high in joyful V-cheer using clean Z abduction + forearm UP!
              lUpperRx = THREE.MathUtils.lerp(lUpperRx, 0.55, arc);
              rUpperRx = THREE.MathUtils.lerp(rUpperRx, 0.55, arc);
              lUpperRy = THREE.MathUtils.lerp(lUpperRy, -0.25, arc);
              rUpperRy = THREE.MathUtils.lerp(rUpperRy, 0.25, arc);
              lUpperRz = THREE.MathUtils.lerp(1.16, -0.35, arc);
              rUpperRz = THREE.MathUtils.lerp(-1.16, 0.35, arc);
              lLowerRz = THREE.MathUtils.lerp(lLowerRz, -0.45, arc);
              rLowerRz = THREE.MathUtils.lerp(rLowerRz, 0.45, arc);
              // Playful anime leg curl in mid-air (heel back -Z!)
              rLowLegRx = -0.65 * arc;
              lLowLegRx = -0.25 * arc;
              headRx += 0.1 * arc;
            } else {
              const lp = (p - 0.74) / 0.26;
              const squash = Math.sin(lp * Math.PI) * (1 - lp * 0.5);
              hipsOffsetY -= 0.045 * squash;
              spineRx -= 0.08 * squash;
              lUpLegRx = 0.26 * squash;
              rUpLegRx = 0.26 * squash;
              lLowLegRx = -0.5 * squash;
              rLowLegRx = -0.5 * squash;
              lFootRx = 0.22 * squash;
              rFootRx = 0.22 * squash;
            }
          } else if (gType === 'twirl') {
            // 360-degree Pirouette Spin — arms gracefully open forward/outward, right knee lifted cleanly!
            const spinProgress = easeOutExpo(Math.min(1, p / 0.88));
            rootSpinY = spinProgress * Math.PI * 2;
            const flare = Math.sin(p * Math.PI);
            hipsOffsetY += 0.04 * flare;
            lUpperRy = THREE.MathUtils.lerp(lUpperRy, -0.32, flare);
            rUpperRy = THREE.MathUtils.lerp(rUpperRy, 0.32, flare);
            lUpperRz = THREE.MathUtils.lerp(lUpperRz, 0.68, flare);
            rUpperRz = THREE.MathUtils.lerp(rUpperRz, -0.68, flare);
            lLowerRy = THREE.MathUtils.lerp(lLowerRy, -0.55, flare);
            rLowerRy = THREE.MathUtils.lerp(rLowerRy, 0.55, flare);
            rUpLegRx = 0.22 * flare;
            rLowLegRx = -0.48 * flare;
            headRz += 0.09 * flare;
          } else if (gType === 'dance') {
            // 120 BPM Rhythmic Hilichurl Groove! Clean Z-flexed paws bobbing in front of chest!
            const beatPhase = gElapsed * Math.PI * 4;
            const sideBeat = Math.sin(beatPhase * 0.5);
            const bounce = Math.abs(Math.sin(beatPhase * 0.5));

            hipsOffsetY += (bounce * 0.045 - 0.015) * env;
            hipsOffsetX += sideBeat * 0.065 * env;
            hipsRz = sideBeat * 0.095 * env;
            hipsRy = -sideBeat * 0.14 * env;
            spineRz = -sideBeat * 0.08 * env;
            spineRx -= 0.05 * env;
            chestRy = sideBeat * 0.1 * env;

            // Alternating cute paws bobbing up & down in front of chest (+Z) with zero shoulder twist!
            lUpperRx = THREE.MathUtils.lerp(lUpperRx, 0.45, env);
            rUpperRx = THREE.MathUtils.lerp(rUpperRx, 0.45, env);
            lUpperRy = THREE.MathUtils.lerp(lUpperRy, -0.42, env);
            rUpperRy = THREE.MathUtils.lerp(rUpperRy, 0.42, env);
            lUpperRz = THREE.MathUtils.lerp(lUpperRz, 0.68 + Math.sin(beatPhase) * 0.16, env);
            rUpperRz = THREE.MathUtils.lerp(rUpperRz, -0.68 + Math.sin(beatPhase) * 0.16, env);
            lLowerRx = THREE.MathUtils.lerp(lLowerRx, -0.55, env);
            rLowerRx = THREE.MathUtils.lerp(rLowerRx, -0.55, env);
            lLowerRy = THREE.MathUtils.lerp(lLowerRy, -0.95, env);
            rLowerRy = THREE.MathUtils.lerp(rLowerRy, 0.95, env);
            lLowerRz = THREE.MathUtils.lerp(lLowerRz, -1.2 + Math.sin(beatPhase) * 0.2, env);
            rLowerRz = THREE.MathUtils.lerp(rLowerRz, 1.2 - Math.sin(beatPhase) * 0.2, env);
            lHandRz = (0.5 + Math.sin(beatPhase) * 0.22) * env;
            rHandRz = (-0.5 - Math.sin(beatPhase) * 0.22) * env;

            // Stepping knees forward (+Z) on beat
            lUpLegRx = (0.12 + Math.max(0, sideBeat) * 0.26) * env;
            lLowLegRx = (-0.24 - Math.max(0, sideBeat) * 0.45) * env;
            rUpLegRx = (0.12 + Math.max(0, -sideBeat) * 0.26) * env;
            rLowLegRx = (-0.24 - Math.max(0, -sideBeat) * 0.45) * env;

            headRz += sideBeat * 0.13 * env;
            headRx -= (0.5 - bounce) * 0.1 * env;
          } else if (gType === 'bow') {
            // Courteous Wangsheng Parlor Director BOW: leans FORWARD toward camera (+Z), right palm over heart!
            spineRx -= 0.28 * env;
            chestRx -= 0.2 * env;
            headRx -= 0.16 * env;
            hipsOffsetY -= 0.015 * env;
            rUpperRx = THREE.MathUtils.lerp(rUpperRx, -0.25, env);
            rUpperRy = THREE.MathUtils.lerp(rUpperRy, 0.48, env);
            rUpperRz = THREE.MathUtils.lerp(rUpperRz, -0.95, env);
            rLowerRy = THREE.MathUtils.lerp(rLowerRy, 2.05, env);
            rLowerRz = THREE.MathUtils.lerp(rLowerRz, 0.25, env);
            rHandRy = 0.5 * env;
            lUpperRy = THREE.MathUtils.lerp(lUpperRy, -0.08, env);
            lUpperRz = THREE.MathUtils.lerp(lUpperRz, 1.14, env);
          } else if (gType === 'shrug') {
            // Teasing shrug: shoulders UP, elbows tucked at sides, forearms & palms symmetrically raised outward!
            lShoulderZ -= 0.18 * env;
            rShoulderZ += 0.18 * env;
            lUpperRx = THREE.MathUtils.lerp(lUpperRx, 0.45, env);
            rUpperRx = THREE.MathUtils.lerp(rUpperRx, 0.45, env);
            lUpperRy = THREE.MathUtils.lerp(lUpperRy, -0.22, env);
            rUpperRy = THREE.MathUtils.lerp(rUpperRy, 0.22, env);
            lUpperRz = THREE.MathUtils.lerp(lUpperRz, 0.88, env);
            rUpperRz = THREE.MathUtils.lerp(rUpperRz, -0.88, env);
            lLowerRx = THREE.MathUtils.lerp(lLowerRx, -0.35, env);
            rLowerRx = THREE.MathUtils.lerp(rLowerRx, -0.35, env);
            lLowerRy = THREE.MathUtils.lerp(lLowerRy, -0.65, env);
            rLowerRy = THREE.MathUtils.lerp(rLowerRy, 0.65, env);
            lLowerRz = THREE.MathUtils.lerp(lLowerRz, -1.15, env);
            rLowerRz = THREE.MathUtils.lerp(rLowerRz, 1.15, env);
            headRz += 0.16 * env;
          } else if (gType === 'nod') {
            headRx -= Math.abs(Math.sin(gElapsed * 7.5)) * 0.22 * env;
            spineRx -= Math.abs(Math.sin(gElapsed * 7.5)) * 0.05 * env;
            headRz += 0.065 * env;
            hipsOffsetY += Math.abs(Math.sin(gElapsed * 7.5)) * 0.012 * env;
          } else if (gType === 'think') {
            headRz += 0.15 * env;
            headRx -= 0.06 * env;
            rUpperRx = THREE.MathUtils.lerp(rUpperRx, 0.55, env);
            rUpperRy = THREE.MathUtils.lerp(rUpperRy, 0.42, env);
            rUpperRz = THREE.MathUtils.lerp(rUpperRz, -0.78, env);
            rLowerRy = THREE.MathUtils.lerp(rLowerRy, 1.35, env);
            rLowerRz = THREE.MathUtils.lerp(rLowerRz, 1.15, env);
            rHandRy = 0.3 * env;
          }
        }

        // Lively conversational hand & head cadence while speaking (hands gesture forward +Z!)
        if (talkingRef.current) {
          const talkWave = Math.sin(elapsed * 6.8) * motionScale;
          headRx -= Math.abs(Math.sin(elapsed * 7.2)) * 0.035 * motionScale;
          headRz += Math.cos(elapsed * 4.8) * 0.025 * motionScale;
          lLowerRy -= Math.max(0, talkWave) * 0.18;
          rLowerRy += Math.max(0, -talkWave) * 0.18;
          lUpperRy -= Math.max(0, talkWave) * 0.08;
          rUpperRy += Math.max(0, -talkWave) * 0.08;
        }

        // Apply Hips translation RELATIVE to calibrated `hipsRestY`!
        const hipsNode = humanoid.getNormalizedBoneNode('hips');
        if (hipsNode) {
          smoothedHipsOffsetY = damp(smoothedHipsOffsetY, hipsOffsetY, 14, dt);
          smoothedHipsOffsetX = damp(smoothedHipsOffsetX, hipsOffsetX, 12, dt);
          hipsNode.position.y = calibratedHeightsRef.current.hipsRestY + smoothedHipsOffsetY;
          hipsNode.position.x = smoothedHipsOffsetX;
        }

        // Apply root twirl spin on holder + scale contact shadow dynamically with jump height!
        if (gType === 'twirl' && gElapsed >= 0 && gElapsed < gDur) {
          smoothedRootSpinY = rootSpinY;
        } else {
          smoothedRootSpinY = damp(smoothedRootSpinY, 0, 10, dt);
        }
        vrmRootHolder.rotation.y = smoothedRootSpinY;

        const shadowScale = THREE.MathUtils.clamp(1 - smoothedHipsOffsetY * 2.2, 0.52, 1.08);
        contactShadow.scale.setScalar(shadowScale);
        contactShadowMat.opacity = THREE.MathUtils.clamp(0.88 - smoothedHipsOffsetY * 2.5, 0.3, 0.9);

        // Apply damped rotations across full skeleton (stiffer primary torso, softer follow-through extremities)
        applyBoneDamped(humanoid, 'hips', hipsRx, hipsRy, hipsRz, 14, dt);
        applyBoneDamped(humanoid, 'spine', spineRx, spineRy, spineRz, 12, dt);
        applyBoneDamped(humanoid, 'chest', chestRx, chestRy, chestRz, 11, dt);
        applyBoneDamped(humanoid, 'leftShoulder', 0, 0, lShoulderZ, 12, dt);
        applyBoneDamped(humanoid, 'rightShoulder', 0, 0, rShoulderZ, 12, dt);

        applyBoneDamped(humanoid, 'neck', headRx * 0.38, headRy * 0.38, headRz * 0.38, 13, dt);
        applyBoneDamped(humanoid, 'head', headRx * 0.62, headRy * 0.62, headRz * 0.62, 10, dt); // head settles slightly after neck

        applyBoneDamped(humanoid, 'leftUpperArm', lUpperRx, lUpperRy, lUpperRz, 13, dt);
        applyBoneDamped(humanoid, 'rightUpperArm', rUpperRx, rUpperRy, rUpperRz, 13, dt);
        applyBoneDamped(humanoid, 'leftLowerArm', lLowerRx, lLowerRy, lLowerRz, 11, dt);
        applyBoneDamped(humanoid, 'rightLowerArm', rLowerRx, rLowerRy, rLowerRz, 11, dt);
        applyBoneDamped(humanoid, 'leftHand', lHandRx, lHandRy, lHandRz, 9, dt);
        applyBoneDamped(humanoid, 'rightHand', rHandRx, rHandRy, rHandRz, 9, dt);

        // Subtle natural finger curl so hands never look flat/stiff
        const fingerCurl = 0.18 + Math.sin(elapsed * 1.7) * 0.04;
        const fingerBones: VRMHumanBoneName[] = [
          'leftIndexProximal',
          'leftMiddleProximal',
          'leftRingProximal',
          'leftLittleProximal',
          'rightIndexProximal',
          'rightMiddleProximal',
          'rightRingProximal',
          'rightLittleProximal',
        ];
        for (const fb of fingerBones) {
          const isLeft = fb.startsWith('left');
          applyBoneDamped(humanoid, fb, 0, 0, isLeft ? fingerCurl : -fingerCurl, 8, dt);
        }

        applyBoneDamped(humanoid, 'leftUpperLeg', lUpLegRx, 0, lUpLegRz, 13, dt);
        applyBoneDamped(humanoid, 'rightUpperLeg', rUpLegRx, 0, rUpLegRz, 13, dt);
        applyBoneDamped(humanoid, 'leftLowerLeg', lLowLegRx, 0, 0, 13, dt);
        applyBoneDamped(humanoid, 'rightLowerLeg', rLowLegRx, 0, 0, 13, dt);
        applyBoneDamped(humanoid, 'leftFoot', lFootRx, 0, 0, 13, dt);
        applyBoneDamped(humanoid, 'rightFoot', rFootRx, 0, 0, 13, dt);

        // --- 4) Facial Expressions, Natural Blinking & Lip-Sync Syllable Shapes ---
        if (expManager) {
          const activeEmotion = emotionRef.current;

          const targets: Record<string, number> = {
            happy: activeEmotion === 'happy' ? 0.92 : 0,
            relaxed: activeEmotion === 'playful' ? 0.95 : 0,
            angry: activeEmotion === 'angry' ? 0.85 : 0,
            sad: activeEmotion === 'sad' ? 0.85 : 0,
            Surprised: activeEmotion === 'surprised' ? 0.9 : 0,
            surprised: activeEmotion === 'surprised' ? 0.9 : 0,
          };

          for (const key of Object.keys(currentExpWeights)) {
            currentExpWeights[key] = damp(currentExpWeights[key], targets[key] ?? 0, 8, dt);
            expManager.setValue(key, currentExpWeights[key]);
          }

          if (elapsed >= nextBlinkTime) {
            blinkStart = elapsed;
            nextBlinkTime = elapsed + 2.5 + Math.random() * 3.6;
          }
          let blinkWeight = 0;
          if (blinkStart >= 0) {
            const bProg = (elapsed - blinkStart) / blinkDuration;
            if (bProg <= 1) {
              blinkWeight = Math.sin(bProg * Math.PI);
            } else {
              blinkStart = -1;
            }
          }
          if (currentExpWeights.happy > 0.55) {
            blinkWeight = 0;
          }
          expManager.setValue('blink', blinkWeight);

          if (talkingRef.current) {
            const aa = Math.max(0, Math.sin(elapsed * 14.5)) * 0.65;
            const oh = Math.max(0, Math.sin(elapsed * 9.3 + 1.4)) * 0.42;
            const ih = Math.max(0, Math.sin(elapsed * 11.7 + 2.8)) * 0.3;
            expManager.setValue('aa', aa);
            expManager.setValue('oh', oh);
            expManager.setValue('ih', ih);
          } else {
            const idleSmile = activeEmotion === 'playful' ? 0.12 : 0;
            expManager.setValue('aa', idleSmile);
            expManager.setValue('oh', 0);
            expManager.setValue('ih', 0);
          }
        }

        currentVrm.update(dt);
      }

      renderer.render(scene, camera);

      if (fixedTime !== null) {
        renderer.setAnimationLoop(null);
      }
    });

    // Clean GPU & Event Teardown (`threejs-animation` skill)
    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      controls.removeEventListener('start', stopCamTransition);
      controls.dispose();
      emberTex.dispose();
      shadowTex.dispose();
      if (currentVrm) {
        VRMUtils.deepDispose(currentVrm.scene);
      }
      disposeSceneGraph(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [vrmUrl]);

  return (
    <div ref={containerRef} className="relative h-full w-full select-none overflow-hidden">
      {!isModelLoaded && !loadError && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#12080a]/75 backdrop-blur-sm">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/40 bg-rose-950/50 shadow-lg shadow-rose-950/60">
            <span className="animate-spin text-2xl text-amber-400">✦</span>
          </div>
          <p className="text-sm font-medium tracking-wide text-amber-100">
            Summoning Director Hu Tao...
          </p>
          <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-stone-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-400 transition-all duration-200"
              style={{ width: `${Math.max(8, loadProgress)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-stone-400">{loadProgress}%</p>
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="max-w-sm rounded-2xl border border-rose-500/40 bg-stone-950/90 p-5 text-center text-sm text-rose-200 shadow-xl">
            {loadError}
          </div>
        </div>
      )}
    </div>
  );
}
