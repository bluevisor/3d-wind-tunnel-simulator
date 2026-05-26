import * as THREE from 'three';

/**
 * Voxelize a 3D mesh into an obstacle grid using multi-view silhouette intersection.
 * Renders the model from 3 orthogonal directions and intersects to get a conservative voxel mask.
 */
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

  // Position the clone at the obstacle center in grid coordinates
  const group = new THREE.Group();
  group.add(clone);
  group.position.set(obstacleCenter.x, obstacleCenter.y, obstacleCenter.z);

  // XY silhouette (looking along Z)
  const xyMask = renderSilhouette(renderer, group, Nx, Ny, 'z', Nx, Ny, Nz);
  // XZ silhouette (looking along Y)
  const xzMask = renderSilhouette(renderer, group, Nx, Nz, 'y', Nx, Ny, Nz);
  // YZ silhouette (looking along X)
  const yzMask = renderSilhouette(renderer, group, Ny, Nz, 'x', Nx, Ny, Nz);

  // Intersect all 3 views
  for (let z = 0; z < Nz; z++) {
    for (let y = 0; y < Ny; y++) {
      for (let x = 0; x < Nx; x++) {
        const xy = xyMask[y * Nx + x];
        const xz = xzMask[z * Nx + x];
        const yz = yzMask[z * Ny + y];
        if (xy && xz && yz) {
          obstacle[(z * Ny + y) * Nx + x] = 1;
        }
      }
    }
  }

  whiteMat.dispose();
  return obstacle;
}

function renderSilhouette(
  renderer: THREE.WebGLRenderer,
  group: THREE.Group,
  w: number,
  h: number,
  lookAxis: 'x' | 'y' | 'z',
  Nx: number,
  Ny: number,
  Nz: number,
): Uint8Array {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.add(group.clone(true));

  let camera: THREE.OrthographicCamera;
  if (lookAxis === 'z') {
    camera = new THREE.OrthographicCamera(0, Nx, Ny, 0, -Nz, Nz);
    camera.position.set(Nx / 2, Ny / 2, Nz);
    camera.lookAt(Nx / 2, Ny / 2, 0);
  } else if (lookAxis === 'y') {
    camera = new THREE.OrthographicCamera(0, Nx, Nz, 0, -Ny, Ny);
    camera.position.set(Nx / 2, Ny, Nz / 2);
    camera.lookAt(Nx / 2, 0, Nz / 2);
  } else {
    camera = new THREE.OrthographicCamera(0, Ny, Nz, 0, -Nx, Nx);
    camera.position.set(Nx, Ny / 2, Nz / 2);
    camera.lookAt(0, Ny / 2, Nz / 2);
  }

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

/**
 * Simpler: voxelize by rendering a single side view (XY plane at each Z slice).
 * Faster but less accurate for complex 3D shapes.
 */
export function voxelizeFromSideView(
  renderer: THREE.WebGLRenderer,
  model: THREE.Object3D,
  Nx: number,
  Ny: number,
  Nz: number,
  obstacleCenter: { x: number; y: number; z: number },
  angleRad: number,
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
  group.rotation.z = angleRad;

  // Render XY silhouette from Z direction
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.add(group);

  const camera = new THREE.OrthographicCamera(0, Nx, Ny, 0, -Nx, Nx);
  camera.position.set(0, 0, Nx / 2);
  camera.lookAt(0, 0, 0);

  const rt = new THREE.WebGLRenderTarget(Nx, Ny);
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  const pixels = new Uint8Array(Nx * Ny * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, Nx, Ny, pixels);
  rt.dispose();
  whiteMat.dispose();

  // Extrude the 2D mask through the center portion of Z
  const box = new THREE.Box3().setFromObject(group);
  const zMin = Math.max(0, Math.floor((Nz / 2) - (box.max.z - box.min.z) / 2));
  const zMax = Math.min(Nz, Math.ceil((Nz / 2) + (box.max.z - box.min.z) / 2));

  for (let y = 0; y < Ny; y++) {
    for (let x = 0; x < Nx; x++) {
      if (pixels[(y * Nx + x) * 4] > 127) {
        for (let z = zMin; z < zMax; z++) {
          obstacle[(z * Ny + y) * Nx + x] = 1;
        }
      }
    }
  }

  return obstacle;
}
