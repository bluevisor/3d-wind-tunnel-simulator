/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { LBMSolver, getNacaPoints } from '../lbmSolver';
import teslaModelUrl from '../assets/tesla_model3.glb?url';
import shinkansenModelUrl from '../assets/shinkansen_n700.glb?url';
import { SimulationParams, VisualOptions, Point2D } from '../types';

interface LoftStation {
  x: number;
  hw: number;
  rhw: number;
  bot: number;
  top: number;
}

function buildLoftedGeometry(
  stations: LoftStation[],
  segments: number,
  flatBottom: boolean
): THREE.BufferGeometry {
  const n = segments;
  const numSt = stations.length;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let si = 0; si < numSt; si++) {
    const st = stations[si];
    for (let ci = 0; ci < n; ci++) {
      const angle = (ci / n) * Math.PI * 2;
      const sa = Math.sin(angle);
      const ca = Math.cos(angle);
      let y: number, z: number;

      if (flatBottom) {
        if (angle <= Math.PI) {
          const w = st.hw + (st.rhw - st.hw) * sa;
          z = w * ca;
          y = st.bot + (st.top - st.bot) * sa;
        } else {
          z = st.hw * ca;
          y = st.bot;
        }
      } else {
        const centerY = (st.top + st.bot) / 2;
        const halfH = (st.top - st.bot) / 2;
        z = st.hw * ca;
        y = centerY + halfH * sa;
      }

      positions.push(st.x, y, z);
    }
  }

  for (let si = 0; si < numSt - 1; si++) {
    for (let ci = 0; ci < n; ci++) {
      const a = si * n + ci;
      const b = si * n + (ci + 1) % n;
      const c = (si + 1) * n + ci;
      const d = (si + 1) * n + (ci + 1) % n;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const frontIdx = positions.length / 3;
  const last = stations[numSt - 1];
  positions.push(last.x, (last.bot + last.top) / 2, 0);
  for (let ci = 0; ci < n; ci++) {
    indices.push(frontIdx, (numSt - 1) * n + (ci + 1) % n, (numSt - 1) * n + ci);
  }

  const rearIdx = positions.length / 3;
  const first = stations[0];
  positions.push(first.x, (first.bot + first.top) / 2, 0);
  for (let ci = 0; ci < n; ci++) {
    indices.push(rearIdx, ci, (ci + 1) % n);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildTeslaModel3Geometry(scale: number): THREE.BufferGeometry {
  const s = scale;
  const stations: LoftStation[] = [
    { x: -12*s, hw: 0.3*s,  rhw: 0.2*s,  bot: -1.5*s, top: -0.3*s },
    { x: -11*s, hw: 2.5*s,  rhw: 2.0*s,  bot: -3.0*s, top: 0.5*s  },
    { x: -9.5*s,hw: 4.0*s,  rhw: 3.2*s,  bot: -3.5*s, top: 1.0*s  },
    { x: -8*s,  hw: 4.5*s,  rhw: 3.5*s,  bot: -3.5*s, top: 1.8*s  },
    { x: -6*s,  hw: 4.6*s,  rhw: 2.8*s,  bot: -3.5*s, top: 2.8*s  },
    { x: -4*s,  hw: 4.7*s,  rhw: 2.6*s,  bot: -3.5*s, top: 3.4*s  },
    { x: -2*s,  hw: 4.7*s,  rhw: 2.5*s,  bot: -3.5*s, top: 3.8*s  },
    { x: 0,     hw: 4.7*s,  rhw: 2.5*s,  bot: -3.5*s, top: 3.9*s  },
    { x: 2*s,   hw: 4.7*s,  rhw: 2.3*s,  bot: -3.5*s, top: 3.4*s  },
    { x: 4*s,   hw: 4.6*s,  rhw: 3.8*s,  bot: -3.5*s, top: 1.8*s  },
    { x: 6*s,   hw: 4.5*s,  rhw: 4.3*s,  bot: -3.5*s, top: 0.3*s  },
    { x: 8*s,   hw: 4.3*s,  rhw: 4.0*s,  bot: -3.3*s, top: 0.0*s  },
    { x: 10*s,  hw: 3.5*s,  rhw: 3.2*s,  bot: -2.8*s, top: -0.5*s },
    { x: 11*s,  hw: 2.0*s,  rhw: 1.8*s,  bot: -2.0*s, top: -0.8*s },
    { x: 12*s,  hw: 0.3*s,  rhw: 0.2*s,  bot: -1.2*s, top: -0.5*s },
  ];
  return buildLoftedGeometry(stations, 36, true);
}

function buildShinkansenGeometry(scale: number): THREE.BufferGeometry {
  const s = scale;
  // N700 proportions: nose is ~40% of visible length, body is oval, nose droops
  const stations: LoftStation[] = [
    // Rear face (flat)
    { x: -13*s, hw: 4.0*s,  rhw: 3.6*s,  bot: -4.0*s, top: 4.0*s },
    // Body section (constant cross-section)
    { x: -8*s,  hw: 4.0*s,  rhw: 3.6*s,  bot: -4.0*s, top: 4.0*s },
    { x: -3*s,  hw: 4.0*s,  rhw: 3.6*s,  bot: -4.0*s, top: 4.0*s },
    // Nose begins — gradual taper
    { x: 0,     hw: 3.9*s,  rhw: 3.5*s,  bot: -4.0*s, top: 3.8*s },
    { x: 2*s,   hw: 3.6*s,  rhw: 3.2*s,  bot: -3.8*s, top: 3.4*s },
    { x: 4*s,   hw: 3.2*s,  rhw: 2.6*s,  bot: -3.5*s, top: 2.8*s },
    // Nose mid — significant narrowing + droop
    { x: 6*s,   hw: 2.5*s,  rhw: 1.8*s,  bot: -3.0*s, top: 1.8*s },
    { x: 8*s,   hw: 1.6*s,  rhw: 1.0*s,  bot: -2.4*s, top: 0.6*s },
    // Nose tip — sharp duckbill droop
    { x: 10*s,  hw: 0.8*s,  rhw: 0.4*s,  bot: -1.6*s, top: -0.3*s },
    { x: 12*s,  hw: 0.2*s,  rhw: 0.1*s,  bot: -0.8*s, top: -0.5*s },
    { x: 13*s,  hw: 0.05*s, rhw: 0.03*s, bot: -0.4*s, top: -0.35*s },
  ];
  return buildLoftedGeometry(stations, 36, false);
}

interface WindTunnelCanvasProps {
  solver: LBMSolver;
  params: SimulationParams;
  visuals: VisualOptions;
  isSimulating: boolean;
  customPoints?: Point2D[] | null;
  onFpsUpdate?: (fps: number) => void;
}

type SmokeSeedMode = 'distributed' | 'inlet';

function seedSmokeParticle(
  positions: Float32Array,
  ages: Float32Array,
  index: number,
  count: number,
  solver: LBMSolver,
  mode: SmokeSeedMode,
  groundY?: number
) {
  const gs = solver.Nx / 120;
  const halfNx = solver.Nx / 2;
  const halfNy = solver.Ny / 2;
  const xMin = -halfNx + 1;
  const xMax = halfNx - 1;
  const xSpan = xMax - xMin;
  const phase = mode === 'distributed'
    ? (index + Math.random()) / Math.max(count, 1)
    : Math.random();
  const spawnSpan = mode === 'distributed'
    ? xSpan
    : Math.min(xSpan, Math.max(18 * gs, solver.Nx * 0.12));

  const yMin = groundY !== undefined ? groundY : -halfNy + 1;
  const yMax = halfNy - 1;

  positions[index * 3] = xMin + phase * spawnSpan;
  positions[index * 3 + 1] = yMin + Math.random() * (yMax - yMin);
  positions[index * 3 + 2] = (Math.random() - 0.5) * 36 * gs;
  ages[index] = phase * spawnSpan;
}

export default function WindTunnelCanvas({
  solver,
  params,
  visuals,
  isSimulating,
  customPoints,
  onFpsUpdate,
}: WindTunnelCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const flowCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Three.js Core Refs
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Scene Objects
  const obstacleMeshRef = useRef<THREE.Object3D | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  const streamlinesGroupRef = useRef<THREE.Group | null>(null);
  const forceArrowsGroupRef = useRef<THREE.Group | null>(null);
  const slicePlaneRef = useRef<THREE.Mesh | null>(null);
  const groundGroupRef = useRef<THREE.Group | null>(null);
  const sliceTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const obstacleReadyRef = useRef(false);
  const obstacleLoadIdRef = useRef(0);
  const cachedPivotRef = useRef<THREE.Object3D | null>(null);

  // State definitions for HUD
  const [fps, setFps] = useState(0);
  const [, setTriggerUpdate] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);

  // Track Dimensions
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  // Smoke Particle state
  const particleCount = visuals.particleCount || 1000;
  const particlePositionsRef = useRef<Float32Array | null>(null);
  const particleAgesRef = useRef<Float32Array | null>(null);

  // Render slice at a capped resolution for performance — sample from the full LBM grid
  const sliceW = Math.min(solver.Nx, 960);
  const sliceH = Math.min(solver.Ny, 480);
  const sliceStepX = solver.Nx / sliceW;
  const sliceStepY = solver.Ny / sliceH;
  if (!flowCanvasRef.current) {
    const canvas = document.createElement('canvas');
    canvas.width = sliceW;
    canvas.height = sliceH;
    flowCanvasRef.current = canvas;
  }

  // 1. ResizeObserver setup
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = (width: number, height: number) => {
      setDimensions({
        width: Math.max(width, window.innerWidth, 1),
        height: Math.max(height, window.innerHeight, 350),
      });
    };

    const rect = containerRef.current.getBoundingClientRect();
    updateDimensions(rect.width, rect.height);

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      updateDimensions(width, height);
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Update Three.js viewport on resize
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (renderer && camera) {
      renderer.setSize(dimensions.width, dimensions.height, false);
      camera.aspect = dimensions.width / dimensions.height;
      camera.updateProjectionMatrix();
    }
  }, [dimensions]);

  // 2. Initialize Three.js Scene (Runs ONCE on mount)
  useEffect(() => {
    if (!mountRef.current) return;

    const gs = solver.Nx / 120; // grid scale — all scene dimensions proportional to this

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1117);
    scene.fog = new THREE.FogExp2(0x0e1117, 0.0015 / gs);
    sceneRef.current = scene;

    const obsCx = solver.Nx / 3.5 - solver.Nx / 2;
    const initialWidth = Math.max(mountRef.current.clientWidth, window.innerWidth, dimensions.width, 1);
    const initialHeight = Math.max(mountRef.current.clientHeight, window.innerHeight, dimensions.height, 350);
    setDimensions({ width: initialWidth, height: initialHeight });

    const camera = new THREE.PerspectiveCamera(45, initialWidth / initialHeight, 0.1 * gs, 5000 * gs);
    camera.position.set(obsCx, 3 * gs, 32 * gs);
    camera.lookAt(obsCx, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(initialWidth, initialHeight, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    mountRef.current.replaceChildren();
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const obstacleCx = solver.Nx / 3.5 - solver.Nx / 2;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(obstacleCx, 0, 0);
    controls.maxPolarAngle = Math.PI / 2;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.update();
    controlsRef.current = controls;

    const tunnelWidth = solver.Nx;
    const tunnelHeight = solver.Ny;
    const tunnelDepth = 40 * gs;

    // Ground group — grid + reflective floor
    const groundGroup = new THREE.Group();
    const gridHelper = new THREE.GridHelper(240 * gs, 48, 0x1e3a5f, 0x0f1d2e);
    gridHelper.position.y = 0;
    groundGroup.add(gridHelper);

    const floorGeo = new THREE.PlaneGeometry(tunnelWidth * 1.5, tunnelDepth * 1.5);
    const floorMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a0f18,
      roughness: 0.35,
      metalness: 0.6,
      reflectivity: 0.4,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    groundGroup.add(floor);

    groundGroup.position.y = -tunnelHeight * 0.07;
    groundGroup.visible = visuals.showGround;
    scene.add(groundGroup);
    groundGroupRef.current = groundGroup;

    const chamberGeom = new THREE.BoxGeometry(tunnelWidth, tunnelHeight, tunnelDepth);
    const chamberEdges = new THREE.EdgesGeometry(chamberGeom);
    const chamberLine = new THREE.LineSegments(
      chamberEdges,
      new THREE.LineBasicMaterial({ color: 0x334155, linewidth: 1.5 })
    );
    scene.add(chamberLine);

    // Add transparent acrylic wall panels
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.08,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const chamberMesh = new THREE.Mesh(chamberGeom, glassMat);
    scene.add(chamberMesh);

    // Dynamic Flow Cutting Slice Plane
    const sliceGeo = new THREE.PlaneGeometry(tunnelWidth, tunnelHeight);
    const sliceTex = new THREE.CanvasTexture(flowCanvasRef.current!);
    sliceTex.minFilter = THREE.LinearFilter;
    sliceTex.magFilter = THREE.LinearFilter;
    sliceTextureRef.current = sliceTex;

    const sliceMat = new THREE.MeshBasicMaterial({
      map: sliceTex,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const slicePlane = new THREE.Mesh(sliceGeo, sliceMat);
    // position inside tunnel center, offset slightly forward to prevent overlap with obstacle
    slicePlane.position.set(0, 0, -0.5);
    scene.add(slicePlane);
    slicePlaneRef.current = slicePlane;

    // Wind Inlet flow grill mesh structure (visual only)
    const grillGeom = new THREE.PlaneGeometry(tunnelDepth, tunnelHeight);
    const grillMat = new THREE.MeshBasicMaterial({
      color: 0x1d4ed8,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const inletGrill = new THREE.Mesh(grillGeom, grillMat);
    inletGrill.rotation.y = Math.PI / 2;
    inletGrill.position.set(-tunnelWidth / 2, 0, 0);
    scene.add(inletGrill);

    const outletGrill = new THREE.Mesh(grillGeom, grillMat);
    outletGrill.rotation.y = Math.PI / 2;
    outletGrill.position.set(tunnelWidth / 2, 0, 0);
    scene.add(outletGrill);

    // Professional photo studio softbox lighting rig
    const ambientLight = new THREE.AmbientLight(0xe8ecf0, 0.6);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xc8d8f0, 0x1a1a2e, 0.7);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.0);
    keyLight.position.set(100 * gs, 120 * gs, 80 * gs);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -40 * gs;
    keyLight.shadow.camera.right = 40 * gs;
    keyLight.shadow.camera.top = 20 * gs;
    keyLight.shadow.camera.bottom = -20 * gs;
    keyLight.shadow.camera.near = 10 * gs;
    keyLight.shadow.camera.far = 300 * gs;
    keyLight.shadow.bias = -0.001;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd4e4ff, 1.0);
    fillLight.position.set(-100 * gs, 60 * gs, 60 * gs);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 1.2);
    rimLight.position.set(-40 * gs, 80 * gs, -120 * gs);
    scene.add(rimLight);

    const bounceLight = new THREE.DirectionalLight(0xb0c4de, 0.25);
    bounceLight.position.set(0, -80 * gs, 40 * gs);
    scene.add(bounceLight);

    const kickerLight = new THREE.PointLight(0x10b981, 0.4, 300 * gs);
    kickerLight.position.set(80 * gs, -20 * gs, -60 * gs);
    scene.add(kickerLight);

    // Streamlines / Wind Smoke Particle System
    const particlesGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(particleCount * 3);
    const ages = new Float32Array(particleCount);

    // Backfill particles along the flow path so startup looks like a continuous stream.
    for (let i = 0; i < particleCount; i++) {
      seedSmokeParticle(pos, ages, i, particleCount, solver, 'distributed');
    }

    particlesGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particlePositionsRef.current = pos;
    particleAgesRef.current = ages;

    // Use a cool high-tech neon green particle style
    const pMaterial = new THREE.PointsMaterial({
      color: 0x10b981,
      size: visuals.particleSize ?? 1.4,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particlePoints = new THREE.Points(particlesGeo, pMaterial);
    scene.add(particlePoints);
    particlesRef.current = particlePoints;

    // Group to hold our physical ArrowHelpers for Lift (green) & Drag (red) forces
    const forceArrowsGroup = new THREE.Group();
    scene.add(forceArrowsGroup);
    forceArrowsGroupRef.current = forceArrowsGroup;

    setSceneReady(true);

    // Clean up Three.js on unmount
    return () => {
      setSceneReady(false);
      renderer.dispose();
      controls.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // 3. Dynamic Obstacle Generation on LBM Shape Change or Parameter Updates
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneReady) return;

    const loadId = ++obstacleLoadIdRef.current;
    let cancelled = false;
    const isCurrentLoad = () => !cancelled && loadId === obstacleLoadIdRef.current;

    obstacleReadyRef.current = false;
    solver.obstacle.fill(0);
    solver.groundRow = -1;
    solver.reset(0);

    // Remove existing obstacle
    if (obstacleMeshRef.current) {
      scene.remove(obstacleMeshRef.current);
      obstacleMeshRef.current.traverse((child) => {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else mat.dispose();
        }
      });
      obstacleMeshRef.current = null;
    }

    const scale = params.obstacleScale;
    const cx3d = solver.Nx / 3.5 - solver.Nx / 2;

    const carMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x78889a,
      roughness: 0.28,
      metalness: 0.75,
      clearcoat: 0.3,
      clearcoatRoughness: 0.15,
      reflectivity: 0.6,
    });

    // --- Helper: project a 3D object onto the LBM grid as obstacle mask ---
    const projectObstacleMask = (obj: THREE.Object3D) => {
      if (!rendererRef.current) return false;
      const Nx = solver.Nx;
      const Ny = solver.Ny;
      const silMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

      const offScene = new THREE.Scene();
      offScene.background = new THREE.Color(0x000000);

      const silClone = obj.clone(true);
      silClone.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).material = silMat;
      });

      const silGroup = new THREE.Group();
      silGroup.add(silClone);
      silGroup.position.set(Nx / 3.5, Ny / 2, 0);
      silGroup.rotation.z = (params.angleIndex * Math.PI) / 180;
      offScene.add(silGroup);

      const ortho = new THREE.OrthographicCamera(0, Nx, Ny, 0, -Nx, Nx);
      ortho.position.set(0, 0, Nx / 2);
      ortho.lookAt(0, 0, 0);

      const rt = new THREE.WebGLRenderTarget(Nx, Ny);
      rendererRef.current.setRenderTarget(rt);
      rendererRef.current.render(offScene, ortho);
      rendererRef.current.setRenderTarget(null);

      const pixels = new Uint8Array(Nx * Ny * 4);
      rendererRef.current.readRenderTargetPixels(rt, 0, 0, Nx, Ny, pixels);
      rt.dispose();
      silMat.dispose();

      let maskPixels = 0;
      solver.obstacle.fill(0);
      for (let y = 0; y < Ny; y++) {
        for (let x = 0; x < Nx; x++) {
          if (pixels[(y * Nx + x) * 4] > 127) {
            solver.obstacle[y * Nx + x] = 1;
            maskPixels++;
          }
        }
      }
      return maskPixels > 0;
    };

    // --- Helper: place finished obstacle in scene + update ground ---
    const placeObstacle = (obj: THREE.Object3D, pivot: THREE.Object3D) => {
      if (!isCurrentLoad() || !projectObstacleMask(pivot)) return;

      const aoaGroup = new THREE.Group();
      aoaGroup.add(obj);
      aoaGroup.position.set(cx3d, 0, 0);
      aoaGroup.rotation.z = (params.angleIndex * Math.PI) / 180;

      if (obstacleMeshRef.current) {
        scene.remove(obstacleMeshRef.current);
      }
      scene.add(aoaGroup);
      obstacleMeshRef.current = aoaGroup;

      // Position ground at the bottom of the obstacle
      if (groundGroupRef.current) {
        const objBox = new THREE.Box3().setFromObject(aoaGroup);
        groundGroupRef.current.position.y = objBox.min.y;
      }

      // Ground effect: fill all cells below ground as solid obstacle
      if (visuals.showGround) {
        let obsMinY = solver.Ny;
        let obsMaxY = 0;
        for (let y = 0; y < solver.Ny; y++) {
          for (let x = 0; x < solver.Nx; x++) {
            if (solver.obstacle[y * solver.Nx + x] === 1) {
              if (y < obsMinY) obsMinY = y;
              if (y > obsMaxY) obsMaxY = y;
            }
          }
        }
        const obsHeight = Math.max(obsMaxY - obsMinY, 1);
        const groundGap = Math.max(Math.floor(obsHeight * 0.08), 3);
        const gRow = Math.max(0, obsMinY - groundGap);
        solver.groundRow = gRow;

        // Mark all cells below ground as solid — no fluid exists below ground
        for (let y = 0; y < gRow; y++) {
          for (let x = 0; x < solver.Nx; x++) {
            solver.obstacle[y * solver.Nx + x] = 1;
          }
        }
      } else {
        solver.groundRow = -1;
      }

      // Reset flow with obstacle in place to avoid initial explosion
      solver.reset(params.inletVelocity);
      cachedPivotRef.current = pivot;
      obstacleReadyRef.current = true;
    };

    const meshGs = solver.Nx / 120;

    if (params.obstacleType === 'car' || params.obstacleType === 'train') {
      const modelUrl = params.obstacleType === 'car' ? teslaModelUrl : shinkansenModelUrl;
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);
      loader.load(modelUrl, (gltf) => {
        if (!isCurrentLoad() || !sceneRef.current || !rendererRef.current) return;
        const model = gltf.scene;

        const toRemove: THREE.Object3D[] = [];
        model.traverse((child) => {
          if (!(child as THREE.Mesh).isMesh) return;
          const geo = (child as THREE.Mesh).geometry;
          if (geo) {
            geo.computeBoundingBox();
            const gSize = geo.boundingBox!.getSize(new THREE.Vector3());
            if (Math.min(gSize.x, gSize.y, gSize.z) < Math.max(gSize.x, gSize.y, gSize.z) * 0.001) toRemove.push(child);
          }
        });
        toRemove.forEach(c => c.removeFromParent());

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            (child as THREE.Mesh).material = carMaterial;
            (child as THREE.Mesh).castShadow = true;
          }
        });

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const longestDim = Math.max(size.x, size.y, size.z);
        const targetLength = 26 * scale * meshGs;
        const s = targetLength / longestDim;

        const centering = new THREE.Group();
        centering.add(model);
        model.position.set(-center.x, -center.y, -center.z);

        const pivot = new THREE.Group();
        pivot.add(centering);
        pivot.scale.setScalar(s);
        pivot.rotation.y = params.obstacleType === 'car' ? Math.PI / 2 : Math.PI;

        placeObstacle(pivot, pivot);
      }, undefined, (error) => {
        if (isCurrentLoad()) {
          console.error('Failed to load wind tunnel model', error);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    // --- Non-GLB obstacles: build extruded 3D geometry ---
    {
      const shape = new THREE.Shape();
      let shapePoints: { x: number; y: number }[] = [];

      if (params.obstacleType.startsWith('naca')) {
        let m = params.nacaParams.m;
        let p = params.nacaParams.p;
        let t = params.nacaParams.t;
        if (params.obstacleType === 'naca0012') { m = 0.0; p = 0.0; t = 0.12; }
        else if (params.obstacleType === 'naca2412') { m = 0.02; p = 0.4; t = 0.12; }
        else if (params.obstacleType === 'naca4412') { m = 0.04; p = 0.4; t = 0.12; }
        shapePoints = getNacaPoints(m, p, t, scale * 26 * meshGs);

      } else if (params.obstacleType === 'circle') {
        const radius = scale * 6.5 * meshGs;
        for (let i = 0; i <= 60; i++) {
          const theta = (i / 60) * Math.PI * 2;
          shapePoints.push({ x: Math.cos(theta) * radius, y: Math.sin(theta) * radius });
        }

      } else if (params.obstacleType === 'flat_plate') {
        const len = scale * 22 * meshGs;
        const h = 1.6 * meshGs;
        shapePoints = [
          { x: -len / 2, y: -h / 2 }, { x: len / 2, y: -h / 2 },
          { x: len / 2, y: h / 2 }, { x: -len / 2, y: h / 2 },
        ];

      } else if (params.obstacleType === 'custom' && customPoints && customPoints.length > 0) {
        shapePoints = customPoints.map(p => ({ x: p.x - solver.Nx / 3.5, y: solver.Ny / 2 - p.y }));

      } else if (params.obstacleType === 'uploaded') {
        const boxSize = scale * 16 * meshGs;
        shapePoints = [
          { x: -boxSize / 2, y: -boxSize / 2 }, { x: boxSize / 2, y: -boxSize / 2 },
          { x: boxSize / 2, y: boxSize / 2 }, { x: -boxSize / 2, y: boxSize / 2 },
        ];

      } else {
        const radius = scale * 7.0 * meshGs;
        for (let i = 0; i <= 30; i++) {
          const theta = (i / 30) * Math.PI * 2;
          shapePoints.push({ x: Math.cos(theta) * radius, y: Math.sin(theta) * radius });
        }
      }

      if (shapePoints.length === 0) return;

      shape.moveTo(shapePoints[0].x, shapePoints[0].y);
      for (let i = 1; i < shapePoints.length; i++) shape.lineTo(shapePoints[i].x, shapePoints[i].y);
      shape.lineTo(shapePoints[0].x, shapePoints[0].y);

      const geometry = new THREE.ExtrudeGeometry(shape, {
        steps: 2, depth: 30 * meshGs,
        bevelEnabled: true, bevelThickness: 1.0 * meshGs, bevelSize: 0.5 * meshGs,
        bevelOffset: 0, bevelSegments: 6, curveSegments: 24,
      });
      geometry.center();

      const mesh = new THREE.Mesh(geometry, carMaterial);
      mesh.castShadow = true;
      placeObstacle(mesh, mesh);
    }

    return () => {
      cancelled = true;
    };
  }, [params.obstacleType, params.obstacleScale, params.nacaParams, customPoints, sceneReady, visuals.showGround]);

  // Handle Angle of Attack — rotate 3D model + re-project silhouette + reset flow
  useEffect(() => {
    const obj = obstacleMeshRef.current;
    const pivot = cachedPivotRef.current;
    if (!obj || !pivot || !rendererRef.current) return;

    const angleRad = (params.angleIndex * Math.PI) / 180;
    obj.rotation.z = angleRad;

    // Re-project obstacle mask at the new angle
    const Nx = solver.Nx;
    const Ny = solver.Ny;
    const silMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const offScene = new THREE.Scene();
    offScene.background = new THREE.Color(0x000000);
    const silClone = pivot.clone(true);
    silClone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).material = silMat;
    });
    const silGroup = new THREE.Group();
    silGroup.add(silClone);
    silGroup.position.set(Nx / 3.5, Ny / 2, 0);
    silGroup.rotation.z = angleRad;
    offScene.add(silGroup);

    const ortho = new THREE.OrthographicCamera(0, Nx, Ny, 0, -Nx, Nx);
    ortho.position.set(0, 0, Nx / 2);
    ortho.lookAt(0, 0, 0);

    const rt = new THREE.WebGLRenderTarget(Nx, Ny);
    rendererRef.current.setRenderTarget(rt);
    rendererRef.current.render(offScene, ortho);
    rendererRef.current.setRenderTarget(null);

    const pixels = new Uint8Array(Nx * Ny * 4);
    rendererRef.current.readRenderTargetPixels(rt, 0, 0, Nx, Ny, pixels);
    rt.dispose();
    silMat.dispose();

    solver.obstacle.fill(0);
    for (let y = 0; y < Ny; y++) {
      for (let x = 0; x < Nx; x++) {
        if (pixels[(y * Nx + x) * 4] > 127) solver.obstacle[y * Nx + x] = 1;
      }
    }

    // Reapply ground
    if (visuals.showGround) {
      let obsMinY = Ny, obsMaxY = 0;
      for (let y = 0; y < Ny; y++) {
        for (let x = 0; x < Nx; x++) {
          if (solver.obstacle[y * Nx + x] === 1) {
            if (y < obsMinY) obsMinY = y;
            if (y > obsMaxY) obsMaxY = y;
          }
        }
      }
      const gRow = Math.max(0, obsMinY - Math.max(Math.floor((obsMaxY - obsMinY) * 0.08), 3));
      solver.groundRow = gRow;
      for (let y = 0; y < gRow; y++) {
        for (let x = 0; x < Nx; x++) solver.obstacle[y * Nx + x] = 1;
      }
    }

    solver.reset(params.inletVelocity);
  }, [params.angleIndex]);

  // Toggle Visibility Settings
  useEffect(() => {
    if (slicePlaneRef.current) slicePlaneRef.current.visible = visuals.showSlice;
    if (particlesRef.current) particlesRef.current.visible = visuals.showSmoke;
    if (groundGroupRef.current) groundGroupRef.current.visible = visuals.showGround;
  }, [visuals.showSlice, visuals.showSmoke, visuals.showGround]);

  // Update particle size reactively
  useEffect(() => {
    if (particlesRef.current) {
      (particlesRef.current.material as THREE.PointsMaterial).size = visuals.particleSize ?? 1.4;
    }
  }, [visuals.particleSize]);

  // Rebuild particle buffer when density (count) changes
  useEffect(() => {
    const pointsObj = particlesRef.current;
    if (!pointsObj) return;
    const count = visuals.particleCount || 1000;
    const pos = new Float32Array(count * 3);
    const ages = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      seedSmokeParticle(pos, ages, i, count, solver, 'distributed');
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pointsObj.geometry.dispose();
    pointsObj.geometry = geo;
    particlePositionsRef.current = pos;
    particleAgesRef.current = ages;
  }, [visuals.particleCount]);

  // Reset particle positions when viscosity changes to flush stale distributions
  useEffect(() => {
    const positions = particlePositionsRef.current;
    const ages = particleAgesRef.current;
    if (!positions || !ages) return;
    const count = ages.length;
    for (let i = 0; i < count; i++) {
      seedSmokeParticle(positions, ages, i, count, solver, 'distributed');
    }
  }, [params.viscosity]);

  useEffect(() => {
    if (!obstacleReadyRef.current) return;

    solver.reset(params.inletVelocity);

    const positions = particlePositionsRef.current;
    const ages = particleAgesRef.current;
    if (!positions || !ages) return;

    const groundSceneY = (solver.groundRow >= 0 ? solver.groundRow : 0) - solver.Ny / 2;
    const count = ages.length;
    for (let i = 0; i < count; i++) {
      seedSmokeParticle(positions, ages, i, count, solver, 'distributed', groundSceneY);
    }
  }, [params.inletVelocity]);

  // 4. MAIN SIMULATION & RENDERING ANIMATION LOOP
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsTimer = 0;

    const renderLoop = () => {
      animationFrameId = requestAnimationFrame(renderLoop);

      const currentTime = performance.now();
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      // FPS tracking
      frameCount++;
      fpsTimer += deltaTime;
      if (fpsTimer >= 1.0) {
        const currentFps = Math.round(frameCount / fpsTimer);
        setFps(currentFps);
        if (onFpsUpdate) onFpsUpdate(currentFps);
        frameCount = 0;
        fpsTimer = 0;
        setTriggerUpdate((u) => u + 1);
      }

      // Perform LBM Physics steps (only after obstacle is placed)
      if (isSimulating && solver.isStable && obstacleReadyRef.current) {
        const u0 = params.inletVelocity;
        const visc = params.viscosity;
        for (let s = 0; s < params.stepsPerFrame; s++) {
          solver.step(u0, visc);
        }
      }

      // Update 2D fluid heatmap texture
      if (flowCanvasRef.current && sliceTextureRef.current) {
        const ctx = flowCanvasRef.current.getContext('2d');
        if (ctx) {
          updateFluidHeatmapCanvas(ctx);
          sliceTextureRef.current.needsUpdate = true;
        }
      }

      // Update 3D forces arrow indicators
      updateForceArrows();

      // Update interactive Particle smoke traces
      updateSmokeParticles();

      // Update Orbit controls & render
      if (controlsRef.current) controlsRef.current.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animationFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isSimulating, params, visuals]);

  const updateFluidHeatmapCanvas = (ctx: CanvasRenderingContext2D) => {
    const Nx = solver.Nx;
    const Ny = solver.Ny;
    const imgData = ctx.createImageData(sliceW, sliceH);
    const data = imgData.data;

    let maxVal = 1e-5;

    // Dynamically retrieve normalizer scales based on fluid selection
    if (visuals.coloring === 'velocity') {
      maxVal = Math.max(params.inletVelocity * 1.8, 1e-5); // clip range to look great
    } else if (visuals.coloring === 'vorticity') {
      maxVal = 0.05 + 0.1 * params.inletVelocity;
    } else {
      maxVal = 0.45; // standard pressure scale
    }

    for (let sy = 0; sy < sliceH; sy++) {
      const srcY = Math.floor(sy * sliceStepY);
      const destY = sliceH - 1 - sy;
      for (let sx = 0; sx < sliceW; sx++) {
        const srcX = Math.floor(sx * sliceStepX);
        const cIdx = srcY * Nx + srcX;
        const pixelIdx = (destY * sliceW + sx) * 4;

        if (solver.obstacle[cIdx] === 1) {
          data[pixelIdx] = 30; data[pixelIdx + 1] = 41; data[pixelIdx + 2] = 59; data[pixelIdx + 3] = 0;
          continue;
        }

        let val = 0;
        if (visuals.coloring === 'velocity') {
          val = solver.speed[cIdx];
        } else if (visuals.coloring === 'vorticity') {
          val = solver.vorticity[cIdx];
        } else {
          val = solver.pressure[cIdx];
        }

        if (visuals.coloring === 'velocity') {
          const norm = Math.min(Math.max(val / maxVal, 0), 1);
          data[pixelIdx] = 14 + norm * 240 | 0;
          data[pixelIdx + 1] = 22 + norm * 210 | 0;
          data[pixelIdx + 2] = 37 + norm * 150 | 0;
          data[pixelIdx + 3] = 180 * (0.35 + 0.65 * norm) | 0;
        } else if (visuals.coloring === 'vorticity') {
          const scaleVal = val / maxVal;
          const norm = Math.min(Math.max(Math.abs(scaleVal), 0), 1);
          if (val > 0) {
            data[pixelIdx] = 14 + norm * 40 | 0;
            data[pixelIdx + 1] = 22 + norm * 80 | 0;
            data[pixelIdx + 2] = 37 + norm * 210 | 0;
          } else {
            data[pixelIdx] = 210 * norm + 14 * (1 - norm) | 0;
            data[pixelIdx + 1] = 32 * norm + 22 * (1 - norm) | 0;
            data[pixelIdx + 2] = 37 * (1 - norm) | 0;
          }
          data[pixelIdx + 3] = 190 * (0.15 + 0.85 * norm) | 0;
        } else {
          let delta = (val - 0.333) * 4.0;
          const map = Math.min(Math.max(delta, -1), 1);
          if (map < 0) {
            const norm = -map;
            data[pixelIdx] = 30 * (1 - norm) + 59 * norm | 0;
            data[pixelIdx + 1] = 41 * (1 - norm) + 130 * norm | 0;
            data[pixelIdx + 2] = 59 * (1 - norm) + 246 * norm | 0;
            data[pixelIdx + 3] = 190 * (0.2 + 0.8 * norm) | 0;
          } else {
            const norm = map;
            data[pixelIdx] = 30 * (1 - norm) + 239 * norm | 0;
            data[pixelIdx + 1] = 41 * (1 - norm) + 115 * norm | 0;
            data[pixelIdx + 2] = 59 * (1 - norm) + 33 * norm | 0;
            data[pixelIdx + 3] = 190 * (0.2 + 0.8 * norm) | 0;
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  };

  // Physically computes and redraws 3D force arrows indicating Drag/Lift components
  const updateForceArrows = () => {
    const group = forceArrowsGroupRef.current;
    if (!group) return;

    // Clear previous arrows
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    const cx3d = solver.Nx / 3.5 - solver.Nx / 2;
    const cy3d = 0;

    // Lift force is vertical, Drag force is horizontal
    let lForce = solver.lastLiftForce;
    let dForce = solver.lastDragForce;

    // In Three.js world, physical arrow scales:
    const arrowScaleFactor = 0.16 / (params.inletVelocity * params.inletVelocity);

    // Render Lift Vector (Cool neon green pointing upwards)
    if (Math.abs(lForce) > 1e-3) {
      const dirY = lForce > 0 ? 1 : -1;
      const liftDirection = new THREE.Vector3(0, dirY, 0);
      const liftMag = Math.min(Math.abs(lForce) * arrowScaleFactor, 36 * (solver.Nx / 120));
      
      if (liftMag > 0.5) {
        const gs = solver.Nx / 120;
        const liftArrow = new THREE.ArrowHelper(
          liftDirection,
          new THREE.Vector3(cx3d, cy3d, 0),
          liftMag,
          0x10b981,
          3.5 * gs,
          1.2 * gs
        );
        group.add(liftArrow);
      }
    }

    // Render Drag Vector (Crimson red pointing downstream)
    if (Math.abs(dForce) > 1e-3) {
      const dirX = dForce > 0 ? 1 : -1;
      const dragDirection = new THREE.Vector3(dirX, 0, 0);
      const dragMag = Math.min(Math.abs(dForce) * arrowScaleFactor, 36 * (solver.Nx / 120));

      if (dragMag > 0.5) {
        const dragArrow = new THREE.ArrowHelper(
          dragDirection,
          new THREE.Vector3(cx3d, cy3d, 0),
          dragMag,
          0xef4444,
          3.5 * (solver.Nx / 120),
          1.2 * (solver.Nx / 120)
        );
        group.add(dragArrow);
      }
    }
  };

  // Advances physical Smoke tracers in 3D based on sub-grid bilinear LBM flow velocities
  const updateSmokeParticles = () => {
    const pointsObj = particlesRef.current;
    const positions = particlePositionsRef.current;
    const ages = particleAgesRef.current;
    if (!pointsObj || !positions || !ages) return;

    const positionsAttr = pointsObj.geometry.attributes.position as THREE.BufferAttribute;
    const count = positionsAttr.count;

    const halfNx = solver.Nx / 2;
    const halfNy = solver.Ny / 2;

    const groundLbmY = solver.groundRow >= 0 ? solver.groundRow : 0;
    const groundSceneY = groundLbmY - halfNy;
    const offscreen = -halfNy - 1000;

    for (let i = 0; i < count; i++) {
      const pxIdx = i * 3;
      const pyIdx = i * 3 + 1;
      const pzIdx = i * 3 + 2;

      // Negative age = cooldown (particle hidden, waiting to spawn)
      if (ages[i] < 0) {
        ages[i]++;
        positions[pyIdx] = offscreen;
        if (ages[i] >= 0) {
          seedSmokeParticle(positions, ages, i, count, solver, 'inlet', groundSceneY);
          ages[i] = 0;
        }
        continue;
      }

      let x3d = positions[pxIdx];
      let y3d = positions[pyIdx];
      let z3d = positions[pzIdx];

      const lbmX = x3d + halfNx;
      const lbmY = y3d + halfNy;

      const vel = solver.queryVelocity(lbmX, lbmY);

      const vx = Number.isNaN(vel.ux) ? 0 : vel.ux;
      const vy = Number.isNaN(vel.uy) ? 0 : vel.uy;
      const spd = Math.sqrt(vx * vx + vy * vy);
      const boost = spd > 1e-6 ? Math.max(32.5, 0.4 / spd) : 32.5;
      x3d += vx * boost;
      y3d += vy * boost;

      z3d += (Math.random() - 0.5) * 0.12;
      ages[i]++;

      const gx = Math.round(lbmX);
      const gy = Math.round(lbmY);
      const isObs = gx >= 0 && gx < solver.Nx && gy >= 0 && gy < solver.Ny &&
                    solver.obstacle[gy * solver.Nx + gx] === 1;

      if (y3d < groundSceneY) y3d = groundSceneY + Math.random() * 0.5;

      if (
        Number.isNaN(x3d) || Number.isNaN(y3d) || Number.isNaN(z3d) ||
        x3d >= halfNx - 1 ||
        x3d < -halfNx + 1 ||
        y3d >= halfNy - 1 ||
        y3d < groundSceneY ||
        isObs
      ) {
        // Stagger respawn: random cooldown of 1-30 frames
        ages[i] = -(1 + Math.floor(Math.random() * 30));
        positions[pyIdx] = offscreen;
        continue;
      }

      positions[pxIdx] = x3d;
      positions[pyIdx] = y3d;
      positions[pzIdx] = z3d;
    }

    positionsAttr.needsUpdate = true;
  };

  return (
    <div id="wind-tunnel-viewport" className="absolute inset-0 bg-slate-950" ref={containerRef}>
      <div id="threejs-mount-point" className="w-full h-full" ref={mountRef}></div>
    </div>
  );
}
