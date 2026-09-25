import { AsyncLocalStorage } from 'node:async_hooks';

const workspaceContext = new AsyncLocalStorage();

export function withWorkspace(workspaceId, operation) {
  if (typeof workspaceId !== 'string' || !workspaceId.trim() || typeof operation !== 'function') {
    throw new TypeError('A workspace ID and operation are required.');
  }
  return workspaceContext.run({ workspaceId }, operation);
}

export function getWorkspaceId() {
  return workspaceContext.getStore()?.workspaceId || 'legacy';
}
