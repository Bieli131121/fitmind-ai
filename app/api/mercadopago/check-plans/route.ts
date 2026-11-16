
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const planIds = {
  monthly: "5f123e4e9e4645e881dd66a2f911d4d4",
  yearly: "09694d3aea0241d288ece1c2f2c4cb96",
};

export async function GET() {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Rota indisponivel em producao" },
        { status: 404 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Nao autorizado" },
        { status: 401 }
      );
    }

    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: "Token nao configurado no ambiente local" },
        { status: 503 }
      );
    }

    const plans = await Promise.all(
      Object.entries(planIds).map(async ([plan, id]) => {
        try {
          const response = await fetch(
            `https://api.mercadopago.com/preapproval_plan/${id}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
              cache: "no-store",
            }
          );

          if (!response.ok) {
            return {
              plan,
              valid: false,
              httpStatus: response.status,
            };
          }

          const data = await response.json();

          return {
            plan,
            valid: true,
            id: data.id,
            reason: data.reason,
            status: data.status,
            frequency: data.auto_recurring?.frequency,
            frequency_type: data.auto_recurring?.frequency_type,
            amount: data.auto_recurring?.transaction_amount,
            currency: data.auto_recurring?.currency_id,
          };
        } catch {
          return {
            plan,
            valid: false,
            error: "Falha na consulta",
          };
        }
      })
    );

    return NextResponse.json({ plans });
  } catch (error) {
    console.error("Erro ao verificar planos:", error);
    return NextResponse.json(
      { error: "Erro interno ao verificar planos" },
      { status: 500 }
    );
  }
}

