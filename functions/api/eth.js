// /functions/api/eth.js
export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  // Edge cache (10 min)
  const cacheKey = new Request(url.toString(), context.request);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const bases = [
    "https://data-api.binance.vision", // market-data-only mirror
    "https://api.binance.com"
  ];

  async function fetchJson(path) {
    let lastErr;
    for (const base of bases) {
      try {
        const r = await fetch(base + path, {
          headers: {
            "accept": "application/json",
            "user-agent": "EasyGoldGlitch/1.0"
          }
        });
        if (!r.ok) throw new Error(`HTTP ${r.status} from ${base}${path}`);
        return await r.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Failed to fetch from Binance bases");
  }

  // Current price (ETHUSDT)
  // Binance supports GET /api/v3/ticker/price (symbol price ticker). :contentReference[oaicite:4]{index=4}
  const priceJson = await fetchJson("/api/v3/ticker/price?symbol=ETHUSDT");
  const usd = Number(priceJson?.price);

  // Weekly high (last 7 days). We'll use 1h candles * 168
  // Binance klines: GET /api/v3/klines. :contentReference[oaicite:5]{index=5}
  const klines = await fetchJson("/api/v3/klines?symbol=ETHUSDT&interval=1h&limit=168");

  let weeklyHighUsd = 0;
  for (const k of klines) {
    // [ openTime, open, high, low, close, volume, ... ]
    const high = Number(k?.[2]);
    if (Number.isFinite(high)) weeklyHighUsd = Math.max(weeklyHighUsd, high);
  }

  const now = Date.now();
  const payload = {
    ok: true,
    symbol: "ETH",
    pair: "ETHUSDT",
    usd,
    weeklyHighUsd,
    method: "binance",
    refreshedAt: now,
    ttlMs: 10 * 60 * 1000
  };

  const res = new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=600"
    }
  });

  // Cache it
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
