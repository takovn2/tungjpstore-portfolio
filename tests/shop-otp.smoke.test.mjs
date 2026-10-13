import assert from "node:assert/strict";
import { test } from "node:test";
import { createOtpD1, seedOtpShop, otpModule } from "./helpers/otp-harness.mjs";
const auth = await otpModule("src/lib/shop/customer-auth.ts");
const endpoint = await otpModule("src/lib/shop/otp/endpoint.ts");
const grants = await otpModule("src/lib/shop/otp/grant-repository.ts");
const rate = await otpModule("src/lib/shop/otp/rate-limit.ts");
const reauth = await otpModule("src/lib/shop/otp/reauth.ts");
const reconciliation = await otpModule("src/lib/shop/otp/reconciliation.ts");
const google = await otpModule("src/lib/shop/otp/google-reauth.ts");
async function fixture(options) {
  const fixture = createOtpD1(), identity = await seedOtpShop(fixture.db, auth, options);
  let calls = 0;
  const env = { CONTENT_DB: fixture.db, SHOP_OTP_ENABLED: "true", SHOP_CUSTOMER_SESSION_SECRET: identity.secret,
    OTP_BRIDGE_RPC_HMAC_KEY: "synthetic-rpc-shared-key-32-characters", SHOP_PUBLIC_ORIGIN: "https://tung.codes",
    MAILVAULT_OTP: { lookupLoginOtp: async () => { calls += 1; return { state: "found", code: "593821", receivedAt: new Date(identity.now-500).toISOString(), messageRef: "private" }; },
      validateAlias: async (request) => { calls += 1; return { state: "active", aliasId: request.aliasId }; } } };
  const request = (body = { allocationId: "allocation-a" }, headers = {}) => new Request("https://tung.codes/api/shop/me/orders/order-a/otp", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://tung.codes", cookie: identity.cookie, ...headers }, body: JSON.stringify(body),
  });
  return { ...fixture, ...identity, env, request, calls: () => calls };
}
test("all historical migrations plus additive OTP migration apply with FK integrity", () => {
  const f = createOtpD1({ full: true }); try { assert.deepEqual(f.sqlite.prepare("PRAGMA foreign_key_check").all(), []); } finally { f.close(); }
});
test("authorized allocation returns minimal no-store code with no internal mail metadata", async () => {
  const f = await fixture(); try { const response = await endpoint.handleCustomerOtp(f.request(), "order-a", f.env); assert.equal(response.status,200); const body=await response.json(); assert.deepEqual(Object.keys(body).sort(),["code","ok","receivedAt","state"]); assert.equal(body.code,"593821"); assert.match(response.headers.get("cache-control"), /private.*no-store/); assert.equal(f.calls(),1); assert.doesNotMatch(JSON.stringify(f.sqlite.prepare("SELECT * FROM shop_otp_lookup_attempts").all()), /593821|messageRef|private/); } finally { f.close(); }
});
test("OFF flag never invokes RPC", async () => { const f=await fixture(); try { f.env.SHOP_OTP_ENABLED="false"; assert.equal((await endpoint.handleCustomerOtp(f.request(),"order-a",f.env)).status,404); assert.equal(f.calls(),0); } finally { f.close(); } });
for (const [name, body] of Object.entries({ extra_alias:{ allocationId:"allocation-a",aliasId:"alias-a" }, email:{ allocationId:"allocation-a",email:"victim@test" }, wrong_allocation:{ allocationId:"allocation-b" }, grant:{ allocationId:"allocation-a",grantId:"grant-b" }, oversize:{ allocationId:"x".repeat(1100) }, nested:{ allocationId:{} } })) {
 test(`denies ${name} without RPC`, async () => { const f=await fixture(); try { const response=await endpoint.handleCustomerOtp(f.request(body),"order-a",f.env); assert.ok([400,404].includes(response.status)); assert.equal(f.calls(),0); } finally { f.close(); } });
}
for (const [name, headers, status] of [["missing cookie",{cookie:""},401],["cross origin",{origin:"https://evil.test"},403],["missing origin",{origin:""},403],["cross-site metadata",{"sec-fetch-site":"cross-site"},403]]) {
 test(`denies ${name}`,async()=>{const f=await fixture();try{assert.equal((await endpoint.handleCustomerOtp(f.request(undefined,headers),"order-a",f.env)).status,status);assert.equal(f.calls(),0);}finally{f.close();}});
}
for (const [name, sql] of [
 ["other owner","UPDATE shop_orders SET customer_id = 'customer-b' WHERE id = 'order-a'"], ["unpaid","UPDATE shop_orders SET payment_status = 'unpaid' WHERE id = 'order-a'"],
 ["refund","UPDATE shop_orders SET payment_status = 'refunded', status = 'refunded' WHERE id = 'order-a'"], ["partial refund","UPDATE shop_orders SET payment_status = 'partially_refunded' WHERE id = 'order-a'"],
 ["cancelled","UPDATE shop_orders SET status = 'cancelled' WHERE id = 'order-a'"], ["revoked unit","UPDATE shop_inventory_units SET status = 'revoked' WHERE id = 'unit-a'"],
 ["disabled mapping","UPDATE shop_otp_inventory_aliases SET state = 'disabled' WHERE id = 'binding-a'"], ["blocked customer","UPDATE shop_customers SET status = 'blocked' WHERE id = 'customer-a'"],
 ["deleted customer","UPDATE shop_customers SET deleted_at = '2026-01-01T00:00:00.000Z' WHERE id = 'customer-a'"], ["pending allocation","UPDATE shop_inventory_allocations SET status = 'held' WHERE id = 'allocation-a'"],
 ["wrong variant","UPDATE shop_order_items SET variant_id = NULL WHERE id = 'item-a'"], ["expired grant","UPDATE shop_otp_grants SET expires_at = '2026-01-01T00:00:00.000Z' WHERE id = 'otp_allocation-a'"],
 ["expired proof","UPDATE shop_otp_session_proofs SET expires_at = '2026-01-01T00:00:00.000Z'"], ["guest token cannot establish OTP ownership","UPDATE shop_customer_identities SET verified_at = NULL"],
 ]) test(`denies ${name} before RPC`,async()=>{const f=await fixture();try{f.sqlite.exec(sql);assert.ok([401,403,404].includes((await endpoint.handleCustomerOtp(f.request(),"order-a",f.env)).status));assert.equal(f.calls(),0);}finally{f.close();}});
test("pending setup returns 409 without OTP lookup",async()=>{const f=await fixture({active:false});try{assert.equal((await endpoint.handleCustomerOtp(f.request(),"order-a",f.env)).status,409);assert.equal(f.calls(),0);}finally{f.close();}});
for(const concurrency of [20,50]) test(`${concurrency} concurrent lookups reserve exactly one slot before RPC`,async()=>{const f=await fixture();try{const responses=await Promise.all(Array.from({length:concurrency},()=>endpoint.handleCustomerOtp(f.request(),"order-a",f.env)));assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(responses.filter(r=>r.status===429).length,concurrency-1);assert.equal(f.calls(),1);}finally{f.close();}});
test("sliding per-grant 5-minute and per-customer day quotas are atomic",async()=>{const f=await fixture();try{
 const input={customerId:"customer-a",grantId:"otp_allocation-a",identityHash:"test-identity"};
 for(let index=0;index<30;index++)assert.equal(await rate.reserveOtpAttempt(f.db,{...input,requestId:`rate-${index}`},f.now+index*5000),true);
 assert.equal(await rate.reserveOtpAttempt(f.db,{...input,requestId:"rate-over"},f.now+150000),false);
 f.sqlite.exec("DELETE FROM shop_otp_lookup_attempts");
 for(let index=0;index<150;index++)assert.equal(await rate.reserveOtpAttempt(f.db,{...input,requestId:`day-${index}`},f.now+index*300001),true);
 assert.equal(await rate.reserveOtpAttempt(f.db,{...input,requestId:"day-over"},f.now+150*300001),false);
 }finally{f.close();}});
test("refund completes during RPC and final check denies code",async()=>{const f=await fixture();try{f.env.MAILVAULT_OTP.lookupLoginOtp=async()=>{f.sqlite.exec("UPDATE shop_orders SET payment_status = 'refunded', status = 'refunded' WHERE id = 'order-a'");return{state:"found",code:"593821",receivedAt:new Date().toISOString(),messageRef:"private"};};assert.equal((await endpoint.handleCustomerOtp(f.request(),"order-a",f.env)).status,404);}finally{f.close();}});
test("session revoked during RPC denies code",async()=>{const f=await fixture();try{f.env.MAILVAULT_OTP.lookupLoginOtp=async()=>{f.sqlite.exec("UPDATE shop_customer_sessions SET revoked_at = '2026-01-01T00:00:00.000Z'");return{state:"found",code:"593821",receivedAt:new Date().toISOString(),messageRef:"private"};};assert.equal((await endpoint.handleCustomerOtp(f.request(),"order-a",f.env)).status,404);}finally{f.close();}});
test("fulfillment creates one pending grant atomically then reconciliation activates once",async()=>{const f=await fixture({fulfilled:false});try{
 f.sqlite.exec("UPDATE shop_inventory_units SET status='fulfilled'; UPDATE shop_inventory_allocations SET status='fulfilled',fulfilled_at=updated_at;");
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM shop_otp_grants").get().count,1);
 await Promise.all([reconciliation.reconcileOtpGrants(f.env),reconciliation.reconcileOtpGrants(f.env)]);
 assert.equal(f.sqlite.prepare("SELECT state FROM shop_otp_grants").get().state,"active");assert.equal(f.calls(),1);
 await Promise.all(Array.from({length:20},()=>grants.createPendingGrants(f.db)));
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM shop_otp_grants").get().count,1);
 }finally{f.close();}});
test("immutable mapping and grant cannot be reassigned, deleted or resurrected after refund",async()=>{const f=await fixture();try{
 for(const sql of ["UPDATE shop_otp_inventory_aliases SET alias_id='other'","UPDATE shop_otp_grants SET customer_id='customer-b'","DELETE FROM shop_otp_inventory_aliases","DELETE FROM shop_otp_grants"]) assert.throws(()=>f.sqlite.exec(sql));
 f.sqlite.exec("UPDATE shop_orders SET payment_status='refunded'"); assert.throws(()=>f.sqlite.exec("UPDATE shop_otp_grants SET state='active'"));
 assert.throws(()=>f.sqlite.exec("INSERT INTO shop_otp_inventory_aliases SELECT 'new',inventory_unit_id,alias_id,provider_key,state,validated_at,created_at,updated_at,record_version FROM shop_otp_inventory_aliases"));
 }finally{f.close();}});
test("reauth proof binds the original session and same verified identity",async()=>{const f=await fixture();try{
 const context={otpReauth:true,customerId:"customer-a",sessionHash:f.sessionHash};
 assert.ok(await reauth.completeOtpReauth(f.env,f.request(),context,"email",{subject:"buyer@example.test",email:"buyer@example.test"}));
 assert.equal(await reauth.completeOtpReauth(f.env,f.request(),{...context,customerId:"customer-b"},"email",{subject:"other@example.test",email:"other@example.test"}),null);
 assert.equal(await reauth.completeOtpReauth(f.env,f.request(),{...context,sessionHash:"other"},"email",{subject:"buyer@example.test",email:"buyer@example.test"}),null);
 }finally{f.close();}});
test("Google step-up verifies signed ID token, fresh auth_time, nonce, audience and identity",async()=>{
 const now=Date.now(), seconds=Math.floor(now/1000);
 const keys=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
 const jwk={...await crypto.subtle.exportKey("jwk",keys.publicKey),kid:"test",use:"sig"};
 const certificates=async()=>Response.json({keys:[jwk]});
 const enc=(value)=>Buffer.from(JSON.stringify(value)).toString("base64url");
 const make=async(overrides={})=>{const data=`${enc({alg:"RS256",kid:"test"})}.${enc({iss:"https://accounts.google.com",aud:"client",sub:"subject",nonce:"nonce",auth_time:seconds,iat:seconds,exp:seconds+60,...overrides})}`; const signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",keys.privateKey,new TextEncoder().encode(data));return`${data}.${Buffer.from(signature).toString("base64url")}`;};
 const input={clientId:"client",nonce:"nonce",subject:"subject"};
 assert.equal(await google.verifyGoogleReauth(await make(),input,now,certificates),true);
 for(const overrides of [{aud:"other"},{sub:"other"},{nonce:"other"},{auth_time:seconds-121},{exp:seconds-1}])assert.equal(await google.verifyGoogleReauth(await make(overrides),input,now,certificates),false);
 assert.equal(await google.verifyGoogleReauth((await make()).slice(0,-10)+"AAAAAAAAAA",input,now,certificates),false);
});

test("malformed RPC output and unavailable runtime return generic denial", async () => {
 for (const value of [null, {}, {state:"found",code:"593821",receivedAt:new Date().toISOString(),messageRef:"private",body:"unexpected"}, {state:"found",code:"invalid",receivedAt:"invalid",messageRef:"private"}]) {
  const f=await fixture();try {f.env.MAILVAULT_OTP.lookupLoginOtp=async()=>value;
   const response=await endpoint.handleCustomerOtp(f.request(),"order-a",f.env);assert.equal(response.status,503);
   assert.deepEqual(await response.json(),{ok:false,code:"otp_service_unavailable"});
  }finally{f.close();}
 }
});
test("binding races and alias reuse fail closed while remote validation is pending", async()=>{
 const binding=await otpModule("src/lib/shop/otp/inventory-binding.ts");const f=await fixture({fulfilled:false});
 try{f.sqlite.exec("INSERT INTO shop_inventory_units SELECT 'unit-b',variant_id,status,crypto_version,key_version,ciphertext_b64,data_iv_b64,wrapped_dek_b64,wrap_iv_b64,'b' || substr(key_fingerprint,2),imported_by,imported_at,updated_at,fulfilled_at,NULL,NULL FROM shop_inventory_units WHERE id='unit-a'");
  const input={inventoryUnitId:"unit-b",aliasId:"alias-b",providerKey:"synthetic"};
  const outcomes=await Promise.allSettled(Array.from({length:20},()=>binding.bindOtpInventory(f.env,input)));
  assert.equal(outcomes.filter(result=>result.status==="fulfilled").length,1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM shop_otp_inventory_aliases WHERE alias_id='alias-b'").get().n,1);
  await assert.rejects(()=>binding.bindOtpInventory(f.env,{...input,aliasId:"alias-a"}));
 }finally{f.close();}
});
test("admin quarantine preserves the operator reason without OTP in status or outcomes",async()=>{
 const admin=await otpModule("src/lib/admin/router/shop/otp.ts"),f=await fixture();
 try{const ctx={bindings:f.env,session:{createdAt:new Date().toISOString()},method:"POST",segments:["shop","otp","quarantine"],request:new Request("https://tung.codes/api/admin/shop/otp/quarantine",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({inventoryUnitId:"unit-a",reason:"operator_security_review"})})};
  const response=await admin.handleOtpRoutes(ctx,"otp");assert.equal(response.status,200);
  assert.equal(f.sqlite.prepare("SELECT revoked_reason FROM shop_otp_grants").get().revoked_reason,"operator_security_review");
  ctx.method="GET";ctx.segments=["shop","otp"];ctx.request=new Request("https://tung.codes/api/admin/shop/otp?inventoryUnitId=unit-a");
  assert.doesNotMatch(await(await admin.handleOtpRoutes(ctx,"otp")).text(),/593821|alias-a/);
 }finally{f.close();}
});

test("session revocation between final proof read and entitlement SQL is fenced",async()=>{
 const f=await fixture();try{
  const prepare=f.env.CONTENT_DB.prepare.bind(f.env.CONTENT_DB);let orderReads=0;
  f.env.CONTENT_DB={...f.env.CONTENT_DB,prepare(sql){
   const statement=prepare(sql);
   if(sql.startsWith("SELECT id FROM shop_orders WHERE id = ? AND customer_id = ?")) {
    const first=statement.first.bind(statement);statement.first=async()=>{
      const row=await first();orderReads+=1;
      if(orderReads===2)f.sqlite.exec("UPDATE shop_customer_sessions SET revoked_at='2026-01-01T00:00:00.000Z'");
      return row;
    };
   }
   return statement;
  }};
  const response=await endpoint.handleCustomerOtp(f.request(),"order-a",f.env);
  assert.equal(response.status,404);assert.doesNotMatch(await response.text(),/593821/);
 }finally{f.close();}
});
test("existing one-use magic-link step-up preserves session, identity and localized allocation return",async()=>{
 const magic=await otpModule("src/lib/shop/magic-link.ts"),f=await fixture();
 try{
  f.sqlite.exec("DELETE FROM shop_otp_session_proofs");
  const token="B".repeat(43),returnPath="/ja/shop/account/orders/order-a?allocation=allocation-a";
  await auth.createAuthChallenge(f.env,{kind:"magic_link",provider:"email",publicToken:token,email:"buyer@example.test",redirectPath:returnPath,payload:{locale:"ja",otpReauth:true,customerId:"customer-a",sessionHash:f.sessionHash}});
  const result=await magic.consumeMagicLink(f.env,{token,request:f.request()});
  assert.equal(result.redirectPath,returnPath);assert.equal(result.session.cookie,"");assert.equal(result.session.tokenHash,f.sessionHash);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM shop_customer_sessions").get().n,1);
  assert.equal(f.sqlite.prepare("SELECT customer_id FROM shop_otp_session_proofs").get().customer_id,"customer-a");
  assert.ok("error" in await magic.consumeMagicLink(f.env,{token,request:f.request()}));
 }finally{f.close();}
});
test("two delivered allocations in one order keep aliases and codes isolated",async()=>{
 const f=await fixture();try{
  function clone(table,id,replacements){const row=f.sqlite.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);Object.assign(row,replacements);
   const columns=Object.keys(row);f.sqlite.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(()=>"?").join(",")})`).run(...columns.map(column=>row[column]));}
  clone("shop_inventory_units","unit-a",{id:"unit-b",key_fingerprint:"b".repeat(43)});
  clone("shop_order_items","item-a",{id:"item-b",line_number:2});
  clone("shop_inventory_reservations","reservation-a",{id:"reservation-b",order_item_id:"item-b"});
  clone("shop_inventory_allocations","allocation-a",{id:"allocation-b",reservation_id:"reservation-b",order_item_id:"item-b",inventory_unit_id:"unit-b"});
  clone("shop_otp_inventory_aliases","binding-a",{id:"binding-b",inventory_unit_id:"unit-b",alias_id:"alias-b"});
  await reconciliation.reconcileOtpGrants(f.env);
  assert.equal((await grants.listOrderOtpCards(f.db,"customer-a","order-a")).length,2);
  f.env.MAILVAULT_OTP.lookupLoginOtp=async request=>({state:"found",code:request.aliasId==="alias-a"?"593821":"482716",receivedAt:new Date().toISOString(),messageRef:"private"});
  assert.equal((await(await endpoint.handleCustomerOtp(f.request(),"order-a",f.env)).json()).code,"593821");
  assert.equal((await(await endpoint.handleCustomerOtp(f.request({allocationId:"allocation-b"}),"order-a",f.env)).json()).code,"482716");
 }finally{f.close();}
});
