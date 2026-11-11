const {createClient}=require("@supabase/supabase-js");
const {createHmac,timingSafeEqual}=require("crypto");
const E=process.env;
module.exports=async(req,res)=>{
 try{
  const q=req.query||{},e=String(q.e||""),t=String(q.t||"");
  if(!E.TOKEN_SECRET||!E.SUPABASE_URL||!E.SUPABASE_SERVICE_KEY)return res.status(500).send("Server is not set up yet.");
  const good=createHmac("sha256",E.TOKEN_SECRET).update(e).digest("hex");
  if(t.length!==good.length||!timingSafeEqual(Buffer.from(t),Buffer.from(good)))return res.status(400).send("Invalid link");
  const sb=createClient(E.SUPABASE_URL,E.SUPABASE_SERVICE_KEY,{auth:{persistSession:false}});
  await sb.from("contacts").update({unsubscribed:true}).eq("email",e);
  await sb.from("activity_log").insert({username:"public",action:"Unsubscribed "+e});
  res.setHeader("content-type","text/html; charset=utf-8");
  return res.status(200).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;text-align:center;padding:40px"><img src="/logo.png" width="72" alt=""><h2>You are unsubscribed</h2><p>আপনাকে আনসাবস্ক্রাইব করা হয়েছে। You will not get marketing emails from us.</p></body>`);
 }catch(err){return res.status(500).send("Something went wrong. Please try again.")}
};
