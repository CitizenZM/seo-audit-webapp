/** Fire-and-return dispatch to the auto-fix worker (own 300s invocation). */
export async function dispatchAutoFix(origin: string, clientId: string, opts: { scan: boolean; hop?: number }) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, error: 'CRON_SECRET not configured' };
  try {
    const res = await fetch(`${origin}/api/jobs/autofix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ clientId, scan: opts.scan, hop: opts.hop ?? 0 }),
    });
    return { ok: res.status === 202, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'dispatch failed' };
  }
}
