"use client";

import React, { useMemo, useState } from "react";
import PayWithMetaMask from "./PayWithMetaMask";

const CATALOG = [
  { id: "g1", name: "Glitch 1.0 — Simple Sample", usd: 50 },
  { id: "g2", name: "Glitch 2.0 — Wealth Builder", usd: 70 },
  { id: "g3", name: "Glitch Pro — F*ck Gold", usd: 100 },
  { id: "lg", name: "Little Glitcher", usd: 150 },
];

export default function CheckoutPanel() {
  const [productId, setProductId] = useState("g1");
  const [email, setEmail] = useState("");

  const selected = useMemo(() => CATALOG.find((x) => x.id === productId), [productId]);

  return (
    <section style={{ display: "grid", gap: 12, padding: 16, borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)" }}>
      <div style={{ fontWeight: 700, fontSize: 16 }}>Checkout (ETH mainnet)</div>

      <label style={{ display: "grid", gap: 6, fontSize: 13, opacity: 0.9 }}>
        Product
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)" }}
        >
          {CATALOG.map((p) => (
            <option key={p.id} value={p.id} style={{ color: "black" }}>
              {p.name} — ${p.usd}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "grid", gap: 6, fontSize: 13, opacity: 0.9 }}>
        Email (delivery)
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@domain.com"
          style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)" }}
        />
      </label>

      <div style={{ fontSize: 12, opacity: 0.8 }}>
        You’ll pay on Ethereum mainnet. After payment we’ll verify and deliver to your email.
      </div>

      <PayWithMetaMask productId={productId} email={email} />

      {selected && (
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Selected: <b>{selected.name}</b>
        </div>
      )}
    </section>
  );
}
