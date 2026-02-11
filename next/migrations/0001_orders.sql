-- 0001_orders.sql
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  email TEXT NOT NULL,
  product_id TEXT NOT NULL,
  usd_amount INTEGER NOT NULL,
  ref_price_usd REAL NOT NULL,
  eth_expected REAL NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED',
  tx_hash TEXT,
  paid_at INTEGER,
  delivered_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tx_hash_unique ON orders(tx_hash);
