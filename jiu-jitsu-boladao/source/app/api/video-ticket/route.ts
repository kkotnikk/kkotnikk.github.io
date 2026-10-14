import { database, getPortalUser } from "../../../lib/course-auth";
import { hasPaidAccess } from "../../../lib/payments";
import { createVideoTicket } from "../../../lib/video-ticket";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Entre na sua conta." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  const lesson = await database().prepare("SELECT status,video_key FROM lessons WHERE id = ?")
    .bind(id).first<{ status: string; video_key: string | null }>();
  if (!lesson?.video_key || (user.role !== "professor" &&
      (lesson.status !== "published" || !await hasPaidAccess(user.userId))))
    return Response.json({ error: "Vídeo indisponível." }, { status: 403 });
  const ticket = await createVideoTicket(user.userId, id);
  return Response.json({ url: `${new URL(request.url).origin}/api/lesson-video?id=${encodeURIComponent(id)}&ticket=${encodeURIComponent(ticket)}` },
    { headers: { "Cache-Control": "no-store" } });
}
