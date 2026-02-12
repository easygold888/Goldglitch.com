import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

export const runtime = "edge";

const ORDER_TTL_MS = 10 * 60 * 1000;
const COINBASE_URL = "https://api.coinbase.com/v2/prices/ETH-USD/spot";

const CATALOG: Record<string, { usd: number; name: string }> = {
  g1: { usd: 50, name: "Glitch 1.0 — Simple Sample" },
  g2: { usd: 70, name: "Glitch 2.0 — Wealth Builder" },
  g3: { usd: 100, name: "Glitch Pro — F*ck Gold" },
  lg: { usd: 150, name: "Little Glitcher" },
};

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
  } catch {
    // ignore
  }

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);

  try {
    const r = await fetch(COINBASE_URL, {
      signal: ac.signal,
      headers: {
        accept: "application/json",
        "user-agent": "easygoldglitch/1.0",
      },
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
    } catch {
      // ignore
    }

    return ref;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const productId = String(body?.productId ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!CATALOG[productId]) {
      return Response.json({ ok: false, error: "invalid_product" }, { status: 400 });
    }
    if (!isEmailLoose(email)) {
      return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }

    const refPriceUsd = await fetchEthUsdFromCoinbase();
    if (!refPriceUsd) {
      return Response.json({ ok: false, error: "quote_unavailable" }, { status: 503 });
    }

    const usdAmount = CATALOG[productId].usd;
    const ethExpected = usdAmount / refPriceUsd;

    const orderId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + ORDER_TTL_MS;

    // Tipado local para evitar errores TS en build
    const { env } = getCloudflareContext() as unknown as { env: { EGG_DB: D1Database } };

    await env.EGG_DB.prepare(
      `INSERT INTO orders
        (id, created_at, email, product_id, usd_amount, ref_price_usd, eth_expected, expires_at, status)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, 'CREATED')`
    )
      .bind(orderId, now, email, productId, usdAmount, refPriceUsd, ethExpected, expiresAt)
      .run();

    return Response.json({
      ok: true,
      orderId,
      productId,
      usdAmount,
      refPriceUsd,
      ethExpected,
      createdAt: now,
      expiresAt,
    });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
