import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { billingAdmin, reconcileSubscription } from "@/lib/billing/mercadopago";

export const runtime = "nodejs";

// Verificação diária independente do webhook; chamada pelo Vercel Cron.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const received = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret || ""}`;
  if (!secret || secret.length < 32 ||
      Buffer.byteLength(received) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const admin = billingAdmin();
    // O registro mais antigo é processado primeiro; update_at altera a fila.
    const { data, error } = await admin.from("subscriptions")
      .select("provider_subscription_id")
      .not("provider_subscription_id", "is", null)
      .order("updated_at", { ascending: true }).limit(5);
    if (error) throw error;
    let processed = 0;
    let failed = 0;
    for (const sub of data ?? []) {
      if (!sub.provider_subscription_id) continue;
      try {
        await reconcileSubscription(sub.provider_subscription_id);
        processed++;
      } catch (err) {
        failed++;
        console.error("Falha de conciliação recorrente", err);
      }
    }
    return NextResponse.json({ processed, failed });
  } catch (err) {
    console.error("Erro no processamento diário de assinaturas", err);
    return NextResponse.json({ error: "Erro na conciliação" }, { status: 503 });
  }
}
