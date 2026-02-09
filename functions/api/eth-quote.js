// functions/api/eth-quote.js
// ETH quote via Kraken public market data (no API key).
// Returns: { ok:true, spot:<number>, ref:<number>, ts:<ms>, source:"kraken", pair:<string>, stale?:true }

const PAIR = "ETHUSD";               // request pair; Kraken may respond with canonical key like "XETHZUSD"
const INTERVAL_MIN = 1440;           // 1 day candles
const DAYS_FOR_REF = 7;              // weekly reference = max high of last 7 daily candles
const TIMEOUT_MS = 6500;

// In-memory last good quote (best-effort within same isolate)
let lastGood = null;

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Edge cache a bit to reduce upstream hits.
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
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

function pickFirstResultKey(obj) {
  if (!obj || typeof obj !== "object") return null;
  const keys = Object.keys(obj);
  return keys.length ? keys[0] : null;
}

async function krakenQuote() {
  // Kraken REST base URL is https://api.kraken.com/0 and endpoints include /public/Ticker and /public/OHLC. :contentReference[oaicite:0]{index=0}
  const base = "https://api.kraken.com/0";

  // Spot (ticker)
  const tickerUrl = `${base}/public/Ticker?pair=${encodeURIComponent(PAIR)}`;
  // OHLC: use "since" to reduce payload (last ~9 days)
  const since = Math.floor(Date.now() / 1000) - (9 * 86400);
  const ohlcUrl = `${base}/public/OHLC?pair=${encodeURIComponent(PAIR)}&interval=${INTERVAL_MIN}&since=${since}`;

  const [tickerJ, ohlcJ] = await Promise.all([fetchJson(tickerUrl), fetchJson(ohlcUrl)]);

  if (Array.isArray(tickerJ?.error) && tickerJ.error.length) {
    throw new Error(`kraken ticker error: ${tickerJ.error.join(",")}`);
  }
  if (Array.isArray(ohlcJ?.error) && ohlcJ.error.length) {
    throw new Error(`kraken ohlc error: ${ohlcJ.error.join(",")}`);
  }

  const tickerRes = tickerJ?.result;
  const ohlcRes = ohlcJ?.result;

  const tickerKey = pickFirstResultKey(tickerRes);
  if (!tickerKey) throw new Error("kraken ticker: no result key");

  // ticker.c[0] = last trade closed price (string)
  const spot = toNum(tickerRes[tickerKey]?.c?.[0]);
  if (!Number.isFinite(spot) || spot <= 0) throw new Error("kraken ticker: bad spot");

  // OHLC result contains pair key(s) + "last"
  const ohlcPairKey = Object.keys(ohlcRes || {}).find(k => k !== "last");
  if (!ohlcPairKey) throw new Error("kraken ohlc: no pair key");

  const bars = ohlcRes[ohlcPairKey];
  if (!Array.isArray(bars) || bars.length < DAYS_FOR_REF) throw new Error("kraken ohlc: insufficient bars");

  // bar format: [ time, open, high, low, close, vwap, volume, count ]
  const highs = bars.map(b => toNum(b?.[2])).filter(n => Number.isFinite(n) && n > 0);
  if (highs.length < DAYS_FOR_REF) throw new Error("kraken ohlc: bad highs");

  const lastN = highs.slice(-DAYS_FOR_REF);
  const ref = Math.max(...lastN);
  if (!Number.isFinite(ref) || ref <= 0) throw new Error("kraken ohlc: bad ref");

  return {
    ok: true,
    spot,
    ref,
    ts: Date.now(),
    source: "kraken",
    pair: ohlcPairKey,
  };
}

export async function onRequest(context) {
  const { request } = context;

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

  // Try edge cache first
  try {
    const cache = caches.default;
    const cacheKey = new Request(request.url, request);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  } catch {
    // ignore cache errors
  }

  try {
    const payload = await krakenQuote();
    lastGood = payload;

    const res = jsonResponse(payload, 200);

    // Store in edge cache best-effort
    try {
      const cache = caches.default;
      const cacheKey = new Request(request.url, request);
      await cache.put(cacheKey, res.clone());
    } catch {}

    return res;
  } catch (e) {
    // stale fallback if we have something
    if (lastGood?.ok && Number.isFinite(lastGood.spot) && Number.isFinite(lastGood.ref)) {
      return jsonResponse({ ...lastGood, stale: true, ts: Date.now() }, 200);
    }
    return jsonResponse(
      { ok: false, error: "quote_unavailable", detail: String(e?.message || e), ts: Date.now() },
      200
    );
  }
}
