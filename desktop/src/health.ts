/** 后端健康探测:一次 healthz,不轮询;任何失败 → false */
export async function probeBackend(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/healthz`);
    return res.ok;
  } catch {
    return false;
  }
}
