import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';
test('React component render smoke checks cover 60-result controls, paginated rows and disabled sends', async () => {
  const result = await build({
    stdin: {
      contents: `
    import React from 'react';
    import {renderToStaticMarkup as render} from 'react-dom/server';
    import LeadDetailDrawer from './frontend/src/components/LeadDetailDrawer.jsx';
    import SystemHealthView from './frontend/src/components/SystemHealthView.jsx';
    import LeadsView from './frontend/src/components/LeadsView.jsx';
    import DiscoveryView from './frontend/src/components/DiscoveryView.jsx';
    import InboxView from './frontend/src/components/InboxView.jsx';
    import AdminView from './frontend/src/components/AdminView.jsx';
    import PlatformConsole from './frontend/src/components/PlatformConsole.jsx';
    import Sidebar from './frontend/src/components/Sidebar.jsx';
    import PlanManager from './frontend/src/components/PlanManager.jsx';
    import SubscriptionPanel from './frontend/src/components/SubscriptionPanel.jsx';
    import ColdMailModal from './frontend/src/components/ColdMailModal.jsx';
    const leads=Array.from({length:60},(_,i)=>({id:'lead-'+i,name:'Business '+i,source:'live',email:'buyer'+i+'@example.test',emailStatus:'deliverable',phone:'123456',phoneStatus:'listed',foundAt:'2026-10-10'}));
    const publicLead={id:'public',name:'Public contact',source:'live',email:'sales@spices.test',emailStatus:'unknown',emailDiscovery:{source:'website',sourceUrl:'https://spices.test/contact'},emailCandidates:[{value:'sales@spices.test'}]};
    export const published=render(<LeadsView allLeads={[publicLead]} canDraft={true}/>);
    export const evidence=render(<LeadDetailDrawer lead={publicLead} canDraft={true}/>);
    export const health=render(<SystemHealthView serverStatus={{has_hunter_key:true,hunter_enabled:false}} jobs={[{id:"failed",status:"failed",progress:{query:"Spice distributor in Hamburg"},error:"Google connection timed out"},{id:"done",status:"complete",result:{count:15,leads:[]}}]}/>);
    export const customer=render(<Sidebar tenantName="SpiceCoast" activeView="dashboard" canDiscover={false} leadUsage={{count:0,limit:0}} replyUsage={{count:0,limit:0}}/>);
    export const plans=render(<PlanManager plans={[{id:'standard',name:'Standard',leadLimit:60,replyLimit:30,sendLimit:50,seatLimit:10}]}/>);
    export const subscription=render(<SubscriptionPanel tenant={{id:'spicecoast',subscription:{allowed:true,phase:'active',status:'active',openEnded:true,plan:{id:'standard',name:'Standard'}}}} plans={[]}/>);
    export const platform=render(<PlatformConsole user={{id:'admin',email:'admin@signinn.in',role:'super_admin'}}/>);
    export const authenticatedPlatform=render(<PlatformConsole user={{id:"admin",email:"admin@signinn.in",role:"super_admin"}} onLogout={()=>{}}/>);
    export const crm=render(<LeadsView allLeads={leads} canDraft={false}/>);
    export const uncapped=render(<DiscoveryView businessType="spice importer" city="Hamburg" country="Germany" count={60} leadLimit={-1} remainingLeads={Infinity}/>);
    export const unlimitedPlans=render(<PlanManager plans={[{id:'uncapped',name:'Uncapped',leadLimit:-1,replyLimit:30,sendLimit:50,seatLimit:10}]}/>);
    export const discovery=render(<DiscoveryView businessType="spice importer" city="Hamburg" country="Germany" count={60} leadLimit={60} remainingLeads={60}/>);
    export const inbox=render(<InboxView messages={[{id:'m1',sender:'buyer@example.test',subject:'Quote',status:'drafted',source:'webhook',draftReply:'Reply'}]} canSend={false} canDraft={true}/>);
    export const integrations=render(<AdminView currentUser={{id:'admin',email:'admin@signinn.in',role:'super_admin'}} activeTab="integrations" showHeader={false} showNavigation={false}/>);
    export const admin=render(<AdminView currentUser={{id:'admin',email:'admin@signinn.in',role:'super_admin'}}/>);
    export const modal=render(<ColdMailModal modalData={{leadId:'l1',company:'Buyer',source:'live',recipient:'buyer@example.test',subject:'Quote',body:'Draft',status:'pending_review'}} canSend={false} canDraft={true}/>);
  `,
      resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
      loader: 'jsx'
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react', 'react-dom/server']
  });
  const module = {
    exports: {}
  };
  vm.runInNewContext(result.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: createRequire(import.meta.url),
    console,
    window: {location:{origin:'http://localhost:5100'},matchMedia:()=>({matches:false})},
    URL
  });
  const {
    published, evidence, health, uncapped, unlimitedPlans,
    platform, authenticatedPlatform,
    customer,
    plans,
    subscription,
    crm,
    discovery,
    inbox,
    admin,
    integrations,
    modal
  } = module.exports;
  assert.doesNotMatch(uncapped,/Infinity|NaN/);
  assert.match(unlimitedPlans,/>Unlimited</);
  assert.match(published,/Published emails|Unverified/);
  assert.doesNotMatch(published,/Verify email/);
  assert.match(evidence,/View source page/);
  assert.match(evidence,/Publication does not confirm mailbox delivery/);
  assert.match(health,/Website discovery still works without Hunter/);
  assert.doesNotMatch(health,/falls back to simulation/);
  assert.match(health,/Recent discovery jobs/);
  assert.match(health,/Spice distributor in Hamburg/);
  assert.match(health,/Google connection timed out/);
  assert.match(health,/15 saved/);
  assert.match(health,/View batch/);
  assert.doesNotMatch(discovery,/Recent discovery jobs/);
  assert.doesNotMatch(customer,/Administration|Tenant access|Prospector|NaN|Infinity/);
  assert.match(plans,/Save plan/);
  assert.match(subscription,/No expiry is configured/);
  assert.match(subscription,/Loading subscription history/);
  assert.doesNotMatch(subscription,/No subscription changes recorded/);
  assert.doesNotMatch(admin,/<option value="(?:tenant_admin|manager|operator)"/);
  assert.match(integrations,/Loading company settings/);
  assert.doesNotMatch(integrations,/Create a user|Company administration sections/);
  assert.match(platform,/Skip to main content/);
  assert.match(platform,/Loading platform/);
  assert.doesNotMatch(platform,/Operational attention|Uncertain sends/);
  assert.match(platform,/Signinn Leadgen/);
  assert.match(platform,/Platform administration/);
  assert.match(platform,/Platform administrators/);
  assert.doesNotMatch(platform,/Sign out/);
  assert.match(platform,/Local development access/);
  assert.match(authenticatedPlatform,/Sign out/);
  assert.doesNotMatch(platform,/Prospector|Leads CRM|Outreach Studio|Inbound Mailbox/);
  assert.doesNotMatch(admin,/<option value="super_admin"/);
  assert.match(admin,/<option value="company_admin"/);
  const tbody = crm.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  assert.equal((tbody.match(/<tr/g) || []).length, 20);
  assert.match(crm, /Page 1 \/ 3/);
  assert.match(crm, /Select All on Page \(20\)/);
  assert.match(discovery, /Max 60 per batch/);
  assert.match(discovery, /max="60"/);
  assert.match(inbox, /<button[^>]*disabled=""[^>]*>Approve &amp; send reply/);
  assert.match(admin, /Create account/);
  assert.match(admin, /admin@signinn.in/);
  assert.match(modal, /<button[^>]*disabled=""[^>]*>[\s\S]*?Dispatch Email/);
});
