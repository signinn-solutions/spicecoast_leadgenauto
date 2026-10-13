export function outreachBlockReason(lead) {
 if (!lead || lead.source !== 'live') return 'Only live leads can enter email outreach.';
 if (typeof lead.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email.trim())) return 'No usable email address. Phone-only leads cannot enter email outreach.';
 if (!['deliverable','valid','mx_valid'].includes(lead.emailStatus)) return 'Verify this email before outreach.';
 return '';
}
