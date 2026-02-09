export async function onRequestGet(context) {
  const CACHE_TTL_SECONDS = 600; // 10 min

  const cache = caches.default;
  const url = new URL(context.request.url);

  // Cache key fijo (misma respuesta para todos durante 10 min)
  const cacheKey = new Request(url.toString(), { method: "GET" });

  // 1) Try cache first
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // 2) Fetch fresh from CoinGecko
  const spotUrl =
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
  const ohlcUrl =
    "https://api.coingecko.com/api/v3/coins/ethereum/ohlc?vs_currency=usd&days=7";

  try {
    const [spotRes, ohlcRes] = await Promise.all([
      fetch(spotUrl, { headers: { accept: "application/json" } }),
      fetch(ohlcUrl, { headers: { accept: "application/json" } }),
    ]);

    if (!spotRes.ok) throw new Error(`CoinGecko spot failed: ${spotRes.status}`);
    if (!ohlcRes.ok) throw new Error(`CoinGecko OHLC failed: ${ohlcRes.status}`);

    const spotJson = await spotRes.json();
    const ohlcJson = await ohlcRes.json(); // [[ts, open, high, low, close], ...]

    const ethUsdSpot = Number(spotJson?.ethereum?.usd);
    if (!Number.isFinite(ethUsdSpot) || ethUsdSpot <= 0)
      throw new Error("Invalid ethUsdSpot");

    // weekly ATH = max(high) en velas 7d
    const ethUsdWeeklyHigh = Math.max(
      ...ohlcJson.map((c) => Number(c?.[2]) || 0)
    );
    if (!Number.isFinite(ethUsdWeeklyHigh) || ethUsdWeeklyHigh <= 0)
      throw new Error("Invalid ethUsdWeeklyHigh");

    const now = Date.now();
    const expiresAt = new Date(now + CACHE_TTL_SECONDS * 1000).toISOString();

    const body = JSON.stringify(
      {
        ok: true,
        ethUsdSpot,
        ethUsdWeeklyHigh,
        quoteTtlSeconds: CACHE_TTL_SECONDS,
        expiresAt,
        updatedAt: new Date(now).toISOString(),
      },
      null,
      2
    );

    const response = new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        // cache en edge 10 min
        "cache-control": `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}`,
      },
    });

    // Cache API: guarda la respuesta en edge
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return new Response(
      JSON.stringify(
        { ok: false, error: String(err?.message || err) },
        null,
        2
      ),
      {
        status: 502,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    );
  }
}
