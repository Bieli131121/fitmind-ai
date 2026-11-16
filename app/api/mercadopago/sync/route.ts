import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { billingAdmin, reconcileSubscription } from "@/lib/billing/mercadopago";

export const runtime = "nodejs";

// Usado na volta do checkout ou quando o cliente quer atualizar a situação.
// Não confia em parâmetros do navegador: obtém o ID só do banco do usuário.
export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const admin = billingAdmin();
    const { data: sub, error: dbError } = await admin.from("subscriptions")
      .select("provider_subscription_id").eq("user_id", user.id).maybeSingle();
    if (dbError) throw dbError;
    if (!sub?.provider_subscription_id) return NextResponse.json({ status: "free" });
    const result = await reconcileSubscription(sub.provider_subscription_id, user.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Erro ao sincronizar assinatura", err);
    return NextResponse.json({ error: "Não foi possível atualizar a assinatura agora." }, { status: 502 });
  }
}
