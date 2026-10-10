import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import config from '../config/env.js';
import app from '../app.js';
import {getDatabase,getPlatformDatabase,closeStorage,saveLeadsHistory,loadLeadsHistory,saveDailyUsage,loadDailyUsage,getTodayDateString,saveMailboxHistory,loadMailboxHistory,saveAutoSendSetting,loadAutoSendSetting} from '../services/storageService.js';
import {accessDatabase,createUser,completeSetup,findUser,publicUser,audit,auditList} from '../services/accessService.js';
import {listTenants,createTenant,runInTenant,findTenant,updateTenant,assertTenantActive,saveSubscription} from '../services/tenantService.js';
import {saveProviderSettings,providerSettings} from '../services/integrationService.js';
import {sendEmail} from '../services/mailService.js';
import {generateColdEmail,extractMetadataAndDraftReply} from '../services/deepseekService.js';
import {generateFollowUpDraft} from '../services/followUpEngine.js';
let dir,original,server,realFetch;
const keys=['DB_PATH','DAILY_USAGE_FILE','REPLY_USAGE_FILE','LEADS_HISTORY_FILE','SEEN_PLACES_FILE','MAILBOX_HISTORY_FILE','OUTREACH_HISTORY_FILE','SETTINGS_ENCRYPTION_KEY','GOOGLE_API_KEY','HUNTER_API_KEY','DEEPSEEK_API_KEY','HOSTINGER_API_TOKEN','HOSTINGER_WEBHOOK_BEARER_TOKEN','HOSTINGER_MAILBOX_ID','HOSTINGER_SEND_ENDPOINT_OVERRIDE','SENDER_MAILBOX','SMTP_HOST','SMTP_USER','SMTP_PASS','ADMIN_EMAIL','ADMIN_PASSWORD_HASH','NODE_ENV','AUTO_SEND','BUSINESS_CONTEXT','LEAD_KEYWORDS'];
beforeEach(()=>{original=Object.fromEntries(keys.map(k=>[k,config[k]]));realFetch=globalThis.fetch;dir=fs.mkdtempSync(path.join(os.tmpdir(),'signinn-tenancy-'));closeStorage();for(const k of keys.filter(k=>k.endsWith('_FILE')||k==='DB_PATH'))config[k]=path.join(dir,k==='DB_PATH'?'platform.sqlite':k);Object.assign(config,{SETTINGS_ENCRYPTION_KEY:'ab'.repeat(32),GOOGLE_API_KEY:'legacy-google',HUNTER_API_KEY:'legacy-hunter',DEEPSEEK_API_KEY:'',HOSTINGER_API_TOKEN:'',HOSTINGER_WEBHOOK_BEARER_TOKEN:'legacy-webhook',HOSTINGER_MAILBOX_ID:'',HOSTINGER_SEND_ENDPOINT_OVERRIDE:'',SENDER_MAILBOX:'sales@spicecoast.test',SMTP_HOST:'',SMTP_USER:'',SMTP_PASS:'',ADMIN_EMAIL:'',ADMIN_PASSWORD_HASH:'',NODE_ENV:'development',AUTO_SEND:false,BUSINESS_CONTEXT:'',LEAD_KEYWORDS:''});globalThis.fetch=async()=>{throw new Error('Unexpected external provider call');};});
afterEach(async()=>{if(server){await new Promise(r=>server.close(r));server=null;}closeStorage();Object.assign(config,original);globalThis.fetch=realFetch;fs.rmSync(dir,{recursive:true,force:true});});
const newTenant=()=>{const t=createTenant({name:'Acme Trading',slug:'acme'});return saveSubscription(t.id,{planId:'standard',status:'active',openEnded:true},'system');};
async function account(role,email,tenantId){const result=createUser({name:role,email,role,tenantId});await completeSetup(email,result.setup.token,'long-test-password-123');return publicUser(findUser(result.user.id));}
async function listen(){server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return 'http://127.0.0.1:'+server.address().port;}
async function login(base,email){const res=await realFetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'long-test-password-123'})});assert.equal(res.status,200);const data=await res.json();return {cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':data.csrfToken,'Content-Type':'application/json'};}
const request=(base,url,headers,method='GET',body)=>realFetch(base+url,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
test('legacy migration preserves SpiceCoast records and separates platform and customer accounts',()=>{
 saveLeadsHistory({leads:[{id:'old',name:'Existing buyer'}],searches:[]});
 const db=getPlatformDatabase();db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,role TEXT,active INTEGER,password_hash TEXT,version INTEGER,daily_lead_limit INTEGER,setup_hash TEXT,setup_expires INTEGER,created_at TEXT,last_login_at TEXT)");
 db.prepare('INSERT INTO users(id,email,name,role,active,version,daily_lead_limit,created_at) VALUES(?,?,?,?,1,1,60,?)').run('platform','admin@signinn.in','Signinn','super_admin',new Date().toISOString());
 db.prepare('INSERT INTO users(id,email,name,role,active,version,daily_lead_limit,created_at) VALUES(?,?,?,?,1,1,60,?)').run('staff','staff@spicecoast.test','Staff','manager',new Date().toISOString());
 accessDatabase();const firstVersion=findUser('staff').version;accessDatabase();assert.equal(findUser('staff').role,'company_admin');assert.equal(findUser('staff').version,firstVersion);assert.equal(findUser('platform').tenant_id,null);assert.equal(findUser('staff').tenant_id,'spicecoast');assert.equal(listTenants().length,1);
 runInTenant('spicecoast',()=>assert.equal(loadLeadsHistory().leads[0].id,'old'));
});
test('concurrent tenant operations isolate records, settings, quotas and async context',async()=>{
 const t=newTenant();
 await runInTenant('spicecoast',async()=>{await saveProviderSettings({GOOGLE_API_KEY:'private-a',SENDER_MAILBOX:'sales@spicecoast.test'},'platform');saveLeadsHistory({leads:[{id:'same',name:'SpiceCoast buyer'}],searches:[]});saveDailyUsage(getTodayDateString(),5);saveAutoSendSetting(true);audit('actor-a','test.a');});
 await runInTenant(t.id,async()=>{assert.equal(config.GOOGLE_API_KEY,'');assert.equal(config.SENDER_MAILBOX,'');assert.equal(loadLeadsHistory().leads.length,0);assert.equal(loadAutoSendSetting(),false);await saveProviderSettings({GOOGLE_API_KEY:'private-b',SENDER_MAILBOX:'sales@acme.test'},'platform');saveLeadsHistory({leads:[{id:'same',name:'Acme buyer'}],searches:[]});saveDailyUsage(getTodayDateString(),2);audit('actor-b','test.b');});
 await Promise.all([runInTenant('spicecoast',async()=>{await new Promise(r=>setTimeout(r,25));assert.equal(config.GOOGLE_API_KEY,'private-a');assert.equal(loadLeadsHistory().leads[0].name,'SpiceCoast buyer');assert.equal(loadDailyUsage().count,5);assert.ok(auditList().every(e=>e.tenant_id==='spicecoast'));}),runInTenant(t.id,async()=>{await new Promise(r=>setTimeout(r,5));assert.equal(config.GOOGLE_API_KEY,'private-b');assert.equal(loadLeadsHistory().leads[0].name,'Acme buyer');assert.equal(loadDailyUsage().count,2);assert.ok(auditList().every(e=>e.tenant_id===t.id));assert.ok(!JSON.stringify(providerSettings()).includes('private-b'));})]);
 assert.equal(config.GOOGLE_API_KEY,'legacy-google');
});
test('platform and tenant APIs enforce ownership, role boundaries and account targeting',async()=>{
 const t=newTenant();const p=await account('super_admin','admin@signinn.test');const a=await account('company_admin','owner@spicecoast.test','spicecoast');const b=await account('company_admin','owner@acme.test',t.id);const op=await account('viewer','operator@acme.test',t.id);
 runInTenant('spicecoast',()=>saveLeadsHistory({leads:[{id:'a',name:'Private A'}],searches:[]}));runInTenant(t.id,()=>saveLeadsHistory({leads:[{id:'b',name:'Private B'}],searches:[]}));
 const base=await listen(),ph=await login(base,p.email),ah=await login(base,a.email),bh=await login(base,b.email),oh=await login(base,op.email);
 assert.equal((await request(base,'/api/platform/overview',ph)).status,200);assert.equal((await request(base,'/api/leads',ph)).status,403);assert.equal((await request(base,'/api/platform/overview',ah)).status,403);
 const records=await (await request(base,'/api/leads?tenantId=spicecoast',{...bh,'X-Tenant-Id':'spicecoast'})).json();assert.equal(records.all_leads[0].id,'b');
 assert.equal((await request(base,'/api/admin/users/'+a.id,bh,'PATCH',{active:false})).status,403);
 assert.equal((await request(base,'/api/platform/tenants/'+t.id+'/admin/users/'+a.id,ph,'PATCH',{active:false})).status,404);
 assert.equal((await request(base,'/api/admin/users',ah,'POST',{name:'Escalation',email:'escalate@test.example',role:'super_admin'})).status,403);
 assert.equal((await request(base,'/api/admin/users/'+b.id,ah,'PATCH',{tenantId:'spicecoast'})).status,403);
 assert.equal((await request(base,'/api/admin/users',oh)).status,403);
 assert.equal((await request(base,'/api/platform/tenants/'+t.id+'/admin/users',ph)).status,200);
 const settings=await (await request(base,'/api/platform/tenants/'+t.id+'/admin/integrations',ph)).json();assert.equal(settings.fields.find(f=>f.key==='GOOGLE_API_KEY').configured,false);
 assert.equal((await request(base,'/api/platform/tenants/'+t.id+'/admin/users',ph,'POST',{name:'Wrong',email:'wrong@acme.test',role:'super_admin'})).status,403);
});
test('platform onboarding creates tenant administrator and rolls back invalid onboarding',async()=>{
 const p=await account('super_admin','admin@signinn.test');const base=await listen(),h=await login(base,p.email);
 const result=await request(base,'/api/platform/tenants',h,'POST',{name:'New Customer',slug:'new-customer',ownerName:'Customer Owner',ownerEmail:'owner@new.test'});assert.equal(result.status,201);const data=await result.json();assert.equal(data.owner.user.role,'company_admin');assert.equal(data.owner.user.tenantId,data.tenant.id);assert.equal(data.owner.user.activated,false);
 await completeSetup(data.owner.user.email,data.owner.setup.token,'long-test-password-123');assert.equal((await request(base,'/api/auth/login',{'Content-Type':'application/json'},'POST',{email:data.owner.user.email,password:'long-test-password-123'})).status,403);
 assert.equal((await request(base,'/api/platform/tenants/'+data.tenant.id+'/subscription',h,'PUT',{planId:'standard',status:'active',openEnded:true})).status,200);const oh=await login(base,data.owner.user.email);assert.equal((await request(base,'/api/leads',oh)).status,200);assert.equal((await request(base,'/api/platform/overview',oh)).status,403);
 const before=listTenants().length;assert.equal((await request(base,'/api/platform/tenants',h,'POST',{name:'Invalid',slug:'invalid',ownerName:'',ownerEmail:'bad'})).status,400);assert.equal(listTenants().length,before);
});
test('suspension blocks tenant sessions, background dispatch and webhooks while platform management remains available',async()=>{
 const t=newTenant();const p=await account('super_admin','admin@signinn.test'),a=await account('company_admin','owner@acme.test',t.id);const base=await listen(),ph=await login(base,p.email),ah=await login(base,a.email);
 assert.equal((await request(base,'/api/platform/tenants/'+t.id,ph,'PATCH',{active:false})).status,200);
 assert.equal((await request(base,'/api/leads',ah)).status,403);assert.equal((await request(base,'/webhook/'+t.slug,{'Content-Type':'application/json'},'POST',{})).status,403);
 const signIn=await request(base,'/api/auth/login',{'Content-Type':'application/json'},'POST',{email:a.email,password:'long-test-password-123'});assert.equal(signIn.status,403);
 await runInTenant(t.id,async()=>{assert.throws(assertTenantActive);await assert.rejects(sendEmail('buyer@test.example','Subject','Body'),/suspended/);},{allowSuspended:true});
 assert.equal((await request(base,'/api/platform/tenants/'+t.id+'/admin/integrations',ph)).status,200);
 assert.equal((await request(base,'/api/platform/tenants/'+t.id,ph,'PATCH',{active:true})).status,200);assert.equal((await request(base,'/api/leads',ah)).status,200);
});
test('tenant webhooks authenticate against the routed tenant and retain messages only there',async()=>{
 const t=newTenant();await account('super_admin','admin@signinn.test');await runInTenant(t.id,()=>saveProviderSettings({HOSTINGER_WEBHOOK_BEARER_TOKEN:'acme-webhook',SENDER_MAILBOX:'sales@acme.test',LEAD_KEYWORDS:'software,demo'},'platform'));
 const base=await listen();const payload={id:'event-b',from:'buyer@example.test',to:'sales@acme.test',subject:'Software demo',message:'Please share a software demo.'};
 assert.equal((await request(base,'/webhook/'+t.slug,{'Content-Type':'application/json',Authorization:'Bearer legacy-webhook'},'POST',payload)).status,401);
 assert.equal((await request(base,'/webhook/'+t.slug,{'Content-Type':'application/json',Authorization:'Bearer acme-webhook'},'POST',payload)).status,200);
 runInTenant(t.id,()=>assert.equal(loadMailboxHistory().length,1));runInTenant('spicecoast',()=>assert.equal(loadMailboxHistory().length,0));
 assert.equal((await request(base,'/webhook',{'Content-Type':'application/json',Authorization:'Bearer legacy-webhook'},'POST',{...payload,id:'event-a',to:'sales@spicecoast.test',subject:'Spices quote'})).status,200);runInTenant('spicecoast',()=>assert.equal(loadMailboxHistory().length,1));
});
test('new tenant cold emails, inbound replies and follow-ups use its identity',async()=>{
 const t=newTenant();await runInTenant(t.id,async()=>{await saveProviderSettings({SENDER_MAILBOX:'sales@acme.test',BUSINESS_CONTEXT:'We supply business software.'},'platform');const cold=await generateColdEmail({name:'Prospect',city:'Paris'},{useAI:false});const reply=await extractMetadataAndDraftReply('Software inquiry','Need a demo','buyer@example.test','Buyer','','',{useAI:false});const follow=generateFollowUpDraft({id:'x',leadName:'Buyer',subject:cold.subject});for(const value of [cold.body,reply.reply,follow.body]){assert.match(value,/Acme Trading/);assert.doesNotMatch(value,/SpiceCoast|The Spice Coast|Kerala/);}});
});
test('complete backup restores platform access and all customer records under a new storage root',async()=>{
 const t=newTenant();await account('super_admin','admin@signinn.test');await account('company_admin','staff@acme.test',t.id);runInTenant('spicecoast',()=>saveLeadsHistory({leads:[{id:'a'}],searches:[]}));runInTenant(t.id,()=>saveLeadsHistory({leads:[{id:'b'}],searches:[]}));
 const backup=path.join(dir,'backup');execFileSync(process.execPath,['server/scripts/backup-tenants.js',backup],{cwd:path.resolve('.'),env:{...process.env,SPICECOAST_DB_PATH:config.DB_PATH,SETTINGS_ENCRYPTION_KEY:config.SETTINGS_ENCRYPTION_KEY},windowsHide:true});assert.ok(fs.existsSync(path.join(backup,'manifest.json')));closeStorage();config.DB_PATH=path.join(backup,'platform.sqlite');assert.equal(findUser(findUserByEmailId()).role,'company_admin');runInTenant('spicecoast',()=>assert.equal(loadLeadsHistory().leads[0].id,'a'));runInTenant(t.id,()=>assert.equal(loadLeadsHistory().leads[0].id,'b'));
 function findUserByEmailId(){return accessDatabase().prepare('SELECT id FROM users WHERE email=?').get('staff@acme.test').id;}
});

test('concurrent background HTTP searches retain tenant context and hide jobs from other tenants',async()=>{
 const t=newTenant();const a=await account('company_admin','manager@spicecoast.test','spicecoast'),b=await account('company_admin','manager@acme.test',t.id);
 await runInTenant(t.id,()=>saveProviderSettings({GOOGLE_API_KEY:'google-b',HUNTER_API_KEY:'hunter-b'},'platform'));
 globalThis.fetch=async(url,options)=>{assert.match(String(url),/places:searchText/);await new Promise(r=>setTimeout(r,20));const key=options.headers['X-Goog-Api-Key'];return {ok:true,status:200,json:async()=>({places:[{id:'same-provider-id',displayName:{text:'Buyer '+key},formattedAddress:'Hamburg Germany'}]})};};
 const base=await listen(),ah=await login(base,a.email),bh=await login(base,b.email);
 const body={business_type:'wholesale buyer',city:'Hamburg',country:'Germany',count:1,mode:'live',background:true,request_id:'11111111-2222-3333-4444-555555555555'};
 const results=await Promise.all([request(base,'/api/search',ah,'POST',body),request(base,'/api/search',bh,'POST',body)]);assert.ok(results.every(r=>r.status===202));const [aj,bj]=await Promise.all(results.map(r=>r.json()));
 for(let i=0;i<100;i++){const states=await Promise.all([request(base,'/api/search/jobs/'+aj.job.id,ah).then(r=>r.json()),request(base,'/api/search/jobs/'+bj.job.id,bh).then(r=>r.json())]);if(states.every(s=>s.job.status==='complete'))break;await new Promise(r=>setTimeout(r,10));}
 assert.equal((await request(base,'/api/search/jobs/'+aj.job.id,bh)).status,404);
 runInTenant('spicecoast',()=>{assert.equal(loadLeadsHistory().leads[0].name,'Buyer legacy-google');assert.equal(loadDailyUsage().count,1);});runInTenant(t.id,()=>{assert.equal(loadLeadsHistory().leads[0].name,'Buyer google-b');assert.equal(loadDailyUsage().count,1);});
});
