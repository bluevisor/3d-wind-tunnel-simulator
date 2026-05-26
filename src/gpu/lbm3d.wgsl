// D3Q19 Lattice Boltzmann Method — WebGPU Compute Shaders
// Architecture: collide writes post-collision to fIn (in-place), stream reads fIn writes fOut

struct Params {
  nx: u32,
  ny: u32,
  nz: u32,
  u0: f32,
  omega: f32,
  groundY: i32,
  _pad0: u32,
  _pad1: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> fA: array<f32>;
@group(0) @binding(2) var<storage, read_write> fB: array<f32>;
@group(0) @binding(3) var<storage, read>       obstacle: array<u32>;
@group(0) @binding(4) var<storage, read_write> mfield: array<f32>;

const DX = array<i32, 19>(0, 1,-1, 0, 0, 0, 0, 1,-1, 1,-1, 1,-1, 1,-1, 0, 0, 0, 0);
const DY = array<i32, 19>(0, 0, 0, 1,-1, 0, 0, 1, 1,-1,-1, 0, 0, 0, 0, 1,-1, 1,-1);
const DZ = array<i32, 19>(0, 0, 0, 0, 0, 1,-1, 0, 0, 0, 0, 1, 1,-1,-1, 1, 1,-1,-1);
const W = array<f32, 19>(
  1.0/3.0,
  1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0,
  1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0,
  1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0,
  1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0
);
const OPP = array<u32, 19>(0u, 2u, 1u, 4u, 3u, 6u, 5u, 10u, 9u, 8u, 7u, 14u, 13u, 12u, 11u, 18u, 17u, 16u, 15u);

fn fIdx(cellIdx: u32, dir: u32) -> u32 { return cellIdx * 19u + dir; }
fn macIdx(cellIdx: u32, field: u32) -> u32 { return cellIdx * 7u + field; }
fn idx3(x: u32, y: u32, z: u32) -> u32 { return (z * params.ny + y) * params.nx + x; }

fn computeFeq(w: f32, rho: f32, ux: f32, uy: f32, uz: f32, dx: i32, dy: i32, dz: i32) -> f32 {
  let udot = f32(dx) * ux + f32(dy) * uy + f32(dz) * uz;
  return w * rho * (1.0 + 3.0 * udot + 4.5 * udot * udot - 1.5 * (ux*ux + uy*uy + uz*uz));
}

// ============ Collide: compute mfieldscopic + BGK collision, write back to fA in-place ============
@compute @workgroup_size(256)
fn collide(@builtin(global_invocation_id) gid: vec3<u32>) {
  let ci = gid.x;
  if (ci >= params.nx * params.ny * params.nz) { return; }

  if (obstacle[ci] == 1u) {
    for (var f = 0u; f < 7u; f++) { mfield[macIdx(ci, f)] = 0.0; }
    return;
  }

  var rho: f32 = 0.0;
  var ux: f32 = 0.0;
  var uy: f32 = 0.0;
  var uz: f32 = 0.0;
  for (var i = 0u; i < 19u; i++) {
    let fi = fA[fIdx(ci, i)];
    rho += fi;
    ux += fi * f32(DX[i]);
    uy += fi * f32(DY[i]);
    uz += fi * f32(DZ[i]);
  }
  if (rho > 1e-6) { ux /= rho; uy /= rho; uz /= rho; }
  else { rho = 1.0; ux = 0.0; uy = 0.0; uz = 0.0; }

  mfield[macIdx(ci, 0u)] = rho;
  mfield[macIdx(ci, 1u)] = ux;
  mfield[macIdx(ci, 2u)] = uy;
  mfield[macIdx(ci, 3u)] = uz;
  mfield[macIdx(ci, 4u)] = ux*ux + uy*uy + uz*uz;
  mfield[macIdx(ci, 5u)] = rho / 3.0;

  let omega = params.omega;
  for (var i = 0u; i < 19u; i++) {
    let fi = fA[fIdx(ci, i)];
    let eq = computeFeq(W[i], rho, ux, uy, uz, DX[i], DY[i], DZ[i]);
    fA[fIdx(ci, i)] = fi - omega * (fi - eq);
  }
}

// ============ Stream: propagate post-collision fA → fB using pull scheme ============
@compute @workgroup_size(256)
fn stream(@builtin(global_invocation_id) gid: vec3<u32>) {
  let ci = gid.x;
  let tc = params.nx * params.ny * params.nz;
  if (ci >= tc) { return; }

  let x = ci % params.nx;
  let y = (ci / params.nx) % params.ny;
  let z = ci / (params.nx * params.ny);

  // Inlet: x == 0
  if (x == 0u) {
    for (var i = 0u; i < 19u; i++) {
      fB[fIdx(ci, i)] = computeFeq(W[i], 1.0, params.u0, 0.0, 0.0, DX[i], DY[i], DZ[i]);
    }
    return;
  }

  // Outlet: x == Nx-1, zero-gradient
  if (x == params.nx - 1u) {
    let src = idx3(x - 1u, y, z);
    for (var i = 0u; i < 19u; i++) {
      fB[fIdx(ci, i)] = fA[fIdx(src, i)];
    }
    return;
  }

  for (var i = 0u; i < 19u; i++) {
    let sx = i32(x) - DX[i];
    let sy = i32(y) - DY[i];
    let sz = i32(z) - DZ[i];

    // Wall bounce-back
    if (sy < max(params.groundY, 0) || sy >= i32(params.ny) || sz < 0 || sz >= i32(params.nz)) {
      fB[fIdx(ci, i)] = fA[fIdx(ci, OPP[i])];
      continue;
    }
    if (sx < 0 || sx >= i32(params.nx)) {
      fB[fIdx(ci, i)] = fA[fIdx(ci, i)];
      continue;
    }

    let srcIdx = idx3(u32(sx), u32(sy), u32(sz));
    if (obstacle[srcIdx] == 1u) {
      fB[fIdx(ci, i)] = fA[fIdx(ci, OPP[i])];
    } else {
      fB[fIdx(ci, i)] = fA[fIdx(srcIdx, i)];
    }
  }
}

// ============ Swap: copy fB back to fA for next timestep ============
@compute @workgroup_size(256)
fn swap(@builtin(global_invocation_id) gid: vec3<u32>) {
  let ci = gid.x;
  let tc = params.nx * params.ny * params.nz;
  if (ci >= tc) { return; }
  for (var i = 0u; i < 19u; i++) {
    let idx = fIdx(ci, i);
    fA[idx] = fB[idx];
  }
}

// ============ Vorticity ============
@compute @workgroup_size(256)
fn vorticity(@builtin(global_invocation_id) gid: vec3<u32>) {
  let ci = gid.x;
  if (ci >= params.nx * params.ny * params.nz) { return; }

  let x = ci % params.nx;
  let y = (ci / params.nx) % params.ny;
  let z = ci / (params.nx * params.ny);

  if (x < 1u || x >= params.nx-1u || y < 1u || y >= params.ny-1u || z < 1u || z >= params.nz-1u || obstacle[ci] == 1u) {
    mfield[macIdx(ci, 6u)] = 0.0;
    return;
  }

  let xp = idx3(x+1u,y,z); let xm = idx3(x-1u,y,z);
  let yp = idx3(x,y+1u,z); let ym = idx3(x,y-1u,z);
  let zp = idx3(x,y,z+1u); let zm = idx3(x,y,z-1u);

  let wx = 0.5*(mfield[macIdx(yp,3u)]-mfield[macIdx(ym,3u)]) - 0.5*(mfield[macIdx(zp,2u)]-mfield[macIdx(zm,2u)]);
  let wy = 0.5*(mfield[macIdx(zp,1u)]-mfield[macIdx(zm,1u)]) - 0.5*(mfield[macIdx(xp,3u)]-mfield[macIdx(xm,3u)]);
  let wz = 0.5*(mfield[macIdx(xp,2u)]-mfield[macIdx(xm,2u)]) - 0.5*(mfield[macIdx(yp,1u)]-mfield[macIdx(ym,1u)]);
  mfield[macIdx(ci, 6u)] = sqrt(wx*wx + wy*wy + wz*wz);
}
