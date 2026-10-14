import { env } from "cloudflare:workers";
import { getPortalUser } from "../../../lib/course-auth";
import { hasPaidAccess } from "../../../lib/payments";

export const dynamic = "force-dynamic";

const MAX_BYTES = 80 * 1024 * 1024;
const database = () => { if (!env.DB) throw new Error("Banco de dados indisponível."); return env.DB; };
const bucket = () => { if (!env.BUCKET) throw new Error("Armazenamento indisponível."); return env.BUCKET; };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const sameOrigin = (request: Request) => request.headers.get("origin") === new URL(request.url).origin;

export async function GET(request: Request) {
  const user = await getPortalUser();
  if (!user) return new Response(null, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  const lesson = await database().prepare("SELECT status,video_key FROM lessons WHERE id = ?")
    .bind(id).first<{ status: string; video_key: string | null }>();
  if (!lesson?.video_key) return new Response(null, { status: 404 });
  const admin = user.role === "professor";
  if (!admin) {
    if (!await hasPaidAccess(user.userId) || lesson.status !== "published") return new Response(null, { status: 403 });
  }
  const head = await bucket().head(lesson.video_key);
  if (!head) return new Response(null, { status: 404 });
  const size = head.size;
  const range = request.headers.get("range");
  let start = 0, end = size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || (!match[1] && !match[2]))
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    if (match[1]) {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : size - 1;
    } else {
      const suffix = Number(match[2]);
      start = Math.max(0, size - suffix);
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end || end < 0)
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    end = Math.min(end, size - 1);
  }
  const video = range
    ? await bucket().get(lesson.video_key, { range: { offset: start, length: end - start + 1 } })
    : await bucket().get(lesson.video_key);
  if (!video) return new Response(null, { status: 404 });
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  return new Response(video.body, { status: range ? 206 : 200, headers });
}

export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!sameOrigin(request) || user?.role !== "professor")
    return json({ error: "Acesso reservado ao professor." }, 403);
  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES + 1024 * 1024)
    return json({ error: "O vídeo deve ter até 80 MB." }, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: "Arquivo inválido." }, 400); }
  const id = String(form.get("id") || "");
  const file = form.get("video");
  if (!(file instanceof File) || !file.size || file.size > MAX_BYTES || file.type !== "video/mp4")
    return json({ error: "Selecione um vídeo MP4 de até 80 MB." }, 400);
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (String.fromCharCode(...signature.slice(4, 8)) !== "ftyp")
    return json({ error: "Arquivo MP4 inválido." }, 400);
  const lesson = await database().prepare("SELECT video_key FROM lessons WHERE id = ?")
    .bind(id).first<{ video_key: string | null }>();
  if (!lesson) return json({ error: "Aula não encontrada." }, 404);
  const key = `lessons/${id}/${crypto.randomUUID()}.mp4`;
  await bucket().put(key, file.stream(), { httpMetadata: { contentType: "video/mp4" } });
  try {
    await database().prepare("UPDATE lessons SET video_key = ? WHERE id = ?").bind(key, id).run();
  } catch (error) {
    await bucket().delete(key);
    throw error;
  }
  if (lesson.video_key) await bucket().delete(lesson.video_key);
  return json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getPortalUser();
  if (!sameOrigin(request) || user?.role !== "professor")
    return json({ error: "Acesso reservado ao professor." }, 403);
  const id = new URL(request.url).searchParams.get("id") || "";
  const lesson = await database().prepare("SELECT video_key FROM lessons WHERE id = ?")
    .bind(id).first<{ video_key: string | null }>();
  if (!lesson) return json({ error: "Aula não encontrada." }, 404);
  await database().prepare("UPDATE lessons SET video_key = NULL WHERE id = ?").bind(id).run();
  if (lesson.video_key) await bucket().delete(lesson.video_key);
  return json({ ok: true });
}
