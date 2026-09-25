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

  try {
    const response = await fetch(config.HOSTINGER_SEND_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Hostinger API responded with ${response.status}: ${errText}`);
    }

    const data = await response.json().catch(() => ({ status: 'success' }));
    return data;
  } catch (e) {
    console.error(`[Hostinger API Error]: ${e.message}`);
    throw e;
  }
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

  return await transporter.sendMail(mailOptions);
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
