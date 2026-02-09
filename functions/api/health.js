export async function onRequestGet({ env }) {
  try {
    const r = await env.DB.prepare("SELECT 1 as ok").first();
    return new Response(JSON.stringify({ ok: true, db: r?.ok === 1 }), {
      headers: { "content-type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}
