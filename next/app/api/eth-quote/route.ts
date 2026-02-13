export const runtime = "edge";

const WALLET_ADDRESS = "0xeCa7db8547Fbe9d6E4B7fbcE12439e03eb00AFEf";
const CACHE_SECONDS = 15;

function asNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

async function fetchEthUsdFromCoinbase(): Promise<number | null> {
  const r = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
    headers: {
      "accept": "application/json",
      "user-agent": "easygoldglitch/1.0",
    },
    cache: "no-store",
  });

  if (!r.ok) return null;
  const j = await r.json().catch(() => null);

  const amt =
    j?.data?.amount ??
    j?.data?.rates?.USD ??
    j?.amount ??
    j?.price;

  const n = asNum(amt);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET() {
  try {
    const ref = await fetchEthUsdFromCoinbase();

    if (!ref) {
      return Response.json(
        { ok: false, error: "quote_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } }
      );
    }

    return Response.json(
      {
        ok: true,
        ref,
        address: WALLET_ADDRESS,
        source: "coinbase",
        ts: Date.now(),
      },
      {
        headers: {
          "cache-control": `public, max-age=${CACHE_SECONDS}`,
          "content-type": "application/json",
        },
      }
    );
  } catch {
    return new Response("Internal Server Error", { status: 500 });
  }
}
