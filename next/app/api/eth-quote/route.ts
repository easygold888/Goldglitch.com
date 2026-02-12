export const runtime = "edge";

const ADDRESS = "0xeCa7db8547Fbe9d6E4B7fbcE12439e03eb00AFEf";
const COINBASE_URL = "https://api.coinbase.com/v2/prices/ETH-USD/spot";

function asNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

async function fetchEthUsdFromCoinbase(): Promise<number | null> {
  const r = await fetch(
    COINBASE_URL,
    ({
      // Cloudflare Workers-specific fetch options:
      // TS no lo reconoce en RequestInit, por eso casteamos el objeto completo.
      cf: { cacheTtl: 15, cacheEverything: true },
      headers: {
        accept: "application/json",
        "user-agent": "easygoldglitch/1.0",
      },
    } as unknown as RequestInit)
  ).catch(() => null);

  if (!r || !r.ok) return null;

  const j = await r.json().catch(() => null);
  const amount = asNum(j?.data?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return amount;
}

export async function GET() {
  const ref = await fetchEthUsdFromCoinbase();

  if (!ref) {
    return Response.json(
      { ok: false, error: "quote_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }

  return Response.json(
    { ok: true, ref, address: ADDRESS, source: "coinbase", ts: Date.now() },
    { headers: { "cache-control": "public, max-age=15" } }
  );
}
