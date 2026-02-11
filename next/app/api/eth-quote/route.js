export const runtime = "edge";

const NO_STORE = { "content-type": "application/json", "cache-control": "no-store" };

// Helper: fetch JSON with timeout
async function fetchJson(url, ms = 6500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "accept": "application/json" } });
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch {}
    return { ok: r.ok, status: r.status, json: j, text };
  } finally {
    clearTimeout(t);
  }
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

// Providers (ordered): Coinbase, Kraken, CoinGecko
async function quoteFromCoinbase() {
  const { ok, status, json } = await fetchJson("https://api.coinbase.com/v2/prices/ETH-USD/spot");
  if (!ok) throw new Error(`coinbase_${status}`);
  const spot = num(json?.data?.amount);
  if (!Number.isFinite(spot)) throw new Error("coinbase_bad");
  return { spot, ref: spot, provider: "coinbase" };
}

async function quoteFromKraken() {
  const { ok, status, json } = await fetchJson("https://api.kraken.com/0/public/Ticker?pair=ETHUSD");
  if (!ok) throw new Error(`kraken_${status}`);
  const key = json?.result ? Object.keys(json.result)[0] : null;
  const spot = num(key ? json.result[key]?.c?.[0] : NaN); // last trade close
  if (!Number.isFinite(spot)) throw new Error("kraken_bad");
  return { spot, ref: spot, provider: "kraken" };
}

async function quoteFromCoinGecko() {
  const { ok, status, json } = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
  if (!ok) throw new Error(`coingecko_${status}`);
  const spot = num(json?.ethereum?.usd);
  if (!Number.isFinite(spot)) throw new Error("coingecko_bad");
  return { spot, ref: spot, provider: "coingecko" };
}

// "Reference price": keep it deterministic.
// For now ref = spot (you can later replace ref with a smoothing rule)
function buildResponse({ spot, ref, provider }) {
  return {
    ok: true,
    spot,
    ref,
    provider,
    sourceTime: new Date().toISOString()
  };
}

export async function GET() {
  const providers = [quoteFromCoinbase, quoteFromKraken, quoteFromCoinGecko];

  for (const fn of providers) {
    try {
      const q = await fn();
      return new Response(JSON.stringify(buildResponse(q)), { headers: NO_STORE });
    } catch (_) {
      // try next provider
    }
  }

  return new Response(JSON.stringify({ ok: false, error: "quote_unavailable" }), { status: 503, headers: NO_STORE });
}
