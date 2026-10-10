import {runInTenant} from '../services/tenantService.js';
export function requireTenantWorkspace(req,res,next) {
 const user=req.dashboardSession?.user;
 if(user?.role==='super_admin' && !['local-development','legacy-admin'].includes(user.id)) return res.status(403).json({error:'Platform administrators use the Signinn control panel, not a tenant workspace.'});
 try {return runInTenant(user?.tenantId || 'spicecoast',()=>next());}catch(e){next(e);}
}
export function tenantWebhook(req,res,next) {
 try{return runInTenant(req.params.tenantId || 'spicecoast',()=>next());}catch(e){next(e);}
}
