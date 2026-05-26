export async function initWebGPU(): Promise<{ device: GPUDevice; adapter: GPUAdapter } | null> {
  if (!navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return null;
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: 512 * 1024 * 1024,
      maxBufferSize: 512 * 1024 * 1024,
      maxComputeWorkgroupSizeX: 256,
    },
  });
  return { device, adapter };
}

export function isWebGPUAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}
