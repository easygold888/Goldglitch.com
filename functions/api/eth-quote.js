// functions/api/eth-quote.js
// Returns: { ok:true, spot:<usd>, ref:<usd>, ts:<ms>, source:<string>, stale?:true }

const TTL_SECONDS = 600; // 10 minutes
const TTL_MS = TTL_SECONDS * 1000;

function json(data, { maxAge = 60 } = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
      "access-control-allow-origin": "*",
    },
  });
}

async function fetchCoingecko7d() {
  // 7-day hourly series. We'll compute:
  // spot = last price, ref = max price in the window ("Reference price")
  const url =
    "https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=7&interval=hourly";

  const r = await fetch(url, {
    headers: {
      accept: "application/json",
      // Some providers behave better with a UA set
      "user-agent": "EasyGoldGlitch/1.0 (Cloudflare Pages Function)",
    },
  });

  if (!r.ok) throw new Error(`coingecko_http_${r.status}`);

  const j = await r.json();
  const prices = j?.prices;

  if (!Array.isArray(prices) || prices.length < 5) throw new Error("bad_prices_array");

  let max = 0;
  for (const p of prices) {
    const v = Number(p?.[1]);
    if (Number.isFinite(v) && v > max) max = v;
  }

  const last = Number(prices[prices.length - 1]?.[1]);

  if (!Number.isFinite(last) || last <= 0) throw new Error("bad_spot");
  if (!Number.isFinite(max) || max <= 0) max = last;

  return { spot: last, ref: max, source: "coingecko_market_chart_7d" };
}

export async function onRequestGet({ request, ctx }) {
  const now = Date.now();
  const origin = new URL(request.url).origin;

  // Cache key independent of query params (stable key)
  const cacheKey = new Request(`${origin}/api/__eth_quote_cache_key`);

  // 1) Try cache first
  let cached = await caches.default.match(cacheKey);
  if (cached) {
    try {
      const c = await cached.clone().json();
      const fresh = c?.ok === true && Number.isFinite(c.ts) && now - c.ts < TTL_MS;
      if (fresh) return cached;
    } catch {
      // ignore cache parse issues and refresh below
    }
  }

  // 2) Fetch fresh
  try {
    const q = await fetchCoingecko7d();

    const body = {
      ok: true,
      spot: q.spot,
      ref: q.ref,
      ts: now,
      source: q.source,
    };

    const resp = json(body, { maxAge: TTL_SECONDS });

    // Write cache async (so the request returns fast)
    ctx.waitUntil(caches.default.put(cacheKey, resp.clone())); // Cache API + waitUntil :contentReference[oaicite:2]{index=2}
    return resp;
  } catch (e) {
    // 3) If upstream fails, return cached if we have it (even if stale)
    if (cached) {
      try {
        const c = await cached.clone().json();
        // If cache was ok, serve it as stale ok:true instead of ok:false
        if (c?.ok === true) {
          const staleResp = json({ ...c, stale: true }, { maxAge: 60 });
          return staleResp;
        }
      } catch {
        // fall through
      }
    }

    // 4) Nothing cached => explicit unavailable
    return json({ ok: false, error: "quote_unavailable", ts: now }, { maxAge: 30 });
  }
}
