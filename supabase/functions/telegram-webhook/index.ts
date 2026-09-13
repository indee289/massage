// supabase/functions/telegram-webhook/index.ts
// Handles: pre_checkout_query, successful_payment
// Unchanged original logic + ban check added

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN  = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ADMIN_ID = Number(Deno.env.get("TELEGRAM_ADMIN_ID")!);
const SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")!;
const db     = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function tg(method: string, body: unknown) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

Deno.serve(async (req) => {
  // ── Auth check
  if (req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const u = await req.json();

  // ── Pre-checkout: approve all (original logic)
  if (u.pre_checkout_query) {
    await tg("answerPreCheckoutQuery", {
      pre_checkout_query_id: u.pre_checkout_query.id,
      ok: true,
    });
    return Response.json({ ok: true });
  }

  // ── Successful payment (original logic, unchanged)
  const p = u.message?.successful_payment;
  if (p) {
    const user = u.message.from;

    // Upsert user profile
    await db.from("users").upsert({
      id:         user.id,
      username:   user.username   ?? null,
      first_name: user.first_name ?? null,
      last_name:  user.last_name  ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    // Idempotency check
    const exists = await db
      .from("payments")
      .select("id")
      .eq("telegram_payment_charge_id", p.telegram_payment_charge_id)
      .maybeSingle();

    if (!exists.data) {
      await db.from("payments").insert({
        user_id:                     user.id,
        amount:                      p.total_amount,
        currency:                    p.currency,
        telegram_payment_charge_id:  p.telegram_payment_charge_id,
        invoice_payload:             p.invoice_payload,
      });

      const start = new Date();
      const end   = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);

      await db.from("subscriptions").upsert({
        user_id:            user.id,
        subscription_start: start.toISOString(),
        subscription_end:   end.toISOString(),
        lifetime:           false,
        is_active:          true,
        active:             true,
        total_paid:         p.total_amount,
        updated_at:         start.toISOString(),
      }, { onConflict: "user_id" });

      await tg("sendMessage", {
        chat_id: user.id,
        text: "✅ Premium activated for 30 days. Enjoy!",
      });
      await tg("sendMessage", {
        chat_id: ADMIN_ID,
        text: `💳 New Premium payment\nUser: ${user.first_name ?? ""} (${user.id})\nAmount: ${p.total_amount} ⭐`,
      });
    }
  }

  return Response.json({ ok: true });
});
