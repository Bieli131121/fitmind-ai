import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valida a assinatura x-signature do Mercado Pago.
 * O ID deve vir da query `data.id`, nunca somente do JSON não confiável.
 * Manifest oficial: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 */
export function verifyMercadoPagoWebhookSignature(input: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string | undefined;
  now?: number;
}): boolean {
  const { signature, requestId, dataId, secret, now = Date.now() } = input;
  if (!secret || !signature || !requestId || !dataId) return false;
  if (secret.length < 16 || requestId.length > 256 || !/^[\w-]{1,120}$/.test(dataId)) return false;

  const attributes = new Map<string, string>();
  for (const part of signature.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    attributes.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  const ts = attributes.get("ts") ?? "";
  const v1 = attributes.get("v1") ?? "";
  if (!/^\d{10,16}$/.test(ts) || !/^[a-fA-F0-9]{64}$/.test(v1)) return false;

  // A documentação apresenta timestamps em segundos e em milissegundos.
  // Rejeitar mensagens antigas reduz a possibilidade de replay.
  const timestamp = Number(ts);
  const timestampMs = ts.length <= 10 ? timestamp * 1000 : timestamp;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 15 * 60 * 1000) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const calculated = createHmac("sha256", secret).update(manifest).digest();
  const provided = Buffer.from(v1, "hex");
  return provided.length === calculated.length && timingSafeEqual(provided, calculated);
}
