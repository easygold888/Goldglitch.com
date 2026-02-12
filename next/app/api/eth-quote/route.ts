import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const CACHE_TTL_SECONDS = 15;

type QuoteOk = {
  ok: true;
  ref: number;      // ETH/USD
  address: string;  // from /public/address.txt
  source: "coinbase";
  ts: number;
};

type QuoteErr = {
  ok: false;
  error: "quote_unavailable";
};

async function fetchEthUsdFromCoinbase(): Promise<number | null> {
  const r = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
    headers: {
      accept: "application/json",
      "user-agent": "easygoldglitch/1.0",
    },
    cache: "no-store",
  });

  if (!r.ok) return null;

  const j = (await r.json().catch(() => null)) as any;
  const n = Number(j?.data?.amount);

  return Number.isFinite(n) && n > 0 ? n : null;
}

async function readAddress(requestUrl: string): Promise<string> {
  try {
    // address.txt está en /public/address.txt (tu build lo sube como asset)
    const u = new URL("/address.txt", requestUrl);
    const r = await fetch(u.toString(), { cache: "no-store" });
    if (!r.ok) return "";
    return (await r.text()).trim();
  } catch {
    return "";
  }
}

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    // En Cloudflare Workers existe caches.default; en dev local (Node) no.
    // Si no existe, simplemente no cacheamos.
    // @ts-ignore
    if (typeof caches === "undefined" || !caches?.default) return null;

    const req = new Request(key, { method: "GET" });
    // @ts-ignore
    const hit = await caches.default.match(req);
    if (!hit) return null;

    return (await hit.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

async function cachePut(key: string, data: any): Promise<void> {
  try {
    // @ts-ignore
    if (typeof caches === "undefined" || !caches?.default) return;

    const req = new Request(key, { method: "GET" });
    const res = new Response(JSON.stringify(data), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });

    // @ts-ignore
    await caches.default.put(req, res);
  } catch {
    // no-op
  }
}

export async function GET(request: Request) {
  // Cache key estable (sin query params)
  const cacheKey = new URL(request.url);
  cacheKey.pathname = "/__cache/eth-quote";
  cacheKey.search = "";
  const key = cacheKey.toString();

  const cached = await cacheGet<QuoteOk>(key);
  if (cached?.ok === true && typeof cached.ref === "number") {
    return NextResponse.json(cached, {
      headers: { "cache-control": `public, max-age=${CACHE_TTL_SECONDS}` },
    });
  }

  const [price, address] = await Promise.all([
    fetchEthUsdFromCoinbase(),
    readAddress(request.url),
  ]);

  if (!price) {
    const err: QuoteErr = { ok: false, error: "quote_unavailable" };
    return NextResponse.json(err, { status: 503 });
  }

  const payload: QuoteOk = {
    ok: true,
    ref: price,
    address,
    source: "coinbase",
    ts: Date.now(),
  };

  await cachePut(key, payload);

  return NextResponse.json(payload, {
    headers: { "cache-control": `public, max-age=${CACHE_TTL_SECONDS}` },
  });
}
