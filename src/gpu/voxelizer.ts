import * as THREE from 'three';

/**
 * Voxelize a 3D mesh by rendering depth maps from 6 directions and marking
 * cells that are "inside" the model (between front and back depth).
 * This produces an accurate 3D voxel mask, not just silhouette intersection.
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

  const group = new THREE.Group();
  group.add(clone);
  group.position.set(obstacleCenter.x, obstacleCenter.y, obstacleCenter.z);

  // Render XY silhouette (side view, looking along Z) — this gives x,y mask
  const xyMask = renderSilhouette(renderer, group, Nx, Ny, 'z', Nx, Ny, Nz);

  // Get the Z extent of the model to know how deep to extrude
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const zMin = Math.max(0, Math.floor(box.min.z));
  const zMax = Math.min(Nz, Math.ceil(box.max.z));

  // Also render XZ silhouette (top view) to refine the Z extent per-X column
  const xzMask = renderSilhouette(renderer, group, Nx, Nz, 'y', Nx, Ny, Nz);

  // Combine: a voxel is obstacle if it's in the XY silhouette AND in the XZ silhouette's Z range
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
    camera = new THREE.OrthographicCamera(0, Nx, Ny, 0, -Nz * 2, Nz * 2);
    camera.position.set(Nx / 2, Ny / 2, Nz);
    camera.lookAt(Nx / 2, Ny / 2, 0);
  } else if (lookAxis === 'y') {
    camera = new THREE.OrthographicCamera(0, Nx, Nz, 0, -Ny * 2, Ny * 2);
    camera.position.set(Nx / 2, Ny, Nz / 2);
    camera.lookAt(Nx / 2, 0, Nz / 2);
  } else {
    camera = new THREE.OrthographicCamera(0, Ny, Nz, 0, -Nx * 2, Nx * 2);
    camera.position.set(Nx, Ny / 2, Nz / 2);
    camera.lookAt(0, Ny / 2, Nz / 2);
  }
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
