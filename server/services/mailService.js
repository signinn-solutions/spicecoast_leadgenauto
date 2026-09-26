import nodemailer from 'nodemailer';
import config from '../config/env.js';

let smtpTransporter = null;

export function getSmtpTransporter() {
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS) {
    return null;
  }
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      requireTLS: !config.SMTP_SECURE,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
      dnsTimeout: 10000,
      maxRecipients: 1,
      disableFileAccess: true,
      disableUrlAccess: true,
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
    });
  }
  return smtpTransporter;
}

export async function sendEmailViaHostinger(toAddress, subject, body, { reply = false } = {}) {
  if (!config.HOSTINGER_API_TOKEN) {
    console.log('[Hostinger API] No HOSTINGER_API_TOKEN configured. Logged as simulated dispatch.');
    return {
      status: 'simulated',
      message: 'No Hostinger API token configured. Draft recorded.',
    };
  }

  const cleanSubject = reply && !subject.toLowerCase().startsWith('re:') ? `Re: ${subject}` : subject;
  const headers = {
    Authorization: `Bearer ${config.HOSTINGER_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
  const payload = {
    to: [toAddress],
    from: config.SENDER_MAILBOX,
    subject: cleanSubject,
    text: body,
  };

  let response;
  try {
    response = await fetch(config.HOSTINGER_SEND_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

  } catch {
    throw new Error('Email provider request failed.');
  }

  if (!response.ok) {
    throw new Error(`Email provider rejected message (HTTP ${response.status}).`);
  }

  // A successful HTTP status is the transport acknowledgement; APIs may
  // return an empty body. Do not expose a provider's raw error response.
  const data = await response.json().catch(() => ({}));
  if (['failed', 'failure', 'error', 'rejected'].includes(String(data?.status).toLowerCase()) || data?.error) {
    throw new Error('Email provider rejected message.');
  }
  return { ...data, status: 'sent' };
}

export async function sendEmailViaSmtp(toAddress, subject, body, { reply = false } = {}) {
  const transporter = getSmtpTransporter();
  if (!transporter) {
    throw new Error('SMTP transporter is not configured.');
  }

  const cleanSubject = reply && !subject.toLowerCase().startsWith('re:') ? `Re: ${subject}` : subject;
  const mailOptions = {
    from: config.SENDER_MAILBOX,
    to: toAddress,
    subject: cleanSubject,
    text: body,
  };

  let result;
  try {
    result = await transporter.sendMail(mailOptions);
  } catch {
    throw new Error('SMTP delivery failed.');
  }
  const accepted = Array.isArray(result?.accepted) ? result.accepted : [];
  const rejected = Array.isArray(result?.rejected) ? result.rejected : [];
  const recipient = toAddress.trim().toLowerCase();
  if (!accepted.some((address) => typeof address === 'string' && address.toLowerCase() === recipient) ||
      rejected.some((address) => typeof address === 'string' && address.toLowerCase() === recipient)) {
    throw new Error('SMTP server did not accept recipient.');
  }
  return { status: 'sent', messageId: result.messageId };
}

export async function sendEmail(toAddress, subject, body, options = {}) {
  // If Hostinger API Token is present, prefer Hostinger Agentic Mail API
  if (config.HOSTINGER_API_TOKEN) {
    return await sendEmailViaHostinger(toAddress, subject, body, options);
  }
  // If SMTP is configured, send via SMTP transporter
  if (config.SMTP_HOST && config.SMTP_USER) {
    return await sendEmailViaSmtp(toAddress, subject, body, options);
  }
  // Otherwise simulate
  return await sendEmailViaHostinger(toAddress, subject, body, options);
}
