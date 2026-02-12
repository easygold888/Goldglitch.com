export const runtime = "edge";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

const ORDER_TTL_MS = 10 * 60 * 1000;

const CATALOG: Record<string, { usd: number; name: string }> = {
  g1: { usd: 50, name: "Glitch 1.0 — Simple Sample" },
  g2: { usd: 70, name: "Glitch 2.0 — Wealth Builder" },
  g3: { usd: 100, name: "Glitch Pro — F*ck Gold" },
  lg: { usd: 150, name: "Little Glitcher" },
};

const COINBASE_URL = "https://api.coinbase.com/v2/prices/ETH-USD/spot";

function isEmailLoose(email: string) {
  const e = email.trim();
  return e.length >= 6 && e.includes("@") && e.includes(".");
}

function asNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

async function fetchEthUsd(): Promise<number | null> {
  const r = await fetch(
    COINBASE_URL,
    ({
      cf: { cacheTtl: 15, cacheEverything: true },
      headers: {
        accept: "application/json",
        "user-agent": "easygoldglitch/1.0",
      },
    } as unknown as RequestInit)
  ).catch(() => null);

  if (!r || !r.ok) return null;

  const j = await r.json().catch(() => null);
  const amount = asNum(j?.data?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

export async function GET() {
  // Health check para que GET no te devuelva 500 nunca más
  return Response.json({ ok: true, hint: "POST /api/order-intent" });
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

    const refPriceUsd = await fetchEthUsd();
    if (!refPriceUsd) {
      return Response.json({ ok: false, error: "quote_unavailable" }, { status: 503 });
    }

    const usdAmount = CATALOG[productId].usd;
    const ethExpected = usdAmount / refPriceUsd;

    const orderId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + ORDER_TTL_MS;

    const { env } = getCloudflareContext() as any;
    const db = env.EGG_DB as D1Database;

    await db
      .prepare(
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
