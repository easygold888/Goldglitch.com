const WALLET_ADDRESS = "0xeCa7db8547Fbe9d6E4B7fbcE12439e03eb00AFEf";

function asNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

async function fetchEthUsdFromCoinbase(): Promise<number | null> {
  try {
    const r = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
      headers: {
        "accept": "application/json",
        "user-agent": "easygoldglitch/1.0",
      },
    });

    if (!r.ok) return null;

    const j: any = await r.json().catch(() => null);
    const amount = asNum(j?.data?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    return amount;
  } catch {
    return null;
  }
}

export async function GET() {
  const ref = await fetchEthUsdFromCoinbase();
  if (!Number.isFinite(ref as any) || (ref as number) <= 0) {
    // Respuesta JSON, no texto plano (más fácil de debuggear)
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
      status: 200,
      headers: {
        // Cache corto para que no te tumbe Coinbase y siga “snappy”
        "cache-control": "public, max-age=15",
      },
    }
  );
}
