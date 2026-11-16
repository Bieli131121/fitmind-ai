import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { mpApi, reconcileSubscription } from "@/lib/billing/mercadopago";

export const runtime = "nodejs";

type Notification = {
  type?: string;
  topic?: string;
  data?: { id?: string | number };
  id?: string | number;
};

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Para Assinaturas, a documentação do MP não garante assinatura HMAC
// no mesmo fluxo dos webhooks comuns. Exigimos uma chave longa e secreta
// no URL de entrega, e sempre buscamos o recurso na API autenticada.
export async function POST(request: NextRequest) {
  const expected = process.env.MERCADOPAGO_WEBHOOK_TOKEN;
  const provided = request.nextUrl.searchParams.get("token") ?? "";
  if (!expected || expected.length < 32 || !safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Webhook não autorizado" }, { status: 401 });
  }
  const data: Notification = await request.json().catch(() => ({}));
  const topic = data.type || data.topic || request.nextUrl.searchParams.get("type") || "";
  const id = String(data.data?.id ?? request.nextUrl.searchParams.get("data.id") ?? data.id ?? "");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  try {
    let subscriptionId: string | undefined;
    if (topic === "subscription_preapproval") {
      subscriptionId = id;
    } else if (topic === "subscription_authorized_payment") {
      const invoice = await mpApi<{ preapproval_id?: string }>(`/authorized_payments/${encodeURIComponent(id)}`);
      subscriptionId = invoice.preapproval_id;
    } else if (topic === "payment") {
      // Uma cobrança só pertence a esta integração se o MP confirmar
      // uma fatura autorizada vinculada a um ID de assinatura conhecido.
      const invoices = await mpApi<{ results?: { preapproval_id?: string }[] }>(
        `/authorized_payments/search?payment_id=${encodeURIComponent(id)}`
      );
      subscriptionId = invoices.results?.[0]?.preapproval_id;
    } else {
      return NextResponse.json({ ok: true, ignored: true });
    }
    if (!subscriptionId) return NextResponse.json({ ok: true, ignored: true });
    await reconcileSubscription(subscriptionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    // O MP pode ter enviado um evento antes do checkout ser salvo no banco.
    // Resposta não-2xx permite retry; logs NÃO incluem tokens ou payloads.
    console.error("Erro ao processar notificação MP", error);
    return NextResponse.json({ error: "Falha temporária na conciliação" }, { status: 503 });
  }
}
