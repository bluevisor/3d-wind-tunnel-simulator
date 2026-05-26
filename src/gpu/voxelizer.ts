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

  const maxDim = Math.max(Nx, Ny, Nz) * 2;

  // XY silhouette: camera looks along -Z, captures (x, y)
  const xyMask = renderView(renderer, group, Nx, Ny, maxDim, null);

  // XZ silhouette: rotate model -90° around X so old-Z maps to camera-Y,
  // then use the same -Z looking camera. Avoids gimbal lock entirely.
  const xzMask = renderView(renderer, group, Nx, Nz, maxDim, -Math.PI / 2);

  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const zMin = Math.max(0, Math.floor(box.min.z));
  const zMax = Math.min(Nz, Math.ceil(box.max.z));

  for (let z = zMin; z < zMax; z++) {
    for (let y = 0; y < Ny; y++) {
      for (let x = 0; x < Nx; x++) {
        if (xyMask[y * Nx + x] && xzMask[z * Nx + x]) {
          obstacle[(z * Ny + y) * Nx + x] = 1;
        }
      }
    }
  }

  whiteMat.dispose();
  return obstacle;
}

function renderView(
  renderer: THREE.WebGLRenderer,
  group: THREE.Group,
  w: number,
  h: number,
  maxDim: number,
  rotateX: number | null,
): Uint8Array {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const cloned = group.clone(true);
  if (rotateX !== null) {
    const wrapper = new THREE.Group();
    wrapper.add(cloned);
    wrapper.rotation.x = rotateX;
    scene.add(wrapper);
  } else {
    scene.add(cloned);
  }

  const camera = new THREE.OrthographicCamera(0, w, h, 0, -maxDim, maxDim);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
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
