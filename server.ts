import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = "0.0.0.0";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ADMIN_TG = Number(process.env.TELEGRAM_ADMIN_ID || "10001");

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, "frontend")));

/* ══════════════════════════════════════
   IN-MEMORY DATABASE STORE
   ══════════════════════════════════════ */

interface Profile {
  user_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  photo_url: string | null;
  is_banned: boolean;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: number;
  user_id: number;
  sender_id: number;
  text: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  seen_at: string | null;
}

interface Subscription {
  user_id: number;
  is_active: boolean;
  lifetime: boolean;
  subscription_start: string | null;
  subscription_end: string | null;
}

interface Payment {
  id: number;
  user_id: number;
  amount: number;
  created_at: string;
}

interface AdminAction {
  id: number;
  admin_id: number;
  target_id: number | null;
  action: string;
  details?: any;
  created_at: string;
}

// Seed Initial Data for Preview & Testing
const profilesStore = new Map<number, Profile>();
const messagesStore: Message[] = [];
const subscriptionsStore = new Map<number, Subscription>();
const paymentsStore: Payment[] = [];
const adminActionsStore: AdminAction[] = [];

let nextMessageId = 1;

// Helper to initialize stores (no dummy messages/users)
function seedInitialData() {
  const now = new Date().toISOString();

  // Admin / Default Owner Profile
  profilesStore.set(10001, {
    user_id: 10001,
    first_name: "Sanya Chouhan",
    last_name: "",
    username: "sanyachouhaan_bot",
    bio: "Private messaging inside Telegram.",
    avatar_url: null,
    photo_url: null,
    is_banned: false,
    created_at: now,
    updated_at: now,
  });
  subscriptionsStore.set(10001, {
    user_id: 10001,
    is_active: true,
    lifetime: true,
    subscription_start: now,
    subscription_end: "2099-01-01T00:00:00.000Z",
  });
}

seedInitialData();

/* ══════════════════════════════════════
   AUTHENTICATION HELPER
   ══════════════════════════════════════ */

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

function parseTelegramInitData(initData: string): TelegramUser | null {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    const userStr = params.get("user");
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user && user.id) {
        return {
          id: Number(user.id),
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          photo_url: user.photo_url,
        };
      }
    }
  } catch (e) {
    console.error("InitData parse error:", e);
  }
  return null;
}

function getAuthUser(req: Request): TelegramUser {
  const initData = req.headers["x-telegram-init-data"] as string || "";
  const parsed = parseTelegramInitData(initData);

  if (parsed) {
    return parsed;
  }

  // Fallback for AI Studio preview / non-Telegram browser environments
  // Default to Demo Admin User (10001) so all features and Admin Panel work immediately
  return {
    id: 10001,
    first_name: "Sanya Chouhan",
    last_name: "",
    username: "sanyachouhaan_bot",
  };
}

function getOrCreateProfile(tgUser: TelegramUser): Profile {
  let profile = profilesStore.get(tgUser.id);
  const now = new Date().toISOString();

  if (!profile) {
    profile = {
      user_id: tgUser.id,
      first_name: tgUser.first_name || null,
      last_name: tgUser.last_name || null,
      username: tgUser.username || null,
      bio: null,
      avatar_url: tgUser.photo_url || null,
      photo_url: tgUser.photo_url || null,
      is_banned: false,
      created_at: now,
      updated_at: now,
    };
    profilesStore.set(tgUser.id, profile);
  } else {
    profile.updated_at = now;
  }

  return profile;
}

function getSubscription(userId: number): { active: boolean; lifetime: boolean; start: string | null; end: string | null } | null {
  const sub = subscriptionsStore.get(userId);
  if (!sub) return null;

  const now = new Date();
  const active = Boolean(
    sub.lifetime || (sub.is_active && sub.subscription_end && new Date(sub.subscription_end) > now)
  );

  if (!active && sub.is_active) {
    sub.is_active = false;
  }

  if (!active) return null;

  return {
    active: true,
    lifetime: Boolean(sub.lifetime),
    start: sub.subscription_start,
    end: sub.subscription_end,
  };
}

/* ══════════════════════════════════════
   API ROUTES (supports both /api/* and /*)
   ══════════════════════════════════════ */

const router = express.Router();

// GET /me
router.get("/me", (req: Request, res: Response) => {
  const tgUser = getAuthUser(req);
  const profile = getOrCreateProfile(tgUser);
  const isAdmin = tgUser.id === ADMIN_TG || profile.user_id === 10001;
  const subscription = getSubscription(profile.user_id);

  return res.json({
    id: profile.user_id,
    first_name: profile.first_name || tgUser.first_name || null,
    last_name: profile.last_name || tgUser.last_name || null,
    username: profile.username || tgUser.username || null,
    bio: profile.bio || "",
    avatar_url: profile.avatar_url || profile.photo_url || tgUser.photo_url || null,
    is_admin: isAdmin,
    subscription,
  });
});

// GET /messages
router.get("/messages", (req: Request, res: Response) => {
  const tgUser = getAuthUser(req);
  const profile = getOrCreateProfile(tgUser);
  const isAdmin = tgUser.id === ADMIN_TG || profile.user_id === 10001;
  const uid = profile.user_id;

  if (!isAdmin && !getSubscription(uid)) {
    return res.status(403).json({ error: "Premium required" });
  }

  const userMsgs = messagesStore.filter(m => m.user_id === uid);
  const now = new Date().toISOString();

  // Mark unseen admin messages as seen
  userMsgs.forEach(m => {
    if (m.sender_id !== uid && !m.seen_at) {
      m.seen_at = now;
    }
  });

  return res.json({ messages: userMsgs });
});

// POST /messages
router.post("/messages", (req: Request, res: Response) => {
  const tgUser = getAuthUser(req);
  const profile = getOrCreateProfile(tgUser);
  const isAdmin = tgUser.id === ADMIN_TG || profile.user_id === 10001;
  const uid = profile.user_id;

  if (!isAdmin && !getSubscription(uid)) {
    return res.status(403).json({ error: "Premium required" });
  }

  const text = String(req.body?.text || "").trim();
  if (!text) {
    return res.status(400).json({ error: "Empty message" });
  }
  if (text.length > 4000) {
    return res.status(400).json({ error: "Message too long" });
  }

  const newMsg: Message = {
    id: nextMessageId++,
    user_id: uid,
    sender_id: uid,
    text,
    created_at: new Date().toISOString(),
    edited_at: null,
    deleted_at: null,
    seen_at: null,
  };

  messagesStore.push(newMsg);
  return res.json({ ok: true });
});

// PATCH /messages/:id
router.patch("/messages/:id", (req: Request, res: Response) => {
  const tgUser = getAuthUser(req);
  const profile = getOrCreateProfile(tgUser);
  const isAdmin = tgUser.id === ADMIN_TG || profile.user_id === 10001;
  const uid = profile.user_id;

  if (!isAdmin && !getSubscription(uid)) {
    return res.status(403).json({ error: "Premium required" });
  }

  const msgId = Number(req.params.id);
  const text = String(req.body?.text || "").trim();

  if (!text) return res.status(400).json({ error: "Empty text" });
  if (text.length > 4000) return res.status(400).json({ error: "Message too long" });

  const msg = messagesStore.find(m => m.id === msgId);
  if (!msg) return res.status(404).json({ error: "Message not found" });

  if (!isAdmin && (msg.user_id !== uid || msg.sender_id !== uid)) {
    return res.status(403).json({ error: "Not your message" });
  }

  if (msg.deleted_at) {
    return res.status(400).json({ error: "Message already deleted" });
  }

  msg.text = text;
  msg.edited_at = new Date().toISOString();

  return res.json({ ok: true });
});

// POST /messages/:id/unsend
router.post("/messages/:id/unsend", (req: Request, res: Response) => {
  const tgUser = getAuthUser(req);
  const profile = getOrCreateProfile(tgUser);
  const isAdmin = tgUser.id === ADMIN_TG || profile.user_id === 10001;
  const uid = profile.user_id;

  if (!isAdmin && !getSubscription(uid)) {
    return res.status(403).json({ error: "Premium required" });
  }

  const msgId = Number(req.params.id);
  const msg = messagesStore.find(m => m.id === msgId);
  if (!msg) return res.status(404).json({ error: "Message not found" });

  if (!isAdmin && (msg.user_id !== uid || msg.sender_id !== uid)) {
    return res.status(403).json({ error: "Not your message" });
  }

  if (msg.deleted_at) {
    return res.status(400).json({ error: "Message already deleted" });
  }

  msg.deleted_at = new Date().toISOString();
  msg.text = "";

  return res.json({ ok: true });
});

// DELETE /messages/:id
router.delete("/messages/:id", (req: Request, res: Response) => {
  const tgUser = getAuthUser(req);
  const profile = getOrCreateProfile(tgUser);
  const isAdmin = tgUser.id === ADMIN_TG || profile.user_id === 10001;
  const uid = profile.user_id;

  if (!isAdmin && !getSubscription(uid)) {
    return res.status(403).json({ error: "Premium required" });
  }

  const msgId = Number(req.params.id);
  const msg = messagesStore.find(m => m.id === msgId);
  if (!msg) return res.status(404).json({ error: "Message not found" });

  if (!isAdmin && msg.user_id !== uid) {
    return res.status(403).json({ error: "Not your message" });
  }

  msg.deleted_at = new Date().toISOString();
  msg.text = "";

  return res.json({ ok: true });
});

// PATCH /profile
router.patch("/profile", (req: Request, res: Response) => {
  const tgUser = getAuthUser(req);
  const profile = getOrCreateProfile(tgUser);

  if (typeof req.body?.first_name === "string") {
    profile.first_name = req.body.first_name.trim().slice(0, 64) || profile.first_name;
  }
  if (typeof req.body?.bio === "string") {
    profile.bio = req.body.bio.trim().slice(0, 160);
  }
  if (typeof req.body?.username === "string") {
    profile.username = req.body.username.trim().replace(/^@/, "").slice(0, 32) || null;
  }
  if (typeof req.body?.avatar_data_url === "string") {
    profile.avatar_url = req.body.avatar_data_url;
  }

  profile.updated_at = new Date().toISOString();
  return res.json({ ok: true });
});

// POST/GET /create-invoice
router.all("/create-invoice", (req: Request, res: Response) => {
  const tgUser = getAuthUser(req);
  const profile = getOrCreateProfile(tgUser);
  const uid = profile.user_id;

  // Simulate premium activation in dev mode
  const now = new Date();
  subscriptionsStore.set(uid, {
    user_id: uid,
    is_active: true,
    lifetime: false,
    subscription_start: now.toISOString(),
    subscription_end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  paymentsStore.push({
    id: paymentsStore.length + 1,
    user_id: uid,
    amount: 199,
    created_at: now.toISOString(),
  });

  return res.json({
    invoice_url: "#paid",
    ok: true,
  });
});

/* ══════════════════════════════════════
   ADMIN ROUTES
   ══════════════════════════════════════ */

function checkAdmin(req: Request, res: Response): boolean {
  const tgUser = getAuthUser(req);
  const profile = getOrCreateProfile(tgUser);
  const isAdmin = tgUser.id === ADMIN_TG || profile.user_id === 10001;

  if (!isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// GET /conversations
router.get("/conversations", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const convMap = new Map<number, {
    user_id: number;
    last_message: string;
    last_message_at: string;
    unread_count: number;
  }>();

  // Sort messages descending
  const sortedMsgs = [...messagesStore].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  for (const m of sortedMsgs) {
    if (m.user_id === 10001) continue;
    if (!convMap.has(m.user_id)) {
      convMap.set(m.user_id, {
        user_id: m.user_id,
        last_message: m.deleted_at ? "🚫 Deleted" : (m.text || ""),
        last_message_at: m.created_at,
        unread_count: 0,
      });
    }
  }

  // Count unread messages
  for (const m of messagesStore) {
    if (m.user_id !== 10001 && m.sender_id === m.user_id && !m.seen_at && !m.deleted_at) {
      const conv = convMap.get(m.user_id);
      if (conv) conv.unread_count++;
    }
  }

  const conversations = Array.from(convMap.values()).map(c => {
    const p = profilesStore.get(c.user_id);
    const sub = getSubscription(c.user_id);
    return {
      ...c,
      first_name: p?.first_name || null,
      username: p?.username || null,
      avatar_url: p?.avatar_url || p?.photo_url || null,
      is_banned: Boolean(p?.is_banned),
      is_premium: Boolean(sub?.active),
    };
  });

  return res.json({ conversations });
});

// GET /admin-messages
router.get("/admin-messages", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const targetId = Number(req.query.user_id);
  if (!targetId) return res.status(400).json({ error: "user_id required" });

  const msgs = messagesStore.filter(m => m.user_id === targetId);
  const now = new Date().toISOString();

  // Mark as seen by admin
  msgs.forEach(m => {
    if (m.sender_id !== 10001 && !m.seen_at) {
      m.seen_at = now;
    }
  });

  return res.json({ messages: msgs });
});

// POST /admin-messages
router.post("/admin-messages", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const text = String(req.body?.text || "").trim();
  const targetId = Number(req.body?.user_id);

  if (!text || !targetId) {
    return res.status(400).json({ error: "text and user_id required" });
  }
  if (text.length > 4000) {
    return res.status(400).json({ error: "Message too long" });
  }

  const newMsg: Message = {
    id: nextMessageId++,
    user_id: targetId,
    sender_id: 10001,
    text,
    created_at: new Date().toISOString(),
    edited_at: null,
    deleted_at: null,
    seen_at: null,
  };

  messagesStore.push(newMsg);
  return res.json({ ok: true });
});

// DELETE /admin-messages/:id
router.delete("/admin-messages/:id", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const msgId = Number(req.params.id);
  const msg = messagesStore.find(m => m.id === msgId);
  if (!msg) return res.status(404).json({ error: "Message not found" });

  msg.deleted_at = new Date().toISOString();
  msg.text = "";

  adminActionsStore.push({
    id: adminActionsStore.length + 1,
    admin_id: 10001,
    target_id: msg.user_id,
    action: "delete_message",
    details: { message_id: msgId },
    created_at: new Date().toISOString(),
  });

  return res.json({ ok: true });
});

// GET /admin-users
router.get("/admin-users", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const users = Array.from(profilesStore.values())
    .filter(p => p.user_id !== 10001)
    .map(p => {
      const sub = getSubscription(p.user_id);
      return {
        ...p,
        id: p.user_id,
        subscription: sub ? { active: true, lifetime: sub.lifetime, end: sub.end } : null,
      };
    });

  return res.json({ users });
});

// GET /admin-stats
router.get("/admin-stats", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const usersList = Array.from(profilesStore.values()).filter(p => p.user_id !== 10001);
  const total_users = usersList.length;
  const premium_users = usersList.filter(p => getSubscription(p.user_id)?.active).length;
  const banned_users = usersList.filter(p => p.is_banned).length;
  const total_messages = messagesStore.filter(m => !m.deleted_at).length;
  const active_today = usersList.length;
  const revenue_stars = paymentsStore.reduce((sum, p) => sum + p.amount, 0);

  return res.json({
    total_users,
    premium_users,
    total_messages,
    banned_users,
    active_today,
    revenue_stars,
  });
});

// POST /admin-grant
router.post("/admin-grant", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const targetId = Number(req.body?.user_id);
  if (!targetId || targetId === 10001) {
    return res.status(400).json({ error: "Invalid user_id" });
  }

  const now = new Date().toISOString();
  subscriptionsStore.set(targetId, {
    user_id: targetId,
    subscription_start: now,
    subscription_end: "2099-01-01T00:00:00.000Z",
    lifetime: true,
    is_active: true,
  });

  adminActionsStore.push({
    id: adminActionsStore.length + 1,
    admin_id: 10001,
    target_id: targetId,
    action: "grant_premium",
    created_at: now,
  });

  return res.json({ ok: true });
});

// POST /admin-ban
router.post("/admin-ban", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const targetId = Number(req.body?.user_id);
  if (!targetId || targetId === 10001) {
    return res.status(400).json({ error: "Invalid user_id" });
  }

  const p = profilesStore.get(targetId);
  if (p) {
    p.is_banned = true;
  }

  adminActionsStore.push({
    id: adminActionsStore.length + 1,
    admin_id: 10001,
    target_id: targetId,
    action: "ban",
    created_at: new Date().toISOString(),
  });

  return res.json({ ok: true });
});

// POST /admin-unban
router.post("/admin-unban", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const targetId = Number(req.body?.user_id);
  if (!targetId || targetId === 10001) {
    return res.status(400).json({ error: "Invalid user_id" });
  }

  const p = profilesStore.get(targetId);
  if (p) {
    p.is_banned = false;
  }

  adminActionsStore.push({
    id: adminActionsStore.length + 1,
    admin_id: 10001,
    target_id: targetId,
    action: "unban",
    created_at: new Date().toISOString(),
  });

  return res.json({ ok: true });
});

// Mount router on both `/api` and `/`
app.use("/api", router);
app.use("/", router);

// Fallback to static index.html for unknown routes
app.get("*", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`[AI Studio] Sanya Messenger server listening on http://${HOST}:${PORT}`);
});
