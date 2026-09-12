const tg = window.Telegram?.WebApp;
const API = (window.SUPABASE_FUNCTION_URL || "https://YOUR_PROJECT_REF.supabase.co/functions/v1/api").replace(/\/$/,"");

let state = { me:null, chatUserId:null, adminUserId:null, poll:null };

if (tg) {
  tg.ready();
  tg.expand();
}

const $ = id => document.getElementById(id);
function initData(){ return tg?.initData || ""; }
function headers(){ return {"Content-Type":"application/json","X-Telegram-Init-Data":initData()}; }

async function api(path, options={}) {
  const res = await fetch(API + path, { ...options, headers:{...headers(),...(options.headers||{})} });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function toast(msg){
  $("toast").textContent=msg;
  $("toast").classList.remove("hidden");
  setTimeout(()=>$("toast").classList.add("hidden"),2200);
}
function show(id){
  ["homeView","chatView","adminView"].forEach(x=>$(x).classList.add("hidden"));
  $(id).classList.remove("hidden");
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function formatTime(s){return new Date(s).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});}

async function loadMe(){
  if(!initData()){ toast("Open this page from Telegram."); return; }
  try{
    state.me = await api("/me");
    $("statusText").textContent = state.me.is_admin ? "Admin" : "Private Messenger";
    $("adminBtn").classList.toggle("hidden",!state.me.is_admin);
    $("planBadge").textContent = state.me.subscription?.active
      ? (state.me.subscription.lifetime ? "Lifetime Premium" : "Premium Active")
      : "Premium required";
    $("subscribeBtn").classList.toggle("hidden",!!state.me.subscription?.active);
  }catch(e){toast(e.message)}
}

async function openChat(){
  if(!state.me?.subscription?.active){toast("Premium is required."); return;}
  state.chatUserId = state.me.id;
  show("chatView");
  await loadMessages();
  startPolling();
}
async function loadMessages(){
  const d=await api("/messages");
  renderMessages($("messages"),d.messages,state.me.id);
}
function renderMessages(el,list,myId){
  el.innerHTML=list.map(m=>`<div class="bubble ${m.sender_id===myId?"mine":"theirs"}">
    ${escapeHtml(m.text)}<div class="time">${formatTime(m.created_at)}</div></div>`).join("");
  el.scrollTop=el.scrollHeight;
}
async function sendMessage(){
  const input=$("messageInput"), text=input.value.trim();
  if(!text)return;
  input.value="";
  try{await api("/messages",{method:"POST",body:JSON.stringify({text})});await loadMessages();}
  catch(e){toast(e.message)}
}
function startPolling(){
  clearInterval(state.poll);
  state.poll=setInterval(()=>{if(!$("chatView").classList.contains("hidden"))loadMessages().catch(()=>{})},1800);
}

async function subscribe(){
  try{
    const d=await api("/create-invoice");
    if(tg?.openInvoice) tg.openInvoice(d.invoice_url, result=>{ if(result==="paid"){toast("Premium activated.");loadMe();} });
    else window.open(d.invoice_url,"_blank");
  }catch(e){toast(e.message)}
}

async function openAdmin(){
  if(!state.me?.is_admin)return;
  show("adminView");
  $("adminChat").classList.add("hidden");
  const d=await api("/conversations");
  $("conversationList").innerHTML=d.conversations.map(c=>`
    <div class="conversation" data-id="${c.user_id}">
      <div class="avatar">${escapeHtml((c.first_name||"?").slice(0,1))}</div>
      <div class="conversation-info"><div class="conversation-name">${escapeHtml(c.first_name||c.username||String(c.user_id))}</div>
      <div class="conversation-last">${escapeHtml(c.last_message||"No messages yet")}</div></div>
    </div>`).join("");
  document.querySelectorAll(".conversation").forEach(x=>x.onclick=()=>openAdminChat(x.dataset.id));
}
async function openAdminChat(id){
  state.adminUserId=String(id);
  $("adminChat").classList.remove("hidden");
  await loadAdminMessages();
}
async function loadAdminMessages(){
  const d=await api("/admin-messages?user_id="+encodeURIComponent(state.adminUserId));
  renderMessages($("adminChatMessages"),d.messages,state.me.id);
}
async function sendAdminMessage(){
  const input=$("adminMessageInput"),text=input.value.trim();
  if(!text||!state.adminUserId)return;
  input.value="";
  try{await api("/admin-messages",{method:"POST",body:JSON.stringify({user_id:Number(state.adminUserId),text})});await loadAdminMessages();}
  catch(e){toast(e.message)}
}

$("openChatBtn").onclick=openChat;
$("subscribeBtn").onclick=subscribe;
$("sendBtn").onclick=sendMessage;
$("messageInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendMessage()});
$("backBtn").onclick=()=>{clearInterval(state.poll);show("homeView")};
$("adminBtn").onclick=openAdmin;
$("adminBackBtn").onclick=()=>show("homeView");
$("adminSendBtn").onclick=sendAdminMessage;
$("adminMessageInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendAdminMessage()});

loadMe();
