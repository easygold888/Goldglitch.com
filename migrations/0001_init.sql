CREATE TABLE IF NOT EXISTS orders (
  orderId TEXT PRIMARY KEY,
  productId TEXT NOT NULL,
  usdPrice INTEGER NOT NULL,
  ethRefUsd REAL NOT NULL,
  expectedWei TEXT NOT NULL,
  walletTo TEXT NOT NULL,
  status TEXT NOT NULL, -- CREATED | EXPIRED | PAID_PENDING | PAID_VERIFIED | DELIVERED | LICENSED | REVOKED
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL,

  email TEXT,
  txHash TEXT UNIQUE,

  deliveredAt TEXT,
  downloadedAt TEXT,

  accountLogin TEXT,
  machineFpHash TEXT
);

CREATE TABLE IF NOT EXISTS delivery_tokens (
  tokenHash TEXT PRIMARY KEY,
  orderId TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  maxDownloads INTEGER NOT NULL DEFAULT 3,
  downloads INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(orderId) REFERENCES orders(orderId)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId TEXT,
  type TEXT NOT NULL,
  detail TEXT,
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_orderId ON events(orderId);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
