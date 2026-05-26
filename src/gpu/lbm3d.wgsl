// D3Q19 Lattice Boltzmann Method — WebGPU Compute Shaders

struct Params {
  nx: u32,
  ny: u32,
  nz: u32,
  u0: f32,
  omega: f32,
  groundZ: i32,  // -1 = no ground
  _pad0: u32,
  _pad1: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read>       fIn:       array<f32>;
@group(0) @binding(2) var<storage, read_write> fOut:      array<f32>;
@group(0) @binding(3) var<storage, read>       obstacle:  array<u32>;
@group(0) @binding(4) var<storage, read_write> macro:     array<f32>;

// D3Q19 velocity vectors
const DX = array<i32, 19>(0, 1,-1, 0, 0, 0, 0, 1,-1, 1,-1, 1,-1, 1,-1, 0, 0, 0, 0);
const DY = array<i32, 19>(0, 0, 0, 1,-1, 0, 0, 1, 1,-1,-1, 0, 0, 0, 0, 1,-1, 1,-1);
const DZ = array<i32, 19>(0, 0, 0, 0, 0, 1,-1, 0, 0, 0, 0, 1, 1,-1,-1, 1, 1,-1,-1);

// Weights
const W = array<f32, 19>(
  1.0/3.0,
  1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0,
  1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0,
  1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0,
  1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0
);

// Opposite direction index for bounce-back
const OPP = array<u32, 19>(0u, 2u, 1u, 4u, 3u, 6u, 5u, 10u, 9u, 8u, 7u, 14u, 13u, 12u, 11u, 18u, 17u, 16u, 15u);

fn idx3(x: u32, y: u32, z: u32) -> u32 {
  return (z * params.ny + y) * params.nx + x;
}

fn fIdx(cellIdx: u32, dir: u32) -> u32 {
  return cellIdx * 19u + dir;
}

fn macroIdx(cellIdx: u32, field: u32) -> u32 {
  return cellIdx * 7u + field;
}

fn feq(w: f32, rho: f32, ux: f32, uy: f32, uz: f32, dx: i32, dy: i32, dz: i32) -> f32 {
  let udot = f32(dx) * ux + f32(dy) * uy + f32(dz) * uz;
  let u2 = ux * ux + uy * uy + uz * uz;
  return w * rho * (1.0 + 3.0 * udot + 4.5 * udot * udot - 1.5 * u2);
}

// ============ Collision + Macroscopic ============
@compute @workgroup_size(256)
fn collide(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cellIdx = gid.x;
  let totalCells = params.nx * params.ny * params.nz;
  if (cellIdx >= totalCells) { return; }

  // Decompose linear index to 3D
  let x = cellIdx % params.nx;
  let y = (cellIdx / params.nx) % params.ny;
  let z = cellIdx / (params.nx * params.ny);

  // Obstacle: zero out macroscopic, copy f unchanged
  if (obstacle[cellIdx] == 1u) {
    macro[macroIdx(cellIdx, 0u)] = 0.0;
    macro[macroIdx(cellIdx, 1u)] = 0.0;
    macro[macroIdx(cellIdx, 2u)] = 0.0;
    macro[macroIdx(cellIdx, 3u)] = 0.0;
    macro[macroIdx(cellIdx, 4u)] = 0.0;
    macro[macroIdx(cellIdx, 5u)] = 0.0;
    macro[macroIdx(cellIdx, 6u)] = 0.0;
    for (var i = 0u; i < 19u; i++) {
      fOut[fIdx(cellIdx, i)] = fIn[fIdx(cellIdx, i)];
    }
    return;
  }

  // Compute macroscopic quantities
  var rho: f32 = 0.0;
  var ux: f32 = 0.0;
  var uy: f32 = 0.0;
  var uz: f32 = 0.0;

  for (var i = 0u; i < 19u; i++) {
    let fi = fIn[fIdx(cellIdx, i)];
    rho += fi;
    ux += fi * f32(DX[i]);
    uy += fi * f32(DY[i]);
    uz += fi * f32(DZ[i]);
  }

  if (rho > 1e-6) {
    ux /= rho;
    uy /= rho;
    uz /= rho;
  } else {
    rho = 1.0;
    ux = 0.0;
    uy = 0.0;
    uz = 0.0;
  }

  let speed2 = ux * ux + uy * uy + uz * uz;
  macro[macroIdx(cellIdx, 0u)] = rho;
  macro[macroIdx(cellIdx, 1u)] = ux;
  macro[macroIdx(cellIdx, 2u)] = uy;
  macro[macroIdx(cellIdx, 3u)] = uz;
  macro[macroIdx(cellIdx, 4u)] = speed2;
  macro[macroIdx(cellIdx, 5u)] = rho / 3.0;

  // BGK collision
  let omega = params.omega;
  for (var i = 0u; i < 19u; i++) {
    let fi = fIn[fIdx(cellIdx, i)];
    let eq = feq(W[i], rho, ux, uy, uz, DX[i], DY[i], DZ[i]);
    fOut[fIdx(cellIdx, i)] = fi - omega * (fi - eq);
  }
}

// ============ Streaming ============
@compute @workgroup_size(256)
fn stream(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cellIdx = gid.x;
  let totalCells = params.nx * params.ny * params.nz;
  if (cellIdx >= totalCells) { return; }

  let x = cellIdx % params.nx;
  let y = (cellIdx / params.nx) % params.ny;
  let z = cellIdx / (params.nx * params.ny);

  let nx = params.nx;
  let ny = params.ny;
  let nz = params.nz;

  // Inlet boundary: x == 0 → set equilibrium
  if (x == 0u) {
    let rho0: f32 = 1.0;
    let u0 = params.u0;
    for (var i = 0u; i < 19u; i++) {
      fOut[fIdx(cellIdx, i)] = feq(W[i], rho0, u0, 0.0, 0.0, DX[i], DY[i], DZ[i]);
    }
    return;
  }

  // Outlet boundary: x == Nx-1 → copy from x-1
  if (x == nx - 1u) {
    let srcIdx = idx3(x - 1u, y, z);
    for (var i = 0u; i < 19u; i++) {
      fOut[fIdx(cellIdx, i)] = fOut[fIdx(srcIdx, i)];
    }
    return;
  }

  for (var i = 0u; i < 19u; i++) {
    let sx = i32(x) - DX[i];
    let sy = i32(y) - DY[i];
    let sz = i32(z) - DZ[i];

    let groundZ = params.groundZ;

    // Wall bounce-back: top/bottom/front/back walls + ground
    if (sy < 0 || sy >= i32(ny) || sz < groundZ || sz >= i32(nz)) {
      // Bounce-back: use opposite direction from current cell
      fOut[fIdx(cellIdx, i)] = fIn[fIdx(cellIdx, OPP[i])];
      continue;
    }

    // Left boundary (handled above as inlet)
    if (sx < 0) {
      fOut[fIdx(cellIdx, i)] = fIn[fIdx(cellIdx, i)];
      continue;
    }

    // Right boundary (handled above as outlet)
    if (sx >= i32(nx)) {
      fOut[fIdx(cellIdx, i)] = fIn[fIdx(cellIdx, i)];
      continue;
    }

    let srcCellIdx = idx3(u32(sx), u32(sy), u32(sz));

    // Obstacle bounce-back
    if (obstacle[srcCellIdx] == 1u) {
      fOut[fIdx(cellIdx, i)] = fIn[fIdx(cellIdx, OPP[i])];
    } else {
      fOut[fIdx(cellIdx, i)] = fIn[fIdx(srcCellIdx, i)];
    }
  }
}

// ============ Vorticity (curl of velocity) ============
@compute @workgroup_size(256)
fn vorticity(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cellIdx = gid.x;
  let totalCells = params.nx * params.ny * params.nz;
  if (cellIdx >= totalCells) { return; }

  let x = cellIdx % params.nx;
  let y = (cellIdx / params.nx) % params.ny;
  let z = cellIdx / (params.nx * params.ny);

  if (x < 1u || x >= params.nx - 1u || y < 1u || y >= params.ny - 1u || z < 1u || z >= params.nz - 1u) {
    macro[macroIdx(cellIdx, 6u)] = 0.0;
    return;
  }

  if (obstacle[cellIdx] == 1u) {
    macro[macroIdx(cellIdx, 6u)] = 0.0;
    return;
  }

  let xp = idx3(x + 1u, y, z);
  let xm = idx3(x - 1u, y, z);
  let yp = idx3(x, y + 1u, z);
  let ym = idx3(x, y - 1u, z);
  let zp = idx3(x, y, z + 1u);
  let zm = idx3(x, y, z - 1u);

  // curl = (duz/dy - duy/dz, dux/dz - duz/dx, duy/dx - dux/dy)
  let wx = 0.5 * (macro[macroIdx(yp, 3u)] - macro[macroIdx(ym, 3u)]) -
           0.5 * (macro[macroIdx(zp, 2u)] - macro[macroIdx(zm, 2u)]);
  let wy = 0.5 * (macro[macroIdx(zp, 1u)] - macro[macroIdx(zm, 1u)]) -
           0.5 * (macro[macroIdx(xp, 3u)] - macro[macroIdx(xm, 3u)]);
  let wz = 0.5 * (macro[macroIdx(xp, 2u)] - macro[macroIdx(xm, 2u)]) -
           0.5 * (macro[macroIdx(yp, 1u)] - macro[macroIdx(ym, 1u)]);

  macro[macroIdx(cellIdx, 6u)] = sqrt(wx * wx + wy * wy + wz * wz);
}
