// functions/api/eth-quote.js
// ETH quote via Binance public market data.
// Returns: { ok:true, spot:<number>, ref:<number>, ts:<ms>, source:"binance", symbol:"ETHUSDT", stale?:true }

const SYMBOL = "ETHUSDT";
const KLINE_LIMIT = 8; // pull 8 daily candles, then take last 7 highs
const TIMEOUT_MS = 6500;

// Binance base endpoints (official docs mention multiple; plus market-data-only endpoint)
const BASES = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api-gcp.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com",
];

// in-memory last good quote (survives within same isolate)
let lastGood = null;

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // small edge caching to reduce Binance hits; browser won't cache
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
      // optional CORS (safe even if same-origin)
      "access-control-allow-origin": "*",
    },
  });
}

async function fetchJson(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const r = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "accept": "application/json",
        // Some edges/providers behave better with a UA
        "user-agent": "EasyGoldGlitch/1.0 (+https://easygoldglitch.com)",
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

async function tryBinanceBase(base) {
  const spotUrl = `${base}/api/v3/ticker/price?symbol=${SYMBOL}`;
  const klineUrl = `${base}/api/v3/klines?symbol=${SYMBOL}&interval=1d&limit=${KLINE_LIMIT}`;

  const [spotJ, klines] = await Promise.all([fetchJson(spotUrl), fetchJson(klineUrl)]);

  const spot = toNum(spotJ?.price);

  // klines: array of arrays, high price at index [2]
  const highs = Array.isArray(klines)
    ? klines.map(k => toNum(k?.[2])).filter(n => Number.isFinite(n) && n > 0)
    : [];

  if (!Number.isFinite(spot) || spot <= 0) throw new Error("bad spot");
  if (highs.length < 2) throw new Error("bad klines");

  // "weekly ATH": max high of last 7 daily candles
  const last7 = highs.slice(-7);
  const ref = Math.max(...last7);

  if (!Number.isFinite(ref) || ref <= 0) throw new Error("bad ref");

  return { spot, ref, base };
}

export async function onRequest(context) {
  const { request } = context;

  // Handle preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    });
  }

  if (request.method !== "GET") {
    return jsonResponse({ ok: false, error: "method_not_allowed", ts: Date.now() }, 405);
  }

  let lastErr = null;

  for (const base of BASES) {
    try {
      const { spot, ref, base: usedBase } = await tryBinanceBase(base);
      const payload = {
        ok: true,
        spot,
        ref,
        ts: Date.now(),
        source: "binance",
        symbol: SYMBOL,
        base: usedBase,
      };
      lastGood = payload;
      return jsonResponse(payload, 200);
    } catch (e) {
      lastErr = e;
      // try next base
    }
  }

  // If all bases failed, return last good if we have it (stale mode)
  if (lastGood?.ok && Number.isFinite(lastGood.spot) && Number.isFinite(lastGood.ref)) {
    return jsonResponse({ ...lastGood, stale: true, ts: Date.now() }, 200);
  }

  return jsonResponse(
    { ok: false, error: "quote_unavailable", detail: String(lastErr || ""), ts: Date.now() },
    200
  );
}
