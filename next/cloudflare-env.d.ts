import type { D1Database } from "@cloudflare/workers-types";

declare module "@opennextjs/cloudflare" {
  interface CloudflareEnv {
    EGG_DB: D1Database;
  }
}

export {};
