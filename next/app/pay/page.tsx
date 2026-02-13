import CheckoutPanel from "../components/CheckoutPanel";

export default function PayPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "min(520px, 100%)" }}>
        <CheckoutPanel />
      </div>
    </main>
  );
}
