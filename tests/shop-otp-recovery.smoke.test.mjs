import assert from "node:assert/strict";
import { test } from "node:test";
import { createOtpD1, seedOtpShop, otpModule } from "./helpers/otp-harness.mjs";
const auth = await otpModule("src/lib/shop/customer-auth.ts");
const reconcile = await otpModule("src/lib/shop/otp/reconciliation.ts");
const recovery = await otpModule("src/lib/shop/otp/validation-recovery.ts");
const status = await otpModule("src/lib/shop/otp/status-endpoint.ts");
async function fixture() {
  const f = createOtpD1(), identity = await seedOtpShop(f.db, auth, { active: false });
  let calls = 0, ready = false;
  const env = { CONTENT_DB:f.db, SHOP_OTP_ENABLED:"true", SHOP_PUBLIC_ORIGIN:"https://tung.codes",
    SHOP_CUSTOMER_SESSION_SECRET:identity.secret, OTP_BRIDGE_RPC_HMAC_KEY:"synthetic-rpc-shared-key-32-characters",
    MAILVAULT_OTP:{ validateAlias:async request => { calls++; return {state:ready ? "active":"routing_unknown",aliasId:request.aliasId};},
      lookupLoginOtp:async()=>{ throw new Error("status_must_not_read_mail"); } } };
  const request = (body={allocationId:"allocation-a"}, headers={}) => new Request("https://tung.codes/api/shop/me/orders/order-a/otp-status",{method:"POST",headers:{origin:"https://tung.codes","content-type":"application/json",cookie:identity.cookie,...headers},body:JSON.stringify(body)});
  return { ...f,...identity,env,request,calls:()=>calls,ready:()=>{ready=true;} };
}
test("20 consecutive validation failures, bounded stop, recent-admin requeue and dependency recovery activate grant",async()=>{
 const f=await fixture();try {
  let now=f.now;
  for(let attempt=1;attempt<=20;attempt++) {
   await Promise.all(Array.from({length:20},()=>reconcile.reconcileOtpGrants(f.env,now)));
   const row=f.sqlite.prepare("SELECT * FROM shop_otp_grants").get();
   assert.equal(row.validation_attempts,attempt);assert.equal(row.validation_total_attempts,attempt);
   assert.equal(row.validation_last_failure,"routing_unknown");assert.ok(Date.parse(row.next_validation_at)>now);
   now=Date.parse(row.next_validation_at);
  }
  assert.equal(f.calls(),20);
  await reconcile.reconcileOtpGrants(f.env,now);assert.equal(f.calls(),20);
  f.ready();await reconcile.reconcileOtpGrants(f.env,now+3600000);assert.equal(f.calls(),20);
  const outcomes=await Promise.allSettled(Array.from({length:20},()=>recovery.requeueOtpValidation(f.db,{inventoryUnitId:"unit-a",actor:"owner",reason:"routing_recovered"},now)));
  assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);
  await reconcile.reconcileOtpGrants(f.env,now);
  const row=f.sqlite.prepare("SELECT * FROM shop_otp_grants").get();
  assert.equal(row.state,"active");assert.equal(row.validation_total_attempts,21);assert.equal(row.validation_cycle,2);
  assert.equal(row.activated_at,row.entitlement_start_at);assert.equal(row.validation_last_failure,null);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM shop_otp_validation_requeues").get().n,1);
  assert.throws(()=>f.sqlite.exec("UPDATE shop_otp_validation_requeues SET reason='changed'"));
  assert.throws(()=>f.sqlite.exec("DELETE FROM shop_otp_validation_requeues"));
 }finally{f.close();}
});
test("authorized recovery denies before exhaustion, during cooldown, and after refund; no unsafe resurrection",async()=>{
 const f=await fixture();try {
  const input={inventoryUnitId:"unit-a",actor:"owner",reason:"routing_recovered"};
  await assert.rejects(()=>recovery.requeueOtpValidation(f.db,input,f.now));
  let now=f.now;
  for(let i=0;i<20;i++){await reconcile.reconcileOtpGrants(f.env,now);now=Date.parse(f.sqlite.prepare("SELECT next_validation_at FROM shop_otp_grants").get().next_validation_at);}
  await assert.rejects(()=>recovery.requeueOtpValidation(f.db,input,now-1));
  f.sqlite.exec("UPDATE shop_orders SET payment_status='refunded',status='refunded'");
  await assert.rejects(()=>recovery.requeueOtpValidation(f.db,input,now));
  assert.equal(f.sqlite.prepare("SELECT state FROM shop_otp_grants").get().state,"revoked");
 }finally{f.close();}
});
test("safe bounded reason is persisted when remote validation throws secrets or returns malformed data",async()=>{
 const f=await fixture();try{
  f.env.MAILVAULT_OTP.validateAlias=async()=>{throw new Error("sensitive-mail-credentials");};
  await reconcile.reconcileOtpGrants(f.env,f.now);
  assert.equal(f.sqlite.prepare("SELECT validation_last_failure FROM shop_otp_grants").get().validation_last_failure,"service_unavailable");
  assert.doesNotMatch(JSON.stringify(f.sqlite.prepare("SELECT * FROM shop_otp_grants").all()),/sensitive-mail/);
  const now=Date.parse(f.sqlite.prepare("SELECT next_validation_at FROM shop_otp_grants").get().next_validation_at);
  f.env.MAILVAULT_OTP.validateAlias=async()=>({state:"active",aliasId:"alias-other"});
  await reconcile.reconcileOtpGrants(f.env,now);
  assert.equal(f.sqlite.prepare("SELECT validation_last_failure FROM shop_otp_grants").get().validation_last_failure,"invalid_response");
 }finally{f.close();}
});
test("grant status returns minimal ownership-scoped state with leased validation and without step-up, code or alias",async()=>{
 const f=await fixture();try{
  f.sqlite.exec("DELETE FROM shop_otp_session_proofs");
  const response=await status.handleCustomerOtpStatus(f.request(),"order-a",f.env);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,state:"pending"});
  assert.match(response.headers.get("cache-control"),/no-store/);assert.equal(f.calls(),1);
  assert.equal((await status.handleCustomerOtpStatus(f.request(),"other-order",f.env)).status,404);
  assert.equal((await status.handleCustomerOtpStatus(f.request({allocationId:"allocation-a",aliasId:"alias-a"}),"order-a",f.env)).status,400);
  assert.equal((await status.handleCustomerOtpStatus(f.request(undefined,{origin:"https://evil.test"}),"order-a",f.env)).status,403);
  assert.equal((await status.handleCustomerOtpStatus(f.request(undefined,{cookie:""}),"order-a",f.env)).status,401);
  f.sqlite.exec("UPDATE shop_customer_sessions SET customer_id='customer-b'");
  assert.equal((await status.handleCustomerOtpStatus(f.request(),"order-a",f.env)).status,404);assert.equal(f.calls(),1);
  f.env.SHOP_OTP_ENABLED="false";assert.equal((await status.handleCustomerOtpStatus(f.request(),"order-a",f.env)).status,404);assert.equal(f.calls(),1);
 }finally{f.close();}
});
test("revalidation admin route requires existing recent password session and operator reason",async()=>{
 const admin=await otpModule("src/lib/admin/router/shop/otp.ts"),f=await fixture();try{
  const request=()=>new Request("https://tung.codes/api/admin/shop/otp/revalidate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({inventoryUnitId:"unit-a",reason:"routing_recovered"})});
  const ctx={bindings:f.env,user:{sub:"owner",email:"operator@example.test"},method:"POST",segments:["shop","otp","revalidate"],request:request(),session:null};
  assert.equal((await admin.handleOtpRoutes(ctx,"otp")).status,401);
  ctx.session={createdAt:new Date(Date.now()-3600000).toISOString()};ctx.request=request();assert.equal((await admin.handleOtpRoutes(ctx,"otp")).status,401);
  ctx.session={createdAt:new Date().toISOString()};ctx.request=request();assert.equal((await admin.handleOtpRoutes(ctx,"otp")).status,409);
 }finally{f.close();}
});

test("ownership-scoped setup status retries a recovered dependency when the lease is due",async()=>{
 const f=await fixture();try{
  assert.deepEqual(await(await status.handleCustomerOtpStatus(f.request(),"order-a",f.env,f.now)).json(),{ok:true,state:"pending"});
  f.ready();const due=Date.parse(f.sqlite.prepare("SELECT next_validation_at FROM shop_otp_grants").get().next_validation_at);
  assert.deepEqual(await(await status.handleCustomerOtpStatus(f.request(),"order-a",f.env,due-1)).json(),{ok:true,state:"pending"});assert.equal(f.calls(),1);
  assert.deepEqual(await(await status.handleCustomerOtpStatus(f.request(),"order-a",f.env,due)).json(),{ok:true,state:"active"});assert.equal(f.calls(),2);
 }finally{f.close();}
});
