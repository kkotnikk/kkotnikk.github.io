declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AUTH_HASH_KEY?: string;
    MP_ACCESS_TOKEN?: string;
    MP_WEBHOOK_SECRET?: string;
  }
}
