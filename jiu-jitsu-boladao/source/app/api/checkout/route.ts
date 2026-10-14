import { PAGES_BASE, PAGES_ORIGIN, getPortalUser, database, trustedOrigin } from "../../../lib/course-auth";
import { checkoutUrl, createCheckout, findLatestOrder, hasPaidAccess, paymentReady, syncOrder, type CourseOrder } from "../../../lib/payments";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
  const user = await getPortalUser();
  if (!user) return json({ error: "Entre na sua conta." }, 401);
  const latest = await findLatestOrder(user.userId);
  if (latest && paymentReady() && latest.provider_order_id && latest.status !== "failed") {
    // Reconcile missed or delayed notifications against the provider, never with redirect query parameters.
    try { await syncOrder(latest); } catch { /* Keep last verified state during a provider outage. */ }
  }
  const updated = await findLatestOrder(user.userId);
  return json({ status: updated?.status || "none", checkoutUrl: updated?.status === "pending" ? checkoutUrl(updated.checkout_url) : null,
    paid: await hasPaidAccess(user.userId), ready: paymentReady() });
}

export async function POST(request: Request) {
  if (!trustedOrigin(request)) return json({ error: "Origem inválida." }, 403);
  const user = await getPortalUser();
  if (!user) return json({ error: "Entre na sua conta." }, 401);
  if (user.role === "professor" || await hasPaidAccess(user.userId)) return json({ error: "Esta conta já tem acesso." }, 409);
  if (!paymentReady()) return json({ error: "Inscrições online ainda não disponíveis." }, 503);
  const price = await database().prepare("SELECT amount_cents FROM course_prices WHERE course = 'Curso completo'").first<{ amount_cents: number }>();
  if (!price || price.amount_cents <= 0) return json({ error: "O valor do curso ainda não foi definido." }, 503);
  let order = await findLatestOrder(user.userId);
  if (order?.status === "pending" && order.provider_order_id) {
    try { await syncOrder(order); } catch { return json({ error: "Não foi possível verificar a compra. Tente novamente." }, 503); }
    order = await findLatestOrder(user.userId);
    if (order?.status === "paid") return json({ error: "Esta conta já tem acesso." }, 409);
    if (order?.status === "pending" && checkoutUrl(order.checkout_url)) return json({ checkoutUrl: order.checkout_url, status: "pending" });
  }
  if (!order || order.status !== "creating") {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await database().prepare("INSERT INTO orders (id,account_id,amount_cents,status,created_at,updated_at) VALUES (?,?,?,'creating',?,?)")
      .bind(id, user.userId, price.amount_cents, now, now).run();
    order = await findLatestOrder(user.userId);
  }
  try {
    const returnBase = request.headers.get("origin") === PAGES_ORIGIN ? PAGES_BASE : new URL(request.url).origin;
    const url = await createCheckout(order as CourseOrder, user.email, returnBase);
    return json({ checkoutUrl: url, status: "pending" });
  } catch {
    return json({ error: "Não foi possível abrir o pagamento. Tente novamente." }, 503);
  }
}
