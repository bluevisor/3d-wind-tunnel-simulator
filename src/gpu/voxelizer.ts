import * as THREE from 'three';

export function voxelizeMesh(
  renderer: THREE.WebGLRenderer,
  model: THREE.Object3D,
  Nx: number,
  Ny: number,
  Nz: number,
  obstacleCenter: { x: number; y: number; z: number },
): Uint32Array {
  const obstacle = new Uint32Array(Nx * Ny * Nz);
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

  const clone = model.clone(true);
  clone.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).material = whiteMat;
  });

  const group = new THREE.Group();
  group.add(clone);
  group.position.set(obstacleCenter.x, obstacleCenter.y, obstacleCenter.z);

  // XY silhouette (looking along +Z)
  const xyMask = renderView(renderer, group, Nx, Ny, {
    left: 0, right: Nx, top: Ny, bottom: 0,
    eye: [Nx / 2, Ny / 2, Nz + 10],
    lookAt: [Nx / 2, Ny / 2, 0],
    near: -Nz * 2, far: Nz * 2,
  });

  // XZ silhouette (looking along +Y)
  const xzMask = renderView(renderer, group, Nx, Nz, {
    left: 0, right: Nx, top: Nz, bottom: 0,
    eye: [Nx / 2, Ny + 10, Nz / 2],
    lookAt: [Nx / 2, 0, Nz / 2],
    near: -Ny * 2, far: Ny * 2,
  });

  // YZ silhouette (looking along +X)
  const yzMask = renderView(renderer, group, Ny, Nz, {
    left: 0, right: Ny, top: Nz, bottom: 0,
    eye: [Nx + 10, Ny / 2, Nz / 2],
    lookAt: [0, Ny / 2, Nz / 2],
    near: -Nx * 2, far: Nx * 2,
  });

  // Intersect all 3 views to get conservative 3D voxel mask
  for (let z = 0; z < Nz; z++) {
    for (let y = 0; y < Ny; y++) {
      for (let x = 0; x < Nx; x++) {
        if (xyMask[y * Nx + x] && xzMask[z * Nx + x] && yzMask[z * Ny + y]) {
          obstacle[(z * Ny + y) * Nx + x] = 1;
        }
      }
    }
  }

  whiteMat.dispose();
  return obstacle;
}

interface ViewConfig {
  left: number; right: number; top: number; bottom: number;
  eye: number[]; lookAt: number[];
  near: number; far: number;
}

function renderView(
  renderer: THREE.WebGLRenderer,
  group: THREE.Group,
  w: number,
  h: number,
  cfg: ViewConfig,
): Uint8Array {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.add(group.clone(true));

  const camera = new THREE.OrthographicCamera(cfg.left, cfg.right, cfg.top, cfg.bottom, cfg.near, cfg.far);
  camera.position.set(cfg.eye[0], cfg.eye[1], cfg.eye[2]);
  camera.lookAt(cfg.lookAt[0], cfg.lookAt[1], cfg.lookAt[2]);
  camera.updateProjectionMatrix();

  const rt = new THREE.WebGLRenderTarget(w, h);
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  const pixels = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, pixels);
  rt.dispose();

  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    mask[i] = pixels[i * 4] > 127 ? 1 : 0;
  }
  return mask;
}
