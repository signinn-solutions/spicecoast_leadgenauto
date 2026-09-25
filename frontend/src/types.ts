export type EmailStatus = 'deliverable' | 'valid' | 'risky' | 'accept_all' | 'not_found' | 'invalid' | 'unknown';
export type PhoneStatus = 'valid' | 'invalid' | 'unknown';
export type LeadSource = 'live' | 'simulated' | 'unknown';
export type OutreachStatus = 'pending_review' | 'sent';

export interface ColdMailDraft {
  subject: string;
  body: string;
  status?: OutreachStatus;
  sentAt?: string;
  source?: LeadSource;
}

export interface Lead {
  id: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  businessType?: string;
  phone?: string;
  phoneStatus?: PhoneStatus;
  email?: string;
  emailStatus?: EmailStatus;
  website?: string;
  domain?: string;
  foundAt?: string;
  source?: LeadSource;
  coldMailDraft?: ColdMailDraft;
}

export interface OutreachRecord {
  id: string;
  leadId?: string;
  source?: LeadSource;
  leadName?: string;
  company?: string;
  recipient: string;
  location?: string;
  subject: string;
  body: string;
  status: OutreachStatus;
  createdAt?: string;
  sentAt?: string;
}

export interface ProcurementMetadata {
  buyerName?: string;
  buyerCompany?: string;
  intent?: string;
  requestedVolume?: string;
  destinationPort?: string;
  priority?: 'High' | 'Medium' | 'Normal' | 'Low';
  detectedProducts?: string[];
  receiverEmail?: string;
  receiverName?: string;
}

export interface MailboxMessage {
  id: string;
  sender: string;
  senderName?: string;
  receiver?: string;
  receiverName?: string;
  subject: string;
  body: string;
  receivedAt?: string;
  draftReply?: string;
  status?: 'drafted' | 'sent';
  sentAt?: string;
  model?: string;
  metadata?: ProcurementMetadata;
}

export interface MailboxStatus {
  mailbox: string;
  auto_send: boolean;
  daily_limit: number;
  used_today: number;
  remaining_today: number;
  has_deepseek_key: boolean;
  has_hostinger_token: boolean;
  has_webhook_token: boolean;
  deepseek_model: string;
  send_endpoint?: string;
  outreachStats?: {
    total: number;
    pendingDrafts: number;
    sentOutreach: number;
  };
}

export interface ServerStatus {
  date?: string;
  count?: number;
  limit?: number;
  remaining?: number;
  has_google_key?: boolean;
  has_hunter_key?: boolean;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  count: number;
  date: string;
}

export interface Notice {
  type: 'success' | 'warning' | 'error' | 'info';
  title?: string;
  text: string;
}

export type ViewTab = 'dashboard' | 'search' | 'results' | 'outreach' | 'mailbox' | 'analytics' | 'health';
