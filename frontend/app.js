/* ══════════════════════════════════════
   Sanya Messenger — Premium App Logic
   Fixed version

   Existing workflow preserved:
   - Telegram Mini App
   - Premium access
   - Admin access
   - Private chat
   - Message edit
   - Unsend
   - Delete
   - Profile edit
   - Avatar upload
   - Admin inbox
   - Admin users
   - Admin stats
   - Ban / Unban
   - Lifetime Premium
   ══════════════════════════════════════ */

const tg = window.Telegram?.WebApp;

const API = (
  window.SUPABASE_FUNCTION_URL ||
  "https://emqseukhovnzgrmsvlag.supabase.co/functions/v1/api"
).replace(/\/$/, "");

/* ══════════════════════════════════════
   STATE
   ══════════════════════════════════════ */

let state = {
  me: null,
  chatUserId: null,
  adminUserId: null,
  adminUserData: null,
  poll: null,
  editingMsgId: null,
  avatarDataUrl: null,
  adminTab: "chats",
};

/* ══════════════════════════════════════
   TELEGRAM INIT
   ══════════════════════════════════════ */

if (tg) {
  tg.ready();
  tg.expand();

  try {
    tg.setBackgroundColor("#000000");
    tg.setHeaderColor("#000000");
  } catch {}
}

/* ══════════════════════════════════════
   HELPERS
   ══════════════════════════════════════ */

const $ = id => document.getElementById(id);

function initData() {
  return tg?.initData || "";
}

function headers() {
  return {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": initData(),
  };
}

async function api(path, options = {}) {
  const res = await fetch(
    API + path,
    {
      ...options,
      headers: {
        ...headers(),
        ...(options.headers || {}),
      },
    },
  );

  const data =
    await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      data.error ||
      `Request failed (${res.status})`,
    );
  }

  return data;
}

let toastTimer = null;

function toast(
  msg,
  duration = 2400,
) {
  const el = $("toast");

  if (!el) return;

  el.textContent = msg;
  el.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(
    () =>
      el.classList.remove("show"),
    duration,
  );
}

function show(id) {
  [
    "homeView",
    "chatView",
    "adminView",
  ].forEach(x => {
    const el = $(x);
    if (el) {
      el.classList.add("hidden");
    }
  });

  const target = $(id);

  if (target) {
    target.classList.remove("hidden");
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]),
  );
}

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function formatDate(value) {
  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  const today = new Date();

  const yesterday =
    new Date(today);

  yesterday.setDate(
    today.getDate() - 1,
  );

  if (
    d.toDateString() ===
    today.toDateString()
  ) {
    return "Today";
  }

  if (
    d.toDateString() ===
    yesterday.toDateString()
  ) {
    return "Yesterday";
  }

  return d.toLocaleDateString(
    [],
    {
      month: "short",
      day: "numeric",
      year:
        d.getFullYear() !==
        today.getFullYear()
          ? "numeric"
          : undefined,
    },
  );
}

function autoResize(textarea) {
  if (!textarea) return;

  textarea.style.height = "auto";

  textarea.style.height =
    Math.min(
      textarea.scrollHeight,
      140,
    ) + "px";
}

function setAvatar(
  imgEl,
  textEl,
  url,
  letter,
) {
  if (!imgEl) return;

  if (url) {
    imgEl.src = url;
    imgEl.style.display = "block";

    if (textEl) {
      textEl.textContent = "";
    }
  } else {
    imgEl.style.display = "none";

    if (textEl) {
      textEl.textContent =
        letter || "?";
    }
  }
}

/* ══════════════════════════════════════
   ACCESS HELPERS
   ══════════════════════════════════════ */

/*
  IMPORTANT:
  Admin is ALWAYS allowed to use the app.
  Premium is required only for normal users.
*/

function isCurrentUserAdmin() {
  return state.me?.is_admin === true;
}

function hasPremium() {
  return (
    state.me?.subscription?.active ===
    true
  );
}

function canChat() {
  return (
    isCurrentUserAdmin() ||
    hasPremium()
  );
}

/* ══════════════════════════════════════
   LOAD ME
   ══════════════════════════════════════ */

async function loadMe() {
  if (!initData()) {
    toast(
      "Open this Mini App from Telegram.",
    );
    return;
  }

  try {
    const me =
      await api("/me");

    state.me = me;

    const {
      first_name,
      username,
      bio,
      avatar_url,
      is_admin,
      subscription,
    } = me;

    /*
      Topbar
    */

    if ($("brandName")) {
      $("brandName").textContent =
        first_name || "Sanya";
    }

    if ($("statusText")) {
      $("statusText").textContent =
        is_admin
          ? "Admin"
          : "Messenger";
    }

    setAvatar(
      $("brandAvatarImg"),
      $("brandAvatar"),
      avatar_url,
      (first_name || "S")[0],
    );

    /*
      Hero
    */

    if ($("heroName")) {
      $("heroName").textContent =
        first_name || "Sanya";
    }

    if ($("heroBio")) {
      $("heroBio").textContent =
        bio ||
        "Private messaging inside Telegram.";
    }

    if ($("heroUsername")) {
      $("heroUsername").textContent =
        username
          ? "@" + username
          : "";
    }

    setAvatar(
      $("heroAvatarImg"),
      $("heroAvatar"),
      avatar_url,
      (first_name || "S")[0],
    );

    /*
      Chat header
    */

    if ($("chatHeadName")) {
      $("chatHeadName").textContent =
        first_name || "Sanya";
    }

    setAvatar(
      $("chatMiniAvatarImg"),
      $("chatMiniAvatar"),
      avatar_url,
      (first_name || "S")[0],
    );

    /*
      Admin button.
    */

    if ($("adminBtn")) {
      $("adminBtn").classList.toggle(
        "hidden",
        !is_admin,
      );
    }

    /*
      Premium badge.
    */

    const badge =
      $("planBadge");

    if (badge) {

      /*
        ADMIN MUST NEVER SHOW
        "Premium required".
      */

      if (is_admin) {

        badge.textContent =
          "👑 Admin Access";

        badge.classList.add(
          "active",
        );

      } else if (
        subscription?.lifetime
      ) {

        badge.textContent =
          "✨ Lifetime Premium";

        badge.classList.add(
          "active",
        );

      } else if (
        subscription?.active
      ) {

        badge.textContent =
          "⭐ Premium Active";

        badge.classList.add(
          "active",
        );

      } else {

        badge.textContent =
          "Premium required";

        badge.classList.remove(
          "active",
        );
      }
    }

    /*
      Subscribe button:
      - Admin -> hidden
      - Active Premium -> hidden
      - Free user -> visible
    */

    if ($("subscribeBtn")) {
      $("subscribeBtn").classList.toggle(
        "hidden",
        is_admin ||
          !!subscription?.active,
      );
    }

  } catch (e) {

    console.error(
      "loadMe:",
      e,
    );

    toast(
      e.message ||
      "Unable to load account.",
    );
  }
}

/* ══════════════════════════════════════
   USER CHAT
   ══════════════════════════════════════ */

async function openChat() {

  /*
    FIX:
    Admin bypasses Premium.
  */

  if (!canChat()) {

    toast(
      "⭐ Premium required to chat.",
    );

    return;
  }

  state.chatUserId =
    state.me?.id ??
    null;

  clearEditMode();

  show("chatView");

  await loadMessages();

  startPolling();
}

let lastMsgDate = null;

/* ══════════════════════════════════════
   LOAD USER MESSAGES
   ══════════════════════════════════════ */

async function loadMessages() {

  if (!state.me) {
    return;
  }

  try {

    const d =
      await api("/messages");

    renderMessages(
      $("messages"),
      d.messages || [],
      Number(state.me.id),
      false,
    );

  } catch (e) {

    /*
      Don't spam the user with
      polling errors.
    */

    console.error(
      "loadMessages:",
      e,
    );
  }
}

/* ══════════════════════════════════════
   RENDER MESSAGES
   ══════════════════════════════════════ */

function renderMessages(
  container,
  list,
  myId,
  isAdmin,
) {

  if (!container) {
    return;
  }

  if (!list?.length) {

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <div>No messages yet</div>
        <p>Start the conversation!</p>
      </div>
    `;

    return;
  }

  let html = "";

  let lastDate = null;

  list.forEach(m => {

    const msgDate =
      formatDate(
        m.created_at,
      );

    if (
      msgDate !==
      lastDate
    ) {

      html += `
        <div class="day-divider">
          ${escapeHtml(msgDate)}
        </div>
      `;

      lastDate =
        msgDate;
    }

    /*
      IMPORTANT ADMIN FIX

      User chat:
        sender_id === myId -> mine

      Admin chat:
        sender_id === admin ID -> mine
        everything else -> user

      Previous code compared sender_id
      against adminUserId in the wrong way.
    */

    const senderId =
      Number(m.sender_id);

    const currentId =
      Number(myId);

    const adminId =
      Number(
        state.me?.id ||
        0,
      );

    let isMine = false;

    if (isAdmin) {

      /*
        Admin's own messages are mine.
      */

      isMine =
        senderId ===
        adminId;

    } else {

      /*
        Normal user's own messages.
      */

      isMine =
        senderId ===
        currentId;
    }

    const cls =
      isMine
        ? "mine"
        : "theirs";

    const deleted =
      m.deleted_at
        ? "deleted"
        : "";

    const edited =
      m.edited_at &&
      !m.deleted_at
        ? "edited"
        : "";

    const content =
      m.deleted_at
        ? "🚫 Message deleted"
        : escapeHtml(
            m.text || "",
          );

    /*
      Only normal user messages
      can be edited by user.

      Admin messages are not user-editable.
    */

    const canEdit =
      !isAdmin &&
      isMine &&
      !m.deleted_at;

    const canDelete =
      isMine &&
      !m.deleted_at;

    const canUnsend =
      canDelete;

    /*
      Tick only for current sender.
    */

    const tick =
      isMine
        ? `
          <span class="tick ${
            m.seen_at
              ? "seen"
              : ""
          }">✓✓</span>
        `
        : "";

    /*
      Store raw text safely in dataset.
      escapeHtml is used because it goes
      into an HTML attribute.
    */

    const safeText =
      escapeHtml(
        m.text || "",
      );

    html += `
      <div
        class="bubble-wrap ${cls}"
        data-id="${Number(m.id)}"
      >

        <div
          class="bubble ${deleted} ${edited}"
          data-id="${Number(m.id)}"
          data-text="${safeText}"
          data-mine="${isMine}"
          data-deleted="${!!m.deleted_at}"
          data-can-edit="${canEdit}"
        >
          ${content}
        </div>

        <div class="bubble-meta">
          <span>
            ${formatTime(m.created_at)}
          </span>
          ${tick}
        </div>

      </div>
    `;
  });

  container.innerHTML =
    html;

  /*
    Always show latest messages.
  */

  container.scrollTop =
    container.scrollHeight;

  /*
    Long press / right click.
  */

  container
    .querySelectorAll(
      ".bubble",
    )
    .forEach(
      bubble => {

        let pressTimer =
          null;

        bubble.addEventListener(
          "contextmenu",
          e => {

            e.preventDefault();

            showMsgCtx(
              e,
              bubble,
              isAdmin,
            );
          },
        );

        bubble.addEventListener(
          "touchstart",
          e => {

            pressTimer =
              setTimeout(
                () => {

                  showMsgCtx(
                    e.touches[0],
                    bubble,
                    isAdmin,
                  );

                },
                500,
              );
          },
          {
            passive: true,
          },
        );

        bubble.addEventListener(
          "touchend",
          () => {
            clearTimeout(
              pressTimer,
            );
          },
        );

        bubble.addEventListener(
          "touchmove",
          () => {
            clearTimeout(
              pressTimer,
            );
          },
        );
      },
    );
}

/* ══════════════════════════════════════
   MESSAGE CONTEXT MENU
   ══════════════════════════════════════ */

function showMsgCtx(
  e,
  bubble,
  isAdmin,
) {

  if (!bubble) {
    return;
  }

  const id =
    bubble.dataset.id;

  const text =
    bubble.dataset.text || "";

  const isMine =
    bubble.dataset.mine ===
    "true";

  const isDeleted =
    bubble.dataset.deleted ===
    "true";

  const canEdit =
    bubble.dataset.canEdit ===
    "true";

  if (isDeleted) {
    return;
  }

  const items = [];

  /*
    User's own message:
    Edit + Unsend
  */

  if (canEdit) {

    items.push({
      label:
        "✏️ Edit",

      icon:
        "edit",

      action:
        () =>
          startEdit(
            id,
            text,
          ),
    });

    items.push({
      label:
        "↩️ Unsend",

      icon:
        "unsend",

      action:
        () =>
          confirmUnsend(
            id,
          ),

      danger:
        true,
    });
  }

  /*
    User's delete option.
  */

  if (
    !isAdmin &&
    isMine
  ) {

    items.push({
      label:
        "🗑️ Delete",

      icon:
        "delete",

      action:
        () =>
          confirmDelete(
            id,
          ),

      danger:
        true,
    });
  }

  /*
    Admin can delete any message
    in the admin conversation.
  */

  if (isAdmin) {

    items.push({
      label:
        "🗑️ Delete (Admin)",

      icon:
        "delete",

      action:
        () =>
          adminDeleteMsg(
            id,
          ),

      danger:
        true,
    });
  }

  /*
    Copy.
  */

  items.push({
    label:
      "📋 Copy",

    icon:
      "copy",

    action:
      () => {

        if (
          navigator.clipboard
        ) {

          navigator.clipboard
            .writeText(
              text,
            )
            .then(
              () =>
                toast(
                  "Copied!",
                ),
            )
            .catch(
              () =>
                toast(
                  "Copy failed",
                ),
            );

        } else {

          toast(
            "Copy not supported",
          );
        }
      },
  });

  if (!items.length) {
    return;
  }

  const ctx =
    $("msgCtx");

  if (!ctx) {
    return;
  }

  ctx.innerHTML =
    items
      .map(
        item => `
          <div
            class="msg-ctx-item ${
              item.danger
                ? "danger"
                : ""
            }"
            data-action="${item.icon}"
          >
            ${item.label}
          </div>
        `,
      )
      .join("");

  /*
    Position safely inside viewport.
  */

  const x =
    Math.min(
      Number(
        e.clientX ||
        e.pageX ||
        50,
      ),
      Math.max(
        10,
        window.innerWidth -
          190,
      ),
    );

  const estimatedHeight =
    items.length *
      48 +
    12;

  const y =
    Math.min(
      Number(
        e.clientY ||
        e.pageY ||
        50,
      ),
      Math.max(
        10,
        window.innerHeight -
          estimatedHeight,
      ),
    );

  ctx.style.left =
    x + "px";

  ctx.style.top =
    y + "px";

  ctx.classList.remove(
    "hidden",
  );

  const actionEls =
    ctx.querySelectorAll(
      ".msg-ctx-item",
    );

  actionEls.forEach(
    (el, i) => {

      el.onclick =
        () => {

          ctx.classList.add(
            "hidden",
          );

          items[i].action();
        };
    },
  );

  setTimeout(
    () =>
      document.addEventListener(
        "click",
        closeMsgCtx,
        {
          once: true,
        },
      ),
    10,
  );
}

function closeMsgCtx() {
  const ctx =
    $("msgCtx");

  if (ctx) {
    ctx.classList.add(
      "hidden",
    );
  }
}

/* ══════════════════════════════════════
   EDIT MESSAGE
   ══════════════════════════════════════ */

function startEdit(
  id,
  text,
) {

  state.editingMsgId =
    String(id);

  const input =
    $("messageInput");

  if (!input) {
    return;
  }

  input.value =
    text || "";

  input.focus();

  autoResize(
    input,
  );

  const banner =
    $("editBanner");

  if (banner) {
    banner.classList.remove(
      "hidden",
    );
  }

  const sendBtn =
    $("sendBtn");

  if (sendBtn) {
    sendBtn.disabled =
      false;
  }
}

function clearEditMode() {

  state.editingMsgId =
    null;

  const input =
    $("messageInput");

  if (input) {
    input.value =
      "";

    autoResize(
      input,
    );
  }

  const banner =
    $("editBanner");

  if (banner) {
    banner.classList.add(
      "hidden",
    );
  }

  const sendBtn =
    $("sendBtn");

  if (sendBtn) {
    sendBtn.disabled =
      true;
  }
}

/* ══════════════════════════════════════
   UNSEND / DELETE
   ══════════════════════════════════════ */

function confirmUnsend(
  id,
) {

  showConfirm(
    "Unsend Message?",
    "This will delete your message for everyone.",
    async () => {

      try {

        await api(
          "/messages/" +
            encodeURIComponent(
              id,
            ) +
            "/unsend",
          {
            method:
              "POST",
          },
        );

        toast(
          "Message unsent.",
        );

        await loadMessages();

      } catch (e) {

        toast(
          e.message,
        );
      }
    },
  );
}

function confirmDelete(
  id,
) {

  showConfirm(
    "Delete Message?",
    "Delete this message?",
    async () => {

      try {

        await api(
          "/messages/" +
            encodeURIComponent(
              id,
            ),
          {
            method:
              "DELETE",
          },
        );

        toast(
          "Deleted.",
        );

        await loadMessages();

      } catch (e) {

        toast(
          e.message,
        );
      }
    },
    false,
  );
}

async function adminDeleteMsg(
  id,
) {

  try {

    await api(
      "/admin-messages/" +
        encodeURIComponent(
          id,
        ),
      {
        method:
          "DELETE",
      },
    );

    toast(
      "Message deleted.",
    );

    await loadAdminMessages();

  } catch (e) {

    toast(
      e.message,
    );
  }
}

/* ══════════════════════════════════════
   SEND / EDIT MESSAGE
   ══════════════════════════════════════ */

async function sendMessage() {

  const input =
    $("messageInput");

  const sendBtn =
    $("sendBtn");

  if (!input) {
    return;
  }

  const text =
    input.value.trim();

  if (!text) {
    return;
  }

  if (sendBtn) {
    sendBtn.disabled =
      true;
  }

  try {

    /*
      EDIT
    */

    if (
      state.editingMsgId
    ) {

      await api(
        "/messages/" +
          encodeURIComponent(
            state.editingMsgId,
          ),
        {
          method:
            "PATCH",

          body:
            JSON.stringify({
              text,
            }),
        },
      );

      toast(
        "Message edited.",
      );

      clearEditMode();

    } else {

      /*
        NEW MESSAGE
      */

      input.value =
        "";

      autoResize(
        input,
      );

      await api(
        "/messages",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              text,
            }),
        },
      );
    }

    await loadMessages();

  } catch (e) {

    /*
      Restore text if sending failed.
    */

    if (
      !state.editingMsgId &&
      !input.value
    ) {
      input.value =
        text;

      autoResize(
        input,
      );
    }

    toast(
      e.message,
    );
  }

  if (sendBtn) {
    sendBtn.disabled =
      !input.value.trim();
  }
}

/* ══════════════════════════════════════
   MESSAGE POLLING
   ══════════════════════════════════════ */

function startPolling() {

  clearInterval(
    state.poll,
  );

  state.poll =
    setInterval(
      () => {

        const chatView =
          $("chatView");

        if (
          chatView &&
          !chatView.classList.contains(
            "hidden",
          )
        ) {

          loadMessages()
            .catch(
              () => {},
            );
        }

      },
      2000,
    );
}

/* ══════════════════════════════════════
   PREMIUM SUBSCRIBE
   ══════════════════════════════════════ */

async function subscribe() {

  /*
    Admin never needs Premium.
  */

  if (
    isCurrentUserAdmin()
  ) {

    toast(
      "👑 Admin already has full access.",
    );

    return;
  }

  /*
    If Premium already active,
    don't create another invoice.
  */

  if (
    hasPremium()
  ) {

    toast(
      "⭐ Premium is already active.",
    );

    return;
  }

  try {

    /*
      Backend supports POST /create-invoice.
      Price is controlled server-side:
      199 Telegram Stars.
    */

    const d =
      await api(
        "/create-invoice",
        {
          method:
            "POST",
        },
      );

    if (
      !d.invoice_url
    ) {

      throw new Error(
        "Invoice URL not received.",
      );
    }

    if (
      tg?.openInvoice
    ) {

      tg.openInvoice(
        d.invoice_url,
        result => {

          if (
            result ===
            "paid"
          ) {

            toast(
              "✨ Premium activated!",
              3000,
            );

            /*
              Reload account status
              after successful payment.
            */

            setTimeout(
              () =>
                loadMe(),
              800,
            );
          }

          if (
            result ===
            "cancelled"
          ) {

            toast(
              "Payment cancelled.",
            );
          }

          if (
            result ===
            "failed"
          ) {

            toast(
              "Payment failed.",
            );
          }
        },
      );

    } else {

      window.open(
        d.invoice_url,
        "_blank",
      );
    }

  } catch (e) {

    toast(
      e.message ||
      "Unable to create payment.",
    );
  }
}

/* ══════════════════════════════════════
   PROFILE EDIT
   ══════════════════════════════════════ */

function openProfileEdit() {

  const {
    first_name,
    bio,
    username,
    avatar_url,
  } =
    state.me || {};

  const nameInput =
    $("editName");

  const bioInput =
    $("editBio");

  const usernameInput =
    $("editUsername");

  if (nameInput) {
    nameInput.value =
      first_name || "";
  }

  if (bioInput) {
    bioInput.value =
      bio || "";
  }

  if (usernameInput) {
    usernameInput.value =
      username || "";
  }

  state.avatarDataUrl =
    null;

  const img =
    $("sheetAvatarImg");

  const preview =
    $("sheetAvatarPreview");

  if (
    img &&
    preview
  ) {

    if (avatar_url) {

      img.src =
        avatar_url;

      img.style.display =
        "block";

      preview.textContent =
        "";

      preview.appendChild(
        img,
      );

    } else {

      img.style.display =
        "none";

      preview.textContent =
        (
          first_name ||
          "S"
        )[0];
    }
  }

  const sheet =
    $("profileSheet");

  if (sheet) {
    sheet.classList.remove(
      "hidden",
    );
  }
}

function closeProfileEdit() {

  const sheet =
    $("profileSheet");

  if (sheet) {
    sheet.classList.add(
      "hidden",
    );
  }

  state.avatarDataUrl =
    null;
}

/* ══════════════════════════════════════
   SAVE PROFILE
   ══════════════════════════════════════ */

async function saveProfile() {

  const name =
    $("editName")
      ?.value
      .trim() || "";

  const bio =
    $("editBio")
      ?.value
      .trim() || "";

  const username =
    (
      $("editUsername")
        ?.value
        .trim() || ""
    ).replace(
      /^@/,
      "",
    );

  try {

    await api(
      "/profile",
      {
        method:
          "PATCH",

        body:
          JSON.stringify({
            first_name:
              name,

            bio:
              bio,

            username:
              username,

            avatar_data_url:
              state.avatarDataUrl ||
              undefined,
          }),
      },
    );

    toast(
      "✅ Profile saved!",
    );

    closeProfileEdit();

    await loadMe();

  } catch (e) {

    toast(
      e.message,
    );
  }
}

/* ══════════════════════════════════════
   AVATAR UPLOAD
   ══════════════════════════════════════ */

const avatarFileInput =
  $("avatarFileInput");

if (avatarFileInput) {

  avatarFileInput.addEventListener(
    "change",
    e => {

      const file =
        e.target.files?.[0];

      if (!file) {
        return;
      }

      if (
        !file.type.startsWith(
          "image/",
        )
      ) {

        toast(
          "Please select an image.",
        );

        return;
      }

      if (
        file.size >
        5 * 1024 * 1024
      ) {

        toast(
          "Image too large (max 5MB)",
        );

        return;
      }

      const reader =
        new FileReader();

      reader.onload =
        ev => {

          state.avatarDataUrl =
            ev.target.result;

          const preview =
            $("sheetAvatarPreview");

          const img =
            $("sheetAvatarImg");

          if (
            !preview ||
            !img
          ) {
            return;
          }

          img.src =
            ev.target.result;

          img.style.display =
            "block";

          preview.textContent =
            "";

          preview.appendChild(
            img,
          );
        };

      reader.readAsDataURL(
        file,
      );
    },
  );
}

/* ══════════════════════════════════════
   HERO AVATAR EDIT
   ══════════════════════════════════════ */

const heroAvatarEdit =
  $("heroAvatarEdit");

if (heroAvatarEdit) {

  heroAvatarEdit.addEventListener(
    "click",
    () => {

      openProfileEdit();

      setTimeout(
        () => {

          const input =
            $("avatarFileInput");

          if (input) {
            input.click();
          }

        },
        300,
      );
    },
  );
}

/* ══════════════════════════════════════
   ADMIN PANEL
   ══════════════════════════════════════ */

async function openAdmin() {

  /*
    Frontend protection.
    Backend ALSO verifies real admin ID.
  */

  if (
    !isCurrentUserAdmin()
  ) {

    toast(
      "Admin access required.",
    );

    return;
  }

  show(
    "adminView",
  );

  const adminChat =
    $("adminChat");

  if (adminChat) {
    adminChat.classList.remove(
      "open",
    );
  }

  switchAdminTab(
    "chats",
  );
}

/* ══════════════════════════════════════
   ADMIN TABS
   ══════════════════════════════════════ */

function switchAdminTab(
  tab,
) {

  if (
    !isCurrentUserAdmin()
  ) {
    return;
  }

  state.adminTab =
    tab;

  document
    .querySelectorAll(
      ".admin-tab",
    )
    .forEach(
      t =>
        t.classList.toggle(
          "active",
          t.dataset.tab ===
            tab,
        ),
    );

  const tabChats =
    $("tabChats");

  const tabUsers =
    $("tabUsers");

  const tabStats =
    $("tabStats");

  if (tabChats) {
    tabChats.classList.toggle(
      "hidden",
      tab !== "chats",
    );
  }

  if (tabUsers) {
    tabUsers.classList.toggle(
      "hidden",
      tab !== "users",
    );
  }

  if (tabStats) {
    tabStats.classList.toggle(
      "hidden",
      tab !== "stats",
    );
  }

  if (
    tab ===
    "chats"
  ) {
    loadConversations();
  }

  if (
    tab ===
    "users"
  ) {
    loadUsers();
  }

  if (
    tab ===
    "stats"
  ) {
    loadStats();
  }
}

/* ══════════════════════════════════════
   ADMIN CONVERSATIONS
   ══════════════════════════════ */

async function loadConversations() {

  const container =
    $("tabChats");

  if (!container) {
    return;
  }

  container.innerHTML =
    '<div class="spinner"></div>';

  try {

    const d =
      await api(
        "/conversations",
      );

    const conversations =
      d.conversations ||
      [];

    if (!conversations.length) {

      container.innerHTML =
        `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <div>No conversations yet</div>
        </div>
        `;

      return;
    }

    container.innerHTML =
      conversations
        .map(
          c => {

            const name =
              escapeHtml(
                c.first_name ||
                c.username ||
                String(
                  c.user_id,
                ),
              );

            const last =
              escapeHtml(
                c.last_message ||
                "No messages yet",
              );

            const letter =
              (
                c.first_name ||
                "?"
              )[0]
                .toUpperCase();

            const premiumBadge =
              c.is_premium
                ? `<span class="conv-badge">⭐</span>`
                : "";

            const unread =
              Number(
                c.unread_count,
              ) > 0
                ? `
                  <div class="conv-unread">
                    ${Number(
                      c.unread_count,
                    )}
                  </div>
                `
                : "";

            const time =
              c.last_message_at
                ? formatTime(
                    c.last_message_at,
                  )
                : "";

            const avatarContent =
              c.avatar_url
                ? `
                  <img
                    src="${escapeHtml(
                      c.avatar_url,
                    )}"
                    alt=""
                  >
                `
                : letter;

            return `
              <div
                class="conv-item"
                data-uid="${Number(
                  c.user_id,
                )}"
                data-name="${name}"
              >

                <div class="conv-avatar">
                  ${avatarContent}
                </div>

                <div class="conv-info">

                  <div class="conv-name">
                    ${name}
                    ${premiumBadge}
                  </div>

                  <div class="conv-last">
                    ${last}
                  </div>

                </div>

                <div
                  style="
                    display:flex;
                    flex-direction:column;
                    align-items:flex-end;
                    gap:4px
                  "
                >

                  <div class="conv-time">
                    ${time}
                  </div>

                  ${unread}

                </div>

              </div>
            `;
          },
        )
        .join("");

    container
      .querySelectorAll(
        ".conv-item",
      )
      .forEach(
        el => {

          el.onclick =
            () => {

              const uid =
                el.dataset.uid;

              const user =
                conversations.find(
                  c =>
                    String(
                      c.user_id,
                    ) ===
                    String(uid),
                );

              openAdminChat(
                uid,
                el.dataset.name,
                user,
              );
            };
        },
      );

  } catch (e) {

    console.error(
      "loadConversations:",
      e,
    );

    container.innerHTML =
      `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div>Unable to load conversations</div>
      </div>
      `;

    toast(
      e.message,
    );
  }
}

/* ══════════════════════════════════════
   ADMIN USERS
   ══════════════════════════════════════ */

async function loadUsers() {

  const container =
    $("usersList");

  if (!container) {
    return;
  }

  container.innerHTML =
    '<div class="spinner"></div>';

  try {

    const d =
      await api(
        "/admin-users",
      );

    const users =
      d.users ||
      [];

    if (!users.length) {

      container.innerHTML =
        `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <div>No users yet</div>
        </div>
        `;

      return;
    }

    container.innerHTML =
      users
        .map(
          u => {

            const name =
              escapeHtml(
                u.first_name ||
                u.username ||
                String(
                  u.id,
                ),
              );

            const isPremium =
              u.subscription
                ?.active ===
              true;

            const badgeCls =
              u.is_banned
                ? "banned"
                : isPremium
                  ? "premium"
                  : "free";

            const badgeTxt =
              u.is_banned
                ? "Banned"
                : isPremium
                  ? "⭐ Premium"
                  : "Free";

            const avatarLetter =
              (
                u.first_name ||
                "?"
              )[0]
                .toUpperCase();

            const avatarContent =
              u.avatar_url
                ? `
                  <img
                    src="${escapeHtml(
                      u.avatar_url,
                    )}"
                    alt=""
                  >
                `
                : avatarLetter;

            return `
              <div class="user-row">

                <div
                  class="conv-avatar"
                  style="
                    width:40px;
                    height:40px;
                    font-size:15px
                  "
                >
                  ${avatarContent}
                </div>

                <div class="user-row-info">

                  <div class="user-row-name">

                    ${name}

                    <span
                      class="badge ${badgeCls}"
                    >
                      ${badgeTxt}
                    </span>

                  </div>

                  <div class="user-row-sub">

                    ID: ${Number(
                      u.id,
                    )}

                    ${
                      u.username
                        ? " · @" +
                          escapeHtml(
                            u.username,
                          )
                        : ""
                    }

                  </div>

                </div>

                <div class="user-row-actions">

                  ${
                    !u.is_banned
                      ? `
                        <button
                          class="admin-action-btn success"
                          onclick="adminGrant(${Number(
                            u.id,
                          )})"
                          title="Grant Lifetime Premium"
                        >
                          ⭐
                        </button>

                        <button
                          class="admin-action-btn danger"
                          onclick="adminBan(${Number(
                            u.id,
                          )})"
                          title="Ban User"
                        >
                          🚫
                        </button>
                      `
                      : `
                        <button
                          class="admin-action-btn"
                          onclick="adminUnban(${Number(
                            u.id,
                          )})"
                          title="Unban User"
                        >
                          ✅
                        </button>
                      `
                  }

                </div>

              </div>
            `;
          },
        )
        .join("");

  } catch (e) {

    console.error(
      "loadUsers:",
      e,
    );

    toast(
      e.message,
    );
  }
}

/* ══════════════════════════════════════
   ADMIN STATS
   ══════════════════════════════════════ */

async function loadStats() {

  try {

    const d =
      await api(
        "/admin-stats",
      );

    if ($("statTotal")) {
      $("statTotal").textContent =
        d.total_users ??
        "—";
    }

    if ($("statPremium")) {
      $("statPremium").textContent =
        d.premium_users ??
        "—";
    }

    if ($("statMsgs")) {
      $("statMsgs").textContent =
        d.total_messages ??
        "—";
    }

    if ($("statRevenue")) {
      $("statRevenue").textContent =
        d.revenue_stars ??
        "—";
    }

    if ($("statBanned")) {
      $("statBanned").textContent =
        d.banned_users ??
        "—";
    }

    if ($("statActive")) {
      $("statActive").textContent =
        d.active_today ??
        "—";
    }

  } catch (e) {

    console.error(
      "loadStats:",
      e,
    );
  }
}

/* ══════════════════════════════════════
   OPEN ADMIN CHAT
   ══════════════════════════════════════ */

async function openAdminChat(
  uid,
  name,
  userData,
) {

  if (
    !isCurrentUserAdmin()
  ) {
    return;
  }

  state.adminUserId =
    String(uid);

  state.adminUserData =
    userData || {};

  if ($("adminChatName")) {
    $("adminChatName").textContent =
      name ||
      "User";
  }

  if ($("adminChatSub")) {
    $("adminChatSub").textContent =
      "User ID: " +
      uid;
  }

  const avatarEl =
    $("adminChatAvatar");

  if (avatarEl) {

    if (
      userData?.avatar_url
    ) {

      avatarEl.innerHTML =
        `
        <img
          src="${escapeHtml(
            userData.avatar_url,
          )}"
          alt=""
          style="
            width:100%;
            height:100%;
            object-fit:cover;
            border-radius:50%
          "
        >
        `;

    } else {

      avatarEl.textContent =
        (
          name ||
          "?"
        )[0]
          .toUpperCase();
    }
  }

  /*
    Ban button.
  */

  const banBtn =
    $("adminBanBtn");

  if (banBtn) {

    banBtn.textContent =
      userData?.is_banned
        ? "✅ Unban"
        : "🚫 Ban";

    banBtn.onclick =
      () =>
        userData?.is_banned
          ? adminUnban(
              uid,
            )
          : adminBan(
              uid,
            );
  }

  const adminChat =
    $("adminChat");

  if (adminChat) {
    adminChat.classList.add(
      "open",
    );
  }

  await loadAdminMessages();
}

/* ══════════════════════════════════════
   LOAD ADMIN MESSAGES
   ══════════════════════════════════════ */

async function loadAdminMessages() {

  if (
    !state.adminUserId
  ) {
    return;
  }

  try {

    const d =
      await api(
        "/admin-messages?user_id=" +
          encodeURIComponent(
            state.adminUserId,
          ),
      );

    renderMessages(
      $("adminChatMessages"),
      d.messages || [],
      Number(
        state.me?.id,
      ),
      true,
    );

  } catch (e) {

    console.error(
      "loadAdminMessages:",
      e,
    );

    toast(
      e.message,
    );
  }
}

/* ══════════════════════════════════════
   SEND ADMIN MESSAGE
   ══════════════════════════════════════ */

async function sendAdminMessage() {

  if (
    !isCurrentUserAdmin()
  ) {
    return;
  }

  const input =
    $("adminMessageInput");

  if (!input) {
    return;
  }

  const text =
    input.value.trim();

  if (
    !text ||
    !state.adminUserId
  ) {
    return;
  }

  if (
    text.length >
    4000
  ) {

    toast(
      "Message too long.",
    );

    return;
  }

  input.value =
    "";

  autoResize(
    input,
  );

  try {

    await api(
      "/admin-messages",
      {
        method:
          "POST",

        body:
          JSON.stringify({
            user_id:
              Number(
                state.adminUserId,
              ),

            text:
              text,
          }),
      },
    );

    await loadAdminMessages();

    /*
      Refresh inbox preview.
    */

    if (
      state.adminTab ===
      "chats"
    ) {

      loadConversations()
        .catch(
          () => {},
        );
    }

  } catch (e) {

    /*
      Restore failed message.
    */

    input.value =
      text;

    autoResize(
      input,
    );

    toast(
      e.message,
    );
  }
}

/* ══════════════════════════════════════
   ADMIN GRANT LIFETIME PREMIUM
   ══════════════════════════════════════ */

async function adminGrant(
  userId,
) {

  if (
    !isCurrentUserAdmin()
  ) {
    return;
  }

  showConfirm(
    "Grant Premium?",
    "Give lifetime premium to this user.",
    async () => {

      try {

        await api(
          "/admin-grant",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                user_id:
                  Number(
                    userId,
                  ),
              }),
          },
        );

        toast(
          "⭐ Premium granted!",
        );

        if (
          state.adminTab ===
          "users"
        ) {
          await loadUsers();
        }

      } catch (e) {

        toast(
          e.message,
        );
      }
    },
    true,
  );
}

/* ══════════════════════════════════════
   ADMIN BAN
   ══════════════════════════════════════ */

async function adminBan(
  userId,
) {

  if (
    !isCurrentUserAdmin()
  ) {
    return;
  }

  showConfirm(
    "Ban User?",
    "This user will be blocked from using the app.",
    async () => {

      try {

        await api(
          "/admin-ban",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                user_id:
                  Number(
                    userId,
                  ),
              }),
          },
        );

        toast(
          "🚫 User banned.",
        );

        if (
          state.adminTab ===
          "users"
        ) {
          await loadUsers();
        }

        /*
          Update currently open
          admin chat button.
        */

        if (
          $("adminChat") &&
          $("adminChat").classList.contains(
            "open",
          )
        ) {

          if (
            $("adminBanBtn")
          ) {

            $("adminBanBtn").textContent =
              "✅ Unban";

            $("adminBanBtn").onclick =
              () =>
                adminUnban(
                  userId,
                );
          }
        }

      } catch (e) {

        toast(
          e.message,
        );
      }
    },
    false,
  );
}

/* ══════════════════════════════════════
   ADMIN UNBAN
   ══════════════════════════════════════ */

async function adminUnban(
  userId,
) {

  if (
    !isCurrentUserAdmin()
  ) {
    return;
  }

  try {

    await api(
      "/admin-unban",
      {
        method:
          "POST",

        body:
          JSON.stringify({
            user_id:
              Number(
                userId,
              ),
          }),
      },
    );

    toast(
      "✅ User unbanned.",
    );

    if (
      state.adminTab ===
      "users"
    ) {
      await loadUsers();
    }

    if (
      $("adminChat") &&
      $("adminChat").classList.contains(
        "open",
      )
    ) {

      if (
        $("adminBanBtn")
      ) {

        $("adminBanBtn").textContent =
          "🚫 Ban";

        $("adminBanBtn").onclick =
          () =>
            adminBan(
              userId,
            );
      }
    }

  } catch (e) {

    toast(
      e.message,
    );
  }
}

/* ══════════════════════════════════════
   CONFIRM MODAL
   ══════════════════════════════════════ */

function showConfirm(
  title,
  body,
  onConfirm,
  safe = false,
) {

  if ($("confirmTitle")) {
    $("confirmTitle").textContent =
      title;
  }

  if ($("confirmBody")) {
    $("confirmBody").textContent =
      body;
  }

  const modal =
    $("confirmModal");

  if (!modal) {
    return;
  }

  modal.classList.remove(
    "hidden",
  );

  const okBtn =
    $("confirmOk");

  const cancelBtn =
    $("confirmCancel");

  if (okBtn) {

    okBtn.className =
      "modal-btn " +
      (
        safe
          ? "confirm-safe"
          : "confirm"
      );

    okBtn.onclick =
      () => {

        modal.classList.add(
          "hidden",
        );

        try {
          onConfirm();
        } catch (e) {
          console.error(e);
        }
      };
  }

  if (cancelBtn) {

    cancelBtn.onclick =
      () =>
        modal.classList.add(
          "hidden",
        );
  }
}

/* ══════════════════════════════════════
   EVENT LISTENERS
   ══════════════════════════════════════ */

const openChatBtn =
  $("openChatBtn");

if (openChatBtn) {
  openChatBtn.onclick =
    openChat;
}

const subscribeBtn =
  $("subscribeBtn");

if (subscribeBtn) {
  subscribeBtn.onclick =
    subscribe;
}

const editProfileBtn =
  $("editProfileBtn");

if (editProfileBtn) {
  editProfileBtn.onclick =
    openProfileEdit;
}

const cancelProfileBtn =
  $("cancelProfileBtn");

if (cancelProfileBtn) {
  cancelProfileBtn.onclick =
    closeProfileEdit;
}

const saveProfileBtn =
  $("saveProfileBtn");

if (saveProfileBtn) {
  saveProfileBtn.onclick =
    saveProfile;
}

const profileSheet =
  $("profileSheet");

if (profileSheet) {

  profileSheet.addEventListener(
    "click",
    e => {

      if (
        e.target ===
        profileSheet
      ) {

        closeProfileEdit();
      }
    },
  );
}

/* ══════════════════════════════════════
   USER MESSAGE INPUT
   ══════════════════════════════════════ */

const sendBtn =
  $("sendBtn");

if (sendBtn) {
  sendBtn.onclick =
    sendMessage;
}

const messageInput =
  $("messageInput");

if (messageInput) {

  messageInput.addEventListener(
    "input",
    e => {

      autoResize(
        e.target,
      );

      if (sendBtn) {
        sendBtn.disabled =
          !e.target.value.trim();
      }
    },
  );

  messageInput.addEventListener(
    "keydown",
    e => {

      if (
        e.key ===
          "Enter" &&
        !e.shiftKey
      ) {

        e.preventDefault();

        sendMessage();
      }
    },
  );
}

/* ══════════════════════════════════════
   CANCEL EDIT
   ══════════════════════════════════════ */

const cancelEditBtn =
  $("cancelEditBtn");

if (cancelEditBtn) {
  cancelEditBtn.onclick =
    clearEditMode;
}

/* ══════════════════════════════════════
   USER BACK
   ══════════════════════════════════════ */

const backBtn =
  $("backBtn");

if (backBtn) {

  backBtn.onclick =
    () => {

      clearInterval(
        state.poll,
      );

      clearEditMode();

      show(
        "homeView",
      );
    };
}

/* ══════════════════════════════════════
   ADMIN BUTTON
   ══════════════════════════════════════ */

const adminBtn =
  $("adminBtn");

if (adminBtn) {
  adminBtn.onclick =
    openAdmin;
}

/* ══════════════════════════════════════
   ADMIN BACK
   ══════════════════════════════════════ */

const adminBackBtn =
  $("adminBackBtn");

if (adminBackBtn) {

  adminBackBtn.onclick =
    () => {

      const adminChat =
        $("adminChat");

      if (adminChat) {
        adminChat.classList.remove(
          "open",
        );
      }

      show(
        "homeView",
      );
    };
}

/* ══════════════════════════════════════
   ADMIN CHAT BACK
   ══════════════════════════════════════ */

const adminChatBackBtn =
  $("adminChatBackBtn");

if (adminChatBackBtn) {

  adminChatBackBtn.onclick =
    () => {

      const adminChat =
        $("adminChat");

      if (adminChat) {
        adminChat.classList.remove(
          "open",
        );
      }

      /*
        Refresh conversation list
        after returning.
      */

      if (
        state.adminTab ===
        "chats"
      ) {
        loadConversations()
          .catch(
            () => {},
          );
      }
    };
}

/* ══════════════════════════════════════
   ADMIN GRANT BUTTON
   ══════════════════════════════════════ */

const adminGrantBtn =
  $("adminGrantBtn");

if (adminGrantBtn) {

  adminGrantBtn.onclick =
    () => {

      if (
        state.adminUserId
      ) {

        adminGrant(
          state.adminUserId,
        );
      }
    };
}

/* ══════════════════════════════════════
   ADMIN SEND
   ══════════════════════════════════════ */

const adminSendBtn =
  $("adminSendBtn");

if (adminSendBtn) {
  adminSendBtn.onclick =
    sendAdminMessage;
}

const adminMessageInput =
  $("adminMessageInput");

if (adminMessageInput) {

  adminMessageInput.addEventListener(
    "input",
    e =>
      autoResize(
        e.target,
      ),
  );

  adminMessageInput.addEventListener(
    "keydown",
    e => {

      if (
        e.key ===
          "Enter" &&
        !e.shiftKey
      ) {

        e.preventDefault();

        sendAdminMessage();
      }
    },
  );
}

/* ══════════════════════════════════════
   ADMIN TABS
   ══════════════════════════════════════ */

document
  .querySelectorAll(
    ".admin-tab",
  )
  .forEach(
    tab => {

      tab.onclick =
        () =>
          switchAdminTab(
            tab.dataset.tab,
          );
    },
  );

/* ══════════════════════════════════════
   CLOSE CONTEXT MENU
   ══════════════════════════════════════ */

document.addEventListener(
  "click",
  e => {

    const ctx =
      $("msgCtx");

    if (
      ctx &&
      !e.target.closest(
        ".msg-ctx",
      )
    ) {

      ctx.classList.add(
        "hidden",
      );
    }
  },
);

/* ══════════════════════════════════════
   TELEGRAM VIEWPORT
   ══════════════════════════════════════ */

if (tg) {

  try {

    tg.onEvent?.(
      "viewportChanged",
      () => {
        try {
          tg.expand();
        } catch {}
      },
    );

  } catch {}
}

/* ══════════════════════════════════════
   BOOT
   ══════════════════════════════════════ */

loadMe();
