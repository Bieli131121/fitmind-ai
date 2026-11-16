import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { billingAdmin, mpApi, mpSubscription, reconcileSubscription } from "@/lib/billing/mercadopago";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  try {
    const admin = billingAdmin();
    const { data: sub, error: dbError } = await admin.from("subscriptions")
      .select("provider_subscription_id,cancel_at_period_end").eq("user_id", user.id).maybeSingle();
    if (dbError) throw dbError;
    if (!sub?.provider_subscription_id) return NextResponse.json({ error: "Nenhuma assinatura encontrada." }, { status: 404 });
    if (sub.cancel_at_period_end) return NextResponse.json({ ok: true });
    const remote = await mpSubscription(sub.provider_subscription_id);
    if (remote.external_reference !== user.id) throw new Error("Titular da assinatura divergente");
    if (remote.status !== "canceled" && remote.status !== "cancelled") {
      await mpApi(`/preapproval/${encodeURIComponent(sub.provider_subscription_id)}`, {
        method: "PUT", body: JSON.stringify({ status: "canceled" }),
      });
    }
    await reconcileSubscription(sub.provider_subscription_id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Erro no cancelamento", err);
    return NextResponse.json({ error: "Não foi possível confirmar o cancelamento." }, { status: 502 });
  }
}
