// supabase/functions/api/index.ts
// All endpoints for Sanya Messenger frontend
//
// Endpoints:
//   GET    /me
//   GET    /messages
//   POST   /messages
//   PATCH  /messages/:id          ← edit
//   POST   /messages/:id/unsend   ← unsend (delete for everyone)
//   DELETE /messages/:id          ← delete for self
//   PATCH  /profile               ← edit name / bio / username / avatar
//   POST   /create-invoice
//   GET    /conversations          (admin)
//   GET    /admin-messages         (admin)
//   POST   /admin-messages         (admin)
//   DELETE /admin-messages/:id     (admin)
//   GET    /admin-users            (admin)
//   GET    /admin-stats            (admin)
//   POST   /admin-grant            (admin)
//   POST   /admin-ban              (admin)
//   POST   /admin-unban            (admin)

import { createClient }  from "https://esm.sh/@supabase/supabase-js@2";

// ── Env ─────────────────────────────────────────────────────────────────────
const TOKEN    = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ADMIN_TG = Number(Deno.env.get("TELEGRAM_ADMIN_ID")!);
const BOT_TOKEN = TOKEN;
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ── Helpers ──────────────────────────────────────────────────────────────────
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

// Validate Telegram initData and return user object
// IMPORTANT: Telegram initData is verified server-side using the Bot Token.
async function authUser(req: Request): Promise<{ id: number; first_name: string; username?: string; last_name?: string } | null> {
  const initData = req.headers.get("x-telegram-init-data") ?? "";
  if (!initData) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");

    // Telegram Web App data-check-string
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const encoder = new TextEncoder();

    // Telegram Web App secret key:
    // HMAC-SHA256(key="WebAppData", message=TELEGRAM_BOT_TOKEN)
    const secretKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode("WebAppData"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const keyBytes = await crypto.subtle.sign(
      "HMAC",
      secretKey,
      encoder.encode(TOKEN),
    );

    const msgKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const sig = await crypto.subtle.sign(
      "HMAC",
      msgKey,
      encoder.encode(dataCheckString),
    );

    const calculatedHash = [...new Uint8Array(sig)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (calculatedHash !== hash) return null;

    // Reject stale initData. Telegram auth_date is Unix seconds.
    const authDate = Number(params.get("auth_date"));
    if (!authDate || Math.floor(Date.now() / 1000) - authDate > 86400) return null;

    const userStr = params.get("user");
    if (!userStr) return null;

    const user = JSON.parse(userStr);
    if (!user?.id || !user?.first_name) return null;

    return user;
  } catch {
    return null;
  }
}

// Ensure user row exists in DB, return full user record
async function getOrCreateUser(tgUser: { id: number; first_name: string; username?: string; last_name?: string }) {
  // Upsert basic info (do not overwrite bio/avatar if already set)
  await db.from("users").upsert({
    id:         tgUser.id,
    first_name: tgUser.first_name,
    username:   tgUser.username ?? null,
    last_name:  tgUser.last_name ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id", ignoreDuplicates: false });

  const { data } = await db.from("users").select("*").eq("id", tgUser.id).single();
  return data;
}

async function isAdmin(userId: number): Promise<boolean> {
  const { data } = await db.from("users").select("is_admin").eq("id", userId).single();
  return !!data?.is_admin;
}

async function getSubscription(userId: number) {
  const { data } = await db
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  const expired = data.lifetime ? false : new Date(data.subscription_end) < new Date();
  if (expired) {
    await db.from("subscriptions").update({ is_active: false, active: false }).eq("user_id", userId);
    return null;
  }
  return { active: true, lifetime: data.lifetime };
}

async function tg(method: string, body: unknown) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Upload base64 avatar to Supabase Storage, return public URL
async function saveAvatar(userId: number, dataUrl: string): Promise<string | null> {
  try {
    const [meta, base64] = dataUrl.split(",");
    const mime = meta.match(/:(.*?);/)?.[1] ?? "image/jpeg";
    const ext  = mime.split("/")[1] ?? "jpg";
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const path  = `avatars/${userId}.${ext}`;
    const { error } = await db.storage.from("avatars").upload(path, bytes, {
      contentType: mime, upsert: true,
    });
    if (error) return null;
    const { data } = db.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl + "?t=" + Date.now();
  } catch {
    return null;
  }
}

// ── Router ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url    = new URL(req.url);
  const method = req.method;

  // Path without leading slash, split into parts
  // e.g. "/messages/42/unsend" → ["messages","42","unsend"]
  const parts = url.pathname.replace(/^\//, "").split("/").filter(Boolean);
  const p0 = parts[0] ?? "";
  const p1 = parts[1] ?? "";
  const p2 = parts[2] ?? "";

  // ── Auth ──────────────────────────────────────────────────────────────────
  const tgUser = await authUser(req);
  if (!tgUser) return err("Unauthorized — open from Telegram", 401);

  const user = await getOrCreateUser(tgUser);
  if (!user) return err("User error", 500);

  // Ban check
  if (user.is_banned) return err("Your account has been banned.", 403);

  const uid      = user.id as number;
  const adminRow = await isAdmin(uid);

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /me
  // ═══════════════════════════════════════════════════════════════════════════
  if (p0 === "me" && method === "GET") {
    const sub = await getSubscription(uid);
    return json({
      id:           uid,
      first_name:   user.first_name,
      username:     user.username,
      bio:          user.bio ?? "",
      avatar_url:   user.avatar_url ?? null,
      is_admin:     adminRow,
      subscription: sub,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /messages  — load user's chat with admin
  // ═══════════════════════════════════════════════════════════════════════════
  if (p0 === "messages" && method === "GET" && !p1) {
    const sub = await getSubscription(uid);
    if (!sub) return err("Premium required", 403);

    const { data } = await db
      .from("messages")
      .select("id, sender_id, text, created_at, edited_at, deleted_at, seen_at")
      .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
      .order("created_at", { ascending: true });

    // Mark admin messages as seen
    await db.from("messages")
      .update({ seen_at: new Date().toISOString() })
      .eq("receiver_id", uid)
      .is("seen_at", null);

    return json({ messages: data ?? [] });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /messages  — send message to admin
  // ═══════════════════════════════════════════════════════════════════════════
  if (p0 === "messages" && method === "POST" && !p1) {
    const sub = await getSubscription(uid);
    if (!sub) return err("Premium required", 403);

    const body = await req.json();
    const text = (body.text ?? "").trim();
    if (!text) return err("Empty message");

    const { error } = await db.from("messages").insert({
      sender_id:   uid,
      receiver_id: ADMIN_TG,
      text,
    });
    if (error) return err(error.message, 500);

    // Notify admin via Telegram
    const name = user.first_name ?? String(uid);
    await tg("sendMessage", {
      chat_id: ADMIN_TG,
      text: `💬 New message from ${name} (${uid}):\n${text}`,
    });

    return json({ ok: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /messages/:id  — edit own message
  // ═══════════════════════════════════════════════════════════════════════════
  if (p0 === "messages" && p1 && !p2 && method === "PATCH") {
    const msgId = Number(p1);
    const body  = await req.json();
    const text  = (body.text ?? "").trim();
    if (!text) return err("Empty text");

    // Only sender can edit, within 48h, not deleted
    const { data: msg } = await db.from("messages").select("*").eq("id", msgId).single();
    if (!msg) return err("Message not found", 404);
    if (msg.sender_id !== uid) return err("Not your message", 403);
    if (msg.deleted_at) return err("Message already deleted");
    const age = Date.now() - new Date(msg.created_at).getTime();
    if (age > 48 * 60 * 60 * 1000) return err("Edit window expired (48h)");

    await db.from("messages").update({
      text,
      edited_at: new Date().toISOString(),
    }).eq("id", msgId);

    return json({ ok: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /messages/:id/unsend  — delete for everyone
  // ═══════════════════════════════════════════════════════════════════════════
  if (p0 === "messages" && p1 && p2 === "unsend" && method === "POST") {
    const msgId = Number(p1);

    const { data: msg } = await db.from("messages").select("*").eq("id", msgId).single();
    if (!msg) return err("Not found", 404);
    if (msg.sender_id !== uid) return err("Not your message", 403);
    if (msg.deleted_at) return err("Already deleted");

    await db.from("messages").update({
      deleted_at: new Date().toISOString(),
      text: "",
    }).eq("id", msgId);

    return json({ ok: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /messages/:id  — soft delete for self
  // ═══════════════════════════════════════════════════════════════════════════
  if (p0 === "messages" && p1 && !p2 && method === "DELETE") {
    const msgId = Number(p1);

    const { data: msg } = await db.from("messages").select("*").eq("id", msgId).single();
    if (!msg) return err("Not found", 404);
    if (msg.sender_id !== uid && msg.receiver_id !== uid) return err("Not your message", 403);

    // Soft delete — mark deleted for this user only
    // (use deleted_at as universal for simplicity; unsend = same effect)
    await db.from("messages").update({
      deleted_at: new Date().toISOString(),
      text: "",
    }).eq("id", msgId);

    return json({ ok: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /profile  — update name / bio / username / avatar
  // ═══════════════════════════════════════════════════════════════════════════
  if (p0 === "profile" && method === "PATCH") {
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.first_name === "string") updates.first_name = body.first_name.trim().slice(0, 64) || user.first_name;
    if (typeof body.bio        === "string") updates.bio        = body.bio.trim().slice(0, 160);
    if (typeof body.username   === "string") {
      const uname = body.username.trim().replace(/^@/, "").slice(0, 32);
      // Check uniqueness
      if (uname) {
        const { data: clash } = await db.from("users").select("id").eq("username", uname).neq("id", uid).maybeSingle();
        if (clash) return err("Username already taken");
      }
      updates.username = uname || null;
    }

    // Avatar upload
    if (typeof body.avatar_data_url === "string" && body.avatar_data_url.startsWith("data:image")) {
      const avatarUrl = await saveAvatar(uid, body.avatar_data_url);
      if (avatarUrl) updates.avatar_url = avatarUrl;
    }

    await db.from("users").update(updates).eq("id", uid);
    return json({ ok: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /create-invoice  — Telegram Stars payment
  // ═══════════════════════════════════════════════════════════════════════════
  if (p0 === "create-invoice" && method === "POST") {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/createInvoiceLink`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title:         "Sanya Premium",
        description:   "30-day premium access to private messaging.",
        payload:       `premium_${uid}_${Date.now()}`,
        currency:      "XTR",
        prices:        [{ label: "Premium", amount: 199 }],
      }),
    });
    const d = await r.json();
    if (!d.ok) return err(d.description ?? "Invoice error", 500);
    return json({ invoice_url: d.result });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── ADMIN ONLY below ──────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  if (!adminRow) return err("Forbidden", 403);

  // ── GET /conversations ────────────────────────────────────────────────────
  if (p0 === "conversations" && method === "GET") {
    // Get all unique users who messaged (not admin)
    const { data: rows } = await db
      .from("messages")
      .select("sender_id, receiver_id, text, created_at, seen_at")
      .order("created_at", { ascending: false });

    if (!rows) return json({ conversations: [] });

    // Build per-user summary
    const map = new Map<number, {
      user_id: number; last_message: string; last_message_at: string; unread_count: number;
    }>();
    for (const r of rows) {
      const otherId = r.sender_id === uid ? r.receiver_id : r.sender_id;
      if (otherId === uid) continue;
      if (!map.has(otherId)) {
        map.set(otherId, {
          user_id:         otherId,
          last_message:    r.text || "🚫 Deleted",
          last_message_at: r.created_at,
          unread_count:    0,
        });
      }
      // Count unread (messages sent TO admin, not seen)
      if (r.receiver_id === uid && !r.seen_at) {
        map.get(otherId)!.unread_count++;
      }
    }

    // Enrich with user profiles
    const userIds = [...map.keys()];
    const { data: users } = await db.from("users").select("*").in("id", userIds);
    const { data: subs }  = await db.from("subscriptions").select("user_id, is_active, lifetime").in("user_id", userIds).eq("is_active", true);
    const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u]));
    const subMap  = Object.fromEntries((subs  ?? []).map(s => [s.user_id, s]));

    const conversations = [...map.values()].map(c => ({
      ...c,
      first_name:  userMap[c.user_id]?.first_name ?? null,
      username:    userMap[c.user_id]?.username    ?? null,
      avatar_url:  userMap[c.user_id]?.avatar_url  ?? null,
      is_banned:   userMap[c.user_id]?.is_banned   ?? false,
      is_premium:  !!subMap[c.user_id],
    }));

    return json({ conversations });
  }

  // ── GET /admin-messages?user_id=xxx ──────────────────────────────────────
  if (p0 === "admin-messages" && method === "GET") {
    const targetId = Number(url.searchParams.get("user_id"));
    if (!targetId) return err("user_id required");

    const { data } = await db
      .from("messages")
      .select("id, sender_id, receiver_id, text, created_at, edited_at, deleted_at, seen_at")
      .or(`and(sender_id.eq.${targetId},receiver_id.eq.${uid}),and(sender_id.eq.${uid},receiver_id.eq.${targetId})`)
      .order("created_at", { ascending: true });

    // Mark as seen
    await db.from("messages")
      .update({ seen_at: new Date().toISOString() })
      .eq("sender_id", targetId)
      .eq("receiver_id", uid)
      .is("seen_at", null);

    return json({ messages: data ?? [] });
  }

  // ── POST /admin-messages  — reply as admin ────────────────────────────────
  if (p0 === "admin-messages" && method === "POST") {
    const body     = await req.json();
    const text     = (body.text ?? "").trim();
    const targetId = Number(body.user_id);
    if (!text || !targetId) return err("text and user_id required");

    await db.from("messages").insert({
      sender_id:   uid,
      receiver_id: targetId,
      text,
    });

    // Push to user's Telegram
    await tg("sendMessage", { chat_id: targetId, text: `💌 Sanya: ${text}` });

    return json({ ok: true });
  }

  // ── DELETE /admin-messages/:id ────────────────────────────────────────────
  if (p0 === "admin-messages" && p1 && method === "DELETE") {
    const msgId = Number(p1);
    await db.from("messages").update({
      deleted_at: new Date().toISOString(),
      text: "",
    }).eq("id", msgId);

    await db.from("admin_actions").insert({
      admin_id: uid,
      action:   "delete_message",
      details:  { message_id: msgId },
    });

    return json({ ok: true });
  }

  // ── GET /admin-users ──────────────────────────────────────────────────────
  if (p0 === "admin-users" && method === "GET") {
    const { data: users } = await db
      .from("users")
      .select("id, first_name, username, avatar_url, is_banned, is_admin, created_at")
      .eq("is_admin", false)
      .order("created_at", { ascending: false });

    const ids = (users ?? []).map(u => u.id);
    const { data: subs } = await db
      .from("subscriptions")
      .select("user_id, is_active, lifetime")
      .in("user_id", ids)
      .eq("is_active", true);
    const subMap = Object.fromEntries((subs ?? []).map(s => [s.user_id, s]));

    const enriched = (users ?? []).map(u => ({
      ...u,
      subscription: subMap[u.id] ? { active: true, lifetime: !!subMap[u.id].lifetime } : null,
    }));

    return json({ users: enriched });
  }

  // ── GET /admin-stats ──────────────────────────────────────────────────────
  if (p0 === "admin-stats" && method === "GET") {
    const [
      { count: total_users },
      { count: premium_users },
      { count: total_messages },
      { count: banned_users },
      { count: active_today },
      { data: rev },
    ] = await Promise.all([
      db.from("users").select("*", { count: "exact", head: true }).eq("is_admin", false),
      db.from("subscriptions").select("*", { count: "exact", head: true }).eq("is_active", true),
      db.from("messages").select("*", { count: "exact", head: true }).is("deleted_at", null),
      db.from("users").select("*", { count: "exact", head: true }).eq("is_banned", true),
      db.from("users").select("*", { count: "exact", head: true })
        .gte("updated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      db.from("payments").select("amount").gte("created_at",
        new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    ]);

    const revenue_stars = (rev ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount ?? 0), 0);

    return json({ total_users, premium_users, total_messages, banned_users, active_today, revenue_stars });
  }

  // ── POST /admin-grant  — give premium ────────────────────────────────────
  if (p0 === "admin-grant" && method === "POST") {
    const body     = await req.json();
    const targetId = Number(body.user_id);
    if (!targetId) return err("user_id required");

    const now = new Date().toISOString();
    await db.from("subscriptions").upsert({
      user_id:            targetId,
      subscription_start: now,
      subscription_end:   new Date("2099-01-01").toISOString(),
      lifetime:           true,
      is_active:          true,
      active:             true,
      updated_at:         now,
    }, { onConflict: "user_id" });

    await db.from("admin_actions").insert({ admin_id: uid, target_id: targetId, action: "grant_premium" });
    await tg("sendMessage", { chat_id: targetId, text: "✨ You've been gifted Lifetime Premium by Sanya!" });

    return json({ ok: true });
  }

  // ── POST /admin-ban ───────────────────────────────────────────────────────
  if (p0 === "admin-ban" && method === "POST") {
    const body     = await req.json();
    const targetId = Number(body.user_id);
    if (!targetId) return err("user_id required");

    await db.from("users").update({ is_banned: true }).eq("id", targetId);
    await db.from("admin_actions").insert({ admin_id: uid, target_id: targetId, action: "ban" });
    await tg("sendMessage", { chat_id: targetId, text: "🚫 Your account has been suspended." });

    return json({ ok: true });
  }

  // ── POST /admin-unban ─────────────────────────────────────────────────────
  if (p0 === "admin-unban" && method === "POST") {
    const body     = await req.json();
    const targetId = Number(body.user_id);
    if (!targetId) return err("user_id required");

    await db.from("users").update({ is_banned: false }).eq("id", targetId);
    await db.from("admin_actions").insert({ admin_id: uid, target_id: targetId, action: "unban" });
    await tg("sendMessage", { chat_id: targetId, text: "✅ Your account has been reinstated." });

    return json({ ok: true });
  }

  // ── 404 ───────────────────────────────────────────────────────────────────
  return err("Not found", 404);
});
