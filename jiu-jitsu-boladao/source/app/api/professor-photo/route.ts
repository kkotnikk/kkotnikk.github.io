import { env } from "cloudflare:workers";
import { getPortalUser, trustedOrigin } from "../../../lib/course-auth";

export const dynamic = "force-dynamic";

const PHOTO_KEY = "professor/portrait";
const MAX_BYTES = 8 * 1024 * 1024;
const json = (body: unknown, status = 200) => Response.json(body, { status });
const bucket = () => { if (!env.BUCKET) throw new Error("Armazenamento indisponível."); return env.BUCKET; };
const database = () => { if (!env.DB) throw new Error("Banco de dados indisponível."); return env.DB; };

async function canEdit(request: Request) {
  if (!trustedOrigin(request)) return false;
  const user = await getPortalUser();
  return user?.role === "professor";
}
function validImage(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}
export async function GET() {
  const photo = await bucket().get(PHOTO_KEY);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(photo.body, {
    headers: {
      "Content-Type": photo.httpMetadata?.contentType || "image/jpeg",
      "Content-Length": String(photo.size),
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function POST(request: Request) {
  if (!await canEdit(request)) return json({ error: "Acesso reservado ao professor." }, 403);
  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES + 1024 * 1024)
    return json({ error: "A foto deve ter até 8 MB." }, 413);
  let file: FormDataEntryValue | null;
  try { file = (await request.formData()).get("photo"); }
  catch { return json({ error: "Arquivo inválido." }, 400); }
  if (!(file instanceof File) || !file.size || file.size > MAX_BYTES)
    return json({ error: "Selecione uma foto de até 8 MB." }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validImage(bytes, file.type)) return json({ error: "Use JPG, PNG ou WebP." }, 400);
  await bucket().put(PHOTO_KEY, bytes, { httpMetadata: { contentType: file.type } });
  const version = Date.now().toString();
  await database().prepare("INSERT INTO site_content (key,value) VALUES ('professor_photo_version',?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(version).run();
  return json({ ok: true });
}
export async function DELETE(request: Request) {
  if (!await canEdit(request)) return json({ error: "Acesso reservado ao professor." }, 403);
  await bucket().delete(PHOTO_KEY);
  await database().prepare("DELETE FROM site_content WHERE key = 'professor_photo_version'").run();
  return json({ ok: true });
}
