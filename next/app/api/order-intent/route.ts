import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

type Env = {
  EGG_DB: D1Database;
};

const ORDER_TTL_MS = 10 * 60 * 1000;

// Si quieres, luego lo movemos a un secret/env.
// Por ahora lo dejo hardcodeado para eliminar variables en debugging.
const WALLET_ADDRESS = "0xeCa7db8547Fbe9d6E4B7fbcE12439e03eb00AFEf";

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
  try {
    const r = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
      headers: {
        "accept": "application/json",
        "user-agent": "easygoldglitch/1.0",
      },
    });

    if (!r.ok) return null;

    const j: any = await r.json().catch(() => null);
    const amount = asNum(j?.data?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    return amount;
  } catch {
    return null;
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
    if (!Number.isFinite(refPriceUsd as any) || (refPriceUsd as number) <= 0) {
      return Response.json({ ok: false, error: "quote_unavailable" }, { status: 503 });
    }

    const usdAmount = CATALOG[productId].usd;
    const ethExpected = usdAmount / (refPriceUsd as number);

    const orderId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + ORDER_TTL_MS;

    const { env } = (getCloudflareContext() as unknown as { env: Env });

    await env.EGG_DB.prepare(
      `INSERT INTO orders
        (id, created_at, email, product_id, usd_amount, ref_price_usd, eth_expected, expires_at, status, wallet_address)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, 'CREATED', ?)`
    )
      .bind(orderId, now, email, productId, usdAmount, refPriceUsd, ethExpected, expiresAt, WALLET_ADDRESS)
      .run();

    return Response.json({
      ok: true,
      orderId,
      productId,
      usdAmount,
      refPriceUsd,
      ethExpected,
      walletAddress: WALLET_ADDRESS,
      createdAt: now,
      expiresAt,
    });
  } catch (e: any) {
    // Devolvemos JSON para poder debugear rápido sin texto plano
    return Response.json(
      { ok: false, error: "server_error", detail: String(e?.message ?? e ?? "unknown") },
      { status: 500 }
    );
  }
}
