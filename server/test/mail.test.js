import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import config from '../config/env.js';
import { sendEmailViaSmtp, sendEmailViaHostinger } from '../services/mailService.js';

test('SMTP sends one recipient with TLS safeguards and confirms acceptance without a socket', async (t) => {
  const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE', 'SENDER_MAILBOX'];
  const original = Object.fromEntries(keys.map((key) => [key, config[key]]));
  let transportOptions;
  let mailOptions;
  let sendResult = { accepted: ['buyer@example.test'], rejected: [], messageId: 'test-message-1' };
  t.mock.method(nodemailer, 'createTransport', (options) => {
    transportOptions = options;
    return { sendMail: async (mail) => { mailOptions = mail; if (sendResult instanceof Error) throw sendResult; return sendResult; } };
  });
  try {
    Object.assign(config, {
      SMTP_HOST: 'smtp.example.test', SMTP_PORT: 587, SMTP_USER: 'test-user',
      SMTP_PASS: 'test-password', SMTP_SECURE: false, SENDER_MAILBOX: 'sender@example.test',
    });
    const delivered = await sendEmailViaSmtp('buyer@example.test', 'Spice inquiry', 'Reply body', { reply: true });
    assert.deepEqual(delivered, { status: 'sent', messageId: 'test-message-1' });
    assert.equal(mailOptions.to, 'buyer@example.test');
    assert.equal(mailOptions.from, 'sender@example.test');
    assert.equal(mailOptions.subject, 'Re: Spice inquiry');
    assert.equal(mailOptions.text, 'Reply body');
    assert.equal(transportOptions.requireTLS, true);
    assert.equal(transportOptions.disableFileAccess, true);
    assert.equal(transportOptions.disableUrlAccess, true);
    assert.equal(transportOptions.maxRecipients, 1);
    assert.equal(transportOptions.dnsTimeout, 10000);

    await sendEmailViaSmtp('buyer@example.test', 'New partnership', 'Cold body');
    assert.equal(mailOptions.subject, 'New partnership');
    sendResult = { accepted: [], rejected: ['buyer@example.test'], response: 'private provider diagnostic' };
    await assert.rejects(sendEmailViaSmtp('buyer@example.test', 'Subject', 'Body'),
      { message: 'SMTP server did not accept recipient.' });
    sendResult = new Error('private SMTP credentials and server response');
    await assert.rejects(sendEmailViaSmtp('buyer@example.test', 'Subject', 'Body'),
      { message: 'SMTP delivery failed.' });
  } finally {
    Object.assign(config, original);
  }
});

test('Hostinger errors never leak provider response text', async () => {
  const originalToken = config.HOSTINGER_API_TOKEN;
  const originalFetch = globalThis.fetch;
  try {
    config.HOSTINGER_API_TOKEN = 'test-token';
    globalThis.fetch = async () => ({ ok: false, status: 403, text: async () => 'private token echoed here' });
    await assert.rejects(sendEmailViaHostinger('buyer@example.test', 'Subject', 'Body'),
      { message: 'Email provider rejected message (HTTP 403).' });
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ status: 'failed', error: 'private response' }) });
    await assert.rejects(sendEmailViaHostinger('buyer@example.test', 'Subject', 'Body'),
      { message: 'Email provider rejected message.' });
    globalThis.fetch = async () => { throw new Error('private URL and token'); };
    await assert.rejects(sendEmailViaHostinger('buyer@example.test', 'Subject', 'Body'),
      { message: 'Email provider request failed.' });
  } finally {
    config.HOSTINGER_API_TOKEN = originalToken;
    globalThis.fetch = originalFetch;
  }
});
