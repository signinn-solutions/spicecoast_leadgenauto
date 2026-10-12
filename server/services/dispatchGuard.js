import { randomUUID } from 'node:crypto';

// Persist before calling the provider. A restart must not silently resend an
// email whose delivery outcome is unknown. Existing workflow locks own concurrency.
export async function dispatchOnce({ record, persist, send }) {
  if (['sending', 'unknown', 'sent'].includes(record.dispatch?.state)) {
    throw new Error('This message was sent or its delivery is unconfirmed. Check Hostinger Sent before retrying to avoid a duplicate.');
  }
  record.dispatch = { id: randomUUID(), state: 'sending', startedAt: new Date().toISOString() };
  persist();
  let result;
  try {
    result = await send();
    if (result?.status !== 'sent') throw Object.assign(new Error('Email transport did not send the message.'), { deliveryRejected: true });
  } catch (error) {
    record.dispatch.state = error.deliveryRejected ? 'rejected' : 'unknown';
    persist();
    throw error;
  }
  record.dispatch = { ...record.dispatch, state: 'sent', acceptedAt: new Date().toISOString(), messageId: result.messageId || result.data?.messageId || null };
  persist();
  return result;
}
