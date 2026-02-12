import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "edge";

const ORDER_TTL_MS = 10 * 60 * 1000;

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

async function fetchEthUsdFromInternal(request: Request): Promise<number | null> {
  const quoteUrl = new URL("/api/eth-quote", request.url);
  const r = await fetch(quoteUrl.toString(), { cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!j || j.ok !== true) return null;

  const ref = asNum(j.ref);
  return Number.isFinite(ref) && ref > 0 ? ref : null;
}

async function fetchEthUsdFromCoinbase(): Promise<number | null> {
  const r = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
    cf: { cacheTtl: 15, cacheEverything: true } as any,
    headers: {
      "accept": "application/json",
      "user-agent": "easygoldglitch/1.0",
    },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const amount = asNum(j?.data?.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
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

    // 1) Intento con eth-quote interno
    let refPriceUsd = await fetchEthUsdFromInternal(request);

    // 2) Fallback externo
    if (!refPriceUsd) {
      refPriceUsd = await fetchEthUsdFromCoinbase();
    }

    if (!refPriceUsd) {
      return Response.json({ ok: false, error: "quote_unavailable" }, { status: 503 });
    }

    const usdAmount = CATALOG[productId].usd;
    const ethExpected = usdAmount / refPriceUsd;

    const orderId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + ORDER_TTL_MS;

    const { env } = getCloudflareContext();

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
