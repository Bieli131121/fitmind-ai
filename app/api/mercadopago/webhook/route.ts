import { NextRequest, NextResponse } from "next/server";
import { mpApi, reconcileSubscription } from "@/lib/billing/mercadopago";
import { verifyMercadoPagoWebhookSignature } from "@/lib/billing/webhook-signature";

export const runtime = "nodejs";

type Notification = {
  type?: string;
  topic?: string;
  data?: { id?: string | number };
};

/**
 * URL pública para cadastrar no Mercado Pago:
 * https://fitmind-ai-alpha.vercel.app/api/mercadopago/webhook
 * Sem ?token=, sem segredos na URL.
 * A origem é validada pelo x-signature com segredo GERADO PELO MERCADO PAGO.
 */
export async function POST(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const signedId = params.get("data.id");
  const verified = verifyMercadoPagoWebhookSignature({
    signature: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId: signedId,
    secret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
  });
  if (!process.env.MERCADOPAGO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook ainda não configurado" }, { status: 503 });
  }
  if (!verified) {
    return NextResponse.json({ error: "Assinatura de webhook inválida" }, { status: 401 });
  }

  const notification: Notification = await request.json().catch(() => ({}));
  const topic = notification.type || notification.topic || params.get("type") || "";
  const resourceId = String(notification.data?.id ?? signedId ?? "");
  // O recurso processado precisa ser EXATAMENTE o recurso coberto pelo HMAC.
  if (!signedId || signedId.toLowerCase() !== resourceId.toLowerCase() ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(resourceId)) {
    return NextResponse.json({ error: "Identificador de recurso inválido" }, { status: 400 });
  }
  if (params.get("type") && notification.type && params.get("type") !== notification.type) {
    return NextResponse.json({ error: "Tipo de notificação divergente" }, { status: 400 });
  }

  try {
    let subscriptionId: string | undefined;
    if (topic === "subscription_preapproval") {
      subscriptionId = resourceId;
    } else if (topic === "subscription_authorized_payment") {
      const invoice = await mpApi<{ preapproval_id?: string }>(
        `/authorized_payments/${encodeURIComponent(resourceId)}`
      );
      subscriptionId = invoice.preapproval_id;
    } else if (topic === "payment") {
      const invoices = await mpApi<{ results?: { preapproval_id?: string }[] }>(
        `/authorized_payments/search?payment_id=${encodeURIComponent(resourceId)}`
      );
      subscriptionId = invoices.results?.[0]?.preapproval_id;
    } else {
      return NextResponse.json({ ok: true, ignored: true });
    }
    if (!subscriptionId) return NextResponse.json({ ok: true, ignored: true });
    await reconcileSubscription(subscriptionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Falha temporária: o MP pode repetir a notificação.
    // Nunca registrar assinatura, URL completa ou segredos nos logs.
    console.error("Falha ao conciliar webhook do Mercado Pago", error);
    return NextResponse.json({ error: "Falha temporária na conciliação" }, { status: 503 });
  }
}
