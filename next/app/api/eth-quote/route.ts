export const runtime = "edge";

const PAYMENT_ADDRESS = "0xeCa7db8547Fbe9d6E4B7fbcE12439e03eb00AFEf";
const COINBASE_URL = "https://api.coinbase.com/v2/prices/ETH-USD/spot";

function asNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

async function fetchEthUsdFromCoinbase(): Promise<number | null> {
  const cacheKey = new Request("https://cache.easygoldglitch.com/eth-usd");

  try {
    // @ts-ignore
    const cache = (globalThis as any).caches?.default;
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const j = await hit.json().catch(() => null);
        const ref = asNum(j?.ref);
        if (Number.isFinite(ref) && ref > 0) return ref;
      }
    }
  } catch {
    // ignore cache errors
  }

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);

  try {
    const r = await fetch(COINBASE_URL, {
      signal: ac.signal,
      headers: {
        accept: "application/json",
        "user-agent": "easygoldglitch/1.0",
      },
      cache: "no-store",
    });

    if (!r.ok) return null;

    const j = await r.json().catch(() => null);
    const ref = asNum(j?.data?.amount);
    if (!Number.isFinite(ref) || ref <= 0) return null;

    try {
      // @ts-ignore
      const cache = (globalThis as any).caches?.default;
      if (cache) {
        await cache.put(
          cacheKey,
          new Response(JSON.stringify({ ref }), {
            headers: {
              "content-type": "application/json",
              "cache-control": "public, max-age=15",
            },
          })
        );
      }
    } catch {
      // ignore
    }

    return ref;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const ref = await fetchEthUsdFromCoinbase();
  if (!ref) {
    return Response.json({ ok: false, error: "quote_unavailable" }, { status: 503 });
  }

  return Response.json(
    { ok: true, ref, address: PAYMENT_ADDRESS, source: "coinbase", ts: Date.now() },
    { headers: { "cache-control": "public, max-age=15" } }
  );
}
