export type PaymentRecord = { id: string; provider_order_id: string | null; amount_cents: number };
export type ProviderOrder = {
  id?: string; external_reference?: string; status?: string; status_detail?: string;
  total_amount?: string; total_paid_amount?: string; currency?: string;
  country_code?: string; checkout_url?: string;
};

// Only an order fetched directly from the provider can change access.
export function verifiedStatus(provider: ProviderOrder, order: PaymentRecord): "paid" | "refunded" | "failed" | "pending" | null {
  const cents = (s: unknown) => typeof s === "string" && /^\d+\.\d{2}$/.test(s) ? Number(s.replace(".", "")) : NaN;
  if (provider.id !== order.provider_order_id || provider.external_reference !== order.id ||
      provider.currency !== "BRL" || provider.country_code !== "BRA" || cents(provider.total_amount) !== order.amount_cents)
    return null;
  if (provider.status === "processed" && provider.status_detail === "accredited" && cents(provider.total_paid_amount) >= order.amount_cents) return "paid";
  if (provider.status === "refunded" || provider.status === "canceled" || provider.status === "processed" && ["refunded", "partially_refunded"].includes(provider.status_detail || "")) return "refunded";
  if (provider.status === "failed") return "failed";
  return "pending";
}
