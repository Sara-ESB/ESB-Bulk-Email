const {createClient}=require("@supabase/supabase-js");
const {createHash}=require("crypto");
const E=process.env;
module.exports=async(req,res)=>{
 try{
  if(req.method!=="POST")return res.status(405).json({error:"POST only"});
  if(!E.SUPABASE_URL||!E.SUPABASE_SERVICE_KEY)return res.status(500).json({error:"SUPABASE_URL or SUPABASE_SERVICE_KEY is not set in Vercel. Add it and redeploy."});
  if(!E.OWNER_CODE_HASH)return res.status(500).json({error:"OWNER_CODE_HASH is not set in Vercel. Add it and redeploy."});
  let b=req.body;if(typeof b==="string"){try{b=JSON.parse(b)}catch(e){b={}}}b=b||{};
  const jwt=String(req.headers.authorization||"").replace("Bearer ","");
  const sb=createClient(E.SUPABASE_URL,E.SUPABASE_SERVICE_KEY,{auth:{persistSession:false}});
  const {data,error}=await sb.auth.getUser(jwt);
  if(error||!data||!data.user)return res.status(401).json({error:"Not signed in."});
  const {count}=await sb.from("profiles").select("id",{count:"exact",head:true}).eq("role","super");
  if(count>0)return res.status(409).json({error:"An owner account already exists."});
  if(createHash("sha256").update(String(b.code||"")).digest("hex")!==String(E.OWNER_CODE_HASH).trim().toLowerCase())return res.status(403).json({error:"Wrong owner code."});
  const {error:ue}=await sb.from("profiles").update({role:"super",username:"supreme-admin",name:"Supreme Admin"}).eq("id",data.user.id);
  if(ue)return res.status(500).json({error:"Could not save the owner: "+ue.message+" (did schema.sql run completely?)"});
  await sb.from("activity_log").insert({username:"supreme-admin",action:"Owner account created"});
  return res.status(200).json({ok:true});
 }catch(e){return res.status(500).json({error:String((e&&e.message)||e)})}
};
