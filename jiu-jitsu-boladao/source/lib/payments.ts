import { env } from "cloudflare:workers";
import { database, hex } from "./course-auth";
import { verifiedStatus, type ProviderOrder } from "./payment-verification";

export type CourseOrder = {
  id: string; account_id: string; amount_cents: number; provider_order_id: string | null;
  checkout_url: string | null; status: string; created_at: string; updated_at: string;
};

export const paymentReady = () => !!(env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET);
export const money = (cents: number) => (cents / 100).toFixed(2);
export const checkoutUrl = (value: unknown) => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "mercadopago.com.br" || url.hostname.endsWith(".mercadopago.com.br")) ? value : null;
  } catch { return null; }
};

async function providerFetch(path: string, init?: RequestInit) {
  if (!env.MP_ACCESS_TOKEN) throw Error("Pagamento indisponível.");
  const response = await fetch("https://api.mercadopago.com" + path, {
    ...init, signal: AbortSignal.timeout(10000), headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) throw Error(`Provedor indisponível (${response.status}).`);
  return await response.json() as ProviderOrder;
}

export async function findLatestOrder(accountId: string) {
  return database().prepare("SELECT * FROM orders WHERE account_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(accountId).first<CourseOrder>();
}
export async function hasPaidAccess(accountId: string) {
  return !!await database().prepare("SELECT 1 AS allowed FROM orders WHERE account_id = ? AND status = 'paid' LIMIT 1")
    .bind(accountId).first();
}

export async function createCheckout(order: CourseOrder, email: string, origin: string) {
  const amount = money(order.amount_cents);
  const result = await providerFetch("/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Idempotency-Key": order.id },
    body: JSON.stringify({
      type: "online", processing_mode: "manual", capture_mode: "automatic",
      total_amount: amount, external_reference: order.id,
      description: "Jiu-Jitsu Boladão — curso completo",
      payer: { email },
      items: [{ title: "Jiu-Jitsu Boladão — curso completo", quantity: 1, unit_measure: "unit", unit_price: amount, total_amount: amount }],
      config: { online: {
        success_url: `${origin}/site.html?pagamento=retorno`,
        pending_url: `${origin}/site.html?pagamento=retorno`,
        failure_url: `${origin}/site.html?pagamento=retorno`,
        auto_return: "approved",
      } },
    }),
  });
  const url = checkoutUrl(result.checkout_url);
  if (!url || !/^[A-Za-z0-9_-]{8,100}$/.test(result.id || "") ||
      result.external_reference !== order.id || result.total_amount !== amount ||
      result.currency !== "BRL" || result.country_code !== "BRA") throw Error("O checkout não pôde ser validado.");
  await database().prepare("UPDATE orders SET provider_order_id = ?, checkout_url = ?, status = 'pending', updated_at = ? WHERE id = ? AND status = 'creating'")
    .bind(result.id, url, new Date().toISOString(), order.id).run();
  return url;
}

export async function syncOrder(order: CourseOrder) {
  if (!order.provider_order_id) return order.status;
  const provider = await providerFetch(`/v1/orders/${encodeURIComponent(order.provider_order_id)}`);
  const status = verifiedStatus(provider, order);
  if (!status) throw Error("Os dados da compra não conferem.");
  const now = new Date().toISOString();
  await database().prepare("UPDATE orders SET status = ?, updated_at = ?, paid_at = CASE WHEN ? = 'paid' THEN COALESCE(paid_at, ?) ELSE paid_at END WHERE id = ? AND provider_order_id = ?")
    .bind(status, now, status, now, order.id, order.provider_order_id).run();
  return status;
}

export async function validWebhook(request: Request, orderId: string) {
  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const ts = /(?:^|,)ts=(\d{10,16})(?:,|$)/.exec(signature)?.[1];
  const given = /(?:^|,)v1=([a-fA-F0-9]{64})(?:,|$)/.exec(signature)?.[1];
  if (!env.MP_WEBHOOK_SECRET || !ts || !given || !requestId || !orderId) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.MP_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`id:${orderId};request-id:${requestId};ts:${ts};`)));
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= signed.charCodeAt(i) ^ given.toLowerCase().charCodeAt(i);
  return diff === 0;
}
