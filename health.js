const {createClient}=require("@supabase/supabase-js");
const nodemailer=require("nodemailer");
const {timingSafeEqual}=require("crypto");
const E=process.env;
module.exports=async(req,res)=>{
 const s=E.CRON_SECRET||"",k=String((req.query&&req.query.key)||"");
 if(!s||Buffer.byteLength(k)!==Buffer.byteLength(s)||!timingSafeEqual(Buffer.from(k),Buffer.from(s)))return res.status(401).json({error:"Use /api/health?key=YOUR_CRON_SECRET"});
 const names=["SUPABASE_URL","SUPABASE_SERVICE_KEY","SMTP_HOST","SMTP_PORT","SMTP_USER","SMTP_PASS","SITE_URL","TOKEN_SECRET","CRON_SECRET","OWNER_CODE_HASH"];
 const out={env:Object.fromEntries(names.map(n=>[n,E[n]?"set":"MISSING"]))};
 try{const sb=createClient(E.SUPABASE_URL,E.SUPABASE_SERVICE_KEY,{auth:{persistSession:false}});
  const {error,count}=await sb.from("profiles").select("id",{count:"exact",head:true});
  out.database=error?"ERROR: "+error.message+" (did schema.sql run?)":"ok, "+count+" profile(s)";
  const m=await sb.from("messages").select("id",{count:"exact",head:true}).eq("status","queued");out.queued_messages=m.error?"ERROR: "+m.error.message:m.count;
 }catch(e){out.database="ERROR: "+e.message}
 try{const port=+E.SMTP_PORT||465,tr=nodemailer.createTransport({host:E.SMTP_HOST,port,secure:port===465,auth:{user:E.SMTP_USER,pass:E.SMTP_PASS},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:10000});await tr.verify();out.smtp="ok: login works"}catch(e){out.smtp="ERROR: "+e.message}
 return res.status(200).json(out);
};
