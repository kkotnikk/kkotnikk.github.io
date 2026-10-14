import { database } from "../../../lib/course-auth";
import { paymentReady, syncOrder, validWebhook, type CourseOrder } from "../../../lib/payments";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!paymentReady()) return new Response(null, { status: 503 });
  const url = new URL(request.url);
  const id = url.searchParams.get("data.id") || "";
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(id) || !(await validWebhook(request, id))) return new Response(null, { status: 401 });
  if (url.searchParams.get("type") !== "order") return new Response(null, { status: 200 });
  const order = await database().prepare("SELECT * FROM orders WHERE provider_order_id = ?").bind(id).first<CourseOrder>();
  if (!order) return new Response(null, { status: 200 });
  try { await syncOrder(order); return new Response(null, { status: 200 }); }
  catch { return new Response(null, { status: 503 }); }
}
