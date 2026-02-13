import CheckoutPanel from "../components/CheckoutPanel";

export default function PayPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "96px 20px 40px",
        display: "grid",
        placeItems: "start center",
        color: "#fff",
        background:
          "radial-gradient(1200px 600px at 50% 0%, rgba(255, 215, 120, 0.12), rgba(0,0,0,0) 60%), linear-gradient(180deg, #06060a 0%, #0a0a12 60%, #07070b 100%)",
      }}
    >
      <div style={{ width: "min(560px, 100%)" }}>
        <CheckoutPanel />
      </div>
    </main>
  );
}
