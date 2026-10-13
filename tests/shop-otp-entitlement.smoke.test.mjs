import assert from "node:assert/strict";
import { test } from "node:test";
import { createOtpD1, seedOtpShop, otpModule, read } from "./helpers/otp-harness.mjs";
const auth = await otpModule("src/lib/shop/customer-auth.ts");
const grants = await otpModule("src/lib/shop/otp/grant-repository.ts");
const policy = await otpModule("src/lib/shop/otp/entitlement-policy.ts");
const reconciliation = await otpModule("src/lib/shop/otp/reconciliation.ts");
const now = Date.parse("2026-10-14T01:00:00.000Z");
const iso = at => new Date(at).toISOString();
async function fixture(options = {}) {
  const f = createOtpD1();
  const identity = await seedOtpShop(f.db, auth, { now, ...options });
  return { ...f, ...identity, env: { CONTENT_DB:f.db,SHOP_OTP_ENABLED:"true",OTP_BRIDGE_RPC_HMAC_KEY:"synthetic-key-for-local-tests-only-32",MAILVAULT_OTP:{validateAlias:async req=>({state:"active",aliasId:req.aliasId})}} };
}
const extension = (version,expiresAt) => ({inventoryUnitId:"unit-a",expectedVersion:version,expiresAt,actor:"admin-test",reason:"reviewed_service_renewal"});

test("30-day sold term derives from fulfillment, separately from checkout deadline",async()=>{
  const f=await fixture({entitlement:{kind:"duration",durationSeconds:30*86400}});
  try {
    f.sqlite.prepare("UPDATE shop_orders SET expires_at=?").run(iso(now-86400000));
    const g=f.sqlite.prepare("SELECT * FROM shop_otp_grants").get();
    assert.equal(g.entitlement_term_start_at,iso(now-1000));
    assert.equal(g.expires_at,iso(now-1000+30*86400000));
    assert.ok(await grants.loadEligibleGrant(f.db,"customer-a","order-a","allocation-a",now));
    assert.equal(await grants.loadEligibleGrant(f.db,"customer-a","order-a","allocation-a",Date.parse(g.expires_at)),null);
    await reconciliation.reconcileOtpGrants(f.env,Date.parse(g.expires_at));
    assert.equal(f.sqlite.prepare("SELECT state FROM shop_otp_grants").get().state,"expired");
  } finally {f.close();}
});

test("perpetual expiry is null only for an explicitly sold perpetual policy",async()=>{
  const f=await fixture();
  try {
    const g=f.sqlite.prepare("SELECT entitlement_kind,expires_at FROM shop_otp_grants").get();
    assert.equal(g.entitlement_kind,"perpetual");assert.equal(g.expires_at,null);
    assert.ok(await grants.loadEligibleGrant(f.db,"customer-a","order-a","allocation-a",now+3650*86400000));
    await assert.rejects(()=>policy.extendOtpEntitlement(f.db,extension(1,iso(now+86400000)),now));
    assert.throws(()=>f.sqlite.exec("UPDATE shop_otp_grants SET expires_at='2030-01-01T00:00:00.000Z'"));
  } finally {f.close();}
});

test("generic catalog termMonths and labels never create an implicit perpetual grant",async()=>{
  const f=await fixture({entitlement:null});
  try {
    f.sqlite.exec("UPDATE shop_products SET metadata_json='{"+'"termMonths":1'+"}'; UPDATE shop_variants SET metadata_json='{"+'"termMonths":1'+"}',option_values_json='{"+'"duration":"1-month"'+"}';");
    await grants.createPendingGrants(f.db,now);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM shop_otp_grants").get().n,0);
    assert.equal(await grants.loadEligibleGrant(f.db,"customer-a","order-a","allocation-a",now),null);
    assert.throws(()=>f.sqlite.exec("UPDATE shop_order_items SET otp_entitlement_kind='perpetual',otp_policy_version=1"));
  } finally {f.close();}
});

test("checkout freezes policy before subsequent catalog policy changes",async()=>{
  const f=await fixture({fulfilled:false,entitlement:{kind:"duration",durationSeconds:30*86400}});
  try {
    await policy.configureOtpVariantPolicy(f.db,{variantId:"otp-variant",kind:"perpetual",expectedRevision:1,actor:"admin-test",reason:"future_variant_revision"},now);
    f.sqlite.exec("UPDATE shop_inventory_units SET status='fulfilled'; UPDATE shop_inventory_allocations SET status='fulfilled',fulfilled_at=updated_at");
    const g=f.sqlite.prepare("SELECT * FROM shop_otp_grants").get();
    assert.equal(g.entitlement_kind,"duration");assert.equal(g.entitlement_policy_version,1);
    assert.equal(g.expires_at,iso(now-1000+30*86400000));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM shop_otp_variant_policy_history").get().n,2);
    for(const sql of ["UPDATE shop_order_items SET otp_duration_seconds=60", "UPDATE shop_order_items SET otp_entitlement_kind='perpetual'", "UPDATE shop_otp_grants SET entitlement_start_at='2020-01-01T00:00:00.000Z'", "UPDATE shop_otp_grants SET entitlement_expires_at=NULL"])
      assert.throws(()=>f.sqlite.exec(sql));
  } finally {f.close();}
});

test("late verified ownership starts the message fence without extending sold service duration",async()=>{
  const f=await fixture({fulfilled:false,entitlement:{kind:"duration",durationSeconds:30*86400}});
  try {
    const acquired=now+3600000;
    f.sqlite.prepare("UPDATE shop_customers SET account_activated_at=? WHERE id='customer-a'").run(iso(acquired));
    f.sqlite.prepare("UPDATE shop_customer_identities SET verified_at=?").run(iso(acquired));
    f.sqlite.exec("UPDATE shop_inventory_units SET status='fulfilled'; UPDATE shop_inventory_allocations SET status='fulfilled',fulfilled_at=updated_at");
    const g=f.sqlite.prepare("SELECT * FROM shop_otp_grants").get();
    assert.equal(g.entitlement_term_start_at,iso(now-1000));
    assert.equal(g.entitlement_start_at,iso(acquired));
    assert.equal(g.expires_at,iso(now-1000+30*86400000));
    await reconciliation.reconcileOtpGrants(f.env,acquired+5000);
    assert.equal(f.sqlite.prepare("SELECT activated_at FROM shop_otp_grants").get().activated_at,iso(acquired));
    assert.equal(await grants.loadEligibleGrant(f.db,"customer-a","order-a","allocation-a",acquired-1),null);
  } finally {f.close();}
});

test("delayed routing validation preserves the first post-entitlement OTP boundary",async()=>{
  const f=await fixture({active:false});
  try {
    const start=f.sqlite.prepare("SELECT entitlement_start_at FROM shop_otp_grants").get().entitlement_start_at;
    await reconciliation.reconcileOtpGrants(f.env,now+60000);
    const g=f.sqlite.prepare("SELECT activated_at,entitlement_start_at FROM shop_otp_grants").get();
    assert.equal(g.activated_at,start);assert.equal(g.entitlement_start_at,start);
  } finally {f.close();}
});

test("explicit fixed UTC expiry is snapshotted and immediately denies expired access",async()=>{
  const f=await fixture({entitlement:{kind:"until",expiresAt:iso(now+3600000)}});
  try {
    const g=f.sqlite.prepare("SELECT * FROM shop_otp_grants").get();assert.equal(g.expires_at,iso(now+3600000));
    assert.equal(await grants.loadEligibleGrant(f.db,"customer-a","order-a","allocation-a",now+3600000),null);
    assert.ok(await grants.loadEligibleGrant(f.db,"customer-a","order-a","allocation-a",now+3599999));
  } finally {f.close();}
});

test("reviewed renewal extends effective expiry, retains original snapshot and alias, and records one audit",async()=>{
  const f=await fixture({entitlement:{kind:"duration",durationSeconds:86400}});
  try {
    const before=f.sqlite.prepare("SELECT * FROM shop_otp_grants").get();
    const result=await policy.extendOtpEntitlement(f.db,extension(before.version,iso(now+2*86400000)),now);
    const after=f.sqlite.prepare("SELECT * FROM shop_otp_grants").get();
    assert.equal(result.version,before.version+1);assert.equal(after.expires_at,iso(now+2*86400000));
    assert.equal(after.entitlement_expires_at,before.entitlement_expires_at);assert.equal(after.alias_id,before.alias_id);
    assert.equal(after.inventory_unit_id,before.inventory_unit_id);assert.equal(after.entitlement_start_at,before.entitlement_start_at);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM shop_otp_grant_extensions").get().n,1);
    for(const sql of ["UPDATE shop_otp_grant_extensions SET reason='changed'", "DELETE FROM shop_otp_grant_extensions", "UPDATE shop_otp_grants SET expires_at=NULL"])
      assert.throws(()=>f.sqlite.exec(sql));
  } finally {f.close();}
});

for(const concurrency of [20,50]) test(`${concurrency} concurrent renewals admit one version and one audit`,async()=>{
  const f=await fixture({entitlement:{kind:"duration",durationSeconds:86400}});
  try {
    const results=await Promise.allSettled(Array.from({length:concurrency},()=>policy.extendOtpEntitlement(f.db,extension(1,iso(now+2*86400000)),now)));
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM shop_otp_grant_extensions").get().n,1);
    assert.equal(f.sqlite.prepare("SELECT version FROM shop_otp_grants").get().version,2);
  } finally {f.close();}
});

for(const first of ["renewal","expiry"]) test(`${first} wins expiry/renewal interleaving without resurrection`,async()=>{
  const f=await fixture({entitlement:{kind:"duration",durationSeconds:60}});
  try {
    const expires=Date.parse(f.sqlite.prepare("SELECT expires_at FROM shop_otp_grants").get().expires_at);
    if(first==="renewal") {
      await policy.extendOtpEntitlement(f.db,extension(1,iso(expires+60000)),expires-1);
      await reconciliation.reconcileOtpGrants(f.env,expires);
      assert.equal(f.sqlite.prepare("SELECT state FROM shop_otp_grants").get().state,"active");
    } else {
      await reconciliation.reconcileOtpGrants(f.env,expires);
      await assert.rejects(()=>policy.extendOtpEntitlement(f.db,extension(1,iso(expires+60000)),expires));
      assert.equal(f.sqlite.prepare("SELECT state FROM shop_otp_grants").get().state,"expired");
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM shop_otp_grant_extensions").get().n,0);
      assert.throws(()=>f.sqlite.exec("UPDATE shop_otp_grants SET state='active'"));
    }
  } finally {f.close();}
});

test("expired wall-clock term cannot renew even before cron marks it expired",async()=>{
  const f=await fixture({entitlement:{kind:"duration",durationSeconds:60}});
  try {
    const expires=Date.parse(f.sqlite.prepare("SELECT expires_at FROM shop_otp_grants").get().expires_at);
    await assert.rejects(()=>policy.extendOtpEntitlement(f.db,extension(1,iso(expires+60000)),expires));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM shop_otp_grant_extensions").get().n,0);
  } finally {f.close();}
});

test("legacy migration suspends indefinite grants without guessing sold terms",async()=>{
  const f=createOtpD1({through:"0062"});
  try {
    await seedOtpShop(f.db,auth,{now,legacy:true});
    assert.equal(f.sqlite.prepare("SELECT state,expires_at FROM shop_otp_grants").get().state,"active");
    f.sqlite.exec(read("content-migrations/0063_shop_otp_entitlement_policy.sql"));
    f.sqlite.exec(read("content-migrations/0064_shop_otp_validation_recovery.sql"));
    assert.equal(f.sqlite.prepare("SELECT state FROM shop_otp_grants").get().state,"suspended");
    assert.equal(await grants.loadEligibleGrant(f.db,"customer-a","order-a","allocation-a",now),null);
    await policy.configureOtpVariantPolicy(f.db,{variantId:"otp-variant",kind:"perpetual",expectedRevision:0,actor:"admin-test",reason:"future_policy_only"},now);
    await reconciliation.reconcileOtpGrants({CONTENT_DB:f.db,SHOP_OTP_ENABLED:"true"},now);
    assert.equal(f.sqlite.prepare("SELECT state FROM shop_otp_grants").get().state,"suspended");
    assert.throws(()=>f.sqlite.exec("UPDATE shop_otp_grants SET state='active'"));
    assert.throws(()=>f.sqlite.exec("UPDATE shop_order_items SET otp_entitlement_kind='perpetual',otp_policy_version=1"));
    assert.deepEqual(f.sqlite.prepare("PRAGMA foreign_key_check").all(),[]);
  } finally {f.close();}
});

test("policy requires validated finite duration, canonical UTC expiry and explicit revisions",async()=>{
  const f=await fixture();
  try {
    for(const input of [
      {kind:"duration",durationSeconds:0},{kind:"duration",durationSeconds:60.5},{kind:"duration",durationSeconds:Infinity},
      {kind:"until",expiresAt:"2027-01-01"},{kind:"until",expiresAt:iso(now)},
      {kind:"perpetual",expectedRevision:0},
    ]) await assert.rejects(()=>policy.configureOtpVariantPolicy(f.db,{variantId:"otp-variant",expectedRevision:1,actor:"admin-test",reason:"reviewed_policy",...input},now));
    const results=await Promise.allSettled(Array.from({length:20},()=>policy.configureOtpVariantPolicy(f.db,{variantId:"otp-variant",kind:"duration",durationSeconds:86400,expectedRevision:1,actor:"admin-test",reason:"reviewed_policy"},now)));
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM shop_otp_variant_policy_history").get().n,2);
  } finally {f.close();}
});
