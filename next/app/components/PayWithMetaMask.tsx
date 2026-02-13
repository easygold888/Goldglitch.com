"use client";

import React, { useMemo, useState } from "react";

type OrderIntentResponse =
  | {
      ok: true;
      orderId: string;
      productId: string;
      usdAmount: number;
      refPriceUsd: number;
      ethExpected?: number;
      ethExpectedStr?: string;
      walletAddress: string;
      createdAt: number;
      expiresAt: number;
    }
  | { ok: false; error: string };

type Props = {
  productId: string;
  email: string;
  className?: string;
};

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: any[] | object }) => Promise<any>;
    };
  }
}

const ETH_MAINNET_CHAIN_ID = "0x1";

function ethDecimalToWeiHex(ethStr: string): string {
  const s = ethStr.trim();
  if (!s || !/^\d+(\.\d+)?$/.test(s)) throw new Error("invalid_eth_amount");

  const [iRaw, fRaw = ""] = s.split(".");
  const i = iRaw.replace(/^0+(?=\d)/, "");
  const f = (fRaw + "0".repeat(18)).slice(0, 18);

  const wei = BigInt(i || "0") * 10n ** 18n + BigInt(f || "0");
  if (wei <= 0n) throw new Error("invalid_eth_amount");

  return "0x" + wei.toString(16);
}

async function ensureEthereumMainnet() {
  const chainId = await window.ethereum!.request({ method: "eth_chainId" });
  if (chainId === ETH_MAINNET_CHAIN_ID) return;

  await window.ethereum!.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: ETH_MAINNET_CHAIN_ID }],
  });
}

export default function PayWithMetaMask({ productId, email, className }: Props) {
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<OrderIntentResponse | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canPay = useMemo(() => productId?.trim() && email?.trim(), [productId, email]);

  async function onPay() {
    setErr(null);
    setTxHash(null);
    setBusy(true);

    try {
      if (!window.ethereum) throw new Error("metamask_not_found");

      const r = await fetch("/api/order-intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, email }),
      });

      const j = (await r.json().catch(() => null)) as OrderIntentResponse | null;
      if (!j) throw new Error("bad_response");
      setOrder(j);

      if (j.ok !== true) throw new Error((j as any).error || "order_intent_failed");

      const walletAddress = j.walletAddress;
      if (!walletAddress?.startsWith("0x")) throw new Error("invalid_wallet_address");

      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts?.[0];
      if (!from) throw new Error("no_account");

      await ensureEthereumMainnet();

      const ethAmountStr =
        j.ethExpectedStr?.toString() ??
        (typeof j.ethExpected === "number" ? j.ethExpected.toFixed(18) : "");

      if (!ethAmountStr) throw new Error("missing_amount");

      const value = ethDecimalToWeiHex(ethAmountStr);

      const hash = (await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, to: walletAddress, value }],
      })) as string;

      setTxHash(hash);
    } catch (e: any) {
      const msg =
        e?.code === 4001 ? "user_rejected" : typeof e?.message === "string" ? e.message : "unknown_error";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className} style={{ display: "grid", gap: 10 }}>
      <button
        onClick={onPay}
        disabled={!canPay || busy}
        style={{
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(255,255,255,0.06)",
          color: "white",
          cursor: busy ? "not-allowed" : "pointer",
          fontWeight: 600,
        }}
      >
        {busy ? "Opening MetaMask…" : "Pay with MetaMask (Ethereum)"}
      </button>

      {order && order.ok === true && (
        <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.4 }}>
          <div><b>Order:</b> {order.orderId}</div>
          <div><b>Amount:</b> {order.ethExpectedStr ?? order.ethExpected} ETH</div>
          <div style={{ wordBreak: "break-all" }}><b>To:</b> {order.walletAddress}</div>
          <div><b>Expires:</b> {new Date(order.expiresAt).toLocaleString()}</div>
        </div>
      )}

      {txHash && (
        <div style={{ fontSize: 13, opacity: 0.95, lineHeight: 1.4 }}>
          <div><b>Tx sent ✅</b></div>
          <div style={{ wordBreak: "break-all" }}>{txHash}</div>
        </div>
      )}

      {err && (
        <div style={{ fontSize: 13, color: "#ffb4b4", wordBreak: "break-word" }}>
          <b>Error:</b> {err}
        </div>
      )}
    </div>
  );
}
