// supabase/functions/api/index.ts
// Sanya Messenger API
// Existing Supabase schema:
// profiles
// messages
// subscriptions
// payments
// admin_actions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ══════════════════════════════════════
   ENVIRONMENT / SECRETS
   ══════════════════════════════════════ */

const TOKEN =
  Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

const ADMIN_TG =
  Number(
    Deno.env.get("TELEGRAM_ADMIN_ID") ?? "0"
  );

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? "";

const SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const db = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
);

/* ══════════════════════════════════════
   RESPONSE HELPERS
   ══════════════════════════════════════ */

function corsHeaders() {
  return {
    "content-type":
      "application/json; charset=utf-8",

    "access-control-allow-origin":
      "*",

    "access-control-allow-headers":
      "content-type, x-telegram-init-data",

    "access-control-allow-methods":
      "GET, POST, PATCH, DELETE, OPTIONS",

    "access-control-max-age":
      "86400",
  };
}

function json(
  data: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: corsHeaders(),
    },
  );
}

function err(
  msg: string,
  status = 400,
) {
  return json(
    {
      error: msg,
    },
    status,
  );
}

/* ══════════════════════════════════════
   TELEGRAM INIT DATA AUTHENTICATION
   ══════════════════════════════════════ */

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

async function authUser(
  req: Request,
): Promise<TelegramUser | null> {

  const initData =
    req.headers.get(
      "x-telegram-init-data",
    ) ?? "";

  if (!initData) {
    return null;
  }

  if (!TOKEN) {
    console.error(
      "TELEGRAM_BOT_TOKEN is missing",
    );

    return null;
  }

  try {

    const params =
      new URLSearchParams(
        initData,
      );

    const hash =
      params.get("hash");

    if (!hash) {
      return null;
    }

    params.delete("hash");

    /*
      Telegram data-check string:
      sorted key=value pairs joined by newline.
    */

    const dataCheckString =
      [...params.entries()]
        .sort(
          ([a], [b]) =>
            a.localeCompare(b),
        )
        .map(
          ([key, value]) =>
            `${key}=${value}`,
        )
        .join("\n");

    const encoder =
      new TextEncoder();

    /*
      Telegram Mini App secret key:
      HMAC-SHA256(
        key = "WebAppData",
        message = bot token
      )
    */

    const secretKey =
      await crypto.subtle.importKey(
        "raw",
        encoder.encode(
          "WebAppData",
        ),
        {
          name: "HMAC",
          hash: "SHA-256",
        },
        false,
        ["sign"],
      );

    const keyBytes =
      await crypto.subtle.sign(
        "HMAC",
        secretKey,
        encoder.encode(
          TOKEN,
        ),
      );

    /*
      HMAC the data-check string
      with the derived secret.
    */

    const msgKey =
      await crypto.subtle.importKey(
        "raw",
        keyBytes,
        {
          name: "HMAC",
          hash: "SHA-256",
        },
        false,
        ["sign"],
      );

    const signature =
      await crypto.subtle.sign(
        "HMAC",
        msgKey,
        encoder.encode(
          dataCheckString,
        ),
      );

    const calculatedHash =
      [...new Uint8Array(signature)]
        .map(
          byte =>
            byte
              .toString(16)
              .padStart(2, "0"),
        )
        .join("");

    /*
      Hash comparison.
    */

    if (
      calculatedHash.toLowerCase() !==
      hash.toLowerCase()
    ) {
      console.error(
        "Telegram initData hash mismatch",
      );

      return null;
    }

    /*
      auth_date validation.
      Reject data older than 24 hours.
      Also reject timestamps more than
      60 seconds in the future.
    */

    const authDate =
      Number(
        params.get(
          "auth_date",
        ),
      );

    const now =
      Math.floor(
        Date.now() / 1000,
      );

    if (
      !authDate ||
      now - authDate > 86400 ||
      authDate > now + 60
    ) {
      console.error(
        "Telegram initData expired",
      );

      return null;
    }

    /*
      Extract Telegram user.
    */

    const userStr =
      params.get("user");

    if (!userStr) {
      return null;
    }

    const user =
      JSON.parse(userStr);

    if (
      !user ||
      !user.id
    ) {
      return null;
    }

    return {
      id: Number(user.id),
      first_name:
        user.first_name,
      last_name:
        user.last_name,
      username:
        user.username,
      photo_url:
        user.photo_url,
    };

  } catch (error) {

    console.error(
      "Telegram auth error:",
      error instanceof Error
        ? error.message
        : "unknown",
    );

    return null;
  }
}

/* ══════════════════════════════════════
   PROFILE
   ══════════════════════════════════════ */

async function getOrCreateProfile(
  tgUser: TelegramUser,
) {

  const {
    error: upsertError,
  } = await db
    .from("profiles")
    .upsert(
      {
        user_id:
          tgUser.id,

        username:
          tgUser.username ??
          null,

        first_name:
          tgUser.first_name ??
          null,

        last_name:
          tgUser.last_name ??
          null,

        photo_url:
          tgUser.photo_url ??
          null,

        updated_at:
          new Date().toISOString(),
      },
      {
        onConflict:
          "user_id",
      },
    );

  if (upsertError) {

    console.error(
      "Profile upsert error:",
      upsertError.message,
    );

    return null;
  }

  const {
    data,
    error,
  } = await db
    .from("profiles")
    .select("*")
    .eq(
      "user_id",
      tgUser.id,
    )
    .single();

  if (error) {

    console.error(
      "Profile fetch error:",
      error.message,
    );

    return null;
  }

  return data;
}

/* ══════════════════════════════════════
   ADMIN
   ══════════════════════════════════════ */

function isAdmin(
  userId: number,
) {
  return (
    ADMIN_TG > 0 &&
    userId === ADMIN_TG
  );
}

/* ══════════════════════════════════════
   SUBSCRIPTION
   ══════════════════════════════════════ */

async function getSubscription(
  userId: number,
) {

  const {
    data,
    error,
  } = await db
    .from("subscriptions")
    .select(
      "user_id, is_active, lifetime, subscription_start, subscription_end",
    )
    .eq(
      "user_id",
      userId,
    )
    .maybeSingle();

  if (error) {

    console.error(
      "Subscription error:",
      error.message,
    );

    return null;
  }

  if (!data) {
    return null;
  }

  const now =
    new Date();

  const active =
    Boolean(
      data.lifetime ||
      (
        data.is_active &&
        data.subscription_end &&
        new Date(
          data.subscription_end,
        ) > now
      )
    );

  /*
    Automatically deactivate expired
    subscriptions.
  */

  if (
    !active &&
    data.is_active
  ) {

    await db
      .from("subscriptions")
      .update({
        is_active:
          false,
      })
      .eq(
        "user_id",
        userId,
      );
  }

  if (!active) {
    return null;
  }

  return {
    active: true,

    lifetime:
      Boolean(
        data.lifetime,
      ),

    start:
      data.subscription_start ??
      null,

    end:
      data.subscription_end ??
      null,
  };
}

/* ══════════════════════════════════════
   TELEGRAM BOT API
   ══════════════════════════════════════ */

async function tg(
  method: string,
  body: unknown,
) {

  if (!TOKEN) {
    throw new Error(
      "Telegram bot token is not configured",
    );
  }

  const response =
    await fetch(
      `https://api.telegram.org/bot${TOKEN}/${method}`,
      {
        method: "POST",

        headers: {
          "content-type":
            "application/json",
        },

        body:
          JSON.stringify(body),
      },
    );

  const data =
    await response.json();

  if (!data.ok) {

    throw new Error(
      data.description ??
      "Telegram API error",
    );
  }

  return data.result;
}

/* ══════════════════════════════════════
   AVATAR
   ══════════════════════════════════════ */

async function saveAvatar(
  userId: number,
  dataUrl: string,
): Promise<string | null> {

  try {

    const parts =
      dataUrl.split(",");

    if (
      parts.length !== 2
    ) {
      return null;
    }

    const meta =
      parts[0];

    const base64 =
      parts[1];

    if (
      !meta.startsWith(
        "data:image/",
      )
    ) {
      return null;
    }

    const mime =
      meta.match(
        /:(.*?);/,
      )?.[1] ??
      "image/jpeg";

    const allowed =
      [
        "image/jpeg",
        "image/png",
        "image/webp",
      ];

    if (
      !allowed.includes(
        mime,
      )
    ) {
      return null;
    }

    const ext =
      mime ===
      "image/png"
        ? "png"
        : mime ===
            "image/webp"
          ? "webp"
          : "jpg";

    const bytes =
      Uint8Array.from(
        atob(base64),
        c =>
          c.charCodeAt(0),
      );

    /*
      Basic server-side size protection.
    */

    if (
      bytes.byteLength >
      5 * 1024 * 1024
    ) {
      return null;
    }

    const path =
      `avatars/${userId}.${ext}`;

    const {
      error,
    } = await db.storage
      .from("avatars")
      .upload(
        path,
        bytes,
        {
          contentType:
            mime,

          upsert:
            true,
        },
      );

    if (error) {

      console.error(
        "Avatar upload error:",
        error.message,
      );

      return null;
    }

    const {
      data,
    } = db.storage
      .from("avatars")
      .getPublicUrl(
        path,
      );

    if (!data?.publicUrl) {
      return null;
    }

    return (
      `${data.publicUrl}?t=${Date.now()}`
    );

  } catch (error) {

    console.error(
      "Avatar error:",
      error instanceof Error
        ? error.message
        : "unknown",
    );

    return null;
  }
}

/* ══════════════════════════════════════
   ROUTER
   ══════════════════════════════════════ */

Deno.serve(
  async (
    req: Request,
  ) => {

    /*
      CORS preflight must never require
      Telegram authentication.
    */

    if (
      req.method ===
      "OPTIONS"
    ) {
      return json(
        {
          ok: true,
        },
        200,
      );
    }

    try {

      const url =
        new URL(
          req.url,
        );

      /*
        Supabase can expose the function as:

        /me

        or:

        /api/me

        Support both.
      */

      const rawParts =
        url.pathname
          .replace(
            /^\/+/,
            "",
          )
          .split("/")
          .filter(
            Boolean,
          );

      const parts =
        rawParts[0] ===
        "api"
          ? rawParts.slice(
              1,
            )
          : rawParts;

      const p0 =
        parts[0] ?? "";

      const p1 =
        parts[1] ?? "";

      const p2 =
        parts[2] ?? "";

      const method =
        req.method;

      /* ══════════════════════════════
         AUTHENTICATE TELEGRAM USER
         ══════════════════════════════ */

      const tgUser =
        await authUser(
          req,
        );

      if (!tgUser) {

        return err(
          "Unauthorized — open this Mini App from Telegram.",
          401,
        );
      }

      /* ══════════════════════════════
         GET / CREATE PROFILE
         ══════════════════════════════ */

      const profile =
        await getOrCreateProfile(
          tgUser,
        );

      if (!profile) {

        return err(
          "Profile error",
          500,
        );
      }

      const uid =
        Number(
          profile.user_id,
        );

      const admin =
        isAdmin(uid);

      /*
        Banned users are blocked.
        The real admin is never blocked
        by their own ban flag.
      */

      if (
        profile.is_banned &&
        !admin
      ) {

        return err(
          "Your account has been banned.",
          403,
        );
      }

      /* ══════════════════════════════
         GET /me
         ══════════════════════════════ */

      if (
        p0 === "me" &&
        method === "GET"
      ) {
        const subscription =
          await getSubscription(
            uid,
          );

        let ownerProfile: any = null;
        if (ADMIN_TG > 0) {
          const { data } = await db
            .from("profiles")
            .select("user_id, first_name, last_name, username, bio, avatar_url, photo_url")
            .eq("user_id", ADMIN_TG)
            .maybeSingle();
          ownerProfile = data;
        }

        const meObj = {
          id: uid,
          first_name:
            profile.first_name ??
            tgUser.first_name ??
            null,
          last_name:
            profile.last_name ??
            tgUser.last_name ??
            null,
          username:
            profile.username ??
            tgUser.username ??
            null,
          bio:
            profile.bio ??
            "",
          avatar_url:
            profile.avatar_url ??
            profile.photo_url ??
            tgUser.photo_url ??
            null,
          is_admin:
            admin,
          subscription:
            subscription,
        };

        const ownerObj = {
          id: ADMIN_TG || 0,
          first_name: ownerProfile?.first_name || "Sanya Chouhan",
          username: ownerProfile?.username || "sanyachouhaan_bot",
          bio: ownerProfile?.bio || "Official Telegram Bot for direct 1-on-1 private messaging.",
          avatar_url: ownerProfile?.avatar_url || ownerProfile?.photo_url || null,
        };

        return json(
          {
            ok: true,
            me: meObj,
            owner: ownerObj,
            ...meObj,
          },
        );
      }

      /* ══════════════════════════════
         GET /messages
         ══════════════════════════════ */

      if (
        p0 === "messages" &&
        method === "GET" &&
        !p1
      ) {

        /*
          Admin can access messages
          without Premium.
        */

        if (
          !admin &&
          !(await getSubscription(
            uid,
          ))
        ) {

          return err(
            "Premium required",
            403,
          );
        }

        const {
          data,
          error,
        } = await db
          .from("messages")
          .select(
            "id, user_id, sender_id, text, created_at, edited_at, deleted_at, seen_at",
          )
          .eq(
            "user_id",
            uid,
          )
          .order(
            "created_at",
            {
              ascending:
                true,
            },
          );

        if (error) {

          console.error(
            "Messages fetch error:",
            error.message,
          );

          return err(
            error.message,
            500,
          );
        }

        /*
          Mark admin messages as seen.
        */

        await db
          .from("messages")
          .update({
            seen_at:
              new Date().toISOString(),
          })
          .eq(
            "user_id",
            uid,
          )
          .neq(
            "sender_id",
            uid,
          )
          .is(
            "seen_at",
            null,
          );

        return json(
          {
            messages:
              data ??
              [],
          },
        );
      }

      /* ══════════════════════════════
         POST /messages
         ══════════════════════════════ */

      if (
        p0 === "messages" &&
        method === "POST" &&
        !p1
      ) {

        if (
          !admin &&
          !(await getSubscription(
            uid,
          ))
        ) {

          return err(
            "Premium required",
            403,
          );
        }

        let body: any;

        try {
          body =
            await req.json();
        } catch {
          return err(
            "Invalid JSON body",
            400,
          );
        }

        const text =
          String(
            body?.text ??
            "",
          ).trim();

        if (!text) {

          return err(
            "Empty message",
            400,
          );
        }

        if (
          text.length >
          4000
        ) {

          return err(
            "Message too long",
            400,
          );
        }

        const {
          error,
        } = await db
          .from("messages")
          .insert({
            user_id:
              uid,

            sender_id:
              uid,

            text:
              text,
          });

        if (error) {

          console.error(
            "Message insert error:",
            error.message,
          );

          return err(
            error.message,
            500,
          );
        }

        /*
          Push message to the admin's Telegram.
        */

        try {

          await tg(
            "sendMessage",
            {
              chat_id:
                ADMIN_TG,

              text:
                `💬 New message from ${
                  profile.first_name ??
                  uid
                } (${uid}):\n${text}`,
            },
          );

        } catch (error) {

          /*
            Message is already stored.
            Telegram push failure must not
            delete the database message.
          */

          console.error(
            "Admin Telegram notification failed:",
            error instanceof Error
              ? error.message
              : "unknown",
          );
        }

        return json(
          {
            ok: true,
          },
        );
      }

      /* ══════════════════════════════
         PATCH /messages/:id
         ══════════════════════════════ */

      if (
        p0 === "messages" &&
        p1 &&
        !p2 &&
        method === "PATCH"
      ) {

        /*
          Admin bypass is intentional,
          but only the actual sender can
          edit a user message.
        */

        if (
          !admin &&
          !(await getSubscription(
            uid,
          ))
        ) {

          return err(
            "Premium required",
            403,
          );
        }

        const msgId =
          Number(p1);

        if (
          !Number.isInteger(
            msgId,
          ) ||
          msgId <= 0
        ) {

          return err(
            "Invalid message id",
            400,
          );
        }

        let body: any;

        try {
          body =
            await req.json();
        } catch {
          return err(
            "Invalid JSON body",
            400,
          );
        }

        const text =
          String(
            body?.text ??
            "",
          ).trim();

        if (!text) {

          return err(
            "Empty text",
            400,
          );
        }

        if (
          text.length >
          4000
        ) {

          return err(
            "Message too long",
            400,
          );
        }

        const {
          data: msg,
          error:
            msgError,
        } = await db
          .from("messages")
          .select(
            "id, user_id, sender_id, text, created_at, deleted_at",
          )
          .eq(
            "id",
            msgId,
          )
          .single();

        if (
          msgError ||
          !msg
        ) {

          return err(
            "Message not found",
            404,
          );
        }

        /*
          Admin is allowed to manage messages,
          but normal user can only edit
          their own message.
        */

        if (
          !admin &&
          (
            Number(
              msg.user_id,
            ) !== uid ||
            Number(
              msg.sender_id,
            ) !== uid
          )
        ) {

          return err(
            "Not your message",
            403,
          );
        }

        if (
          msg.deleted_at
        ) {

          return err(
            "Message already deleted",
            400,
          );
        }

        /*
          Keep 48-hour edit window
          for user messages.
        */

        if (
          !admin &&
          Date.now() -
            new Date(
              msg.created_at,
            ).getTime() >
            48 *
              60 *
              60 *
              1000
        ) {

          return err(
            "Edit window expired (48h)",
            400,
          );
        }

        const {
          error,
        } = await db
          .from("messages")
          .update({
            text:
              text,

            edited_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            msgId,
          )
          .eq(
            "user_id",
            msg.user_id,
          );

        if (error) {

          return err(
            error.message,
            500,
          );
        }

        return json(
          {
            ok: true,
          },
        );
      }

      /* ══════════════════════════════
         POST /messages/:id/unsend
         ══════════════════════════════ */

      if (
        p0 === "messages" &&
        p1 &&
        p2 === "unsend" &&
        method === "POST"
      ) {

        if (
          !admin &&
          !(await getSubscription(
            uid,
          ))
        ) {

          return err(
            "Premium required",
            403,
          );
        }

        const msgId =
          Number(p1);

        if (
          !Number.isInteger(
            msgId,
          ) ||
          msgId <= 0
        ) {

          return err(
            "Invalid message id",
            400,
          );
        }

        const {
          data: msg,
        } = await db
          .from("messages")
          .select(
            "id, user_id, sender_id, deleted_at",
          )
          .eq(
            "id",
            msgId,
          )
          .single();

        if (!msg) {

          return err(
            "Message not found",
            404,
          );
        }

        if (
          !admin &&
          (
            Number(
              msg.user_id,
            ) !== uid ||
            Number(
              msg.sender_id,
            ) !== uid
          )
        ) {

          return err(
            "Not your message",
            403,
          );
        }

        if (
          msg.deleted_at
        ) {

          return err(
            "Message already deleted",
            400,
          );
        }

        const {
          error,
        } = await db
          .from("messages")
          .update({
            deleted_at:
              new Date().toISOString(),

            text:
              "",
          })
          .eq(
            "id",
            msgId,
          )
          .eq(
            "user_id",
            msg.user_id,
          );

        if (error) {

          return err(
            error.message,
            500,
          );
        }

        return json(
          {
            ok: true,
          },
        );
      }

      /* ══════════════════════════════
         DELETE /messages/:id
         ══════════════════════════════ */

      if (
        p0 === "messages" &&
        p1 &&
        !p2 &&
        method === "DELETE"
      ) {

        if (
          !admin &&
          !(await getSubscription(
            uid,
          ))
        ) {

          return err(
            "Premium required",
            403,
          );
        }

        const msgId =
          Number(p1);

        if (
          !Number.isInteger(
            msgId,
          ) ||
          msgId <= 0
        ) {

          return err(
            "Invalid message id",
            400,
          );
        }

        const {
          data: msg,
        } = await db
          .from("messages")
          .select(
            "id, user_id, sender_id, deleted_at",
          )
          .eq(
            "id",
            msgId,
          )
          .single();

        if (!msg) {

          return err(
            "Message not found",
            404,
          );
        }

        if (
          !admin &&
          Number(
            msg.user_id,
          ) !== uid
        ) {

          return err(
            "Not your message",
            403,
          );
        }

        const {
          error,
        } = await db
          .from("messages")
          .update({
            deleted_at:
              new Date().toISOString(),

            text:
              "",
          })
          .eq(
            "id",
            msgId,
          )
          .eq(
            "user_id",
            msg.user_id,
          );

        if (error) {

          return err(
            error.message,
            500,
          );
        }

        return json(
          {
            ok: true,
          },
        );
      }

      /* ══════════════════════════════
         PATCH /profile
         ══════════════════════════════ */

      if (
        p0 === "profile" &&
        method === "PATCH"
      ) {

        let body: any;

        try {
          body =
            await req.json();
        } catch {
          return err(
            "Invalid JSON body",
            400,
          );
        }

        const updates:
          Record<
            string,
            unknown
          > = {
          updated_at:
            new Date().toISOString(),
        };

        if (
          typeof body?.first_name ===
          "string"
        ) {

          const value =
            body.first_name
              .trim()
              .slice(
                0,
                64,
              );

          updates.first_name =
            value ||
            profile.first_name;
        }

        if (
          typeof body?.bio ===
          "string"
        ) {

          updates.bio =
            body.bio
              .trim()
              .slice(
                0,
                160,
              );
        }

        if (
          typeof body?.username ===
          "string"
        ) {

          const uname =
            body.username
              .trim()
              .replace(
                /^@/,
                "",
              )
              .slice(
                0,
                32,
              );

          if (uname) {

            const {
              data: clash,
            } = await db
              .from("profiles")
              .select(
                "user_id",
              )
              .eq(
                "username",
                uname,
              )
              .neq(
                "user_id",
                uid,
              )
              .maybeSingle();

            if (clash) {

              return err(
                "Username already taken",
                409,
              );
            }
          }

          updates.username =
            uname ||
            null;
        }

        if (
          typeof body?.avatar_data_url ===
          "string" &&
          body.avatar_data_url.startsWith(
            "data:image",
          )
        ) {

          const avatarUrl =
            await saveAvatar(
              uid,
              body.avatar_data_url,
            );

          if (avatarUrl) {
            updates.avatar_url =
              avatarUrl;
          }
        }

        const {
          error,
        } = await db
          .from("profiles")
          .update(
            updates,
          )
          .eq(
            "user_id",
            uid,
          );

        if (error) {

          return err(
            error.message,
            500,
          );
        }

        return json(
          {
            ok: true,
          },
        );
      }

      /* ══════════════════════════════
         CREATE INVOICE
         GET + POST supported
         199 STARS / 30 DAYS
         ══════════════════════════════ */

      if (
        p0 === "create-invoice" &&
        (
          method === "GET" ||
          method === "POST"
        )
      ) {

        if (admin) {

          return err(
            "Admin does not need Premium",
            400,
          );
        }

        if (!TOKEN) {

          return err(
            "Telegram payment configuration is missing",
            500,
          );
        }

        /*
          Existing active Premium users
          don't need another invoice.
        */

        const currentSubscription =
          await getSubscription(
            uid,
          );

        if (
          currentSubscription?.active
        ) {

          return err(
            "Premium is already active",
            400,
          );
        }

        const invoiceResponse =
          await fetch(
            `https://api.telegram.org/bot${TOKEN}/createInvoiceLink`,
            {
              method:
                "POST",

              headers: {
                "content-type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  title:
                    "Sanya Premium",

                  description:
                    "30-day premium access to private messaging.",

                  payload:
                    `premium_${uid}_${Date.now()}`,

                  currency:
                    "XTR",

                  prices: [
                    {
                      label:
                        "Premium — 30 Days",

                      amount:
                        199,
                    },
                  ],

                  /*
                    Telegram Stars subscription period.
                    30 days = 2592000 seconds.
                  */

                  subscription_period:
                    2592000,
                }),
            },
          );

        const invoiceData =
          await invoiceResponse.json();

        if (
          !invoiceData.ok
        ) {

          console.error(
            "Telegram invoice error:",
            invoiceData.description,
          );

          return err(
            invoiceData.description ??
              "Invoice error",
            500,
          );
        }

        return json(
          {
            invoice_url:
              invoiceData.result,
          },
        );
      }

      /* ══════════════════════════════
         EVERYTHING BELOW IS ADMIN ONLY
         ══════════════════════════════ */

      if (!admin) {

        return err(
          "Forbidden",
          403,
        );
      }

      /* ══════════════════════════════
         GET /conversations
         ══════════════════════════════ */

      if (
        p0 === "conversations" &&
        method === "GET"
      ) {

        const {
          data: rows,
          error,
        } = await db
          .from("messages")
          .select(
            "user_id, sender_id, text, created_at, seen_at, deleted_at",
          )
          .neq(
            "user_id",
            ADMIN_TG,
          )
          .order(
            "created_at",
            {
              ascending:
                false,
            },
          );

        if (error) {

          return err(
            error.message,
            500,
          );
        }

        const map =
          new Map<
            number,
            {
              user_id:
                number;

              last_message:
                string;

              last_message_at:
                string;

              unread_count:
                number;
            }
          >();

        for (
          const row of
            rows ?? []
        ) {

          const otherId =
            Number(
              row.user_id,
            );

          if (!otherId) {
            continue;
          }

          if (
            !map.has(
              otherId,
            )
          ) {

            map.set(
              otherId,
              {
                user_id:
                  otherId,

                last_message:
                  row.deleted_at
                    ? "🚫 Deleted"
                    : (
                        row.text ||
                        ""
                      ),

                last_message_at:
                  row.created_at,

                unread_count:
                  0,
              },
            );
          }

          if (
            Number(
              row.sender_id,
            ) ===
              otherId &&
            !row.seen_at &&
            !row.deleted_at
          ) {

            map.get(
              otherId,
            )!.unread_count++;
          }
        }

        const userIds =
          [
            ...map.keys(),
          ];

        const {
          data:
            profiles,
        } =
          userIds.length
            ? await db
                .from(
                  "profiles",
                )
                .select(
                  "user_id, first_name, username, avatar_url, photo_url, is_banned",
                )
                .in(
                  "user_id",
                  userIds,
                )
            : {
                data: [],
              };

        const {
          data:
            subs,
        } =
          userIds.length
            ? await db
                .from(
                  "subscriptions",
                )
                .select(
                  "user_id, is_active, lifetime, subscription_end",
                )
                .in(
                  "user_id",
                  userIds,
                )
            : {
                data: [],
              };

        const profileMap =
          Object.fromEntries(
            (
              profiles ??
              []
            ).map(
              p => [
                Number(
                  p.user_id,
                ),
                p,
              ],
            ),
          );

        const now =
          new Date();

        const subMap =
          Object.fromEntries(
            (
              subs ??
              []
            )
              .filter(
                s =>
                  s.lifetime ||
                  (
                    s.is_active &&
                    s.subscription_end &&
                    new Date(
                      s.subscription_end,
                    ) >
                      now
                  ),
              )
              .map(
                s => [
                  Number(
                    s.user_id,
                  ),
                  s,
                ],
              ),
          );

        const conversations =
          [
            ...map.values(),
          ].map(
            c => ({
              ...c,

              first_name:
                profileMap[
                  c.user_id
                ]?.first_name ??
                null,

              username:
                profileMap[
                  c.user_id
                ]?.username ??
                null,

              avatar_url:
                profileMap[
                  c.user_id
                ]?.avatar_url ??
                profileMap[
                  c.user_id
                ]?.photo_url ??
                null,

              is_banned:
                Boolean(
                  profileMap[
                    c.user_id
                  ]?.is_banned,
                ),

              is_premium:
                Boolean(
                  subMap[
                    c.user_id
                  ],
                ),
            }),
          );

        return json(
          {
            conversations,
          },
        );
      }

      /* ══════════════════════════════
         GET /admin-messages
         ══════════════════════════════ */

      if (
        p0 === "admin-messages" &&
        method === "GET"
      ) {

        const targetId =
          Number(
            url.searchParams.get(
              "user_id",
            ),
          );

        if (
          !targetId
        ) {

          return err(
            "user_id required",
            400,
          );
        }

        const {
          data,
          error,
        } = await db
          .from("messages")
          .select(
            "id, user_id, sender_id, text, created_at, edited_at, deleted_at, seen_at",
          )
          .eq(
            "user_id",
            targetId,
          )
          .order(
            "created_at",
            {
              ascending:
                true,
            },
          );

        if (error) {

          return err(
            error.message,
            500,
          );
        }

        /*
          Mark messages as seen by admin.
        */

        await db
          .from("messages")
          .update({
            seen_at:
              new Date().toISOString(),
          })
          .eq(
            "user_id",
            targetId,
          )
          .neq(
            "sender_id",
            uid,
          )
          .is(
            "seen_at",
            null,
          );

        return json(
          {
            messages:
              data ??
              [],
          },
        );
      }

      /* ══════════════════════════════
         POST /admin-messages
         ══════════════════════════════ */

      if (
        p0 === "admin-messages" &&
        method === "POST"
      ) {

        let body: any;

        try {
          body =
            await req.json();
        } catch {
          return err(
            "Invalid JSON body",
            400,
          );
        }

        const text =
          String(
            body?.text ??
            "",
          ).trim();

        const targetId =
          Number(
            body?.user_id,
          );

        if (
          !text ||
          !targetId
        ) {

          return err(
            "text and user_id required",
            400,
          );
        }

        if (
          text.length >
          4000
        ) {

          return err(
            "Message too long",
            400,
          );
        }

        /*
          Prevent admin from accidentally
          sending a message to themselves
          through this endpoint.
        */

        if (
          targetId ===
          ADMIN_TG
        ) {

          return err(
            "Invalid target user",
            400,
          );
        }

        const {
          error,
        } = await db
          .from("messages")
          .insert({
            user_id:
              targetId,

            sender_id:
              uid,

            text:
              text,
          });

        if (error) {

          return err(
            error.message,
            500,
          );
        }

        /*
          Push reply to user's Telegram.
        */

        try {

          await tg(
            "sendMessage",
            {
              chat_id:
                targetId,

              text:
                `💌 Sanya: ${text}`,
            },
          );

        } catch (error) {

          console.error(
            "User Telegram notification failed:",
            error instanceof Error
              ? error.message
              : "unknown",
          );
        }

        return json(
          {
            ok: true,
          },
        );
      }

      /* ══════════════════════════════
         DELETE /admin-messages/:id
         ══════════════════════════════ */

      if (
        p0 === "admin-messages" &&
        p1 &&
        method === "DELETE"
      ) {

        const msgId =
          Number(p1);

        if (
          !Number.isInteger(
            msgId,
          ) ||
          msgId <= 0
        ) {

          return err(
            "Invalid message id",
            400,
          );
        }

        const {
          error,
        } = await db
          .from("messages")
          .update({
            deleted_at:
              new Date().toISOString(),

            text:
              "",
          })
          .eq(
            "id",
            msgId,
          );

        if (error) {

          return err(
            error.message,
            500,
          );
        }

        /*
          Record admin action.
        */

        await db
          .from("admin_actions")
          .insert({
            admin_id:
              uid,

            target_id:
              null,

            action:
              "delete_message",

            details:
              {
                message_id:
                  msgId,
              },
          });

        return json(
          {
            ok: true,
          },
        );
      }

      /* ══════════════════════════════
         GET /admin-users
         ══════════════════════════════ */

      if (
        p0 === "admin-users" &&
        method === "GET"
      ) {

        const {
          data:
            profiles,
          error,
        } = await db
          .from("profiles")
          .select(
            "user_id, first_name, last_name, username, avatar_url, photo_url, is_banned, created_at, updated_at",
          )
          .neq(
            "user_id",
            ADMIN_TG,
          )
          .order(
            "created_at",
            {
              ascending:
                false,
            },
          );

        if (error) {

          return err(
            error.message,
            500,
          );
        }

        const ids =
          (
            profiles ??
            []
          ).map(
            p =>
              Number(
                p.user_id,
              ),
          );

        const {
          data:
            subs,
        } =
          ids.length
            ? await db
                .from(
                  "subscriptions",
                )
                .select(
                  "user_id, is_active, lifetime, subscription_end",
                )
                .in(
                  "user_id",
                  ids,
                )
            : {
                data: [],
              };

        const now =
          new Date();

        const subMap =
          Object.fromEntries(
            (
              subs ??
              []
            )
              .filter(
                s =>
                  s.lifetime ||
                  (
                    s.is_active &&
                    s.subscription_end &&
                    new Date(
                      s.subscription_end,
                    ) >
                      now
                  ),
              )
              .map(
                s => [
                  Number(
                    s.user_id,
                  ),
                  s,
                ],
              ),
          );

        const users =
          (
            profiles ??
            []
          ).map(
            p => {

              const sub =
                subMap[
                  Number(
                    p.user_id,
                  )
                ];

              return {
                ...p,

                id:
                  Number(
                    p.user_id,
                  ),

                subscription:
                  sub
                    ? {
                        active:
                          true,

                        lifetime:
                          Boolean(
                            sub.lifetime,
                          ),

                        end:
                          sub.subscription_end ??
                          null,
                      }
                    : null,
              };
            },
          );

        return json(
          {
            users,
          },
        );
      }

      /* ══════════════════════════════
         GET /admin-stats
         ══════════════════════════════ */

      if (
        p0 === "admin-stats" &&
        method === "GET"
      ) {

        const since =
          new Date(
            Date.now() -
              24 *
                60 *
                60 *
                1000,
          ).toISOString();

        const today =
          new Date();

        today.setHours(
          0,
          0,
          0,
          0,
        );

        const [
          {
            count:
              total_users,
          },

          {
            data:
              subs,
          },

          {
            count:
              total_messages,
          },

          {
            count:
              banned_users,
          },

          {
            count:
              active_today,
          },

          {
            data:
              rev,
          },
        ] =
          await Promise.all([
            db
              .from(
                "profiles",
              )
              .select(
                "*",
                {
                  count:
                    "exact",
                  head:
                    true,
                },
              )
              .neq(
                "user_id",
                ADMIN_TG,
              ),

            db
              .from(
                "subscriptions",
              )
              .select(
                "user_id, is_active, lifetime, subscription_end",
              ),

            db
              .from(
                "messages",
              )
              .select(
                "*",
                {
                  count:
                    "exact",
                  head:
                    true,
                },
              )
              .is(
                "deleted_at",
                null,
              ),

            db
              .from(
                "profiles",
              )
              .select(
                "*",
                {
                  count:
                    "exact",
                  head:
                    true,
                },
              )
              .eq(
                "is_banned",
                true,
              )
              .neq(
                "user_id",
                ADMIN_TG,
              ),

            db
              .from(
                "profiles",
              )
              .select(
                "*",
                {
                  count:
                    "exact",
                  head:
                    true,
                },
              )
              .gte(
                "updated_at",
                since,
              )
              .neq(
                "user_id",
                ADMIN_TG,
              ),

            db
              .from(
                "payments",
              )
              .select(
                "amount",
              )
              .gte(
                "created_at",
                today.toISOString(),
              ),
          ]);

        const now =
          new Date();

        const premium_users =
          (
            subs ??
            []
          ).filter(
            s =>
              s.lifetime ||
              (
                s.is_active &&
                s.subscription_end &&
                new Date(
                  s.subscription_end,
                ) >
                  now
              ),
          ).length;

        const revenue_stars =
          (
            rev ??
            []
          ).reduce(
            (
              sum: number,
              row: {
                amount:
                  number;
              },
            ) =>
              sum +
              Number(
                row.amount ??
                0,
              ),
            0,
          );

        return json(
          {
            total_users:
              total_users ??
              0,

            premium_users,

            total_messages:
              total_messages ??
              0,

            banned_users:
              banned_users ??
              0,

            active_today:
              active_today ??
              0,

            revenue_stars,
          },
        );
      }

      /* ══════════════════════════════
         POST /admin-grant
         LIFETIME PREMIUM
         ══════════════════════════════ */

      if (
        p0 === "admin-grant" &&
        method === "POST"
      ) {

        let body: any;

        try {
          body =
            await req.json();
        } catch {
          return err(
            "Invalid JSON body",
            400,
          );
        }

        const targetId =
          Number(
            body?.user_id,
          );

        if (
          !targetId ||
          targetId ===
            ADMIN_TG
        ) {

          return err(
            "Invalid user_id",
            400,
          );
        }

        const now =
          new Date().toISOString();

        const {
          error,
        } = await db
          .from(
            "subscriptions",
          )
          .upsert(
            {
              user_id:
                targetId,

              subscription_start:
                now,

              subscription_end:
                "2099-01-01T00:00:00.000Z",

              lifetime:
                true,

              is_active:
                true,

              updated_at:
                now,
            },
            {
              onConflict:
                "user_id",
            },
          );

        if (error) {

          return err(
            error.message,
            500,
          );
        }

        await db
          .from(
            "admin_actions",
          )
          .insert({
            admin_id:
              uid,

            target_id:
              targetId,

            action:
              "grant_premium",
          });

        try {

          await tg(
            "sendMessage",
            {
              chat_id:
                targetId,

              text:
                "✨ You've been gifted Lifetime Premium by Sanya!",
            },
          );

        } catch {}

        return json(
          {
            ok: true,
          },
        );
      }

      /* ══════════════════════════════
         POST /admin-ban
         ══════════════════════════════ */

      if (
        p0 === "admin-ban" &&
        method === "POST"
      ) {

        let body: any;

        try {
          body =
            await req.json();
        } catch {
          return err(
            "Invalid JSON body",
            400,
          );
        }

        const targetId =
          Number(
            body?.user_id,
          );

        if (
          !targetId ||
          targetId ===
            ADMIN_TG
        ) {

          return err(
            "Invalid user_id",
            400,
          );
        }

        const {
          error,
        } = await db
          .from(
            "profiles",
          )
          .update({
            is_banned:
              true,
          })
          .eq(
            "user_id",
            targetId,
          );

        if (error) {

          return err(
            error.message,
            500,
          );
        }

        await db
          .from(
            "admin_actions",
          )
          .insert({
            admin_id:
              uid,

            target_id:
              targetId,

            action:
              "ban",
          });

        try {

          await tg(
            "sendMessage",
            {
              chat_id:
                targetId,

              text:
                "🚫 Your account has been suspended.",
            },
          );

        } catch {}

        return json(
          {
            ok: true,
          },
        );
      }

      /* ══════════════════════════════
         POST /admin-unban
         ══════════════════════════════ */

      if (
        p0 === "admin-unban" &&
        method === "POST"
      ) {

        let body: any;

        try {
          body =
            await req.json();
        } catch {
          return err(
            "Invalid JSON body",
            400,
          );
        }

        const targetId =
          Number(
            body?.user_id,
          );

        if (
          !targetId ||
          targetId ===
            ADMIN_TG
        ) {

          return err(
            "Invalid user_id",
            400,
          );
        }

        const {
          error,
        } = await db
          .from(
            "profiles",
          )
          .update({
            is_banned:
              false,
          })
          .eq(
            "user_id",
            targetId,
          );

        if (error) {

          return err(
            error.message,
            500,
          );
        }

        await db
          .from(
            "admin_actions",
          )
          .insert({
            admin_id:
              uid,

            target_id:
              targetId,

            action:
              "unban",
          });

        try {

          await tg(
            "sendMessage",
            {
              chat_id:
                targetId,

              text:
                "✅ Your account has been reinstated.",
            },
          );

        } catch {}

        return json(
          {
            ok: true,
          },
        );
      }

      /* ══════════════════════════════
         UNKNOWN ROUTE
         ══════════════════════════════ */

      return err(
        "Not found",
        404,
      );

    } catch (error) {

      /*
        Final safety net.
        Instead of the Edge Function
        crashing with a browser-level
        "Failed to fetch", return JSON
        with CORS headers.
      */

      console.error(
        "API unhandled error:",
        error instanceof Error
          ? error.stack ||
              error.message
          : "unknown error",
      );

      return err(
        "Internal server error",
        500,
      );
    }
  },
);
