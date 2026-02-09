// functions/api/eth-quote.js
// ETH quote with multi-provider fallback.
// Returns: { ok:true, spot:<number>, ref:<number>, ts:<ms>, source:<string>, stale?:true }
//
// "spot" = current ETHUSD
// "ref"  = reference price used for checkout (7D high of daily candles)
//
// Why: Binance may return HTTP 451 in some regions/edges, so we fallback.

const TIMEOUT_MS = 6500;

// In-memory last good quote (survives within same isolate)
let lastGood = null;

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // small edge caching to reduce upstream hits; browser won't cache
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
      "access-control-allow-origin": "*",
    },
  });
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const r = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "EasyGoldGlitch/1.0 (+https://easygoldglitch.com)",
        ...headers,
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

function max7DayHighFromHighs(highs) {
  const clean = highs.filter(n => Number.isFinite(n) && n > 0);
  if (clean.length < 2) throw new Error("not_enough_candles");
  const last7 = clean.slice(-7);
  const ref = Math.max(...last7);
  if (!Number.isFinite(ref) || ref <= 0) throw new Error("bad_ref");
  return ref;
}

/* -----------------------
 * Provider 1: Binance (try but can be blocked)
 * ----------------------- */
async function quoteFromBinance() {
  const SYMBOL = "ETHUSDT";
  const KLINE_LIMIT = 8;

  // prefer vision market-data endpoint first
  const BASES = [
    "https://data-api.binance.vision",
    "https://api.binance.com",
    "https://api-gcp.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
    "https://api4.binance.com",
  ];

  let lastErr = null;

  for (const base of BASES) {
    try {
      const spotUrl = `${base}/api/v3/ticker/price?symbol=${SYMBOL}`;
      const klineUrl = `${base}/api/v3/klines?symbol=${SYMBOL}&interval=1d&limit=${KLINE_LIMIT}`;

      const [spotJ, klines] = await Promise.all([fetchJson(spotUrl), fetchJson(klineUrl)]);

      const spot = toNum(spotJ?.price);
      const highs = Array.isArray(klines)
        ? klines.map(k => toNum(k?.[2])).filter(n => Number.isFinite(n) && n > 0)
        : [];

      if (!Number.isFinite(spot) || spot <= 0) throw new Error("bad_spot");
      const ref = max7DayHighFromHighs(highs);

      return { ok: true, spot, ref, ts: Date.now(), source: "binance", base };
    } catch (e) {
      lastErr = e;
    }
  }

  throw new Error(`binance_failed: ${String(lastErr || "")}`);
}

/* -----------------------
 * Provider 2: Kraken
 * ----------------------- */
async function quoteFromKraken() {
  // Kraken uses older-style public endpoints; pair key in result can vary.
  const pair = "ETHUSD";
  const tickerUrl = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;
  const ohlcUrl = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=1440`;

  const [t, o] = await Promise.all([fetchJson(tickerUrl), fetchJson(ohlcUrl)]);

  if (Array.isArray(t?.error) && t.error.length) throw new Error(`kraken_ticker_error: ${t.error.join(",")}`);
  if (Array.isArray(o?.error) && o.error.length) throw new Error(`kraken_ohlc_error: ${o.error.join(",")}`);

  const tRes = t?.result || {};
  const oRes = o?.result || {};

  const tPairKey = Object.keys(tRes)[0];
  const oPairKey = Object.keys(oRes).find(k => k !== "last");

  if (!tPairKey || !oPairKey) throw new Error("kraken_bad_payload");

  const spot = toNum(tRes[tPairKey]?.c?.[0]); // last trade closed price
  const highs = Array.isArray(oRes[oPairKey])
    ? oRes[oPairKey].map(row => toNum(row?.[2])) // high at index 2
    : [];

  if (!Number.isFinite(spot) || spot <= 0) throw new Error("kraken_bad_spot");
  const ref = max7DayHighFromHighs(highs);

  return { ok: true, spot, ref, ts: Date.now(), source: "kraken" };
}

/* -----------------------
 * Provider 3: Coinbase (spot + daily candles)
 * ----------------------- */
async function quoteFromCoinbase() {
  // spot
  const spotJ = await fetchJson("https://api.coinbase.com/v2/prices/ETH-USD/spot");
  const spot = toNum(spotJ?.data?.amount);

  // candles (public)
  const candles = await fetchJson("https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=86400");
  // each: [time, low, high, open, close, volume]
  const highs = Array.isArray(candles) ? candles.map(c => toNum(c?.[2])) : [];

  if (!Number.isFinite(spot) || spot <= 0) throw new Error("coinbase_bad_spot");
  const ref = max7DayHighFromHighs(highs);

  return { ok: true, spot, ref, ts: Date.now(), source: "coinbase" };
}

/* -----------------------
 * Provider 4: CoinGecko (spot + OHLC)
 * ----------------------- */
async function quoteFromCoinGecko() {
  const spotJ = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_last_updated_at=true");
  const spot = toNum(spotJ?.ethereum?.usd);

  // OHLC provides highs directly
  const ohlc = await fetchJson("https://api.coingecko.com/api/v3/coins/ethereum/ohlc?vs_currency=usd&days=7");
  // each: [timestamp, open, high, low, close]
  const highs = Array.isArray(ohlc) ? ohlc.map(r => toNum(r?.[2])) : [];

  if (!Number.isFinite(spot) || spot <= 0) throw new Error("coingecko_bad_spot");
  const ref = max7DayHighFromHighs(highs);

  return { ok: true, spot, ref, ts: Date.now(), source: "coingecko" };
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

  const providers = [quoteFromBinance, quoteFromKraken, quoteFromCoinbase, quoteFromCoinGecko];

  let lastErr = null;

  for (const fn of providers) {
    try {
      const payload = await fn();
      lastGood = payload;
      return jsonResponse(payload, 200);
    } catch (e) {
      lastErr = e;
    }
  }

  // stale fallback
  if (lastGood?.ok && Number.isFinite(lastGood.spot) && Number.isFinite(lastGood.ref)) {
    return jsonResponse({ ...lastGood, stale: true, ts: Date.now() }, 200);
  }

  return jsonResponse(
    { ok: false, error: "quote_unavailable", detail: String(lastErr || ""), ts: Date.now() },
    200
  );
}
