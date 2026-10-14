import { env } from "cloudflare:workers";
import { cookies } from "next/headers";

export const OWNER_EMAIL = "joao.kotnik@gmail.com";
export const SESSION_COOKIE = "jbb_session";
const encoder = new TextEncoder();

export const database = () => { if (!env.DB) throw new Error("Banco de dados indisponível."); return env.DB; };
export async function ensureProfessorAccount() {
  const owner = await database().prepare("SELECT id,role FROM accounts WHERE email = ?")
    .bind(OWNER_EMAIL).first<{ id: string; role: string }>();
  if (owner && owner.role !== "professor") {
    await database().prepare("UPDATE accounts SET role = 'professor' WHERE id = ? AND email = ?")
      .bind(owner.id, OWNER_EMAIL).run();
  }
}
export const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, "0")).join("");
export const randomHex = (length = 32) => hex(crypto.getRandomValues(new Uint8Array(length)));
export async function sha256(value: string) { return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value))); }

export async function passwordHash(password: string, salt: string) {
  const secret = env.AUTH_HASH_KEY;
  if (!secret) throw new Error("Chave de cadastro indisponível.");
  const pepper = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prepared = await crypto.subtle.sign("HMAC", pepper, encoder.encode("password:v1:" + password));
  const key = await crypto.subtle.importKey("raw", prepared, "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: Uint8Array.from(salt.match(/../g)!.map(x => parseInt(x, 16))), iterations: 100_000, hash: "SHA-256" }, key, 256));
}

export async function cpfDigest(cpf: string) {
  const secret = env.AUTH_HASH_KEY;
  if (!secret) throw new Error("Chave de cadastro indisponível.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(cpf)));
}

export async function getPortalUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return database().prepare("SELECT accounts.id AS userId, accounts.email, accounts.role FROM sessions JOIN accounts ON accounts.id = sessions.account_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?")
    .bind(await sha256(token), Date.now()).first<{ userId: string; email: string; role: string }>();
}

export async function createSession(accountId: string) {
  const token = randomHex();
  await database().prepare("INSERT INTO sessions (token_hash,account_id,expires_at) VALUES (?,?,?)")
    .bind(await sha256(token), accountId, Date.now() + 14 * 86400_000).run();
  return token;
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${14 * 86400}`;
}
export function clearSessionCookie() { return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }
