import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { LBMSolver, getNacaPoints } from '../lbmSolver';
import { LBM3DSolver } from '../gpu/LBM3DSolver';
import { voxelizeMesh } from '../gpu/voxelizer';
import teslaModelUrl from '../assets/tesla_model3.glb?url';
import shinkansenModelUrl from '../assets/shinkansen_n700.glb?url';
import { SimulationParams, VisualOptions, Point2D } from '../types';

// ---------------------------------------------------------------------------
// Particle constants
// ---------------------------------------------------------------------------
const PARTICLE_LIFE_MIN = 800;
const PARTICLE_LIFE_MAX = 1600;
const SPAWN_X_FRACTION = 0.12;
const STALL_LIFE_PENALTY = 10;

// ---------------------------------------------------------------------------
// 3-D lofted body helpers
// ---------------------------------------------------------------------------

interface LoftStation { x: number; hw: number; rhw: number; bot: number; top: number }

function buildLoftedGeometry(stations: LoftStation[], segments: number, flatBottom: boolean): THREE.BufferGeometry {
  const n = segments;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let si = 0; si < stations.length; si++) {
    const st = stations[si];
    for (let ci = 0; ci < n; ci++) {
      const angle = (ci / n) * Math.PI * 2;
      const sa = Math.sin(angle);
      const ca = Math.cos(angle);
      let y: number, z: number;
      if (flatBottom) {
        if (angle <= Math.PI) {
          z = (st.hw + (st.rhw - st.hw) * sa) * ca;
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

  for (let si = 0; si < stations.length - 1; si++) {
    for (let ci = 0; ci < n; ci++) {
      const a = si * n + ci, b = si * n + (ci + 1) % n;
      const c = (si + 1) * n + ci, d = (si + 1) * n + (ci + 1) % n;
      indices.push(a, c, b, b, c, d);
    }
  }

  const last = stations[stations.length - 1];
  const frontIdx = positions.length / 3;
  positions.push(last.x, (last.bot + last.top) / 2, 0);
  for (let ci = 0; ci < n; ci++) indices.push(frontIdx, (stations.length - 1) * n + (ci + 1) % n, (stations.length - 1) * n + ci);

  const first = stations[0];
  const rearIdx = positions.length / 3;
  positions.push(first.x, (first.bot + first.top) / 2, 0);
  for (let ci = 0; ci < n; ci++) indices.push(rearIdx, ci, (ci + 1) % n);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildTeslaModel3Geometry(scale: number): THREE.BufferGeometry {
  const s = scale;
  return buildLoftedGeometry([
    { x: -12*s, hw: 0.3*s,  rhw: 0.2*s,  bot: -1.5*s, top: -0.3*s },
    { x: -11*s, hw: 2.5*s,  rhw: 2.0*s,  bot: -3.0*s, top: 0.5*s },
    { x: -9.5*s, hw: 4.0*s, rhw: 3.2*s,  bot: -3.5*s, top: 1.0*s },
    { x: -8*s,  hw: 4.5*s,  rhw: 3.5*s,  bot: -3.5*s, top: 1.8*s },
    { x: -6*s,  hw: 4.6*s,  rhw: 2.8*s,  bot: -3.5*s, top: 2.8*s },
    { x: -4*s,  hw: 4.7*s,  rhw: 2.6*s,  bot: -3.5*s, top: 3.4*s },
    { x: -2*s,  hw: 4.7*s,  rhw: 2.5*s,  bot: -3.5*s, top: 3.8*s },
    { x: 0,     hw: 4.7*s,  rhw: 2.5*s,  bot: -3.5*s, top: 3.9*s },
    { x: 2*s,   hw: 4.7*s,  rhw: 2.3*s,  bot: -3.5*s, top: 3.4*s },
    { x: 4*s,   hw: 4.6*s,  rhw: 3.8*s,  bot: -3.5*s, top: 1.8*s },
    { x: 6*s,   hw: 4.5*s,  rhw: 4.3*s,  bot: -3.5*s, top: 0.3*s },
    { x: 8*s,   hw: 4.3*s,  rhw: 4.0*s,  bot: -3.3*s, top: 0.0*s },
    { x: 10*s,  hw: 3.5*s,  rhw: 3.2*s,  bot: -2.8*s, top: -0.5*s },
    { x: 11*s,  hw: 2.0*s,  rhw: 1.8*s,  bot: -2.0*s, top: -0.8*s },
    { x: 12*s,  hw: 0.3*s,  rhw: 0.2*s,  bot: -1.2*s, top: -0.5*s },
  ], 36, true);
}

function buildShinkansenGeometry(scale: number): THREE.BufferGeometry {
  const s = scale;
  return buildLoftedGeometry([
    { x: -13*s, hw: 4.0*s, rhw: 3.6*s, bot: -4.0*s, top: 4.0*s },
    { x: -8*s,  hw: 4.0*s, rhw: 3.6*s, bot: -4.0*s, top: 4.0*s },
    { x: -3*s,  hw: 4.0*s, rhw: 3.6*s, bot: -4.0*s, top: 4.0*s },
    { x: 0,     hw: 3.9*s, rhw: 3.5*s, bot: -4.0*s, top: 3.8*s },
    { x: 2*s,   hw: 3.6*s, rhw: 3.2*s, bot: -3.8*s, top: 3.4*s },
    { x: 4*s,   hw: 3.2*s, rhw: 2.6*s, bot: -3.5*s, top: 2.8*s },
    { x: 6*s,   hw: 2.5*s, rhw: 1.8*s, bot: -3.0*s, top: 1.8*s },
    { x: 8*s,   hw: 1.6*s, rhw: 1.0*s, bot: -2.4*s, top: 0.6*s },
    { x: 10*s,  hw: 0.8*s, rhw: 0.4*s, bot: -1.6*s, top: -0.3*s },
    { x: 12*s,  hw: 0.2*s, rhw: 0.1*s, bot: -0.8*s, top: -0.5*s },
    { x: 13*s,  hw: 0.05*s, rhw: 0.03*s, bot: -0.4*s, top: -0.35*s },
  ], 36, false);
}

// ---------------------------------------------------------------------------
// Particle spawn — fluid tracers filling the tunnel volume
// ---------------------------------------------------------------------------

function spawnParticle(
  positions: Float32Array,
  lives: Float32Array,
  i: number,
  solver: LBMSolver,
  groundY: number,
  solver3D: LBM3DSolver | null,
  fillDomain: boolean,
) {
  const halfNx = solver.Nx / 2;
  const halfNy = solver.Ny / 2;
  const gs = solver.Nx / 120;
  const xMin = -halfNx + 1;
  const xMax = halfNx - 1;
  const wallMargin = solver.Ny * 0.03;
  const yMin = groundY + wallMargin;
  const yMax = halfNy - 1 - wallMargin;

  if (fillDomain) {
    positions[i * 3] = xMin + Math.random() * (xMax - xMin);
  } else {
    positions[i * 3] = xMin + Math.random() * solver.Nx * SPAWN_X_FRACTION;
  }

  positions[i * 3 + 1] = yMin + Math.random() * (yMax - yMin);

  if (solver3D) {
    const gs3d = solver.Nx / solver3D.Nx;
    const halfZ = solver3D.Nz * gs3d / 2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2 * halfZ * 0.9;
  } else {
    positions[i * 3 + 2] = (Math.random() - 0.5) * 36 * gs;
  }

  lives[i] = PARTICLE_LIFE_MIN + Math.random() * (PARTICLE_LIFE_MAX - PARTICLE_LIFE_MIN);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface WindTunnelCanvasProps {
  solver: LBMSolver;
  solver3D?: LBM3DSolver | null;
  params: SimulationParams;
  visuals: VisualOptions;
  isSimulating: boolean;
  customPoints?: Point2D[] | null;
  onFpsUpdate?: (fps: number) => void;
}

export default function WindTunnelCanvas({
  solver, solver3D, params, visuals, isSimulating, customPoints, onFpsUpdate,
}: WindTunnelCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const flowCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const obstacleMeshRef = useRef<THREE.Object3D | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  const forceArrowsGroupRef = useRef<THREE.Group | null>(null);
  const slicePlaneRef = useRef<THREE.Mesh | null>(null);
  const groundGroupRef = useRef<THREE.Group | null>(null);
  const sliceTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const obstacleReadyRef = useRef(false);
  const obstacleLoadIdRef = useRef(0);
  const cachedPivotRef = useRef<THREE.Object3D | null>(null);

  const paramsRef = useRef(params);
  paramsRef.current = params;
  const visualsRef = useRef(visuals);
  visualsRef.current = visuals;
  const solver3DRef = useRef(solver3D);
  solver3DRef.current = solver3D;

  const [, setFps] = useState(0);
  const [, setTriggerUpdate] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  const particleCount = visuals.particleCount || 1000;
  const particlePositionsRef = useRef<Float32Array | null>(null);
  const particleLivesRef = useRef<Float32Array | null>(null);

  const sliceW = Math.min(solver.Nx, 960);
  const sliceH = Math.min(solver.Ny, 480);
  if (!flowCanvasRef.current) {
    const canvas = document.createElement('canvas');
    canvas.width = sliceW;
    canvas.height = sliceH;
    flowCanvasRef.current = canvas;
  }

  // ---- Resize observer ----
  useEffect(() => {
    if (!containerRef.current) return;
    const update = (w: number, h: number) => {
      setDimensions({ width: Math.max(w, window.innerWidth, 1), height: Math.max(h, window.innerHeight, 350) });
    };
    const rect = containerRef.current.getBoundingClientRect();
    update(rect.width, rect.height);
    const obs = new ResizeObserver((entries) => {
      if (entries[0]) { const { width, height } = entries[0].contentRect; update(width, height); }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const r = rendererRef.current, c = cameraRef.current;
    if (r && c) { r.setSize(dimensions.width, dimensions.height, false); c.aspect = dimensions.width / dimensions.height; c.updateProjectionMatrix(); }
  }, [dimensions]);

  // ---- Three.js scene init (once) ----
  useEffect(() => {
    if (!mountRef.current) return;
    const gs = solver.Nx / 120;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1117);
    scene.fog = new THREE.FogExp2(0x0e1117, 0.0015 / gs);
    sceneRef.current = scene;

    const obsCx = solver.Nx / 3.5 - solver.Nx / 2;
    const iw = Math.max(mountRef.current.clientWidth, window.innerWidth, 1);
    const ih = Math.max(mountRef.current.clientHeight, window.innerHeight, 350);
    setDimensions({ width: iw, height: ih });

    const camera = new THREE.PerspectiveCamera(45, iw / ih, 0.1 * gs, 5000 * gs);
    camera.position.set(obsCx, 3 * gs, 32 * gs);
    camera.lookAt(obsCx, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(iw, ih, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%';
    mountRef.current.replaceChildren();
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(obsCx, 0, 0);
    controls.maxPolarAngle = Math.PI / 2;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    controls.update();
    controlsRef.current = controls;

    const tw = solver.Nx, th = solver.Ny, td = 40 * gs;

    // Ground
    const groundGroup = new THREE.Group();
    groundGroup.add(new THREE.GridHelper(240 * gs, 48, 0x1e3a5f, 0x0f1d2e));
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(tw * 1.5, td * 1.5),
      new THREE.MeshPhysicalMaterial({ color: 0x0a0f18, roughness: 0.35, metalness: 0.6, reflectivity: 0.4 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    groundGroup.add(floor);
    groundGroup.position.y = -th * 0.07;
    groundGroup.visible = visuals.showGround;
    scene.add(groundGroup);
    groundGroupRef.current = groundGroup;

    // Wind-tunnel chamber
    const chamberGeom = new THREE.BoxGeometry(tw, th, td);
    scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(chamberGeom), new THREE.LineBasicMaterial({ color: 0x334155, linewidth: 1.5 })));
    scene.add(new THREE.Mesh(chamberGeom, new THREE.MeshPhysicalMaterial({ color: 0x1e293b, transparent: true, opacity: 0.08, roughness: 0.1, metalness: 0.1, transmission: 0.6, side: THREE.DoubleSide, depthWrite: false })));

    // Flow slice plane
    const sliceTex = new THREE.CanvasTexture(flowCanvasRef.current!);
    sliceTex.minFilter = THREE.LinearFilter;
    sliceTex.magFilter = THREE.LinearFilter;
    sliceTextureRef.current = sliceTex;
    const slicePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(tw, th),
      new THREE.MeshBasicMaterial({ map: sliceTex, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    slicePlane.position.set(0, 0, -0.5);
    scene.add(slicePlane);
    slicePlaneRef.current = slicePlane;

    // Inlet/outlet grills
    const grillGeo = new THREE.PlaneGeometry(td, th);
    const grillMat = new THREE.MeshBasicMaterial({ color: 0x1d4ed8, wireframe: true, transparent: true, opacity: 0.35 });
    const inlet = new THREE.Mesh(grillGeo, grillMat); inlet.rotation.y = Math.PI / 2; inlet.position.x = -tw / 2;
    const outlet = new THREE.Mesh(grillGeo, grillMat); outlet.rotation.y = Math.PI / 2; outlet.position.x = tw / 2;
    scene.add(inlet, outlet);

    // Lights
    scene.add(new THREE.AmbientLight(0xe8ecf0, 0.6));
    scene.add(new THREE.HemisphereLight(0xc8d8f0, 0x1a1a2e, 0.7));

    const addShadowLight = (color: number, intensity: number, pos: THREE.Vector3, mapSize: number) => {
      const l = new THREE.DirectionalLight(color, intensity);
      l.position.copy(pos);
      l.castShadow = true;
      l.shadow.mapSize.set(mapSize, mapSize);
      l.shadow.camera.left = -60 * gs; l.shadow.camera.right = 60 * gs;
      l.shadow.camera.top = 40 * gs; l.shadow.camera.bottom = -40 * gs;
      l.shadow.camera.near = 1 * gs; l.shadow.camera.far = 400 * gs;
      l.shadow.bias = -0.001; l.shadow.normalBias = 0.02;
      l.target.position.set(obsCx, 0, 0);
      scene.add(l, l.target);
      return l;
    };
    addShadowLight(0xfff5e6, 2.0, new THREE.Vector3(100 * gs, 120 * gs, 80 * gs), 4096);
    addShadowLight(0xd4e4ff, 1.0, new THREE.Vector3(-100 * gs, 60 * gs, 60 * gs), 2048);
    addShadowLight(0xffffff, 1.2, new THREE.Vector3(-40 * gs, 80 * gs, -120 * gs), 2048);
    const bounceLight = new THREE.DirectionalLight(0xb0c4de, 0.25);
    bounceLight.position.set(0, -80 * gs, 40 * gs);
    scene.add(bounceLight);
    const kicker = new THREE.PointLight(0x10b981, 0.4, 300 * gs);
    kicker.position.set(80 * gs, -20 * gs, -60 * gs);
    scene.add(kicker);

    // Particles
    const pos = new Float32Array(particleCount * 3);
    const lives = new Float32Array(particleCount);
    const groundY = -solver.Ny / 2;
    for (let i = 0; i < particleCount; i++) {
      spawnParticle(pos, lives, i, solver, groundY, null, true);
      lives[i] = Math.random() * PARTICLE_LIFE_MAX;
    }
    const particlesGeo = new THREE.BufferGeometry();
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particlePositionsRef.current = pos;
    particleLivesRef.current = lives;

    const particlePoints = new THREE.Points(particlesGeo, new THREE.PointsMaterial({
      color: 0x10b981, size: visuals.particleSize ?? 1.4,
      transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(particlePoints);
    particlesRef.current = particlePoints;

    const forceArrowsGroup = new THREE.Group();
    scene.add(forceArrowsGroup);
    forceArrowsGroupRef.current = forceArrowsGroup;

    setSceneReady(true);
    return () => { setSceneReady(false); renderer.dispose(); controls.dispose(); renderer.domElement.remove(); };
  }, []);

  // ---- Obstacle generation ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneReady) return;

    const loadId = ++obstacleLoadIdRef.current;
    let cancelled = false;
    const isCurrent = () => !cancelled && loadId === obstacleLoadIdRef.current;

    obstacleReadyRef.current = false;
    solver.obstacle.fill(0);
    solver.groundRow = -1;
    solver.reset(0);

    if (obstacleMeshRef.current) {
      scene.remove(obstacleMeshRef.current);
      obstacleMeshRef.current.traverse((c) => {
        if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
        if ((c as THREE.Mesh).material) {
          const m = (c as THREE.Mesh).material;
          if (Array.isArray(m)) m.forEach(x => x.dispose()); else m.dispose();
        }
      });
      obstacleMeshRef.current = null;
    }

    const scale = params.obstacleScale;
    const cx3d = solver.Nx / 3.5 - solver.Nx / 2;
    const meshGs = solver.Nx / 120;

    const carBodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x78889a, roughness: 0.28, metalness: 0.75, clearcoat: 0.3, clearcoatRoughness: 0.15, reflectivity: 0.6,
    });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x111118, roughness: 0.05, metalness: 0.0, transmission: 0.85, thickness: 0.5,
      transparent: true, opacity: 0.4, side: THREE.DoubleSide, ior: 1.5,
    });
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, roughness: 0.9, metalness: 0.0,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc, roughness: 0.05, metalness: 1.0,
    });
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.3, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.3,
    });
    const tailLightMat = new THREE.MeshStandardMaterial({
      color: 0xff1a1a, roughness: 0.3, metalness: 0.2, emissive: 0xff0000, emissiveIntensity: 0.3,
    });

    const assignCarMaterial = (mesh: THREE.Mesh) => {
      const name = (mesh.name + ' ' + ((mesh.material as THREE.Material)?.name || '')).toLowerCase();
      if (/glass|window|windshield|windscreen|visor/.test(name)) { mesh.material = glassMaterial; }
      else if (/tyre|tire|rubber|wheel_tire/.test(name)) { mesh.material = tireMat; }
      else if (/chrome|trim|handle|mirror_cap|badge/.test(name)) { mesh.material = chromeMat; }
      else if (/tail.?light|rear.?light|brake.?light|stop.?light/.test(name)) { mesh.material = tailLightMat; }
      else if (/head.?light|light|lamp|signal|fog/.test(name)) { mesh.material = lightMat; }
      else { mesh.material = carBodyMat; }
    };

    const projectMask = (obj: THREE.Object3D) => {
      if (!rendererRef.current) return false;
      const Nx = solver.Nx, Ny = solver.Ny;
      const silMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const offScene = new THREE.Scene();
      offScene.background = new THREE.Color(0x000000);
      const clone = obj.clone(true);
      clone.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = silMat; });
      const silGroup = new THREE.Group();
      silGroup.add(clone);
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
      rt.dispose(); silMat.dispose();

      solver.obstacle.fill(0);
      let count = 0;
      for (let y = 0; y < Ny; y++) for (let x = 0; x < Nx; x++) {
        if (pixels[(y * Nx + x) * 4] > 127) { solver.obstacle[y * Nx + x] = 1; count++; }
      }
      return count > 0;
    };

    const placeObstacle = (obj: THREE.Object3D, pivot: THREE.Object3D) => {
      if (!isCurrent() || !projectMask(pivot)) return;

      const aoaGroup = new THREE.Group();
      aoaGroup.add(obj);
      aoaGroup.position.set(cx3d, 0, 0);
      aoaGroup.rotation.z = (params.angleIndex * Math.PI) / 180;

      if (obstacleMeshRef.current) scene.remove(obstacleMeshRef.current);
      scene.add(aoaGroup);
      obstacleMeshRef.current = aoaGroup;

      if (groundGroupRef.current) {
        const box = new THREE.Box3().setFromObject(aoaGroup);
        groundGroupRef.current.position.y = box.min.y + (box.max.y - box.min.y) * 0.012;
      }

      if (visuals.showGround) {
        let obsMinY = solver.Ny, obsMaxY = 0;
        for (let y = 0; y < solver.Ny; y++) for (let x = 0; x < solver.Nx; x++) {
          if (solver.obstacle[y * solver.Nx + x] === 1) { if (y < obsMinY) obsMinY = y; if (y > obsMaxY) obsMaxY = y; }
        }
        const gRow = Math.max(0, obsMinY - Math.max(Math.floor((obsMaxY - obsMinY) * 0.08), 3));
        solver.groundRow = gRow;
        for (let y = 0; y < gRow; y++) for (let x = 0; x < solver.Nx; x++) solver.obstacle[y * solver.Nx + x] = 1;
      } else {
        solver.groundRow = -1;
      }

      solver.reset(params.inletVelocity);
      cachedPivotRef.current = pivot;
      obstacleReadyRef.current = true;

      // Voxelize for 3D GPU solver
      if (solver3D && rendererRef.current) {
        const s3 = solver3D;
        const gs3d = solver.Nx / s3.Nx;
        const obsCenter = { x: s3.Nx / 3.5, y: s3.Ny / 2, z: s3.Nz / 2 };
        const voxPivot = pivot.clone(true);
        voxPivot.scale.multiplyScalar(1 / gs3d);
        const aoaWrap = new THREE.Group();
        aoaWrap.add(voxPivot);
        aoaWrap.rotation.z = (paramsRef.current.angleIndex * Math.PI) / 180;

        const voxObs = voxelizeMesh(rendererRef.current, aoaWrap, s3.Nx, s3.Ny, s3.Nz, obsCenter);

        if (visualsRef.current.showGround && solver.groundRow >= 0) {
          const gRow3d = Math.max(0, Math.floor(solver.groundRow / gs3d));
          for (let z = 0; z < s3.Nz; z++) for (let y = 0; y < gRow3d; y++) for (let x = 0; x < s3.Nx; x++)
            voxObs[(z * s3.Ny + y) * s3.Nx + x] = 1;
        }

        s3.obstacleData.set(voxObs);
        s3.groundRow = visualsRef.current.showGround && solver.groundRow >= 0 ? Math.max(0, Math.floor(solver.groundRow / gs3d)) : -1;
        s3.uploadObstacle();
        s3.reset(paramsRef.current.inletVelocity);
      }
    };

    if (params.obstacleType === 'car' || params.obstacleType === 'train') {
      const modelUrl = params.obstacleType === 'car' ? teslaModelUrl : shinkansenModelUrl;
      const loader = new GLTFLoader();
      if (params.obstacleType === 'train') {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        loader.setDRACOLoader(dracoLoader);
      }
      loader.load(modelUrl, (gltf) => {
        if (!isCurrent() || !sceneRef.current || !rendererRef.current) return;
        const model = gltf.scene;
        const toRemove: THREE.Object3D[] = [];
        model.traverse(c => {
          if (!(c as THREE.Mesh).isMesh) return;
          const geo = (c as THREE.Mesh).geometry;
          if (geo) { geo.computeBoundingBox(); const sz = geo.boundingBox!.getSize(new THREE.Vector3()); if (Math.min(sz.x, sz.y, sz.z) < Math.max(sz.x, sz.y, sz.z) * 0.001) toRemove.push(c); }
        });
        toRemove.forEach(c => c.removeFromParent());
        model.traverse(c => {
          if (!(c as THREE.Mesh).isMesh) return;
          const mesh = c as THREE.Mesh;
          if (params.obstacleType === 'train') assignCarMaterial(mesh);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const s = (26 * scale * meshGs) / Math.max(size.x, size.y, size.z);

        const centering = new THREE.Group();
        centering.add(model);
        model.position.set(-center.x, -center.y, -center.z);
        // License plate for the Tesla
        if (params.obstacleType === 'car') {
          const plateCanvas = document.createElement('canvas');
          plateCanvas.width = 256;
          plateCanvas.height = 128;
          const pctx = plateCanvas.getContext('2d')!;
          pctx.fillStyle = '#0a0a0a';
          pctx.fillRect(0, 0, 256, 128);
          pctx.strokeStyle = '#333';
          pctx.lineWidth = 4;
          pctx.strokeRect(4, 4, 248, 120);
          pctx.fillStyle = '#c8a000';
          pctx.font = 'bold 14px sans-serif';
          pctx.textAlign = 'center';
          pctx.fillText('CALIFORNIA', 128, 28);
          pctx.font = 'bold 48px monospace';
          pctx.fillText('TESLANB', 128, 82);
          pctx.font = '11px sans-serif';
          pctx.fillStyle = '#999';
          pctx.fillText('THE GOLDEN STATE', 128, 118);

          const plateTex = new THREE.CanvasTexture(plateCanvas);
          plateTex.anisotropy = 4;
          const plateMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.31, 0.155),
            new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.4, metalness: 0.1 }),
          );
          const rearBox = box.clone();
          plateMesh.position.set(rearBox.min.x + 0.01, center.y - size.y * 0.17, 0);
          plateMesh.rotation.y = Math.PI / 2;
          model.add(plateMesh);
        }

        const pivot = new THREE.Group();
        pivot.add(centering);
        pivot.scale.setScalar(s);
        pivot.rotation.y = params.obstacleType === 'car' ? Math.PI / 2 : Math.PI;

        placeObstacle(pivot, pivot);
      }, undefined, (err) => { if (isCurrent()) console.error('Model load failed', err); });
      return () => { cancelled = true; };
    }

    // Geometric obstacles
    {
      const shape = new THREE.Shape();
      let pts: { x: number; y: number }[] = [];

      if (params.obstacleType.startsWith('naca')) {
        let m = params.nacaParams.m, p = params.nacaParams.p, t = params.nacaParams.t;
        if (params.obstacleType === 'naca0012') { m = 0; p = 0; t = 0.12; }
        else if (params.obstacleType === 'naca2412') { m = 0.02; p = 0.4; t = 0.12; }
        else if (params.obstacleType === 'naca4412') { m = 0.04; p = 0.4; t = 0.12; }
        pts = getNacaPoints(m, p, t, scale * 26 * meshGs);
      } else if (params.obstacleType === 'circle') {
        for (let i = 0; i <= 60; i++) { const a = (i / 60) * Math.PI * 2; pts.push({ x: Math.cos(a) * scale * 6.5 * meshGs, y: Math.sin(a) * scale * 6.5 * meshGs }); }
      } else if (params.obstacleType === 'flat_plate') {
        const len = scale * 22 * meshGs, h = 1.6 * meshGs;
        pts = [{ x: -len / 2, y: -h / 2 }, { x: len / 2, y: -h / 2 }, { x: len / 2, y: h / 2 }, { x: -len / 2, y: h / 2 }];
      } else if (params.obstacleType === 'custom' && customPoints?.length) {
        pts = customPoints.map(p => ({ x: p.x - solver.Nx / 3.5, y: solver.Ny / 2 - p.y }));
      } else if (params.obstacleType === 'uploaded') {
        const b = scale * 16 * meshGs;
        pts = [{ x: -b / 2, y: -b / 2 }, { x: b / 2, y: -b / 2 }, { x: b / 2, y: b / 2 }, { x: -b / 2, y: b / 2 }];
      } else {
        for (let i = 0; i <= 30; i++) { const a = (i / 30) * Math.PI * 2; pts.push({ x: Math.cos(a) * scale * 7 * meshGs, y: Math.sin(a) * scale * 7 * meshGs }); }
      }
      if (!pts.length) return;

      shape.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y);
      shape.lineTo(pts[0].x, pts[0].y);

      const geo = new THREE.ExtrudeGeometry(shape, { steps: 2, depth: 30 * meshGs, bevelEnabled: true, bevelThickness: meshGs, bevelSize: 0.5 * meshGs, bevelSegments: 6, curveSegments: 24 });
      geo.center();
      const mesh = new THREE.Mesh(geo, carBodyMat);
      mesh.castShadow = true;
      placeObstacle(mesh, mesh);
    }
    return () => { cancelled = true; };
  }, [params.obstacleType, params.obstacleScale, params.nacaParams, customPoints, sceneReady, visuals.showGround, solver3D]);

  // ---- Angle of attack ----
  useEffect(() => {
    const obj = obstacleMeshRef.current, pivot = cachedPivotRef.current;
    if (!obj || !pivot || !rendererRef.current) return;
    const angleRad = (params.angleIndex * Math.PI) / 180;
    obj.rotation.z = angleRad;

    const Nx = solver.Nx, Ny = solver.Ny;
    const silMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const offScene = new THREE.Scene();
    offScene.background = new THREE.Color(0x000000);
    const clone = pivot.clone(true);
    clone.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = silMat; });
    const silGroup = new THREE.Group();
    silGroup.add(clone);
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
    rt.dispose(); silMat.dispose();

    solver.obstacle.fill(0);
    for (let y = 0; y < Ny; y++) for (let x = 0; x < Nx; x++) if (pixels[(y * Nx + x) * 4] > 127) solver.obstacle[y * Nx + x] = 1;

    if (visuals.showGround) {
      let obsMinY = Ny, obsMaxY = 0;
      for (let y = 0; y < Ny; y++) for (let x = 0; x < Nx; x++) if (solver.obstacle[y * Nx + x] === 1) { if (y < obsMinY) obsMinY = y; if (y > obsMaxY) obsMaxY = y; }
      const gRow = Math.max(0, obsMinY - Math.max(Math.floor((obsMaxY - obsMinY) * 0.08), 3));
      solver.groundRow = gRow;
      for (let y = 0; y < gRow; y++) for (let x = 0; x < Nx; x++) solver.obstacle[y * Nx + x] = 1;
    }
    solver.reset(params.inletVelocity);
  }, [params.angleIndex]);

  // ---- Visibility toggles ----
  useEffect(() => {
    if (slicePlaneRef.current) slicePlaneRef.current.visible = visuals.showSlice;
    if (particlesRef.current) particlesRef.current.visible = visuals.showSmoke;
    if (groundGroupRef.current) groundGroupRef.current.visible = visuals.showGround;
  }, [visuals.showSlice, visuals.showSmoke, visuals.showGround]);

  useEffect(() => {
    if (particlesRef.current) (particlesRef.current.material as THREE.PointsMaterial).size = visuals.particleSize ?? 1.4;
  }, [visuals.particleSize]);

  // ---- Particle buffer rebuild on count change ----
  useEffect(() => {
    const obj = particlesRef.current;
    if (!obj) return;
    const count = visuals.particleCount || 1000;
    const pos = new Float32Array(count * 3);
    const lives = new Float32Array(count);
    const groundY = solver.groundRow >= 0 ? solver.groundRow - solver.Ny / 2 : -solver.Ny / 2;
    for (let i = 0; i < count; i++) {
      spawnParticle(pos, lives, i, solver, groundY, solver3DRef.current ?? null, true);
      lives[i] = Math.random() * PARTICLE_LIFE_MAX;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    obj.geometry.dispose();
    obj.geometry = geo;
    particlePositionsRef.current = pos;
    particleLivesRef.current = lives;
  }, [visuals.particleCount]);

  // ---- Reset solvers + particles on velocity / viscosity change ----
  useEffect(() => {
    const pos = particlePositionsRef.current, lives = particleLivesRef.current;
    if (!pos || !lives || !obstacleReadyRef.current) return;
    solver.reset(params.inletVelocity);
    const s3d = solver3DRef.current;
    if (s3d) s3d.reset(params.inletVelocity);
    const groundY = solver.groundRow >= 0 ? solver.groundRow - solver.Ny / 2 : -solver.Ny / 2;
    for (let i = 0; i < lives.length; i++) { spawnParticle(pos, lives, i, solver, groundY, s3d ?? null, true); lives[i] = Math.random() * PARTICLE_LIFE_MAX; }
  }, [params.inletVelocity, params.viscosity]);

  // ---- Main render loop ----
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsTimer = 0;

    const loop = () => {
      animId = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      frameCount++;
      fpsTimer += dt;
      if (fpsTimer >= 1) {
        const f = Math.round(frameCount / fpsTimer);
        setFps(f);
        if (onFpsUpdate) onFpsUpdate(f);
        frameCount = 0; fpsTimer = 0;
        setTriggerUpdate(u => u + 1);
      }

      const p = paramsRef.current;
      const v = visualsRef.current;

      if (isSimulating && obstacleReadyRef.current) {
        const u0 = p.inletVelocity;
        const visc = p.viscosity;
        const s3d = solver3DRef.current;

        if (s3d) {
          for (let s = 0; s < p.stepsPerFrame; s++) s3d.step(u0, visc);
          s3d.readbackMacro().catch(e => console.warn('[LBM3D] readback error:', e));
        }

        // Always step 2D solver — it provides flow slice data and aero coefficients
        if (solver.isStable) {
          for (let s = 0; s < p.stepsPerFrame; s++) solver.step(u0, visc);
        }
      }

      if (v.showSlice && flowCanvasRef.current && sliceTextureRef.current) {
        const ctx = flowCanvasRef.current.getContext('2d');
        if (ctx) { updateFlowSlice(ctx); sliceTextureRef.current.needsUpdate = true; }
      }

      updateForceArrows();
      updateParticles();

      if (controlsRef.current) controlsRef.current.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current)
        rendererRef.current.render(sceneRef.current, cameraRef.current);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isSimulating]);

  // ---- Flow slice heatmap ----
  const updateFlowSlice = (ctx: CanvasRenderingContext2D) => {
    const Nx = solver.Nx, Ny = solver.Ny;
    const stepX = Nx / sliceW, stepY = Ny / sliceH;
    const imgData = ctx.createImageData(sliceW, sliceH);
    const data = imgData.data;
    const coloring = visualsRef.current.coloring;
    const u0 = paramsRef.current.inletVelocity;

    let maxVal = 1e-5;
    if (coloring === 'velocity') maxVal = Math.max(u0 * 1.8, 1e-5);
    else if (coloring === 'vorticity') maxVal = 0.05 + 0.1 * u0;
    else maxVal = 0.45;

    for (let sy = 0; sy < sliceH; sy++) {
      const srcY = Math.floor(sy * stepY);
      const dy = sliceH - 1 - sy;
      for (let sx = 0; sx < sliceW; sx++) {
        const srcX = Math.floor(sx * stepX);
        const cIdx = srcY * Nx + srcX;
        const pi = (dy * sliceW + sx) * 4;

        if (solver.obstacle[cIdx] === 1) { data[pi] = 30; data[pi + 1] = 41; data[pi + 2] = 59; data[pi + 3] = 0; continue; }

        let val = 0;
        if (coloring === 'velocity') val = solver.speed[cIdx];
        else if (coloring === 'vorticity') val = solver.vorticity[cIdx];
        else val = solver.pressure[cIdx];

        if (coloring === 'velocity') {
          const n = Math.min(Math.max(val / maxVal, 0), 1);
          data[pi] = 14 + n * 240 | 0; data[pi + 1] = 22 + n * 210 | 0; data[pi + 2] = 37 + n * 150 | 0;
          data[pi + 3] = 180 * (0.35 + 0.65 * n) | 0;
        } else if (coloring === 'vorticity') {
          const sv = val / maxVal;
          const n = Math.min(Math.max(Math.abs(sv), 0), 1);
          if (val > 0) { data[pi] = 14 + n * 40 | 0; data[pi + 1] = 22 + n * 80 | 0; data[pi + 2] = 37 + n * 210 | 0; }
          else { data[pi] = (210 * n + 14 * (1 - n)) | 0; data[pi + 1] = (32 * n + 22 * (1 - n)) | 0; data[pi + 2] = (37 * (1 - n)) | 0; }
          data[pi + 3] = 190 * (0.15 + 0.85 * n) | 0;
        } else {
          const delta = (val - 0.333) * 4;
          const m = Math.min(Math.max(delta, -1), 1);
          if (m < 0) {
            const n = -m;
            data[pi] = (30 * (1 - n) + 59 * n) | 0; data[pi + 1] = (41 * (1 - n) + 130 * n) | 0; data[pi + 2] = (59 * (1 - n) + 246 * n) | 0;
          } else {
            const n = m;
            data[pi] = (30 * (1 - n) + 239 * n) | 0; data[pi + 1] = (41 * (1 - n) + 115 * n) | 0; data[pi + 2] = (59 * (1 - n) + 33 * n) | 0;
          }
          data[pi + 3] = 190 * (0.2 + 0.8 * Math.abs(m)) | 0;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  };

  // ---- Force arrows ----
  const liftArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const dragArrowRef = useRef<THREE.ArrowHelper | null>(null);

  const updateForceArrows = () => {
    const group = forceArrowsGroupRef.current;
    if (!group) return;
    const cx3d = solver.Nx / 3.5 - solver.Nx / 2;
    const gs = solver.Nx / 120;
    const u0 = paramsRef.current.inletVelocity;
    if (u0 < 1e-6) return;
    const arrowScale = 0.16 / (u0 * u0);
    const maxLen = 36 * gs;

    const showArrow = (ref: React.MutableRefObject<THREE.ArrowHelper | null>, force: number, dir: THREE.Vector3, color: number) => {
      const mag = Math.min(Math.abs(force) * arrowScale, maxLen);
      if (mag > 0.5) {
        if (!ref.current) { ref.current = new THREE.ArrowHelper(dir, new THREE.Vector3(cx3d, 0, 0), 1, color, 3.5 * gs, 1.2 * gs); group.add(ref.current); }
        ref.current.setDirection(dir.clone().multiplyScalar(force > 0 ? 1 : -1));
        ref.current.setLength(mag, 3.5 * gs, 1.2 * gs);
        ref.current.visible = true;
      } else if (ref.current) { ref.current.visible = false; }
    };

    showArrow(liftArrowRef, solver.lastLiftForce, new THREE.Vector3(0, 1, 0), 0x10b981);
    showArrow(dragArrowRef, solver.lastDragForce, new THREE.Vector3(1, 0, 0), 0xef4444);
  };

  // ---- Particle advection ----
  const updateParticles = () => {
    const obj = particlesRef.current;
    const positions = particlePositionsRef.current;
    const lives = particleLivesRef.current;
    if (!obj || !positions || !lives) return;

    const attr = obj.geometry.attributes.position as THREE.BufferAttribute;
    const count = attr.count;
    const halfNx = solver.Nx / 2;
    const halfNy = solver.Ny / 2;
    const groundLbmY = solver.groundRow >= 0 ? solver.groundRow : 0;
    const groundSceneY = groundLbmY - halfNy;
    const s3d = solver3DRef.current;
    const gs3d = s3d ? solver.Nx / s3d.Nx : 1;
    const halfZ = s3d ? s3d.Nz * gs3d / 2 : Infinity;

    for (let i = 0; i < count; i++) {
      lives[i]--;

      if (lives[i] <= 0) {
        spawnParticle(positions, lives, i, solver, groundSceneY, s3d ?? null, false);
        continue;
      }

      const px = i * 3, py = i * 3 + 1, pz = i * 3 + 2;
      let x = positions[px], y = positions[py], z = positions[pz];
      const lbmX = x + halfNx, lbmY = y + halfNy;

      let vx: number, vy: number, vz: number;
      if (s3d) {
        const lbmZ = (z + halfZ) / gs3d;
        const v = s3d.queryVelocity3D(lbmX / gs3d, lbmY / gs3d, lbmZ);
        vx = v.ux || 0; vy = v.uy || 0; vz = v.uz || 0;
      } else {
        const v = solver.queryVelocity(lbmX, lbmY);
        vx = v.ux || 0; vy = v.uy || 0; vz = 0;
      }

      const spd = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (spd < 0.001) lives[i] -= STALL_LIFE_PENALTY;

      const boost = 32.5;
      x += vx * boost;
      y += vy * boost;
      z += vz * boost + (Math.random() - 0.5) * 0.06;

      // Obstacle collision
      let isObs = false;
      if (s3d) {
        const gx = Math.round((x + halfNx) / gs3d), gy = Math.round((y + halfNy) / gs3d), gz = Math.round((z + halfZ) / gs3d);
        if (gx >= 0 && gx < s3d.Nx && gy >= 0 && gy < s3d.Ny && gz >= 0 && gz < s3d.Nz)
          isObs = s3d.obstacleData[(gz * s3d.Ny + gy) * s3d.Nx + gx] === 1;
      } else {
        const gx = Math.round(x + halfNx), gy = Math.round(y + halfNy);
        if (gx >= 0 && gx < solver.Nx && gy >= 0 && gy < solver.Ny)
          isObs = solver.obstacle[gy * solver.Nx + gx] === 1;
      }

      if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z) ||
          x >= halfNx - 1 || x < -halfNx + 1 ||
          y >= halfNy - 1 || y < groundSceneY ||
          z >= halfZ || z < -halfZ || isObs) {
        lives[i] = 0;
        continue;
      }

      positions[px] = x;
      positions[py] = y;
      positions[pz] = z;
    }

    attr.needsUpdate = true;
  };

  return (
    <div id="wind-tunnel-viewport" className="absolute inset-0 bg-slate-950" ref={containerRef}>
      <div id="threejs-mount-point" className="w-full h-full" ref={mountRef} />
    </div>
  );
}
