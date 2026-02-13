import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

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

function getEnvDB(): D1Database | null {
  try {
    const ctx = getCloudflareContext() as unknown as { env?: { EGG_DB?: D1Database } };
    const db = ctx?.env?.EGG_DB;
    return db ?? null;
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

    // Source of truth: your quote endpoint
    const quoteUrl = new URL("/api/eth-quote", request.url);
    const qr = await fetch(quoteUrl.toString(), { cache: "no-store" });
    const qj = await qr.json().catch(() => null);

    if (!qj || qj.ok !== true) {
      return Response.json({ ok: false, error: "quote_unavailable" }, { status: 503 });
    }

    const refPriceUsd =
      asNum(qj.ref) ||
      asNum(qj.reference) ||
      asNum(qj.referenceUsd) ||
      asNum(qj.reference_usd);

    const walletAddress = String(qj.address ?? "").trim();

    if (!Number.isFinite(refPriceUsd) || refPriceUsd <= 0) {
      return Response.json({ ok: false, error: "invalid_quote" }, { status: 503 });
    }
    if (!walletAddress.startsWith("0x") || walletAddress.length < 40) {
      return Response.json({ ok: false, error: "invalid_wallet_address" }, { status: 503 });
    }

    const usdAmount = CATALOG[productId].usd;
    const ethExpected = usdAmount / refPriceUsd;
    const ethExpectedStr = ethExpected.toFixed(18);

    const orderId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + ORDER_TTL_MS;

    const db = getEnvDB();
    if (!db) {
      return Response.json({ ok: false, error: "db_unavailable" }, { status: 503 });
    }

    await db.prepare(
      `INSERT INTO orders
        (id, created_at, email, product_id, usd_amount, ref_price_usd, eth_expected, expires_at, status, wallet_address)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, 'CREATED', ?)`
    )
      .bind(orderId, now, email, productId, usdAmount, refPriceUsd, ethExpectedStr, expiresAt, walletAddress)
      .run();

    return Response.json({
      ok: true,
      orderId,
      productId,
      usdAmount,
      refPriceUsd,
      ethExpected,
      ethExpectedStr,
      walletAddress,
      createdAt: now,
      expiresAt,
    });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
