import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { root, createOtpD1, seedOtpShop, otpModule } from "./helpers/otp-harness.mjs";
const mailRoot = process.env.MAILVAULT_REPO_PATH;
if (!mailRoot) throw new Error("MAILVAULT_REPO_PATH must point to the audited canonical MailVault checkout");
const auth = await otpModule("src/lib/shop/customer-auth.ts");
const rpcKey = "synthetic-local-cross-worker-key-32-characters";
let mf, db, mailDb, bucket, identity, origin;
async function bundle(contents, resolveDir) {
 const result = await build({ stdin: { contents, resolveDir, sourcefile: "otp-local-harness.ts" }, bundle:true, format:"esm",platform:"neutral",target:"es2022",write:false,
  mainFields:["module","main"],conditions:["workerd","browser"],external:["cloudflare:*","node:*"],logLevel:"silent",
 }); return result.outputFiles[0].text;
}
function sqlStatements(source){
 const statements=[];let pending="",trigger=false;
 for(const line of source.split("\n")){if(line.trim().startsWith("--"))continue;
 if(!pending.trim() && /^\s*CREATE\s+TRIGGER/i.test(line))trigger=true;
 pending+=line+"\n";
 if(trigger){if(/^\s*END\s*;\s*$/.test(line)){statements.push(pending.trim());pending="";trigger=false;}continue;}
 const parts=pending.split(";");pending=parts.pop()??"";statements.push(...parts.map(p=>p.trim()).filter(p=>p && !/^PRAGMA/i.test(p)));
 }if(pending.trim())statements.push(pending.trim());return statements;
}
before(async()=>{
 const shop=await bundle(`import {handleCustomerOtp} from "./src/lib/shop/otp/endpoint";
 import { reconcileOtpGrants } from "./src/lib/shop/otp/reconciliation";
 export default { async fetch(request,env) {
   const path=new URL(request.url).pathname;
   if(path==="/test/reconcile") return Response.json(await reconcileOtpGrants(env));
   return handleCustomerOtp(new Request("https://tung.codes"+path,request),"order-a",env);
 } };`,root);
 // The shipped reader is used unchanged. Only the test bundle replaces the disabled registry lookup.
 const result=await build({stdin:{contents:`export { CustomerOtpReader } from "./apps/worker/src/customer-otp/entrypoint"; export default { fetch(){return new Response("not found",{status:404});} };`,resolveDir:resolve(mailRoot),sourcefile:"otp-local-mail.ts"},bundle:true,format:"esm",platform:"neutral",target:"es2022",write:false,mainFields:["module","main"],conditions:["workerd","browser"],external:["cloudflare:*","node:*"],logLevel:"silent",
 plugins:[{name:"synthetic-provider-only",setup(builder){builder.onLoad({filter:/customer-otp\/providers\.ts$/},async(args)=>({contents:readFileSync(args.path,"utf8").replace(/export function providerPolicy[\s\S]*$/,`export function providerPolicy(key: string): ProviderPolicy | null {
 return key === "synthetic" ? {providerKey:"synthetic",enabled:true,headerFrom:["login@example.test"],dkimDomains:["example.test"],loginSubject:/^Your sign-in code$/,loginBody:/^Use this code to sign in \\d{6}(?:\\n|$)/,reject:DENIED_PURPOSE,codeLengths:[6],minimumConfidence:1,maxCodeAgeSeconds:120,maxMessages:20}: null;
}`),loader:"ts"}));}}]});
 const rpcProbe=await bundle(`export default {async fetch(request,env){const input=await request.json();return Response.json(await env.MAILVAULT_OTP.lookupLoginOtp(input));}}`,root);
 mf=new Miniflare(convertV4MiniflareOptions({workers:[
  {name:"shop-local",modules:true,script:shop,compatibilityDate:"2026-07-24",compatibilityFlags:["nodejs_compat"],d1Databases:{CONTENT_DB:"shop-test"},bindings:{SHOP_OTP_ENABLED:"true",SHOP_PUBLIC_ORIGIN:"https://tung.codes",SHOP_CUSTOMER_SESSION_SECRET:"synthetic-session-secret-32-characters-only",OTP_BRIDGE_RPC_HMAC_KEY:rpcKey},serviceBindings:{MAILVAULT_OTP:{name:"mail-local",entrypoint:"CustomerOtpReader"}}},
  {name:"mail-local",modules:true,script:result.outputFiles[0].text,compatibilityDate:"2026-07-02",compatibilityFlags:["nodejs_compat"],d1Databases:{DB:"mail-test"},r2Buckets:{MAIL_BUCKET:"mail-test-bucket"},bindings:{MAILVAULT_CUSTOMER_OTP_ENABLED:"true",OTP_BRIDGE_RPC_HMAC_KEY:rpcKey}},
  {name:"probe-local",modules:true,script:rpcProbe,compatibilityDate:"2026-07-24",serviceBindings:{MAILVAULT_OTP:{name:"mail-local",entrypoint:"CustomerOtpReader"}}},
 ]}));
 await mf.ready;db=await mf.getD1Database("CONTENT_DB","shop-local");mailDb=await mf.getD1Database("DB","mail-local");bucket=await mf.getR2Bucket("MAIL_BUCKET","mail-local");
 const schema=createOtpD1(); const dump=schema.sqlite.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type='trigger',type='index',rowid").all().map(row=>row.sql);schema.close();
 // Replay the real migration definitions, including their immutable/revoke triggers.
 await db.batch(dump.map(sql=>db.prepare(sql)));
 identity=await seedOtpShop(db,auth);
 for(const file of readdirSync(`${mailRoot}/apps/worker/migrations`).filter(f=>f.endsWith(".sql")).sort())await mailDb.batch(sqlStatements(readFileSync(`${mailRoot}/apps/worker/migrations/${file}`,"utf8")).map(sql=>mailDb.prepare(sql)));
 const at=new Date().toISOString();
 await mailDb.prepare(`INSERT INTO domains(id,cloudflare_zone_id,name,zone_status,zone_type,mail_status,routing_status,catch_all_status,conflict_type,last_checked_at,created_at,updated_at) VALUES ('domain','zone','recipient.test','active','full','READY','READY','OURS','NONE',?,?,?)`).bind(at,at,at).run();
 await mailDb.prepare(`INSERT INTO aliases(id,domain_id,local_part,address,status,created_at,updated_at) VALUES ('alias-a','domain','a','a@recipient.test','ACTIVE',?,?)`).bind(at,at).run();
 origin=(await mf.ready).origin;
}, {timeout:30000});
after(async()=>{await mf?.dispose();});
const request=()=>[`${origin}/api/shop/me/orders/order-a/otp`,{method:"POST",headers:{origin:"https://tung.codes","content-type":"application/json",cookie:identity.cookie},body:JSON.stringify({allocationId:"allocation-a"})}];
test("named RPC accepts scoped signed request and gives pending before mail arrives",async()=>{const response=await mf.dispatchFetch(...request());assert.equal(response.status,200);assert.equal((await response.json()).state,"pending");});
test("fresh approved synthetic code travels across two actual workerd Workers privately",async()=>{
 await db.prepare("DELETE FROM shop_otp_lookup_attempts").run();
 const receivedAt=new Date().toISOString(),subject="Your sign-in code",text="Use this code to sign in 593821";
 const mailAuth={verdict:"TRUSTED",spf:null,dkim:"pass",dmarc:null,alignedPass:{spf:false,dkim:true,dmarc:false},evidence:[{mechanism:"dkim",outcome:"pass",domain:"example.test",aligned:true,source:"cryptographic-verifier",reporter:null}]};
 await bucket.put("parsed/synthetic",JSON.stringify({subject,text,from:"login@example.test",receivedAt}));
 await mailDb.prepare(`INSERT INTO messages(id,domain_id,alias_id,dedupe_key,envelope_from,envelope_to,header_from,subject,received_at,raw_size,raw_r2_key,parsed_r2_key,extracted_codes_json,auth_verdict,auth_json,direction,created_at,ingest_status) VALUES ('synthetic','domain','alias-a','dedupe','login@example.test','a@recipient.test',?,?,?,?,?,?,?,'TRUSTED',?,'IN',?,'COMMITTED')`)
 .bind("login@example.test",subject,receivedAt,100,"raw/synthetic","parsed/synthetic",JSON.stringify([{value:"593821",kind:"numeric",length:6,confidence:1}]),JSON.stringify(mailAuth),receivedAt).run();
 const response=await mf.dispatchFetch(...request());assert.equal(response.status,200);const body=await response.json();assert.deepEqual(body,{ok:true,state:"found",code:"593821",receivedAt});assert.match(response.headers.get("cache-control"),/private.*no-store/);
});
test("50 concurrent lookups across workerd reserve one D1 slot",async()=>{await db.prepare("DELETE FROM shop_otp_lookup_attempts").run();const responses=await Promise.all(Array.from({length:50},()=>mf.dispatchFetch(...request())));assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(responses.filter(r=>r.status===429).length,49);});
test("a bound same-account caller without integration MAC is denied",async()=>{const probe=await mf.getWorker("probe-local");const response=await probe.fetch("https://probe.test",{method:"POST",body:JSON.stringify({v:1,aliasId:"alias-a"})});assert.deepEqual(await response.json(),{state:"unavailable"});});
test("MailVault exposes no public OTP fetch path",async()=>{const mail=await mf.getWorker("mail-local");assert.equal((await mail.fetch("https://mail.test/api/customer/otp")).status,404);});
test("refund permanently revokes entitlement across Workers",async()=>{await db.prepare("UPDATE shop_orders SET payment_status='refunded',status='refunded' WHERE id='order-a'").run();const response=await mf.dispatchFetch(...request());assert.equal(response.status,404);assert.equal((await db.prepare("SELECT state FROM shop_otp_grants").first()).state,"revoked");});
