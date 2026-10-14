import { env } from "cloudflare:workers";
import { PAGES_BASE, PAGES_ORIGIN, ensureProfessorAccount, getPortalUser, randomHex, sha256, trustedOrigin } from "../../../lib/course-auth";
import { hasPaidAccess, paymentReady } from "../../../lib/payments";

export const dynamic = "force-dynamic";

const MODULES = ["Básico", "Intermediário", "Avançado", "Aulas extras"];
const FULL_COURSE = "Curso completo";
const INITIAL = ["Base e postura", "Movimentação no solo", "Posições e controles", "Conectando os fundamentos"];
const database = () => { if (!env.DB) throw new Error("Banco de dados indisponível."); return env.DB; };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
type Lesson = { id: string; title: string; module: string; status: string; published_at: string | null; has_video: number };
type Price = { course: string; amount_cents: number };

async function initialData() {
  const marker = await database().prepare("INSERT OR IGNORE INTO setup (key) VALUES ('lessons-v1')").run();
  if (marker.meta.changes) {
    await database().batch(INITIAL.map((title, i) =>
      database().prepare("INSERT OR IGNORE INTO lessons (id,title,module,status) VALUES (?,?,?,?)")
        .bind(`seed-${i}`, title, "Básico", "published")
    ));
  }
  const structure = await database().prepare("SELECT key FROM setup WHERE key = 'course-structure-v2'").first();
  if (!structure) {
    await database().batch([
      database().prepare("UPDATE lessons SET module = 'Básico' WHERE module = 'Fundamentos'"),
      database().prepare("UPDATE lessons SET module = 'Intermediário' WHERE module = 'Guarda e passagem'"),
      database().prepare("UPDATE lessons SET module = 'Avançado' WHERE module = 'Conexões e finalizações'"),
      database().prepare("INSERT OR IGNORE INTO setup (key) VALUES ('course-structure-v2')"),
    ]);
  }
}
async function context() {
  const user = await getPortalUser();
  if (!user) return { user: null, admin: false, enrolled: false };
  const admin = user.role === "professor";
  if (admin) return { user, admin, enrolled: true };
  return { user, admin, enrolled: await hasPaidAccess(user.userId) };
}
function sameOrigin(request: Request) {
  return trustedOrigin(request);
}
export async function GET() {
  await ensureProfessorAccount();
  const prices = (await database().prepare("SELECT course,amount_cents FROM course_prices WHERE course = ?").bind(FULL_COURSE).all<Price>()).results;
  const content = (await database().prepare("SELECT key,value FROM site_content WHERE key IN ('professor_bio','professor_photo_version')").all<{key:string;value:string}>()).results;
  const profile = { bio: content.find(item => item.key === "professor_bio")?.value || "",
    photoVersion: content.find(item => item.key === "professor_photo_version")?.value || "" };
  const { user, admin, enrolled } = await context();
  if (!user) return json({ signedIn: false, authMode: "email", role: "guest", lessons: [], done: [], prices, profile, paymentReady: paymentReady() });
  await initialData();
  const all = await database().prepare("SELECT id,title,module,status,published_at,CASE WHEN video_key IS NULL THEN 0 ELSE 1 END AS has_video FROM lessons ORDER BY rowid").all<Lesson>();
  const lessons = admin ? all.results : enrolled ? all.results.filter(l => l.status === "published") : [];
  const progress = await database().prepare("SELECT lesson_id FROM progress WHERE user_id = ?")
    .bind(user.userId).all<{lesson_id:string}>();
  const sales = admin ? (await database().prepare("SELECT accounts.email,orders.amount_cents,orders.status,orders.created_at,orders.paid_at FROM orders JOIN accounts ON accounts.id = orders.account_id ORDER BY orders.created_at DESC LIMIT 30").all()).results : [];
  return json({ signedIn: true, authMode: "email", role: admin ? "professor" : enrolled ? "student" : "pending",
    email: user.email, lessons, done: progress.results.map(p => p.lesson_id), prices, profile, sales, paymentReady: paymentReady() });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origem inválida." }, 403);
  const { user, admin, enrolled } = await context();
  if (!user) return json({ error: "Entre na sua conta." }, 401);
  await initialData();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Dados inválidos." }, 400); }
  const action = body.action;
  if (action === "progress") {
    const id = String(body.id || "");
    const lesson = await database().prepare("SELECT id,module,status FROM lessons WHERE id = ?").bind(id).first<Lesson>();
    if (!lesson || lesson.status !== "published" || (!admin && !enrolled))
      return json({ error: "Aula indisponível." }, 403);
    if (body.complete === true) {
      await database().prepare("INSERT OR IGNORE INTO progress (user_id,lesson_id) VALUES (?,?)").bind(user.userId, id).run();
    } else if (body.complete === false) {
      await database().prepare("DELETE FROM progress WHERE user_id = ? AND lesson_id = ?").bind(user.userId, id).run();
    } else return json({ error: "Dados inválidos." }, 400);
    return json({ ok: true });
  }
  if (!admin) return json({ error: "Acesso reservado ao professor." }, 403);
  if (action === "bio") {
    const bio = String(body.bio ?? "").trim();
    if (bio.length > 800) return json({ error: "O resumo deve ter até 800 caracteres." }, 400);
    await database().prepare("INSERT INTO site_content (key,value) VALUES ('professor_bio',?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(bio).run();
    return json({ ok: true });
  }
  if (action === "price") {
    const course = FULL_COURSE;
    const amount = String(body.amount ?? "").trim().replace(",", ".");
    if (!amount) {
      await database().prepare("DELETE FROM course_prices WHERE course = ?").bind(course).run();
      return json({ ok: true });
    }
    if (!/^(0|[1-9]\d{0,5})(\.\d{1,2})?$/.test(amount))
      return json({ error: "Informe um valor válido." }, 400);
    const [whole, fraction = ""] = amount.split(".");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (cents <= 0) return json({ error: "O valor precisa ser maior que zero." }, 400);
    await database().prepare("INSERT INTO course_prices (course,amount_cents) VALUES (?,?) ON CONFLICT(course) DO UPDATE SET amount_cents = excluded.amount_cents")
      .bind(course, cents).run();
    return json({ ok: true });
  }
  if (action === "reset-link") {
    const email = String(body.email || "").trim().toLowerCase();
    const account = await database().prepare("SELECT id FROM accounts WHERE email = ?").bind(email).first<{ id: string }>();
    if (!account) return json({ error: "A conta ainda não foi criada." }, 404);
    const token = randomHex();
    await database().prepare("DELETE FROM reset_tokens WHERE account_id = ?").bind(account.id).run();
    await database().prepare("INSERT INTO reset_tokens (token_hash,account_id,expires_at) VALUES (?,?,?)")
      .bind(await sha256(token), account.id, Date.now() + 3600_000).run();
    const base = request.headers.get("origin") === PAGES_ORIGIN ? PAGES_BASE : new URL(request.url).origin;
    return json({ ok: true, link: `${base}/conta/?redefinir=${token}` });
  }
  if (action === "lesson") {
    const title = String(body.title || "").trim(), module = String(body.module || ""), status = String(body.status || "");
    const id = String(body.id || "") || crypto.randomUUID();
    if (!title || title.length > 85 || !MODULES.includes(module) || !["draft","published"].includes(status))
      return json({ error: "Revise os dados da aula." }, 400);
    if (body.id) {
      const result = await database().prepare("UPDATE lessons SET title = ?, module = ?, status = ?, published_at = CASE WHEN ? = 'draft' THEN NULL WHEN status = 'draft' THEN ? ELSE published_at END WHERE id = ?")
        .bind(title, module, status, status, new Date().toISOString(), id).run();
      if (!result.meta.changes) return json({ error: "Aula não encontrada." }, 404);
    } else {
      await database().prepare("INSERT INTO lessons (id,title,module,status,published_at) VALUES (?,?,?,?,?)")
        .bind(id, title, module, status, status === "published" ? new Date().toISOString() : null).run();
    }
    return json({ ok: true, id });
  }
  if (action === "publish") {
    const result = await database().prepare("UPDATE lessons SET status = 'published', published_at = CASE WHEN status = 'published' THEN published_at ELSE ? END WHERE id = ?")
      .bind(new Date().toISOString(), String(body.id || "")).run();
    return json({ ok: !!result.meta.changes });
  }
  if (action === "delete") {
    const id = String(body.id || "");
    const lesson = await database().prepare("SELECT video_key FROM lessons WHERE id = ?").bind(id).first<{ video_key: string | null }>();
    await database().prepare("DELETE FROM lessons WHERE id = ?").bind(id).run();
    if (lesson?.video_key) {
      if (!env.BUCKET) throw new Error("Armazenamento indisponível.");
      await env.BUCKET.delete(lesson.video_key);
    }
    return json({ ok: true });
  }
  return json({ error: "Ação inválida." }, 400);
}
