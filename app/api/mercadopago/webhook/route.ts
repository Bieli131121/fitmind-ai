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
  // O simulador e integrações legadas podem chamar o mesmo evento de preapproval
  // ou subscription_preapproval. Aceitamos APENAS aliases conhecidos.
  const normalizeTopic = (value: string) => {
    if (value === "preapproval") return "subscription_preapproval";
    if (value === "authorized_payment") return "subscription_authorized_payment";
    return value;
  };
  const bodyTopic = normalizeTopic(notification.type || notification.topic || "");
  const queryTopic = normalizeTopic(params.get("type") || "");
  const topic = bodyTopic || queryTopic;
  const bodyId = notification.data?.id == null ? null : String(notification.data.id);
  // O ID assinado na URL é a identidade autorizada. O corpo não pode substituí-lo.
  const resourceId = signedId ?? "";
  if (!signedId || !/^[a-zA-Z0-9_-]{1,100}$/.test(resourceId) ||
      (bodyId !== null && bodyId.toLowerCase() !== resourceId.toLowerCase())) {
    // Registra apenas a causa: nunca registrar IDs, assinatura, URL ou segredos.
    console.warn("[FitMind webhook] ID_DIVERGENTE", {
      urlTemId: Boolean(signedId), corpoTemId: bodyId !== null,
      idMesmoValor: Boolean(bodyId && signedId && bodyId.toLowerCase() === signedId.toLowerCase()),
    });
    return NextResponse.json({ error: "Identificador de recurso inválido" }, { status: 400 });
  }
  if (bodyTopic && queryTopic && bodyTopic !== queryTopic) {
    console.warn("[FitMind webhook] TIPO_DIVERGENTE", {
      tipoUrl: queryTopic,
      tipoCorpo: bodyTopic,
    });
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
