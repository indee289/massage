// supabase/functions/telegram-webhook/index.ts
// Telegram Webhook Handler for Sanya Messenger
// Handles: pre_checkout_query, successful_payment

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN    = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const ADMIN_ID = Number(Deno.env.get("TELEGRAM_ADMIN_ID") ?? "0");
const SECRET   = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

const db = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

async function tg(method: string, body: unknown) {
  if (!TOKEN) return null;
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

Deno.serve(async (req) => {
  // CORS check / options
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  // Auth check via secret token header if configured
  if (SECRET) {
    const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (receivedSecret !== SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  let u: any;
  try {
    u = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // ── 1. Pre-checkout query handling
  if (u.pre_checkout_query) {
    const pc = u.pre_checkout_query;
    const userId = Number(pc.from?.id);

    // Check if user is banned
    const { data: profile } = await db
      .from("profiles")
      .select("is_banned")
      .eq("user_id", userId)
      .maybeSingle();

    if (profile?.is_banned) {
      await tg("answerPreCheckoutQuery", {
        pre_checkout_query_id: pc.id,
        ok: false,
        error_message: "Your account is suspended.",
      });
    } else {
      await tg("answerPreCheckoutQuery", {
        pre_checkout_query_id: pc.id,
        ok: true,
      });
    }

    return Response.json({ ok: true });
  }

  // ── 2. Successful payment handling
  const p = u.message?.successful_payment;
  if (p) {
    const user = u.message.from;
    const userId = Number(user.id);

    // Upsert user profile in profiles table
    await db.from("profiles").upsert(
      {
        user_id: userId,
        username: user.username ?? null,
        first_name: user.first_name ?? null,
        last_name: user.last_name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    // Idempotency check on payments table
    const { data: existingPayment } = await db
      .from("payments")
      .select("id")
      .eq("telegram_payment_charge_id", p.telegram_payment_charge_id)
      .maybeSingle();

    if (!existingPayment) {
      await db.from("payments").insert({
        user_id: userId,
        amount: Number(p.total_amount),
        currency: String(p.currency || "XTR"),
        telegram_payment_charge_id: p.telegram_payment_charge_id,
        invoice_payload: p.invoice_payload,
      });

      const start = new Date();
      const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);

      await db.from("subscriptions").upsert(
        {
          user_id: userId,
          subscription_start: start.toISOString(),
          subscription_end: end.toISOString(),
          lifetime: false,
          is_active: true,
          total_paid: Number(p.total_amount),
          updated_at: start.toISOString(),
        },
        { onConflict: "user_id" }
      );

      // Notify User
      try {
        await tg("sendMessage", {
          chat_id: userId,
          text: "✨ Premium activated for 30 days! Enjoy 1-on-1 private messaging with Sanya.",
        });
      } catch (err) {
        console.error("Failed to notify user about payment:", err);
      }

      // Notify Admin
      if (ADMIN_ID > 0) {
        try {
          await tg("sendMessage", {
            chat_id: ADMIN_ID,
            text: `💳 New Premium Payment Received!\nUser: ${user.first_name ?? ""} (@${user.username ?? userId})\nID: ${userId}\nAmount: ${p.total_amount} ${p.currency || "XTR"} ⭐`,
          });
        } catch (err) {
          console.error("Failed to notify admin about payment:", err);
        }
      }
    }
  }

  return Response.json({ ok: true });
});
