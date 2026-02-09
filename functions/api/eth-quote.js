// functions/api/eth-quote.js
// Robust ETH quote for Pages Functions:
// - Source: CoinGecko (spot + 7D OHLC high)
// - Cache: 10 minutes (fresh) + 24h (last-good fallback)
// - Never returns blank/zero if we have a previous good quote.

const COINGECKO_SPOT =
  "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";

const COINGECKO_OHLC_7D =
  "https://api.coingecko.com/api/v3/coins/ethereum/ohlc?vs_currency=usd&days=7";

const FRESH_TTL_SECONDS = 600;     // 10 minutes
const LASTGOOD_TTL_SECONDS = 86400; // 24 hours

function jsonResponse(obj, { status = 200, cacheSeconds = 0, extraHeaders = {} } = {}) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    // cacheSeconds applies to edge cache (s-maxage). Browser can cache 0.
    "cache-control": `public, max-age=0, s-maxage=${cacheSeconds}`,
    ...extraHeaders,
  });
  return new Response(JSON.stringify(obj), { status, headers });
}

async function fetchJsonWithTimeout(url, ms = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { "accept": "application/json" },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function computeQuote() {
  // 1) Spot
  const spotRes = await fetchJsonWithTimeout(COINGECKO_SPOT, 6000);
  if (!spotRes.ok) throw new Error(`spot_not_ok:${spotRes.status}`);
  const spot = await spotRes.json();
  const spotUsd = Number(spot?.ethereum?.usd);
  if (!Number.isFinite(spotUsd) || spotUsd <= 0) throw new Error("spot_invalid");

  // 2) 7D OHLC (array of [timestamp, open, high, low, close])
  // We use max(high) as the "Reference price".
  const ohlcRes = await fetchJsonWithTimeout(COINGECKO_OHLC_7D, 7000);
  if (!ohlcRes.ok) throw new Error(`ohlc_not_ok:${ohlcRes.status}`);
  const ohlc = await ohlcRes.json();

  if (!Array.isArray(ohlc) || ohlc.length === 0) throw new Error("ohlc_invalid");

  let high7d = 0;
  for (const candle of ohlc) {
    const h = Number(candle?.[2]);
    if (Number.isFinite(h) && h > high7d) high7d = h;
  }
  if (!Number.isFinite(high7d) || high7d <= 0) throw new Error("high7d_invalid");

  const ts = Date.now();

  return {
    ok: true,
    ts,
    // "Reference price" = 7D high (USD per ETH)
    referenceUsdPerEth: high7d,
    // Spot price (USD per ETH)
    spotUsdPerEth: spotUsd,
    // Convenience conversions for your frontend
    referenceEthPerUsd: 1 / high7d,
    spotEthPerUsd: 1 / spotUsd,
    // Metadata
    source: "coingecko",
    validForSeconds: FRESH_TTL_SECONDS,
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  const cache = caches.default;

  // We keep cache keys stable (ignore query params) to maximize cache hits.
  const origin = new URL(request.url).origin;
  const freshKey = new Request(`${origin}/api/eth-quote`, { method: "GET" });
  const lastKey = new Request(`${origin}/api/eth-quote:last-good`, { method: "GET" });

  // 1) Fresh cache (10 min)
  const freshCached = await cache.match(freshKey);
  if (freshCached) return freshCached;

  // 2) Last-good cache (24h) as fallback
  const lastCached = await cache.match(lastKey);

  try {
    const data = await computeQuote();

    const freshRes = jsonResponse(data, {
      status: 200,
      cacheSeconds: FRESH_TTL_SECONDS,
      extraHeaders: { "x-eg-cache": "fresh" },
    });

    const lastRes = jsonResponse(data, {
      status: 200,
      cacheSeconds: LASTGOOD_TTL_SECONDS,
      extraHeaders: { "x-eg-cache": "last-good" },
    });

    // Store both. (No need to block the response on cache writes.)
    context.waitUntil(cache.put(freshKey, freshRes.clone()));
    context.waitUntil(cache.put(lastKey, lastRes.clone()));

    return freshRes;
  } catch (err) {
    // If upstream fails (rate limit, timeout, etc.), never return blank if we have last-good.
    if (lastCached) {
      const txt = await lastCached.clone().text();
      // Mark stale so you can optionally show “stale” in UI, but don’t erase values.
      return new Response(txt, {
        status: 200,
        headers: new Headers({
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=0, s-maxage=60",
          "x-eg-stale": "1",
        }),
      });
    }

    // Absolute fallback (first ever call and CoinGecko is down)
    return jsonResponse(
      { ok: false, error: "quote_unavailable", ts: Date.now() },
      { status: 503, cacheSeconds: 60 }
    );
  }
}
