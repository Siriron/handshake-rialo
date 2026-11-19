// Same-origin JSON-RPC relay. The devnet RPC sends no CORS headers, so the browser
// talks to this function and this function talks to the RPC.
const UPSTREAM = process.env.RIALO_RPC ?? "http://devnet.rialo.io:4100";
const ALLOWED = /^(get|send|request|simulate)[A-Za-z]+$/;
const MAX_BYTES = 64 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function POST(request: Request): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BYTES) return json({ error: "request too large" }, 413);
  let msg: { method?: unknown };
  try {
    msg = JSON.parse(text);
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (Array.isArray(msg) || typeof msg.method !== "string" || !ALLOWED.test(msg.method))
    return json({ error: "method not allowed" }, 400);
  try {
    const up = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: text,
      signal: AbortSignal.timeout(20_000),
    });
    return new Response(await up.text(), { status: up.status, headers: { "content-type": "application/json" } });
  } catch {
    return json({ error: "devnet RPC unreachable" }, 502);
  }
}
