/* ══════════════════════════════════════
   Sanya Messenger — Premium App Logic
   Fully preserves original API & workflow
   New: edit/unsend/delete, profile edit,
        avatar upload, admin tabs/powers
   ══════════════════════════════════════ */

const tg = window.Telegram?.WebApp;
const API = (window.SUPABASE_FUNCTION_URL || "https://YOUR_PROJECT_REF.supabase.co/functions/v1/api").replace(/\/$/, "");

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

/* ── Telegram init ── */
if (tg) {
  tg.ready();
  tg.expand();
  tg.setBackgroundColor("#000000");
  tg.setHeaderColor("#000000");
}

/* ── Helpers ── */
const $ = id => document.getElementById(id);

function initData() {
  return tg?.initData || "";
}

function headers() {
  return {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": initData()
  };
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

let toastTimer = null;

function toast(msg, duration = 2400) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(
    () => el.classList.remove("show"),
    duration
  );
}

function show(id) {
  ["homeView", "chatView", "adminView"].forEach(
    x => $(x).classList.add("hidden")
  );

  $(id).classList.remove("hidden");
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c])
  );
}

function formatTime(s) {
  return new Date(s).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDate(s) {
  const d = new Date(s);
  const today = new Date();
  const yesterday = new Date(today);

  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) {
    return "Today";
  }

  if (d.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height =
    Math.min(textarea.scrollHeight, 140) + "px";
}

function setAvatar(imgEl, textEl, url, letter) {
  if (url) {
    imgEl.src = url;
    imgEl.style.display = "block";

    if (textEl) {
      textEl.textContent = "";
    }
  } else {
    imgEl.style.display = "none";

    if (textEl) {
      textEl.textContent = letter || "?";
    }
  }
}

/* ══ Load Me ══ */

async function loadMe() {
  if (!initData()) {
    toast("Open from Telegram.");
    return;
  }

  try {
    state.me = await api("/me");

    const {
      first_name,
      username,
      bio,
      avatar_url,
      is_admin,
      subscription
    } = state.me;

    /* Topbar */
    $("brandName").textContent =
      first_name || "Sanya";

    $("statusText").textContent =
      is_admin ? "Admin" : "Messenger";

    setAvatar(
      $("brandAvatarImg"),
      $("brandAvatar"),
      avatar_url,
      (first_name || "S")[0]
    );

    /* Hero */
    $("heroName").textContent =
      first_name || "Sanya";

    $("heroBio").textContent =
      bio || "Private messaging inside Telegram.";

    $("heroUsername").textContent =
      username ? "@" + username : "";

    setAvatar(
      $("heroAvatarImg"),
      $("heroAvatar"),
      avatar_url,
      (first_name || "S")[0]
    );

    /* Chat head */
    $("chatHeadName").textContent =
      first_name || "Sanya";

    setAvatar(
      $("chatMiniAvatarImg"),
      $("chatMiniAvatar"),
      avatar_url,
      (first_name || "S")[0]
    );

    /* Admin button */
    $("adminBtn").classList.toggle(
      "hidden",
      !is_admin
    );

    /* Plan badge */
    const badge = $("planBadge");

    if (subscription?.lifetime) {
      badge.textContent =
        "✨ Lifetime Premium";

      badge.classList.add("active");

    } else if (subscription?.active) {
      badge.textContent =
        "⭐ Premium Active";

      badge.classList.add("active");

    } else {
      badge.textContent =
        "Premium required";

      badge.classList.remove("active");
    }

    /*
      Admin never needs to purchase Premium.
      Normal users see the button only when
      they don't have active Premium.
    */
    $("subscribeBtn").classList.toggle(
      "hidden",
      is_admin || !!subscription?.active
    );

  } catch (e) {
    toast(e.message);
  }
}

/* ══ Chat ══ */

async function openChat() {

  /*
    IMPORTANT:
    Admin can always open the chat.

    Normal users require active Premium.
  */

  const isAdmin =
    state.me?.is_admin === true;

  const hasPremium =
    state.me?.subscription?.active === true;

  if (!isAdmin && !hasPremium) {
    toast("⭐ Premium required to chat.");
    return;
  }

  state.chatUserId =
    state.me.id;

  clearEditMode();

  show("chatView");

  await loadMessages();

  startPolling();
}

let lastMsgDate = null;

async function loadMessages() {
  try {
    const d = await api("/messages");

    renderMessages(
      $("messages"),
      d.messages,
      state.me.id,
      false
    );

  } catch (e) {
    /* silent */
  }
}

function renderMessages(
  container,
  list,
  myId,
  isAdmin
) {

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
      formatDate(m.created_at);

    if (msgDate !== lastDate) {

      html += `
        <div class="day-divider">
          ${escapeHtml(msgDate)}
        </div>
      `;

      lastDate = msgDate;
    }

    const isMine =
      m.sender_id === myId ||
      (isAdmin &&
        m.sender_id !== state.adminUserId);

    const cls =
      isMine ? "mine" : "theirs";

    const deleted =
      m.deleted_at ? "deleted" : "";

    const edited =
      m.edited_at && !m.deleted_at
        ? "edited"
        : "";

    const content =
      m.deleted_at
        ? "🚫 Message deleted"
        : escapeHtml(m.text);

    const canEdit =
      isMine &&
      !m.deleted_at &&
      !isAdmin;

    const canDelete =
      isMine &&
      !m.deleted_at;

    const canUnsend =
      canDelete;

    const tick =
      isMine
        ? `<span class="tick ${
            m.seen_at ? "seen" : ""
          }">✓✓</span>`
        : "";

    html += `
      <div
        class="bubble-wrap ${cls}"
        data-id="${m.id}"
      >

        <div
          class="bubble ${deleted} ${edited}"
          data-id="${m.id}"
          data-text="${escapeHtml(m.text || "")}"
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

  container.innerHTML = html;

  container.scrollTop =
    container.scrollHeight;

  /* Long press + right click */

  container
    .querySelectorAll(".bubble")
    .forEach(b => {

      let pressTimer = null;

      b.addEventListener(
        "contextmenu",
        e => {
          e.preventDefault();
          showMsgCtx(
            e,
            b,
            isAdmin
          );
        }
      );

      b.addEventListener(
        "touchstart",
        e => {
          pressTimer =
            setTimeout(
              () =>
                showMsgCtx(
                  e.touches[0],
                  b,
                  isAdmin
                ),
              500
            );
        },
        { passive: true }
      );

      b.addEventListener(
        "touchend",
        () => clearTimeout(pressTimer)
      );

      b.addEventListener(
        "touchmove",
        () => clearTimeout(pressTimer)
      );
    });
}

/* ── Message Context Menu ── */

function showMsgCtx(
  e,
  bubble,
  isAdmin
) {

  const id =
    bubble.dataset.id;

  const text =
    bubble.dataset.text;

  const isMine =
    bubble.dataset.mine === "true";

  const isDeleted =
    bubble.dataset.deleted === "true";

  const canEdit =
    bubble.dataset.canEdit === "true";

  if (isDeleted) return;

  const items = [];

  if (canEdit) {

    items.push({
      label: "✏️ Edit",
      icon: "edit",
      action: () =>
        startEdit(id, text)
    });

    items.push({
      label: "↩️ Unsend",
      icon: "unsend",
      action: () =>
        confirmUnsend(id),
      danger: true
    });
  }

  if (!isAdmin && isMine) {

    items.push({
      label: "🗑️ Delete",
      icon: "delete",
      action: () =>
        confirmDelete(id),
      danger: true
    });
  }

  if (isAdmin) {

    items.push({
      label: "🗑️ Delete (Admin)",
      icon: "delete",
      action: () =>
        adminDeleteMsg(id),
      danger: true
    });
  }

  items.push({
    label: "📋 Copy",
    icon: "copy",
    action: () => {
      navigator.clipboard?.writeText(text);
      toast("Copied!");
    }
  });

  if (!items.length) return;

  const ctx =
    $("msgCtx");

  ctx.innerHTML =
    items
      .map(
        item => `
          <div
            class="msg-ctx-item ${
              item.danger ? "danger" : ""
            }"
            data-action="${item.icon}"
          >
            ${item.label}
          </div>
        `
      )
      .join("");

  const x =
    Math.min(
      (e.clientX ||
        e.pageX ||
        50),
      window.innerWidth - 180
    );

  const y =
    Math.min(
      (e.clientY ||
        e.pageY ||
        50),
      window.innerHeight -
        (items.length * 48 + 12)
    );

  ctx.style.left =
    x + "px";

  ctx.style.top =
    y + "px";

  ctx.classList.remove(
    "hidden"
  );

  const actionEls =
    ctx.querySelectorAll(
      ".msg-ctx-item"
    );

  actionEls.forEach(
    (el, i) => {
      el.onclick = () => {
        ctx.classList.add(
          "hidden"
        );

        items[i].action();
      };
    }
  );

  setTimeout(
    () =>
      document.addEventListener(
        "click",
        closeMsgCtx,
        { once: true }
      ),
    10
  );
}

function closeMsgCtx() {
  $("msgCtx")
    .classList
    .add("hidden");
}

/* ── Edit Message ── */

function startEdit(id, text) {

  state.editingMsgId =
    id;

  const input =
    $("messageInput");

  input.value = text;

  input.focus();

  autoResize(input);

  $("editBanner")
    .classList
    .remove("hidden");

  $("sendBtn").disabled =
    false;
}

function clearEditMode() {

  state.editingMsgId =
    null;

  $("messageInput").value =
    "";

  $("editBanner")
    .classList
    .add("hidden");

  $("sendBtn").disabled =
    true;
}

/* ── Unsend / Delete ── */

function confirmUnsend(id) {

  showConfirm(
    "Unsend Message?",
    "This will delete your message for everyone.",
    async () => {

      try {

        await api(
          "/messages/" +
            id +
            "/unsend",
          {
            method: "POST"
          }
        );

        toast(
          "Message unsent."
        );

        await loadMessages();

      } catch (e) {
        toast(e.message);
      }
    }
  );
}

function confirmDelete(id) {

  showConfirm(
    "Delete Message?",
    "Delete this message for yourself.",
    async () => {

      try {

        await api(
          "/messages/" +
            id,
          {
            method: "DELETE"
          }
        );

        toast("Deleted.");

        await loadMessages();

      } catch (e) {
        toast(e.message);
      }
    },
    false
  );
}

async function adminDeleteMsg(id) {

  try {

    await api(
      "/admin-messages/" +
        id,
      {
        method: "DELETE"
      }
    );

    toast(
      "Message deleted."
    );

    await loadAdminMessages();

  } catch (e) {
    toast(e.message);
  }
}

/* ── Send / Edit ── */

async function sendMessage() {

  const input =
    $("messageInput");

  const text =
    input.value.trim();

  if (!text) return;

  $("sendBtn").disabled =
    true;

  try {

    if (state.editingMsgId) {

      await api(
        "/messages/" +
          state.editingMsgId,
        {
          method: "PATCH",
          body: JSON.stringify({
            text
          })
        }
      );

      toast(
        "Message edited."
      );

      clearEditMode();

    } else {

      input.value = "";

      autoResize(input);

      await api(
        "/messages",
        {
          method: "POST",
          body: JSON.stringify({
            text
          })
        }
      );
    }

    await loadMessages();

  } catch (e) {

    toast(e.message);
  }

  $("sendBtn").disabled =
    !$("messageInput")
      .value.trim();
}

function startPolling() {

  clearInterval(
    state.poll
  );

  state.poll =
    setInterval(() => {

      if (
        !$("chatView")
          .classList
          .contains("hidden")
      ) {
        loadMessages()
          .catch(() => {});
      }

    }, 2000);
}

/* ══ Subscribe ══ */

async function subscribe() {

  try {

    const d =
      await api(
        "/create-invoice"
      );

    if (tg?.openInvoice) {

      tg.openInvoice(
        d.invoice_url,
        result => {

          if (
            result === "paid"
          ) {

            toast(
              "✨ Premium activated!"
            );

            loadMe();
          }
        }
      );

    } else {

      window.open(
        d.invoice_url,
        "_blank"
      );
    }

  } catch (e) {

    toast(e.message);
  }
}

/* ══ Profile Edit ══ */

function openProfileEdit() {

  const {
    first_name,
    bio,
    username,
    avatar_url
  } = state.me || {};

  $("editName").value =
    first_name || "";

  $("editBio").value =
    bio || "";

  $("editUsername").value =
    username || "";

  state.avatarDataUrl =
    null;

  const img =
    $("sheetAvatarImg");

  const preview =
    $("sheetAvatarPreview");

  if (avatar_url) {

    img.src =
      avatar_url;

    img.style.display =
      "block";

    preview.textContent =
      "";

    preview.appendChild(
      img
    );

  } else {

    img.style.display =
      "none";

    preview.textContent =
      (first_name || "S")[0];
  }

  $("profileSheet")
    .classList
    .remove("hidden");
}

function closeProfileEdit() {

  $("profileSheet")
    .classList
    .add("hidden");

  state.avatarDataUrl =
    null;
}

async function saveProfile() {

  const name =
    $("editName")
      .value
      .trim();

  const bio =
    $("editBio")
      .value
      .trim();

  const username =
    $("editUsername")
      .value
      .trim()
      .replace(/^@/, "");

  try {

    await api(
      "/profile",
      {
        method: "PATCH",
        body: JSON.stringify({
          first_name: name,
          bio,
          username,
          avatar_data_url:
            state.avatarDataUrl ||
            undefined
        })
      }
    );

    toast(
      "✅ Profile saved!"
    );

    closeProfileEdit();

    await loadMe();

  } catch (e) {

    toast(e.message);
  }
}

/* Avatar upload */

$("avatarFileInput")
  .addEventListener(
    "change",
    e => {

      const file =
        e.target.files[0];

      if (!file) return;

      if (
        file.size >
        5 * 1024 * 1024
      ) {

        toast(
          "Image too large (max 5MB)"
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

          img.src =
            ev.target.result;

          img.style.display =
            "block";

          preview.textContent =
            "";

          preview.appendChild(
            img
          );
        };

      reader.readAsDataURL(
        file
      );
    }
  );

/* Tap hero avatar edit button */

$("heroAvatarEdit")
  .addEventListener(
    "click",
    () => {

      openProfileEdit();

      setTimeout(
        () =>
          $("avatarFileInput")
            .click(),
        300
      );
    }
  );

/* ══ Admin Panel ══ */

async function openAdmin() {

  if (
    !state.me?.is_admin
  ) {
    return;
  }

  show("adminView");

  $("adminChat")
    .classList
    .remove("open");

  switchAdminTab(
    "chats"
  );
}

function switchAdminTab(tab) {

  state.adminTab =
    tab;

  document
    .querySelectorAll(
      ".admin-tab"
    )
    .forEach(
      t =>
        t.classList.toggle(
          "active",
          t.dataset.tab === tab
        )
    );

  $("tabChats")
    .classList
    .toggle(
      "hidden",
      tab !== "chats"
    );

  $("tabUsers")
    .classList
    .toggle(
      "hidden",
      tab !== "users"
    );

  $("tabStats")
    .classList
    .toggle(
      "hidden",
      tab !== "stats"
    );

  if (tab === "chats") {
    loadConversations();
  }

  if (tab === "users") {
    loadUsers();
  }

  if (tab === "stats") {
    loadStats();
  }
}

async function loadConversations() {

  $("tabChats").innerHTML =
    '<div class="spinner"></div>';

  try {

    const d =
      await api(
        "/conversations"
      );

    if (
      !d.conversations?.length
    ) {

      $("tabChats").innerHTML =
        '<div class="empty-state"><div class="empty-icon">💬</div><div>No conversations yet</div></div>';

      return;
    }

    $("tabChats").innerHTML =
      d.conversations
        .map(c => {

          const name =
            escapeHtml(
              c.first_name ||
              c.username ||
              String(c.user_id)
            );

          const last =
            escapeHtml(
              c.last_message ||
              "No messages yet"
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
            c.unread_count > 0
              ? `<div class="conv-unread">${c.unread_count}</div>`
              : "";

          const time =
            c.last_message_at
              ? formatTime(
                  c.last_message_at
                )
              : "";

          const avatarContent =
            c.avatar_url
              ? `<img src="${escapeHtml(c.avatar_url)}" alt="">`
              : letter;

          return `
            <div
              class="conv-item"
              data-uid="${c.user_id}"
              data-name="${name}"
            >

              <div class="conv-avatar">
                ${avatarContent}
              </div>

              <div class="conv-info">

                <div class="conv-name">
                  ${name}${premiumBadge}
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

        })
        .join("");

    document
      .querySelectorAll(
        ".conv-item"
      )
      .forEach(el => {

        el.onclick =
          () =>
            openAdminChat(
              el.dataset.uid,
              el.dataset.name,
              d.conversations.find(
                c =>
                  String(c.user_id) ===
                  el.dataset.uid
              )
            );
      });

  } catch (e) {

    toast(e.message);
  }
}

async function loadUsers() {

  $("usersList").innerHTML =
    '<div class="spinner"></div>';

  try {

    const d =
      await api(
        "/admin-users"
      );

    if (!d.users?.length) {

      $("usersList").innerHTML =
        '<div class="empty-state"><div class="empty-icon">👥</div><div>No users yet</div></div>';

      return;
    }

    $("usersList").innerHTML =
      d.users
        .map(u => {

          const name =
            escapeHtml(
              u.first_name ||
              u.username ||
              String(u.id)
            );

          const badgeCls =
            u.is_banned
              ? "banned"
              : u.subscription?.active
                ? "premium"
                : "free";

          const badgeTxt =
            u.is_banned
              ? "Banned"
              : u.subscription?.active
                ? "⭐ Premium"
                : "Free";

          const avatarLetter =
            (
              u.first_name ||
              "?"
            )[0].toUpperCase();

          const avatarContent =
            u.avatar_url
              ? `<img src="${escapeHtml(u.avatar_url)}" alt="">`
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
                  <span class="badge ${badgeCls}">
                    ${badgeTxt}
                  </span>
                </div>

                <div class="user-row-sub">
                  ID: ${u.id}${
                    u.username
                      ? " · @" +
                        escapeHtml(
                          u.username
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
                        onclick="adminGrant(${u.id})"
                      >
                        ⭐
                      </button>

                      <button
                        class="admin-action-btn danger"
                        onclick="adminBan(${u.id})"
                      >
                        🚫
                      </button>
                    `

                    : `
                      <button
                        class="admin-action-btn"
                        onclick="adminUnban(${u.id})"
                      >
                        ✅
                      </button>
                    `
                }

              </div>

            </div>
          `;

        })
        .join("");

  } catch (e) {

    toast(e.message);
  }
}

async function loadStats() {

  try {

    const d =
      await api(
        "/admin-stats"
      );

    $("statTotal").textContent =
      d.total_users ?? "—";

    $("statPremium").textContent =
      d.premium_users ?? "—";

    $("statMsgs").textContent =
      d.total_messages ?? "—";

    $("statRevenue").textContent =
      d.revenue_stars ?? "—";

    $("statBanned").textContent =
      d.banned_users ?? "—";

    $("statActive").textContent =
      d.active_today ?? "—";

  } catch (e) {
    /* silent */
  }
}

async function openAdminChat(
  uid,
  name,
  userData
) {

  state.adminUserId =
    String(uid);

  state.adminUserData =
    userData || {};

  $("adminChatName")
    .textContent =
    name || "User";

  $("adminChatSub")
    .textContent =
    "User ID: " + uid;

  const avatarEl =
    $("adminChatAvatar");

  if (
    userData?.avatar_url
  ) {

    avatarEl.innerHTML =
      `<img src="${escapeHtml(userData.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;

  } else {

    avatarEl.textContent =
      (name || "?")[0]
        .toUpperCase();
  }

  $("adminBanBtn")
    .textContent =
    userData?.is_banned
      ? "✅ Unban"
      : "🚫 Ban";

  $("adminBanBtn").onclick =
    () =>
      userData?.is_banned
        ? adminUnban(uid)
        : adminBan(uid);

  $("adminChat")
    .classList
    .add("open");

  await loadAdminMessages();
}

async function loadAdminMessages() {

  try {

    const d =
      await api(
        "/admin-messages?user_id=" +
        encodeURIComponent(
          state.adminUserId
        )
      );

    renderMessages(
      $("adminChatMessages"),
      d.messages,
      state.me.id,
      true
    );

  } catch (e) {

    toast(e.message);
  }
}

async function sendAdminMessage() {

  const input =
    $("adminMessageInput");

  const text =
    input.value.trim();

  if (
    !text ||
    !state.adminUserId
  ) {
    return;
  }

  input.value = "";

  autoResize(input);

  try {

    await api(
      "/admin-messages",
      {
        method: "POST",
        body: JSON.stringify({
          user_id:
            Number(
              state.adminUserId
            ),
          text
        })
      }
    );

    await loadAdminMessages();

  } catch (e) {

    toast(e.message);
  }
}

/* Admin power actions */

async function adminGrant(
  userId
) {

  showConfirm(
    "Grant Premium?",
    "Give lifetime premium to this user.",
    async () => {

      try {

        await api(
          "/admin-grant",
          {
            method: "POST",
            body: JSON.stringify({
              user_id: userId
            })
          }
        );

        toast(
          "⭐ Premium granted!"
        );

        if (
          state.adminTab ===
          "users"
        ) {
          loadUsers();
        }

      } catch (e) {

        toast(e.message);
      }
    },
    true
  );
}

async function adminBan(
  userId
) {

  showConfirm(
    "Ban User?",
    "This user will be blocked from using the app.",
    async () => {

      try {

        await api(
          "/admin-ban",
          {
            method: "POST",
            body: JSON.stringify({
              user_id: userId
            })
          }
        );

        toast(
          "🚫 User banned."
        );

        if (
          state.adminTab ===
          "users"
        ) {
          loadUsers();
        }

        if (
          $("adminChat")
            .classList
            .contains("open")
        ) {
          $("adminBanBtn")
            .textContent =
            "✅ Unban";
        }

      } catch (e) {

        toast(e.message);
      }
    },
    false
  );
}

async function adminUnban(
  userId
) {

  try {

    await api(
      "/admin-unban",
      {
        method: "POST",
        body: JSON.stringify({
          user_id: userId
        })
      }
    );

    toast(
      "✅ User unbanned."
    );

    if (
      state.adminTab ===
      "users"
    ) {
      loadUsers();
    }

    if (
      $("adminChat")
        .classList
        .contains("open")
    ) {
      $("adminBanBtn")
        .textContent =
        "🚫 Ban";
    }

  } catch (e) {

    toast(e.message);
  }
}

/* ══ Confirm Modal ══ */

function showConfirm(
  title,
  body,
  onConfirm,
  safe = false
) {

  $("confirmTitle")
    .textContent =
    title;

  $("confirmBody")
    .textContent =
    body;

  $("confirmModal")
    .classList
    .remove("hidden");

  const okBtn =
    $("confirmOk");

  okBtn.className =
    "modal-btn " +
    (safe
      ? "confirm-safe"
      : "confirm");

  okBtn.onclick =
    () => {

      $("confirmModal")
        .classList
        .add("hidden");

      onConfirm();
    };

  $("confirmCancel")
    .onclick =
    () =>
      $("confirmModal")
        .classList
        .add("hidden");
}

/* ══ Event Listeners ══ */

$("openChatBtn").onclick =
  openChat;

$("subscribeBtn").onclick =
  subscribe;

$("editProfileBtn").onclick =
  openProfileEdit;

$("cancelProfileBtn").onclick =
  closeProfileEdit;

$("saveProfileBtn").onclick =
  saveProfile;

$("profileSheet")
  .addEventListener(
    "click",
    e => {
      if (
        e.target ===
        $("profileSheet")
      ) {
        closeProfileEdit();
      }
    }
  );

$("sendBtn").onclick =
  sendMessage;

$("messageInput")
  .addEventListener(
    "input",
    e => {
      autoResize(e.target);

      $("sendBtn").disabled =
        !e.target.value.trim();
    }
  );

$("messageInput")
  .addEventListener(
    "keydown",
    e => {

      if (
        e.key === "Enter" &&
        !e.shiftKey
      ) {

        e.preventDefault();

        sendMessage();
      }
    }
  );

$("cancelEditBtn").onclick =
  clearEditMode;

$("backBtn").onclick =
  () => {

    clearInterval(
      state.poll
    );

    clearEditMode();

    show("homeView");
  };

$("adminBtn").onclick =
  openAdmin;

$("adminBackBtn").onclick =
  () =>
    show("homeView");

$("adminChatBackBtn").onclick =
  () =>
    $("adminChat")
      .classList
      .remove("open");

$("adminGrantBtn").onclick =
  () =>
    adminGrant(
      state.adminUserId
    );

$("adminSendBtn").onclick =
  sendAdminMessage;

$("adminMessageInput")
  .addEventListener(
    "input",
    e =>
      autoResize(e.target)
  );

$("adminMessageInput")
  .addEventListener(
    "keydown",
    e => {

      if (
        e.key === "Enter" &&
        !e.shiftKey
      ) {

        e.preventDefault();

        sendAdminMessage();
      }
    }
  );

document
  .querySelectorAll(
    ".admin-tab"
  )
  .forEach(tab => {

    tab.onclick =
      () =>
        switchAdminTab(
          tab.dataset.tab
        );
  });

/* Close ctx menu on outside tap */

document.addEventListener(
  "click",
  e => {

    if (
      !e.target.closest(
        ".msg-ctx"
      )
    ) {

      $("msgCtx")
        .classList
        .add("hidden");
    }
  }
);

/* ── Boot ── */

loadMe();
