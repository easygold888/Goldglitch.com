export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const cacheKey = new Request(url.origin + "/api/eth-quote");
  const cache = caches.default;

  let cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Binance Spot Market Data endpoints (public)
  // docs: /api/v3/klines, /api/v3/ticker/price :contentReference[oaicite:3]{index=3}
  const symbol = "ETHUSDT";

  // weekly high: use 1w kline, last candle high
  const klineUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1w&limit=2`;
  const priceUrl = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;

  const [kRes, pRes] = await Promise.all([fetch(klineUrl), fetch(priceUrl)]);
  if (!kRes.ok || !pRes.ok) return new Response(JSON.stringify({ error: "upstream" }), { status: 502 });

  const klines = await kRes.json(); // array
  const price = await pRes.json();  // {symbol, price}

  // kline format: [ openTime, open, high, low, close, volume, ... ]
  const last = klines[klines.length - 1];
  const weekHighUsd = Number(last?.[2]);
  const ethUsd = Number(price?.price);

  const body = JSON.stringify({
    ethUsd,
    weekHighUsd,
    refreshedAt: Date.now()
  });

  const resp = new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=600" // 10 minutes
    }
  });

  await cache.put(cacheKey, resp.clone());
  return resp;
}
