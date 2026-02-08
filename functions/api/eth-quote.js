export async function onRequestGet() {
  // Spot ETH price in USD (CoinGecko)
  const url = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";

  try {
    const r = await fetch(url, { headers: { "accept": "application/json" } });
    if (!r.ok) throw new Error(`CoinGecko failed: ${r.status}`);

    const j = await r.json();
    const spot = Number(j?.ethereum?.usd);

    if (!Number.isFinite(spot) || spot <= 0) throw new Error("Invalid ETH spot price");

    return new Response(JSON.stringify({
      ok: true,
      ethUsdSpot: spot,
      updatedAt: new Date().toISOString()
    }, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=60"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: String(e?.message || e)
    }, null, 2), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
}
