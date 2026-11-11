const {createClient}=require("@supabase/supabase-js");
const nodemailer=require("nodemailer");
const {createHmac,timingSafeEqual}=require("crypto");
const E=process.env;
const esc=s=>String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const site=()=>(E.SITE_URL||("https://"+E.VERCEL_URL)).replace(/\/$/,"");
const tok=e=>createHmac("sha256",E.TOKEN_SECRET).update(e).digest("hex");
const safe=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
function authed(req){const s=E.CRON_SECRET||"";if(!s)return false;const k=(req.query&&req.query.key)||"",h=String(req.headers.authorization||"").replace("Bearer ","");return safe(k,s)||safe(h,s)}
module.exports=async(req,res)=>{
 if(!authed(req))return res.status(401).json({error:"Unauthorized. Use ?key=YOUR_CRON_SECRET (and set CRON_SECRET in Vercel)."});
 const t0=Date.now(),CAP=+E.DAILY_CAP||300,HOURLY=+E.HOURLY_CAP||150,BATCH=+E.BATCH_SIZE||15;
 try{
  const miss=["SUPABASE_URL","SUPABASE_SERVICE_KEY","SMTP_HOST","SMTP_USER","SMTP_PASS","TOKEN_SECRET"].filter(k=>!E[k]);
  if(miss.length)return res.status(500).json({error:"Missing environment variables: "+miss.join(", ")});
  const sb=createClient(E.SUPABASE_URL,E.SUPABASE_SERVICE_KEY,{auth:{persistSession:false}}),now=new Date().toISOString();
  await sb.from("messages").update({status:"queued"}).eq("status","sending").lt("claimed_at",new Date(Date.now()-10*60000).toISOString());
  await sb.from("messages").update({status:"ready"}).in("channel",["wa","sms"]).eq("status","queued").lte("send_at",now);
  const d=new Date(Date.now()+6*36e5);d.setUTCHours(0,0,0,0);const day=new Date(d-6*36e5).toISOString(),hr=new Date(Date.now()-36e5).toISOString();
  const cnt=async s=>{const {count,error}=await sb.from("messages").select("id",{count:"exact",head:true}).eq("channel","email").eq("status","sent").gte("sent_at",s);if(error)throw error;return count||0};
  const room=Math.min(CAP-await cnt(day),HOURLY-await cnt(hr),BATCH);
  if(room<=0)return res.status(200).json({ok:true,sent:0,note:"Daily or hourly limit reached"});
  const {data:rows,error:e1}=await sb.from("messages").select("id").eq("channel","email").eq("status","queued").lte("send_at",now).order("send_at").limit(room);
  if(e1)throw e1;if(!rows||!rows.length)return res.status(200).json({ok:true,sent:0,note:"Nothing to send"});
  const {data:claimed,error:e2}=await sb.from("messages").update({status:"sending",claimed_at:now}).in("id",rows.map(r=>r.id)).eq("status","queued").select();
  if(e2)throw e2;
  const port=+E.SMTP_PORT||465,tr=nodemailer.createTransport({host:E.SMTP_HOST,port,secure:port===465,auth:{user:E.SMTP_USER,pass:E.SMTP_PASS},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
  let sent=0,failed=0,skipped=0;
  for(let i=0;i<claimed.length;i++){const m=claimed[i];
   if(Date.now()-t0>48000){await sb.from("messages").update({status:"queued"}).in("id",claimed.slice(i).map(x=>x.id));break}
   try{
    const {data:c}=await sb.from("contacts").select("unsubscribed").eq("email",m.to_addr).maybeSingle();
    if(c&&c.unsubscribed){await sb.from("messages").update({status:"skipped",error:"Unsubscribed"}).eq("id",m.id);skipped++;continue}
    const link=`${site()}/api/unsub?e=${encodeURIComponent(m.to_addr)}&t=${tok(m.to_addr)}`;
    const btn=m.btn_link?`<p><a href="${esc(m.btn_link)}" style="background:#0B3C26;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(m.btn_text||"Learn more")}</a></p>`:"";
    const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><div style="text-align:center;border-bottom:3px solid #B58922;padding:12px"><img src="${site()}/logo.png" width="56" height="56" alt="E-Service Book" style="border-radius:50%"></div><div style="padding:16px;color:#17231c">${esc(m.body).replace(/\n/g,"<br>")}${btn}</div><div style="font-size:12px;color:#667069;padding:12px;background:#f2f5f3">Bangladesh e-Servicebook Company Ltd. · <a href="${link}">Unsubscribe</a></div></div>`;
    await tr.sendMail({from:`"${E.FROM_NAME||"E-Service Book"}" <${E.SMTP_USER}>`,to:m.to_addr,subject:m.subject||"(no subject)",text:(m.body||"")+(m.btn_link?`\n\n${m.btn_link}`:"")+`\n\nUnsubscribe: ${link}`,html,headers:{"List-Unsubscribe":`<${link}>`,"List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}});
    await sb.from("messages").update({status:"sent",sent_at:new Date().toISOString(),error:null}).eq("id",m.id);sent++;
   }catch(err){const a=(m.attempts||0)+1;failed++;await sb.from("messages").update({attempts:a,status:a>=3?"failed":"queued",error:String(err.message||err).slice(0,300)}).eq("id",m.id)}
   await new Promise(r=>setTimeout(r,800));
  }
  return res.status(200).json({ok:true,sent,failed,skipped});
 }catch(e){return res.status(500).json({error:String((e&&e.message)||e)})}
};
