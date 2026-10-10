import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
test('logout ignores a late session check and clears client authentication', async()=>{
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../../frontend/src/components/AuthGate.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react'],plugins:[{name:'children',setup(b){b.onResolve({filter:/App\.jsx$|PlatformConsole\.jsx$/},()=>({path:'child',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export default function Child(){}'}));}}]});
 const slots=[];let index=0;const effects=[];const listeners={};let pendingCheck;let fetches=0;
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useRef:value=>{const i=index++;return slots[i]??=( {current:value})},useCallback:fn=>fn,useEffect:fn=>{if(!effects.length)effects.push(fn)}};
 const module={exports:{}};const window={location:{hash:'',pathname:'/'},addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener(){},alert:message=>assert.fail(message),fetch:async(url,options)=>{if(url.includes('/logout')){assert.ok(options.signal);return{ok:true,status:200}};fetches++;if(fetches===2)return await new Promise(resolve=>pendingCheck=resolve);return{ok:true,json:async()=>({enabled:true,authenticated:true,csrfToken:'csrf',user:{role:'super_admin'}})}}};
 vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require:()=>React,window,URLSearchParams,Headers,AbortSignal,Event,console});
 const render=()=>{index=0;return module.exports.default()};render();effects[0]();await new Promise(r=>setImmediate(r));
 const late= listeners['subscription-blocked']();const app=render();assert.equal(typeof app.props.onLogout,'function');await app.props.onLogout();pendingCheck({ok:true,json:async()=>({enabled:true,authenticated:true,csrfToken:'stale',user:{role:'super_admin'}})});await late;
 assert.equal(render().type,'main');assert.ok(JSON.stringify(render()).includes('Sign in'));
});
