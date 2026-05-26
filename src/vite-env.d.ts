/// <reference types="vite/client" />
/// <reference types="@webgpu/types" />

declare module '*.glb?url' {
  const src: string;
  export default src;
}

declare module '*.wgsl?raw' {
  const src: string;
  export default src;
}
