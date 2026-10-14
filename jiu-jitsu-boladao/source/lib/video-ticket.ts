import { env } from "cloudflare:workers";
import { database, hex } from "./course-auth";

const encoder = new TextEncoder();
const key = async () => {
  if (!env.AUTH_HASH_KEY) throw new Error("Chave de acesso indisponível.");
  return crypto.subtle.importKey("raw", encoder.encode(env.AUTH_HASH_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
};

export async function createVideoTicket(userId: string, lessonId: string) {
  const payload = btoa(JSON.stringify({ userId, lessonId, expires: Date.now() + 10 * 60_000 }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const signature = hex(await crypto.subtle.sign("HMAC", await key(), encoder.encode("video:v1:" + payload)));
  return `${payload}.${signature}`;
}

export async function ticketUser(lessonId: string, ticket: string) {
  if (!/^[A-Za-z0-9_-]{20,500}\.[a-f0-9]{64}$/.test(ticket)) return null;
  const [payload, signature] = ticket.split(".");
  const valid = await crypto.subtle.verify("HMAC", await key(),
    Uint8Array.from(signature.match(/../g)!.map(part => parseInt(part, 16))), encoder.encode("video:v1:" + payload));
  if (!valid) return null;
  try {
    const data = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { userId?: string; lessonId?: string; expires?: number };
    if (!data.userId || data.lessonId !== lessonId || typeof data.expires !== "number" ||
        data.expires < Date.now() || data.expires > Date.now() + 10 * 60_000) return null;
    return database().prepare("SELECT id AS userId,email,role FROM accounts WHERE id = ?")
      .bind(data.userId).first<{ userId: string; email: string; role: string }>();
  } catch { return null; }
}
