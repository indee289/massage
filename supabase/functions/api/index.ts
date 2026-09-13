// supabase/functions/api/index.ts
// Sanya Messenger API â€” aligned with the existing Supabase schema.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const ADMIN_TG = Number(Deno.env.get("TELEGRAM_ADMIN_ID") ?? "0");
const db = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-telegram-init-data",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    },
  });
}
function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

// Verify Telegram Mini App initData on the server using TELEGRAM_BOT_TOKEN.
async function authUser(req: Request): Promise<{
  id: number;
  first_name?: string;
  username?: string;
  last_name?: string;
  photo_url?: string;
} | null> {
  const initData = req.headers.get("x-telegram-init-data") ?? "";
  if (!initData || !TOKEN) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const encoder = new TextEncoder();
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

    const authDate = Number(params.get("auth_date"));
    const now = Math.floor(Date.now() / 1000);
    if (!authDate || now - authDate > 86400 || authDate > now + 60) return null;

    const userStr = params.get("user");
    if (!userStr) return null;
    const user = JSON.parse(userStr);
    if (!user?.id) return null;

    return user;
  } catch {
    return null;
  }
}

async function getOrCreateProfile(tgUser: {
  id: number;
  first_name?: string;
  username?: string;
  last_name?: string;
  photo_url?: string;
}) {
  const { error: upsertError } = await db.from("profiles").upsert({
    user_id: tgUser.id,
    username: tgUser.username ?? null,
    first_name: tgUser.first_name ?? null,
    last_name: tgUser.last_name ?? null,
    photo_url: tgUser.photo_url ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (upsertError) return null;

  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", tgUser.id)
    .single();

  if (error) return null;
  return data;
}

function isAdmin(userId: number) {
  return userId === ADMIN_TG;
}

async function getSubscription(userId: number) {
  const { data, error } = await db
    .from("subscriptions")
    .select("user_id, is_active, lifetime, subscription_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const active = Boolean(
    data.lifetime ||
    (data.is_active && data.subscription_end && new Date(data.subscription_end) > new Date()),
  );

  if (!active && data.is_active) {
    await db.from("subscriptions")
      .update({ is_active: false })
      .eq("user_id", userId);
  }

  return active
    ? { active: true, lifetime: Boolean(data.lifetime), end: data.subscription_end ?? null }
    : null;
}

async function tg(method: string, body: unknown) {
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description ?? "Telegram API error");
  return data.result;
}

async function saveAvatar(userId: number, dataUrl: string): Promise<string | null> {
  try {
    const [meta, base64] = dataUrl.split(",");
    const mime = meta.match(/:(.*?);/)?.[1] ?? "image/jpeg";
    const ext = mime.split("/")[1] ?? "jpg";
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const path = `avatars/${userId}.${ext}`;

    const { error } = await db.storage.from("avatars").upload(path, bytes, {
      contentType: mime,
      upsert: true,
    });
    if (error) return null;

    const { data } = db.storage.from("avatars").getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  const url = new URL(req.url);
  const method = req.method;
  const parts = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  const p0 = parts[0] ?? "";
  const p1 = parts[1] ?? "";
  const p2 = parts[2] ?? "";

  const tgUser = await authUser(req);
  if (!tgUser) return err("Unauthorized â€” open from Telegram", 401);

  const profile = await getOrCreateProfile(tgUser);
  if (!profile) return err("Profile error", 500);

  const uid = Number(profile.user_id);
  const admin = isAdmin(uid);

  if (profile.is_banned && !admin) {
    return err("Your account has been banned.", 403);
  }

  // GET /me
  if (p0 === "me" && method === "GET") {
    const subscription = await getSubscription(uid);
    return json({
      id: uid,
      first_name: profile.first_name,
      username: profile.username,
      bio: profile.bio ?? "",
      avatar_url: profile.avatar_url ?? profile.photo_url ?? null,
      is_admin: admin,
      subscription,
    });
  }

  // GET /messages â€” all messages belonging to this user's conversation.
  if (p0 === "messages" && method === "GET" && !p1) {
    if (!admin && !(await getSubscription(uid))) return err("Premium required", 403);

    const { data, error } = await db
      .from("messages")
      .select("id, user_id, sender_id, text, created_at, edited_at, deleted_at, seen_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: true });

    if (error) return err(error.message, 500);

    await db.from("messages")
      .update({ seen_at: new Date().toISOString() })
      .eq("user_id", uid)
      .neq("sender_id", uid)
      .is("seen_at", null);

    return json({ messages: data ?? [] });
  }

  // POST /messages â€” user sends message to admin.
  if (p0 === "messages" && method === "POST" && !p1) {
    if (!admin && !(await getSubscription(uid))) return err("Premium required", 403);

    const body = await req.json();
    const text = String(body.text ?? "").trim();
    if (!text) return err("Empty message");
    if (text.length > 4000) return err("Message too long", 400);

    const { error } = await db.from("messages").insert({
      user_id: uid,
      sender_id: uid,
      text,
    });
    if (error) return err(error.message, 500);

    await tg("sendMessage", {
      chat_id: ADMIN_TG,
      text: `ðŸ’¬ New message from ${profile.first_name ?? uid} (${uid}):\n${text}`,
    });

    return json({ ok: true });
  }

  // PATCH /messages/:id â€” edit own message.
  if (p0 === "messages" && p1 && !p2 && method === "PATCH") {
    const msgId = Number(p1);
    if (!Number.isInteger(msgId)) return err("Invalid message id");

    const body = await req.json();
    const text = String(body.text ?? "").trim();
    if (!text) return err("Empty text");

    const { data: msg } = await db.from("messages")
      .select("id, user_id, sender_id, text, created_at, deleted_at")
      .eq("id", msgId)
      .single();

    if (!msg) return err("Message not found", 404);
    if (msg.user_id !== uid || msg.sender_id !== uid) return err("Not your message", 403);
    if (msg.deleted_at) return err("Message already deleted");
    if (Date.now() - new Date(msg.created_at).getTime() > 48 * 60 * 60 * 1000) {
      return err("Edit window expired (48h)");
    }

    const { error } = await db.from("messages").update({
      text,
      edited_at: new Date().toISOString(),
    }).eq("id", msgId).eq("user_id", uid);
    if (error) return err(error.message, 500);

    return json({ ok: true });
  }

  // POST /messages/:id/unsend â€” delete for everyone.
  if (p0 === "messages" && p1 && p2 === "unsend" && method === "POST") {
    const msgId = Number(p1);
    const { data: msg } = await db.from("messages")
      .select("id, user_id, sender_id, deleted_at")
      .eq("id", msgId)
      .single();

    if (!msg) return err("Not found", 404);
    if (msg.user_id !== uid || msg.sender_id !== uid) return err("Not your message", 403);
    if (msg.deleted_at) return err("Already deleted");

    const { error } = await db.from("messages").update({
      deleted_at: new Date().toISOString(),
      text: "",
    }).eq("id", msgId).eq("user_id", uid);
    if (error) return err(error.message, 500);

    return json({ ok: true });
  }

  // DELETE /messages/:id â€” soft delete. Existing schema has one deleted_at field,
  // so this remains a conversation-wide soft delete rather than per-user delete.
  if (p0 === "messages" && p1 && !p2 && method === "DELETE") {
    const msgId = Number(p1);
    const { data: msg } = await db.from("messages")
      .select("id, user_id, sender_id, deleted_at")
      .eq("id", msgId)
      .single();

    if (!msg) return err("Not found", 404);
    if (msg.user_id !== uid) return err("Not your message", 403);

    const { error } = await db.from("messages").update({
      deleted_at: new Date().toISOString(),
      text: "",
    }).eq("id", msgId).eq("user_id", uid);
    if (error) return err(error.message, 500);

    return json({ ok: true });
  }

  // PATCH /profile
  if (p0 === "profile" && method === "PATCH") {
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.first_name === "string") {
      updates.first_name = body.first_name.trim().slice(0, 64) || profile.first_name;
    }
    if (typeof body.bio === "string") updates.bio = body.bio.trim().slice(0, 160);
    if (typeof body.username === "string") {
      const uname = body.username.trim().replace(/^@/, "").slice(0, 32);
      if (uname) {
        const { data: clash } = await db.from("profiles")
          .select("user_id")
          .eq("username", uname)
          .neq("user_id", uid)
          .maybeSingle();
        if (clash) return err("Username already taken");
      }
      updates.username = uname || null;
    }

    if (typeof body.avatar_data_url === "string" && body.avatar_data_url.startsWith("data:image")) {
      const avatarUrl = await saveAvatar(uid, body.avatar_data_url);
      if (avatarUrl) updates.avatar_url = avatarUrl;
    }

    const { error } = await db.from("profiles").update(updates).eq("user_id", uid);
    if (error) return err(error.message, 500);

    return json({ ok: true });
  }

  // POST /create-invoice â€” 199 Telegram Stars, 30 days.
  if (p0 === "create-invoice" && method === "POST") {
    if (admin) return err("Admin does not need Premium", 400);

    const response = await fetch(`https://api.telegram.org/bot${TOKEN}/createInvoiceLink`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Sanya Premium",
        description: "30-day premium access to private messaging.",
        payload: `premium_${uid}_${Date.now()}`,
        currency: "XTR",
        prices: [{ label: "Premium", amount: 199 }],
      }),
    });
    const data = await response.json();
    if (!data.ok) return err(data.description ?? "Invoice error", 500);
    return json({ invoice_url: data.result });
  }

  // All routes below require the real backend admin identity.
  if (!admin) return err("Forbidden", 403);

  // GET /conversations
  if (p0 === "conversations" && method === "GET") {
    const { data: rows, error } = await db.from("messages")
      .select("user_id, sender_id, text, created_at, seen_at, deleted_at")
      .neq("user_id", ADMIN_TG)
      .order("created_at", { ascending: false });

    if (error) return err(error.message, 500);

    const map = new Map<number, {
      user_id: number;
      last_message: string;
      last_message_at: string;
      unread_count: number;
    }>();

    for (const row of rows ?? []) {
      const otherId = Number(row.user_id);
      if (!otherId) continue;
      if (!map.has(otherId)) {
        map.set(otherId, {
          user_id: otherId,
          last_message: row.deleted_at ? "ðŸš« Deleted" : (row.text || ""),
          last_message_at: row.created_at,
          unread_count: 0,
        });
      }
      if (Number(row.sender_id) === otherId && !row.seen_at && !row.deleted_at) {
        map.get(otherId)!.unread_count++;
      }
    }

    const userIds = [...map.keys()];
    const { data: profiles } = userIds.length
      ? await db.from("profiles").select("user_id, first_name, username, avatar_url, photo_url, is_banned").in("user_id", userIds)
      : { data: [] };
    const { data: subs } = userIds.length
      ? await db.from("subscriptions").select("user_id, is_active, lifetime, subscription_end").in("user_id", userIds)
      : { data: [] };

    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [Number(p.user_id), p]));
    const now = new Date();
    const subMap = Object.fromEntries((subs ?? []).filter((s) =>
      s.lifetime || (s.is_active && s.subscription_end && new Date(s.subscription_end) > now)
    ).map((s) => [Number(s.user_id), s]));

    const conversations = [...map.values()].map((c) => ({
      ...c,
      first_name: profileMap[c.user_id]?.first_name ?? null,
      username: profileMap[c.user_id]?.username ?? null,
      avatar_url: profileMap[c.user_id]?.avatar_url ?? profileMap[c.user_id]?.photo_url ?? null,
      is_banned: Boolean(profileMap[c.user_id]?.is_banned),
      is_premium: Boolean(subMap[c.user_id]),
    }));

    return json({ conversations });
  }

  // GET /admin-messages?user_id=xxx
  if (p0 === "admin-messages" && method === "GET") {
    const targetId = Number(url.searchParams.get("user_id"));
    if (!targetId) return err("user_id required");

    const { data, error } = await db.from("messages")
      .select("id, user_id, sender_id, text, created_at, edited_at, deleted_at, seen_at")
      .eq("user_id", targetId)
      .order("created_at", { ascending: true });

    if (error) return err(error.message, 500);

    await db.from("messages")
      .update({ seen_at: new Date().toISOString() })
      .eq("user_id", targetId)
      .neq("sender_id", uid)
      .is("seen_at", null);

    return json({ messages: data ?? [] });
  }

  // POST /admin-messages
  if (p0 === "admin-messages" && method === "POST") {
    const body = await req.json();
    const text = String(body.text ?? "").trim();
    const targetId = Number(body.user_id);
    if (!text || !targetId) return err("text and user_id required");

    const { error } = await db.from("messages").insert({
      user_id: targetId,
      sender_id: uid,
      text,
    });
    if (error) return err(error.message, 500);

    try {
      await tg("sendMessage", { chat_id: targetId, text: `ðŸ’Œ Sanya: ${text}` });
    } catch {
      // Database message is already stored; Telegram push failure should not erase it.
    }

    return json({ ok: true });
  }

  // DELETE /admin-messages/:id
  if (p0 === "admin-messages" && p1 && method === "DELETE") {
    const msgId = Number(p1);
    const { error } = await db.from("messages").update({
      deleted_at: new Date().toISOString(),
      text: "",
    }).eq("id", msgId);
    if (error) return err(error.message, 500);

    await db.from("admin_actions").insert({
      admin_id: uid,
      target_id: null,
      action: "delete_message",
      details: { message_id: msgId },
    });

    return json({ ok: true });
  }

  // GET /admin-users
  if (p0 === "admin-users" && method === "GET") {
    const { data: profiles, error } = await db.from("profiles")
      .select("user_id, first_name, last_name, username, avatar_url, photo_url, is_banned, created_at, updated_at")
      .neq("user_id", ADMIN_TG)
      .order("created_at", { ascending: false });

    if (error) return err(error.message, 500);

    const ids = (profiles ?? []).map((p) => Number(p.user_id));
    const { data: subs } = ids.length
      ? await db.from("subscriptions").select("user_id, is_active, lifetime, subscription_end").in("user_id", ids)
      : { data: [] };
    const now = new Date();
    const subMap = Object.fromEntries((subs ?? []).filter((s) =>
      s.lifetime || (s.is_active && s.subscription_end && new Date(s.subscription_end) > now)
    ).map((s) => [Number(s.user_id), s]));

    const users = (profiles ?? []).map((p) => ({
      ...p,
      id: Number(p.user_id),
      subscription: subMap[Number(p.user_id)]
        ? { active: true, lifetime: Boolean(subMap[Number(p.user_id)].lifetime) }
        : null,
    }));

    return json({ users });
  }

  // GET /admin-stats
  if (p0 === "admin-stats" && method === "GET") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      { count: total_users },
      { data: subs },
      { count: total_messages },
      { count: banned_users },
      { count: active_today },
      { data: rev },
    ] = await Promise.all([
      db.from("profiles").select("*", { count: "exact", head: true }).neq("user_id", ADMIN_TG),
      db.from("subscriptions").select("user_id, is_active, lifetime, subscription_end"),
      db.from("messages").select("*", { count: "exact", head: true }).is("deleted_at", null),
      db.from("profiles").select("*", { count: "exact", head: true }).eq("is_banned", true).neq("user_id", ADMIN_TG),
      db.from("profiles").select("*", { count: "exact", head: true }).gte("updated_at", since).neq("user_id", ADMIN_TG),
      db.from("payments").select("amount").gte("created_at", today.toISOString()),
    ]);

    const now = new Date();
    const premium_users = (subs ?? []).filter((s) =>
      s.lifetime || (s.is_active && s.subscription_end && new Date(s.subscription_end) > now)
    ).length;
    const revenue_stars = (rev ?? []).reduce((sum: number, row: { amount: number }) => sum + Number(row.amount ?? 0), 0);

    return json({
      total_users: total_users ?? 0,
      premium_users,
      total_messages: total_messages ?? 0,
      banned_users: banned_users ?? 0,
      active_today: active_today ?? 0,
      revenue_stars,
    });
  }

  // POST /admin-grant â€” lifetime Premium.
  if (p0 === "admin-grant" && method === "POST") {
    const body = await req.json();
    const targetId = Number(body.user_id);
    if (!targetId) return err("user_id required");

    const now = new Date().toISOString();
    const { error } = await db.from("subscriptions").upsert({
      user_id: targetId,
      subscription_start: now,
      subscription_end: new Date("2099-01-01T00:00:00.000Z").toISOString(),
      lifetime: true,
      is_active: true,
      updated_at: now,
    }, { onConflict: "user_id" });
    if (error) return err(error.message, 500);

    await db.from("admin_actions").insert({
      admin_id: uid,
      target_id: targetId,
      action: "grant_premium",
    });

    try { await tg("sendMessage", { chat_id: targetId, text: "âœ¨ You've been gifted Lifetime Premium by Sanya!" }); } catch {}
    return json({ ok: true });
  }

  // POST /admin-ban
  if (p0 === "admin-ban" && method === "POST") {
    const body = await req.json();
    const targetId = Number(body.user_id);
    if (!targetId || targetId === ADMIN_TG) return err("Invalid user_id");

    const { error } = await db.from("profiles").update({ is_banned: true }).eq("user_id", targetId);
    if (error) return err(error.message, 500);

    await db.from("admin_actions").insert({ admin_id: uid, target_id: targetId, action: "ban" });
    try { await tg("sendMessage", { chat_id: targetId, text: "ðŸš« Your account has been suspended." }); } catch {}
    return json({ ok: true });
  }

  // POST /admin-unban
  if (p0 === "admin-unban" && method === "POST") {
    const body = await req.json();
    const targetId = Number(body.user_id);
    if (!targetId || targetId === ADMIN_TG) return err("Invalid user_id");

    const { error } = await db.from("profiles").update({ is_banned: false }).eq("user_id", targetId);
    if (error) return err(error.message, 500);

    await db.from("admin_actions").insert({ admin_id: uid, target_id: targetId, action: "unban" });
    try { await tg("sendMessage", { chat_id: targetId, text: "âœ… Your account has been reinstated." }); } catch {}
    return json({ ok: true });
  }

  return err("Not found", 404);
});
