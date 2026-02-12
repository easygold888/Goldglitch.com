import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "edge";

const VERSION = "order-intent-v4-debug";
const ORDER_TTL_MS = 10 * 60 * 1000;
const COINBASE_URL = "https://api.coinbase.com/v2/prices/ETH-USD/spot";

const CATALOG: Record<string, { usd: number; name: string }> = {
  g1: { usd: 50, name: "Glitch 1.0 — Simple Sample" },
  g2: { usd: 70, name: "Glitch 2.0 — Wealth Builder" },
  g3: { usd: 100, name: "Glitch Pro — F*ck Gold" },
  lg: { usd: 150, name: "Little Glitcher" },
};

function json(data: any, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

function isEmailLoose(email: string) {
  const e = email.trim();
  return e.length >= 6 && e.includes("@") && e.includes(".");
}

function asNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

async function fetchEthUsdFromCoinbase(): Promise<number | null> {
  const cacheKey = new Request("https://cache.easygoldglitch.com/eth-usd");

  try {
    // @ts-ignore
    const cache = (globalThis as any).caches?.default;
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const j = await hit.json().catch(() => null);
        const ref = asNum(j?.ref);
        if (Number.isFinite(ref) && ref > 0) return ref;
      }
    }
  } catch {}

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);

  try {
    const r = await fetch(COINBASE_URL, {
      signal: ac.signal,
      headers: { accept: "application/json", "user-agent": "easygoldglitch/1.0" },
      cache: "no-store",
    });

    if (!r.ok) return null;

    const j = await r.json().catch(() => null);
    const ref = asNum(j?.data?.amount);
    if (!Number.isFinite(ref) || ref <= 0) return null;

    try {
      // @ts-ignore
      const cache = (globalThis as any).caches?.default;
      if (cache) {
        await cache.put(
          cacheKey,
          new Response(JSON.stringify({ ref }), {
            headers: {
              "content-type": "application/json",
              "cache-control": "public, max-age=15",
            },
          })
        );
      }
    } catch {}

    return ref;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  // Esto es para verificar rápido que el deploy ya está sirviendo el código nuevo
  return json({ ok: true, route: "order-intent", version: VERSION, ts: Date.now() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const productId = String(body?.productId ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!CATALOG[productId]) return json({ ok: false, error: "invalid_product" }, 400);
    if (!isEmailLoose(email)) return json({ ok: false, error: "invalid_email" }, 400);

    const refPriceUsd = await fetchEthUsdFromCoinbase();
    if (!refPriceUsd) return json({ ok: false, error: "quote_unavailable" }, 503);

    const usdAmount = CATALOG[productId].usd;
    const ethExpected = usdAmount / refPriceUsd;

    const orderId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + ORDER_TTL_MS;

    // binding runtime (D1)
    const { env } = getCloudflareContext() as unknown as { env: { EGG_DB: any } };
    if (!env?.EGG_DB) return json({ ok: false, error: "missing_db_binding", version: VERSION }, 500);

    await env.EGG_DB.prepare(
      `INSERT INTO orders
        (id, created_at, email, product_id, usd_amount, ref_price_usd, eth_expected, expires_at, status)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, 'CREATED')`
    )
      .bind(orderId, now, email, productId, usdAmount, refPriceUsd, ethExpected, expiresAt)
      .run();

    return json({
      ok: true,
      version: VERSION,
      orderId,
      productId,
      usdAmount,
      refPriceUsd,
      ethExpected,
      createdAt: now,
      expiresAt,
    });
  } catch (err: any) {
    console.error("order-intent crash", err);
    return json(
      {
        ok: false,
        error: "server_error",
        version: VERSION,
        detail: String(err?.message ?? err),
      },
      500
    );
  }
}
