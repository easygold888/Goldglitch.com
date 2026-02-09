export async function onRequestGet(context) {
  const cache = caches.default;
  const url = new URL(context.request.url);
  const cacheKey = new Request(url.toString(), context.request);

  // 1) Try edge cache first
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // 2) Fetch from Binance "data-api" (market-data-only host)
  // Docs mention market-data-only endpoints available on data-api.binance.vision :contentReference[oaicite:2]{index=2}
  const symbol = "ETHUSDT";
  const base = "https://data-api.binance.vision";

  // Spot price
  const spotRes = await fetch(`${base}/api/v3/ticker/price?symbol=${symbol}`);
  if (!spotRes.ok) return json({ error: "spot fetch failed" }, 502, noStore());

  const spotJson = await spotRes.json();
  const spot = Number(spotJson.price);

  // 7D reference: max daily high of last 7 daily candles
  const kRes = await fetch(`${base}/api/v3/klines?symbol=${symbol}&interval=1d&limit=7`);
  if (!kRes.ok) return json({ error: "klines fetch failed" }, 502, noStore());

  const klines = await kRes.json();
  // kline format: [ openTime, open, high, low, close, volume, closeTime, ...]
  let ref = 0;
  for (const k of klines) {
    const high = Number(k[2]);
    if (Number.isFinite(high) && high > ref) ref = high;
  }

  // Guard rails
  if (!Number.isFinite(spot) || spot <= 0 || !Number.isFinite(ref) || ref <= 0) {
    return json({ error: "bad quote" }, 502, noStore());
  }

  const body = { spot, ref, sourceTime: Date.now() };

  // Cache for 10 minutes at the edge
  const resp = json(body, 200, {
    "Cache-Control": "public, max-age=600",
  });

  context.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function noStore() {
  return { "Cache-Control": "no-store" };
}
