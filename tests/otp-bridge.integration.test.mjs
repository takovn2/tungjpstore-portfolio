import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { root, createOtpD1, seedOtpShop, otpModule, read } from "./helpers/otp-harness.mjs";
await import("../scripts/assert-otp-companion.mjs");
const mailRoot = process.env.MAILVAULT_REPO_PATH;
if (!mailRoot) throw new Error("MAILVAULT_REPO_PATH must point to the audited canonical MailVault checkout");
const grants = await otpModule("src/lib/shop/otp/grant-repository.ts");
const terms = await otpModule("src/lib/shop/otp/entitlement-policy.ts");
const rpc = await otpModule("src/lib/shop/otp/rpc-client.ts");
const auth = await otpModule("src/lib/shop/customer-auth.ts");
const rpcKey = "synthetic-local-cross-worker-key-32-characters";
let mf, db, legacyDb, mailDb, bucket, identity, origin;
let testNow;
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
 import { requeueOtpValidation } from "./src/lib/shop/otp/validation-recovery";
 import { handleCustomerOtpStatus } from "./src/lib/shop/otp/status-endpoint";
 const actualNow=Date.now;let testNow;Date.now=()=>testNow??actualNow();
 export default { async fetch(request,env) {
   const path=new URL(request.url).pathname;
   if(path==="/test/clock") { testNow=(await request.json()).now; return Response.json({ok:true}); }
   if(path==="/test/reconcile") return Response.json(await reconcileOtpGrants(env));
   if(path==="/test/requeue") {try{return Response.json(await requeueOtpValidation(env.CONTENT_DB,{inventoryUnitId:"unit-a",actor:"synthetic-owner",reason:"routing_recovered"}));}catch{return new Response("denied",{status:409});}}
   if(path.endsWith("/otp-status")) return handleCustomerOtpStatus(new Request("https://tung.codes"+path,request),"order-a",env);
   return handleCustomerOtp(new Request("https://tung.codes"+path,request),"order-a",env);
 } };`,root);
 // Production reader methods are unchanged; the wrapper supplies a synthetic registry and test clock.
 const result=await build({stdin:{contents:`export { CustomerOtpReader } from "./apps/worker/src/customer-otp/entrypoint";
 const actualNow=Date.now;let testNow;Date.now=()=>testNow??actualNow();
 export default {async fetch(request){if(new URL(request.url).pathname==="/test/clock"){testNow=(await request.json()).now;return Response.json({ok:true});}return new Response("not found",{status:404});} };`,resolveDir:resolve(mailRoot),sourcefile:"otp-local-mail.ts"},bundle:true,format:"esm",platform:"neutral",target:"es2022",write:false,mainFields:["module","main"],conditions:["workerd","browser"],external:["cloudflare:*","node:*"],logLevel:"silent",
 plugins:[{name:"synthetic-provider-only",setup(builder){builder.onLoad({filter:/customer-otp\/providers\.ts$/},async(args)=>({contents:readFileSync(args.path,"utf8").replace(/export function providerPolicy[\s\S]*$/,`export function providerPolicy(key: string): ProviderPolicy | null {
 return key === "synthetic" ? {providerKey:"synthetic",enabled:true,headerFrom:["login@example.test"],dkimDomains:["example.test"],loginSubject:/^Your sign-in code$/,loginBody:/^Use this code to sign in \\d{6}(?:\\n|$)/,reject:DENIED_PURPOSE,codeLengths:[6],minimumConfidence:1,maxCodeAgeSeconds:120,maxMessages:20}: null;
}`),loader:"ts"}));}}]});
 const rpcProbe=await bundle(`export default {async fetch(request,env){const input=await request.json();return Response.json(await (input.operation === "validateAlias" ? env.MAILVAULT_OTP.validateAlias(input) : env.MAILVAULT_OTP.lookupLoginOtp(input)));}}`,root);
 mf=new Miniflare(convertV4MiniflareOptions({workers:[
  {name:"shop-local",modules:true,script:shop,compatibilityDate:"2026-07-24",compatibilityFlags:["nodejs_compat"],d1Databases:{CONTENT_DB:"shop-test",LEGACY_DB:"shop-legacy-test"},bindings:{SHOP_OTP_ENABLED:"true",SHOP_PUBLIC_ORIGIN:"https://tung.codes",SHOP_CUSTOMER_SESSION_SECRET:"synthetic-session-secret-32-characters-only",OTP_BRIDGE_RPC_HMAC_KEY:rpcKey},serviceBindings:{MAILVAULT_OTP:{name:"mail-local",entrypoint:"CustomerOtpReader"}}},
  {name:"mail-local",modules:true,script:result.outputFiles[0].text,compatibilityDate:"2026-07-02",compatibilityFlags:["nodejs_compat"],d1Databases:{DB:"mail-test"},r2Buckets:{MAIL_BUCKET:"mail-test-bucket"},bindings:{MAILVAULT_CUSTOMER_OTP_ENABLED:"true",OTP_BRIDGE_RPC_HMAC_KEY:rpcKey}},
  {name:"probe-local",modules:true,script:rpcProbe,compatibilityDate:"2026-07-24",serviceBindings:{MAILVAULT_OTP:{name:"mail-local",entrypoint:"CustomerOtpReader"}}},
 ]}));
 await mf.ready;db=await mf.getD1Database("CONTENT_DB","shop-local");legacyDb=await mf.getD1Database("LEGACY_DB","shop-local");mailDb=await mf.getD1Database("DB","mail-local");bucket=await mf.getR2Bucket("MAIL_BUCKET","mail-local");
 const schema=createOtpD1(); const dump=schema.sqlite.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type='trigger',type='index',rowid").all().map(row=>row.sql);schema.close();
 // Replay the real migration definitions, including their immutable/revoke triggers.
 await db.batch(dump.map(sql=>db.prepare(sql)));
 identity=await seedOtpShop(db,auth,{active:false});
 for(const file of readdirSync(`${mailRoot}/apps/worker/migrations`).filter(f=>f.endsWith(".sql")).sort())await mailDb.batch(sqlStatements(readFileSync(`${mailRoot}/apps/worker/migrations/${file}`,"utf8")).map(sql=>mailDb.prepare(sql)));
 const at=new Date().toISOString();
 await mailDb.prepare(`INSERT INTO domains(id,cloudflare_zone_id,name,zone_status,zone_type,mail_status,routing_status,catch_all_status,conflict_type,last_checked_at,routing_verified_at,created_at,updated_at) VALUES ('domain','zone','recipient.test','active','full','READY','READY','OURS','NONE',?,?,?,?)`).bind(at,at,at,at).run();
 await mailDb.prepare(`INSERT INTO aliases(id,domain_id,local_part,address,status,created_at,updated_at) VALUES ('alias-a','domain','a','a@recipient.test','ACTIVE',?,?)`).bind(new Date(Date.now()-2*86400000).toISOString(),new Date(Date.now()-2*86400000).toISOString()).run();
 origin=(await mf.ready).origin;
}, {timeout:30000});
after(async()=>{await mf?.dispose();});
const request=()=>[`${origin}/api/shop/me/orders/order-a/otp`,{method:"POST",headers:{origin:"https://tung.codes","content-type":"application/json",cookie:identity.cookie},body:JSON.stringify({allocationId:"allocation-a"})}];
async function clockAt(now) {
 testNow=now;
 await mf.dispatchFetch(`${origin}/test/clock`,{method:"POST",body:JSON.stringify({now})});
 const mail=await mf.getWorker("mail-local");await mail.fetch("https://mail.test/test/clock",{method:"POST",body:JSON.stringify({now})});
}
async function addMail(id,code,receivedAt,aliasId="alias-a") {
 const subject="Your sign-in code",text=`Use this code to sign in ${code}`;
 const mailAuth={verdict:"TRUSTED",spf:null,dkim:"pass",dmarc:null,alignedPass:{spf:false,dkim:true,dmarc:false},evidence:[{mechanism:"dkim",outcome:"pass",domain:"example.test",aligned:true,source:"cryptographic-verifier",reporter:null}]};
 await bucket.put(`parsed/${id}`,JSON.stringify({subject,text,from:"login@example.test",receivedAt}));
 await mailDb.prepare(`INSERT INTO messages(id,domain_id,alias_id,dedupe_key,envelope_from,envelope_to,header_from,subject,received_at,raw_size,raw_r2_key,parsed_r2_key,extracted_codes_json,auth_verdict,auth_json,direction,created_at,ingest_status) VALUES (?,'domain',?,?,'login@example.test',?,?,?,?,?,?,?,?,'TRUSTED',?,'IN',?,'COMMITTED')`)
 .bind(id,aliasId,id,aliasId === "alias-a" ? "a@recipient.test" : "b@recipient.test","login@example.test",subject,receivedAt,100,`raw/${id}`,`parsed/${id}`,JSON.stringify([{value:code,kind:"numeric",length:6,confidence:1}]),JSON.stringify(mailAuth),receivedAt).run();
}
test("cold alias older than 24h, no recent receipt, and fresh pre-ownership mail stays excluded",async()=>{
 assert.equal((await db.prepare("SELECT state FROM shop_otp_grants").first()).state,"pending");
 const probe=await mf.getWorker("probe-local");
 const readiness=await rpc.signedRpcRequest({OTP_BRIDGE_RPC_HMAC_KEY:rpcKey},{operation:"validateAlias",aliasId:"alias-a",providerKey:"synthetic",grantId:"otp_allocation-a",notBefore:new Date(identity.now-1000).toISOString()});
 assert.deepEqual(await(await probe.fetch("https://probe.test",{method:"POST",body:JSON.stringify(readiness)})).json(),{state:"active",aliasId:"alias-a"});
 await addMail("pre-ownership","111111",new Date(identity.now-1500).toISOString());
 const signed=await rpc.signedRpcRequest({OTP_BRIDGE_RPC_HMAC_KEY:rpcKey},{operation:"lookupLoginOtp",aliasId:"alias-a",providerKey:"synthetic",grantId:"otp_allocation-a",notBefore:new Date(identity.now-1000).toISOString()});
 const response=await probe.fetch("https://probe.test",{method:"POST",body:JSON.stringify(signed)});
 assert.deepEqual(await response.json(),{state:"pending"});
});
test("actual D1/workerd: 20 routing failures stop, authorized requeue recovers, first pre-activation code qualifies",async()=>{
 await mailDb.prepare("UPDATE domains SET routing_verified_at=NULL").run();
 let now=Date.now();
 for(let attempt=1;attempt<=20;attempt++){
  await clockAt(now);
  const responses=await Promise.all(Array.from({length:20},()=>mf.dispatchFetch(`${origin}/test/reconcile`)));
  for(const response of responses)assert.equal(response.status,200);
  const grant=await db.prepare("SELECT * FROM shop_otp_grants").first();
  assert.equal(grant.validation_attempts,attempt);assert.equal(grant.validation_last_failure,"routing_unknown");
  now=Date.parse(grant.next_validation_at);
 }
 await clockAt(now-1);assert.equal((await mf.dispatchFetch(`${origin}/test/requeue`)).status,409);
 await clockAt(now);await mf.dispatchFetch(`${origin}/test/reconcile`);
 assert.equal((await db.prepare("SELECT validation_total_attempts FROM shop_otp_grants").first()).validation_total_attempts,20);
 await mailDb.prepare("UPDATE domains SET routing_verified_at=?,last_checked_at=?").bind(new Date(now).toISOString(),new Date(now).toISOString()).run();
 // First login arrived before the delayed validation, while still inside its age cap.
 await addMail("first-cold","593821",new Date(now-20000).toISOString());
 const responses=await Promise.all(Array.from({length:20},()=>mf.dispatchFetch(`${origin}/test/requeue`)));
 assert.equal(responses.filter(response=>response.status===200).length,1);
 assert.equal((await(await mf.dispatchFetch(`${origin}/test/reconcile`)).json()).activated,1);
 const grant=await db.prepare("SELECT * FROM shop_otp_grants").first();assert.equal(grant.activated_at,grant.entitlement_start_at);
 assert.equal(grant.validation_total_attempts,21);assert.equal(grant.validation_cycle,2);
 const at=new Date(now).toISOString();
 await db.prepare("UPDATE shop_customer_sessions SET expires_at=?").bind(new Date(now+3600000).toISOString()).run();
 await db.prepare("UPDATE shop_otp_session_proofs SET authenticated_at=?,expires_at=?").bind(at,new Date(now+600000).toISOString()).run();
 const statusRequest=request();statusRequest[0]=statusRequest[0].replace(/otp$/,"otp-status");
 assert.deepEqual(await(await mf.dispatchFetch(...statusRequest)).json(),{ok:true,state:"active"});
 const response=await mf.dispatchFetch(...request());assert.equal(response.status,200);assert.equal((await response.json()).code,"593821");
});
test("fresh approved synthetic code travels across two actual workerd Workers privately",async()=>{
 await db.prepare("DELETE FROM shop_otp_lookup_attempts").run();
 const receivedAt=new Date(testNow-20000).toISOString();
 const response=await mf.dispatchFetch(...request());assert.equal(response.status,200);const body=await response.json();assert.deepEqual(body,{ok:true,state:"found",code:"593821",receivedAt});assert.match(response.headers.get("cache-control"),/private.*no-store/);
});
test("50 concurrent lookups across workerd reserve one D1 slot",async()=>{await db.prepare("DELETE FROM shop_otp_lookup_attempts").run();const responses=await Promise.all(Array.from({length:50},()=>mf.dispatchFetch(...request())));assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(responses.filter(r=>r.status===429).length,49);});
test("a bound same-account caller without integration MAC is denied",async()=>{const probe=await mf.getWorker("probe-local");const response=await probe.fetch("https://probe.test",{method:"POST",body:JSON.stringify({v:1,aliasId:"alias-a"})});assert.deepEqual(await response.json(),{state:"unavailable"});});
test("MailVault exposes no public OTP fetch path",async()=>{const mail=await mf.getWorker("mail-local");assert.equal((await mail.fetch("https://mail.test/api/customer/otp")).status,404);});
test("actual D1: sold term snapshot, concurrent authorized extension, expiry boundary and terminal no-reuse",async()=>{
 const now=testNow,initialExpiry=new Date(now+90000).toISOString(),extendedExpiry=new Date(now+180000).toISOString();
 await terms.configureOtpVariantPolicy(db,{variantId:"otp-variant",kind:"until",expiresAt:initialExpiry,expectedRevision:1,actor:"synthetic-owner",reason:"verified_term"},now);
 async function clone(table,id,replacements){
  const row=await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();Object.assign(row,replacements);
  const columns=Object.keys(row);await db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(()=>"?").join(",")})`).bind(...columns.map(column=>row[column])).run();
 }
 await clone("shop_inventory_units","unit-a",{id:"unit-b",key_fingerprint:"b".repeat(43)});
 await clone("shop_order_items","item-a",{id:"item-b",line_number:2,otp_policy_snapshotted:0});
 await clone("shop_inventory_reservations","reservation-a",{id:"reservation-b",order_item_id:"item-b"});
 await clone("shop_otp_inventory_aliases","binding-a",{id:"binding-b",inventory_unit_id:"unit-b",alias_id:"alias-b"});
 await clone("shop_inventory_allocations","allocation-a",{id:"allocation-b",reservation_id:"reservation-b",order_item_id:"item-b",inventory_unit_id:"unit-b",status:"held",fulfilled_at:null});
 await db.prepare("UPDATE shop_inventory_allocations SET status='fulfilled',fulfilled_at=?,updated_at=? WHERE id='allocation-b'").bind(new Date(now).toISOString(),new Date(now).toISOString()).run();
 const at=new Date(now).toISOString();
 await mailDb.prepare("INSERT INTO aliases(id,domain_id,local_part,address,status,created_at,updated_at) VALUES ('alias-b','domain','b','b@recipient.test','ACTIVE',?,?)").bind(at,at).run();
 await mailDb.prepare("UPDATE domains SET routing_verified_at=NULL").run();
 const setup=request();setup[0]=setup[0].replace(/otp$/,"otp-status");setup[1].body=JSON.stringify({allocationId:"allocation-b"});
 assert.deepEqual(await(await mf.dispatchFetch(...setup)).json(),{ok:true,state:"pending"});
 await mailDb.prepare("UPDATE domains SET routing_verified_at=?").bind(new Date(now).toISOString()).run();
 await addMail("first-recovered","482716",new Date(now+15000).toISOString(),"alias-b");
 await clockAt(now+60000);
 assert.deepEqual(await(await mf.dispatchFetch(...setup)).json(),{ok:true,state:"active"});
 const firstLookup=request();firstLookup[1].body=JSON.stringify({allocationId:"allocation-b"});
 assert.equal((await(await mf.dispatchFetch(...firstLookup)).json()).code,"482716");
 const grant=await db.prepare("SELECT * FROM shop_otp_grants WHERE inventory_unit_id='unit-b'").first();
 assert.equal(grant.entitlement_expires_at,initialExpiry);assert.equal(grant.expires_at,initialExpiry);
 // A later product policy change must leave this sold license unchanged.
 await terms.configureOtpVariantPolicy(db,{variantId:"otp-variant",kind:"perpetual",expectedRevision:2,actor:"synthetic-owner",reason:"future_perpetual"},now);
 const outcomes=await Promise.allSettled(Array.from({length:20},()=>terms.extendOtpEntitlement(db,{inventoryUnitId:"unit-b",expectedVersion:grant.version,expiresAt:extendedExpiry,actor:"synthetic-owner",reason:"verified_renewal"},now)));
 assert.equal(outcomes.filter(outcome=>outcome.status==="fulfilled").length,1);
 const extended=await db.prepare("SELECT * FROM shop_otp_grants WHERE inventory_unit_id='unit-b'").first();
 assert.equal(extended.entitlement_expires_at,initialExpiry);assert.equal(extended.expires_at,extendedExpiry);
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM shop_otp_grant_extensions").first()).n,1);
 await clockAt(now+180000);
 const lookup=request();lookup[1].body=JSON.stringify({allocationId:"allocation-b"});assert.equal((await mf.dispatchFetch(...lookup)).status,404);
 await assert.rejects(()=>terms.extendOtpEntitlement(db,{inventoryUnitId:"unit-b",expectedVersion:extended.version,expiresAt:new Date(now+240000).toISOString(),actor:"synthetic-owner",reason:"late_renewal"},now+180000));
 await mf.dispatchFetch(`${origin}/test/reconcile`);
 assert.equal((await db.prepare("SELECT state FROM shop_otp_grants WHERE inventory_unit_id='unit-b'").first()).state,"expired");
 await assert.rejects(()=>db.prepare("UPDATE shop_otp_grants SET state='active' WHERE inventory_unit_id='unit-b'").run());
 await assert.rejects(()=>db.prepare("UPDATE shop_otp_inventory_aliases SET alias_id='alias-new' WHERE inventory_unit_id='unit-b'").run());
});
test("refund permanently revokes entitlement across Workers",async()=>{await db.prepare("UPDATE shop_orders SET payment_status='refunded',status='refunded' WHERE id='order-a'").run();const response=await mf.dispatchFetch(...request());assert.equal(response.status,404);assert.equal((await db.prepare("SELECT state FROM shop_otp_grants WHERE inventory_unit_id='unit-a'").first()).state,"revoked");});

test("actual D1 upgrade from0062 suspends historical indefinite grants and prevents later implicit backfill",async()=>{
 const legacy=createOtpD1({through:"0062"});
 const dump=legacy.sqlite.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type='trigger',type='index',rowid").all().map(row=>row.sql);legacy.close();
 await legacyDb.batch(dump.map(sql=>legacyDb.prepare(sql)));
 const now=Date.now();await seedOtpShop(legacyDb,auth,{now,legacy:true});
 assert.equal((await legacyDb.prepare("SELECT state FROM shop_otp_grants").first()).state,"active");
 for(const file of ["0063_shop_otp_entitlement_policy.sql","0064_shop_otp_validation_recovery.sql"])
  await legacyDb.batch(sqlStatements(read(`content-migrations/${file}`)).map(sql=>legacyDb.prepare(sql)));
 assert.equal((await legacyDb.prepare("SELECT state FROM shop_otp_grants").first()).state,"suspended");
 assert.equal(await grants.loadEligibleGrant(legacyDb,"customer-a","order-a","allocation-a",now),null);
 await terms.configureOtpVariantPolicy(legacyDb,{variantId:"otp-variant",kind:"perpetual",expectedRevision:0,actor:"synthetic-owner",reason:"future_policy_only"},now);
 await grants.createPendingGrants(legacyDb,now);
 assert.equal((await legacyDb.prepare("SELECT state FROM shop_otp_grants").first()).state,"suspended");
 await assert.rejects(()=>legacyDb.prepare("UPDATE shop_otp_grants SET state='active'").run());
 assert.deepEqual((await legacyDb.prepare("PRAGMA foreign_key_check").all()).results,[]);
});
