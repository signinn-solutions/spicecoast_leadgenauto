import fs from 'node:fs';
import path from 'node:path';
import {getPlatformDatabase,getDatabase,closeStorage} from '../services/storageService.js';
import {accessDatabase} from '../services/accessService.js';
import {listTenants,runInTenant} from '../services/tenantService.js';
const destination=process.argv[2];
try {
 if(!destination)throw new Error('Usage: npm run backup:tenants -- /path/to/new-backup-directory');
 const target=path.resolve(destination);
 if(fs.existsSync(target))throw new Error('Destination already exists. Choose a new backup directory.');
 fs.mkdirSync(target,{recursive:true});accessDatabase();
 const tenants=listTenants();
 // Quiesce the app first: several SQLite files cannot be backed up as one atomic snapshot.
 await getPlatformDatabase().backup(path.join(target,'platform.sqlite'));
 for(const tenant of tenants.filter(t=>t.id!=='spicecoast'))await runInTenant(tenant.id,async()=>{fs.mkdirSync(path.join(target,'tenants'),{recursive:true});await getDatabase().backup(path.join(target,'tenants',tenant.id+'.sqlite'));},{allowSuspended:true});
 fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),platform:'platform.sqlite',tenants:tenants.map(t=>({id:t.id,slug:t.slug,file:t.id==='spicecoast'?'platform.sqlite':'tenants/'+t.id+'.sqlite'}))},null,2));
 console.log('Platform and tenant SQLite backups completed. Back up the encryption secret separately.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{closeStorage();}
