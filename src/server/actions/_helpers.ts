export type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function runAction<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Có lỗi xảy ra";
    return { ok: false, error: msg };
  }
}
