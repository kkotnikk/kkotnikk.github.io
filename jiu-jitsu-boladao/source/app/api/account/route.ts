import { cookies } from "next/headers";
import { brazilPhone, validCpf } from "../../../lib/account-validation";
import { OWNER_EMAIL, SESSION_COOKIE, clearSessionCookie, cpfDigest, createSession, database, ensureProfessorAccount, getPortalUser, passwordHash, randomHex, sessionCookie, sha256 } from "../../../lib/course-auth";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200, cookie?: string) => Response.json(data, { status, headers: { "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } });
const emailValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
type Account = { id: string; email: string; password_salt: string; password_hash: string };

async function limited(key: string, max: number) {
  const now = Date.now();
  const row = await database().prepare("SELECT count,reset_at FROM login_attempts WHERE key = ?").bind(key).first<{ count: number; reset_at: number }>();
  if (!row || row.reset_at < now) return false;
  return row.count >= max;
}
async function failed(key: string, windowMs: number) {
  const now = Date.now();
  await database().prepare("INSERT INTO login_attempts (key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN reset_at < ? THEN 1 ELSE count + 1 END, reset_at = CASE WHEN reset_at < ? THEN ? ELSE reset_at END")
    .bind(key, now + windowMs, now, now, now + windowMs).run();
}

export async function GET() {
  await ensureProfessorAccount();
  const owner = await database().prepare("SELECT 1 AS ready FROM accounts WHERE role = 'professor' LIMIT 1").first();
  const user = await getPortalUser();
  return json({ ownerReady: !!owner, signedIn: !!user, role: user?.role, email: user?.email });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Origem inválida." }, 403);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "Dados inválidos." }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
  } catch { return json({ error: "Dados inválidos." }, 400); }
  const action = String(body.action || "");
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const ipKey = "ip:" + await sha256(ip);
  if (action === "logout") {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) await database().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, clearSessionCookie());
  }
  if (action === "register") {
    const phone = brazilPhone(String(body.phone || ""));
    const cpf = String(body.cpf || "").replace(/\D/g, "");
    if (!emailValid(email) || password.length < 12 || password.length > 128 || !phone || !validCpf(cpf))
      return json({ error: "Revise e-mail, senha (mínimo de 12 caracteres), celular e CPF." }, 400);
    if (await limited(ipKey, 12)) return json({ error: "Muitas tentativas. Tente mais tarde." }, 429);
    if (email === OWNER_EMAIL) return json({ error: "Esta conta já existe. Entre com sua senha." }, 409);
    await failed(ipKey, 3600_000);
    const salt = randomHex(16), digest = await cpfDigest(cpf), id = crypto.randomUUID();
    const hash = await passwordHash(password, salt);
    try {
      await database().prepare("INSERT INTO accounts (id,email,password_salt,password_hash,phone,cpf_digest,role,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(id, email, salt, hash, phone, digest, "student", new Date().toISOString()).run();
    } catch { return json({ error: "Não foi possível criar a conta. Confira os dados ou entre com sua conta." }, 409); }
    const token = await createSession(id);
    return json({ ok: true, message: "Conta criada. Escolha o curso e conclua o pagamento.", redirect: "/site.html?entrar=aluno" }, 200, sessionCookie(token));
  }
  if (action === "login") {
    if (!emailValid(email) || !password) return json({ error: "Informe e-mail e senha." }, 400);
    const key = "login:" + await sha256(email + ":" + ip);
    if (await limited(key, 5) || await limited(ipKey, 40))
      return json({ error: "Muitas tentativas. Tente novamente em 15 minutos." }, 429);
    const account = await database().prepare("SELECT id,email,password_salt,password_hash FROM accounts WHERE email = ?").bind(email).first<Account>();
    const candidate = await passwordHash(password, account?.password_salt || "0".repeat(32));
    if (!account || !constantTime(candidate, account.password_hash)) {
      await failed(key, 15 * 60_000); await failed(ipKey, 15 * 60_000);
      return json({ error: "E-mail ou senha inválidos." }, 401);
    }
    await database().prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
    const token = await createSession(account.id);
    return json({ ok: true, redirect: "/site.html?entrar=aluno" }, 200, sessionCookie(token));
  }
  if (action === "password") {
    const reset = String(body.reset || "");
    if (!/^[a-f0-9]{64}$/.test(reset) || password.length < 12 || password.length > 128) return json({ error: "Link ou senha inválidos." }, 400);
    const hash = await sha256(reset);
    const token = await database().prepare("SELECT account_id FROM reset_tokens WHERE token_hash = ? AND expires_at > ?").bind(hash, Date.now()).first<{ account_id: string }>();
    if (!token) return json({ error: "Link expirado ou utilizado." }, 400);
    const salt = randomHex(16);
    await database().batch([
      database().prepare("UPDATE accounts SET password_salt = ?, password_hash = ? WHERE id = ?").bind(salt, await passwordHash(password, salt), token.account_id),
      database().prepare("DELETE FROM sessions WHERE account_id = ?").bind(token.account_id),
      database().prepare("DELETE FROM reset_tokens WHERE account_id = ?").bind(token.account_id),
    ]);
    return json({ ok: true, message: "Senha atualizada. Entre com a nova senha." }, 200, clearSessionCookie());
  }
  return json({ error: "Ação inválida." }, 400);
}

function constantTime(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
