import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ADMIN_ID = Number(Deno.env.get("TELEGRAM_ADMIN_ID")!);
const WEBAPP_URL = Deno.env.get("TELEGRAM_WEBAPP_URL")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-telegram-init-data",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function validateTelegramInitData(initData:string){
  if(!initData) throw new Error("Telegram initData missing");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if(!hash) throw new Error("Telegram hash missing");
  params.delete("hash");
  const dataCheck = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
  const secretKey = await crypto.subtle.importKey("raw", new TextEncoder().encode("WebAppData"), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const botSecret = await crypto.subtle.sign("HMAC", secretKey, new TextEncoder().encode(TG_TOKEN));
  const key = await crypto.subtle.importKey("raw", new Uint8Array(botSecret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(dataCheck)));
  const expected = [...sig].map(x=>x.toString(16).padStart(2,"0")).join("");
  if(expected !== hash) throw new Error("Invalid Telegram initData");
  const authDate = Number(params.get("auth_date"));
  if(!authDate || Math.floor(Date.now()/1000)-authDate > 86400) throw new Error("Expired Telegram initData");
  const user = JSON.parse(params.get("user") || "{}");
  if(!user.id) throw new Error("Telegram user missing");
  return user;
}

async function auth(req:Request){
  const user = await validateTelegramInitData(req.headers.get("x-telegram-init-data") || "");
  await db.from("profiles").upsert({
    user_id:user.id, username:user.username ?? null, first_name:user.first_name ?? null,
    last_name:user.last_name ?? null, photo_url:user.photo_url ?? null, updated_at:new Date().toISOString()
  });
  const {data:profile}=await db.from("profiles").select("*").eq("user_id",user.id).single();
  if(profile?.is_banned) throw new Error("Account is blocked");
  return user;
}

async function tg(method:string, body:any){
  const r=await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)
  });
  const d=await r.json();
  if(!d.ok) throw new Error(d.description || "Telegram API error");
  return d.result;
}

async function activePlan(userId:number){
  const {data}=await db.from("subscriptions").select("*").eq("user_id",userId).maybeSingle();
  if(!data) return {active:false,lifetime:false,end:null};
  const active=data.lifetime || (data.is_active && data.subscription_end && new Date(data.subscription_end)>new Date());
  return {active,lifetime:data.lifetime,end:data.subscription_end};
}

async function handler(req:Request){
  // Handle CORS preflight before authentication
  if(req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url=new URL(req.url), path=url.pathname.split("/").filter(Boolean).pop() || "";
  const user=await auth(req);

  if(req.method==="GET" && path==="me"){
    return Response.json({id:user.id,username:user.username,is_admin:user.id===ADMIN_ID,subscription:await activePlan(user.id)}, {headers: corsHeaders});
  }

  if(req.method==="GET" && path==="messages"){
    const {data,error}=await db.from("messages").select("id,user_id,sender_id,text,created_at").eq("user_id",user.id).order("created_at");
    if(error) throw error;
    return Response.json({messages:data}, {headers: corsHeaders});
  }

  if(req.method==="POST" && path==="messages"){
    // Admin users bypass Premium requirement; normal users must have active Premium
    const isAdmin = user.id === ADMIN_ID;
    if(!isAdmin){
      const plan=await activePlan(user.id);
      if(!plan.active) return Response.json({error:"Premium required"}, {status:403, headers: corsHeaders});
    }
    const {text}=await req.json();
    if(typeof text!=="string" || !text.trim()) return Response.json({error:"Empty message"}, {status:400, headers: corsHeaders});
    const {data,error}=await db.from("messages").insert({user_id:user.id,sender_id:user.id,text:text.trim()}).select().single();
    if(error) throw error;
    return Response.json({message:data}, {headers: corsHeaders});
  }

  if(req.method==="GET" && path==="admin"){
    if(user.id!==ADMIN_ID) return Response.json({error:"Forbidden"},{status:403, headers: corsHeaders});
  }

  if(req.method==="GET" && path==="conversations"){
    if(user.id!==ADMIN_ID) return Response.json({error:"Forbidden"},{status:403, headers: corsHeaders});
    const {data:profiles}=await db.from("profiles").select("*").order("updated_at",{ascending:false}).limit(500);
    const out=[];
    for(const p of profiles||[]){
      const {data:m}=await db.from("messages").select("text,created_at").eq("user_id",p.user_id).order("created_at",{ascending:false}).limit(1);
      out.push({...p,last_message:m?.[0]?.text||null,last_message_at:m?.[0]?.created_at||null});
    }
    return Response.json({conversations:out}, {headers: corsHeaders});
  }

  if(req.method==="GET" && path==="messages"){
    // handled above for normal users; admin uses /admin/messages
  }

  if(req.method==="GET" && path==="admin-messages"){
    if(user.id!==ADMIN_ID) return Response.json({error:"Forbidden"},{status:403, headers: corsHeaders});
    const target=Number(url.searchParams.get("user_id"));
    const {data,error}=await db.from("messages").select("*").eq("user_id",target).order("created_at");
    if(error) throw error;
    return Response.json({messages:data}, {headers: corsHeaders});
  }

  if(req.method==="POST" && path==="admin-messages"){
    if(user.id!==ADMIN_ID) return Response.json({error:"Forbidden"},{status:403, headers: corsHeaders});
    const {user_id,text}=await req.json();
    const {data,error}=await db.from("messages").insert({user_id:Number(user_id),sender_id:ADMIN_ID,text:String(text).trim()}).select().single();
    if(error) throw error;
    await tg("sendMessage",{chat_id:Number(user_id),text:String(text).trim()});
    return Response.json({message:data}, {headers: corsHeaders});
  }

  if(req.method==="GET" && path==="create-invoice"){
    const plan=await activePlan(user.id);
    if(plan.active) return Response.json({error:"Premium already active"},{status:400, headers: corsHeaders});
    const payload=`sanya_premium_${user.id}_${Date.now()}`;
    const invoice_url=await tg("createInvoiceLink",{
      title:"Sanya Premium",
      description:"30 days of private Premium messaging.",
      payload,
      currency:"XTR",
      prices:[{label:"Premium — 30 Days",amount:299}],
      subscription_period:2592000
    });
    return Response.json({invoice_url}, {headers: corsHeaders});
  }

  return Response.json({error:"Not found"},{status:404, headers: corsHeaders});
}

Deno.serve(async req=>{
  try{return await handler(req)}
  catch(e){return Response.json({error:e?.message||"Server error"},{status:400, headers: corsHeaders})}
});
