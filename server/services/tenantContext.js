import {AsyncLocalStorage} from 'node:async_hooks';
const contexts = new AsyncLocalStorage();
export const tenantContext = () => contexts.getStore();
export const withTenantContext = (context, operation) => contexts.run(context, operation);
