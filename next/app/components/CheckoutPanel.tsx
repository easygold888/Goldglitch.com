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

  const inputStyle: React.CSSProperties = {
    padding: 12,
    borderRadius: 14,
    background: "rgba(0,0,0,0.35)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.14)",
    outline: "none",
  };

  return (
    <section
      style={{
        display: "grid",
        gap: 14,
        padding: 18,
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.06)",
        backdropFilter: "blur(14px)",
        boxShadow: "0 20px 80px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: 0.2 }}>Checkout (ETH mainnet)</div>
        <div style={{ fontSize: 12, opacity: 0.78 }}>
          Pay on Ethereum mainnet. We lock price for ~10 minutes and deliver to your email after verification.
        </div>
      </div>

      <label style={{ display: "grid", gap: 8, fontSize: 13, opacity: 0.9 }}>
        Product
        <select value={productId} onChange={(e) => setProductId(e.target.value)} style={inputStyle as any}>
          {CATALOG.map((p) => (
            <option key={p.id} value={p.id} style={{ color: "black" }}>
              {p.name} — ${p.usd}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "grid", gap: 8, fontSize: 13, opacity: 0.9 }}>
        Email (delivery)
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@domain.com"
          style={inputStyle}
        />
      </label>

      <PayWithMetaMask productId={productId} email={email} />

      {selected && (
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Selected: <b>{selected.name}</b>
        </div>
      )}
    </section>
  );
}
