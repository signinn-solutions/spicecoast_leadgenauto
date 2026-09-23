import OpenAI from 'openai';
import config from '../config/env.js';

let deepseekClient = null;

export function getDeepseekClient() {
  if (!config.DEEPSEEK_API_KEY) return null;
  if (!deepseekClient) {
    try {
      deepseekClient = new OpenAI({
        apiKey: config.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com',
      });
    } catch (e) {
      console.warn(`[DeepSeek Warning] Failed to initialize client: ${e.message}`);
      return null;
    }
  }
  return deepseekClient;
}

/**
 * Generates a highly customized B2B cold email draft for a discovered deliverable lead.
 * Does NOT send the email — saves it as a draft for human confirmation.
 */
export async function generateColdEmail(lead = {}) {
  const companyName = lead.name || 'Valued Partner';
  const city = lead.city || (lead.address ? lead.address.split(',')[1]?.trim() : '') || 'your region';
  const country = lead.country || (lead.address ? lead.address.split(',').pop()?.trim() : '') || '';
  const businessType = lead.businessType || 'Spice Import & Distribution';

  const client = getDeepseekClient();

  if (client && config.DEEPSEEK_API_KEY) {
    try {
      const prompt = `You are the International Export Sales Director for The Spice Coast (SpiceCoast), a premier origin exporter of premium spices based in Kerala, India.

Write a high-converting, concise, professional B2B cold outreach email to an importer/distributor.

Lead Details:
- Target Company: ${companyName}
- Location: ${city}, ${country}
- Sector/Focus: ${businessType}

Requirements:
1. Subject Line: Catchy, professional, and personalized (under 9 words, e.g. "Direct Origin Spices Partnership: Kerala -> [City/Company]").
2. Tone: Professional, respectful, B2B wholesale focus.
3. Message length: Under 130 words.
4. Key Value Props: Direct farm-to-export origin sourcing, certified quality specs (Malabar Black Pepper 550/570 GL, Alleppey Green Cardamom 7-8mm, High-Curcumin Turmeric), and container/bulk FOB & CIF shipping capabilities.
5. Call to Action: Low-friction ask (e.g. asking if we can share our new harvest catalog & export price list).
6. Sign off cordially as:
   The SpiceCoast Export Team
   The Spice Coast | Cochin, Kerala, India
   ${config.SENDER_MAILBOX}

Output Format: Provide strictly valid JSON with keys "subject" and "body". Do not include markdown code block formatting if possible.
`;

      const response = await client.chat.completions.create({
        model: config.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a professional B2B spice export specialist. Return valid JSON only with "subject" and "body" keys.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 400,
        temperature: 0.7,
      });

      const raw = response.choices?.[0]?.message?.content?.trim() || '';
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.subject && parsed.body) {
            return {
              subject: parsed.subject.trim(),
              body: parsed.body.trim(),
            };
          }
        }
      } catch (err) {
        console.warn('[DeepSeek ColdMail JSON Parse Issue]:', err.message);
      }
    } catch (e) {
      console.warn(`[DeepSeek ColdMail API Error]: ${e.message}. Using fallback template.`);
    }
  }

  // Graceful fallback personalized cold email template
  const locationStr = city && country ? `${city}, ${country}` : city || 'your market';
  return {
    subject: `Export-Grade Direct Origin Spices for ${companyName}`,
    body: `Dear Team at ${companyName},

I hope this email finds you well.

I am reaching out from The Spice Coast (SpiceCoast), based in Kerala, India. We are direct-from-origin processors and exporters of premium Indian spices, supplying established importers and distributors across ${locationStr}.

Our core export portfolio includes:
• Malabar Black Pepper (Garbled / High Density 550GL - 570GL)
• Alleppey Green Cardamom (Extra Bold 8mm & Bold 7.5mm)
• High-Curcumin Alleppey Turmeric Fingers & Powder
• Tellicherry Cloves and Ceylon Cinnamon

We maintain strict ISO/HACCP certifications, laboratory-tested pesticide compliance, and competitive FOB & CIF container pricing.

Could we share our latest seasonal harvest specification sheet and export catalog for your review?

Warm regards,
The SpiceCoast Export Desk
The Spice Coast | Cochin, Kerala, India
${config.SENDER_MAILBOX}`,
  };
}

/**
 * Analyzes incoming email, extracts rich metadata (intent, products, buyer data, volume, destination port, priority),
 * and drafts an intelligent contextual response.
 */
export async function extractMetadataAndDraftReply(
  subject = '',
  body = '',
  senderEmail = '',
  senderName = '',
  receiverEmail = '',
  receiverName = ''
) {
  const client = getDeepseekClient();
  const receiverEffective = receiverEmail || config.SENDER_MAILBOX;

  if (client && config.DEEPSEEK_API_KEY) {
    try {
      const prompt = `You are the Senior B2B Export Director for The Spice Coast (SpiceCoast), a premier Indian spice exporting and trading company based in Kerala, India.

A prospective lead or customer just emailed our mailbox:
- Inbound Sender: ${senderName || senderEmail} <${senderEmail}>
- Target Mailbox / Receiver: ${receiverName || 'The Spice Coast'} <${receiverEffective}>
- Subject: ${subject}
- Message Content:
${body}

Tasks:
1. EXTRACT STRUCTURED METADATA:
   - "buyerName": Buyer's personal/contact name extracted from message/signature (e.g. "Markus Weber", "Dr. Klaus Richter", or fallback to senderName).
   - "buyerCompany": Importer/buyer company name if mentioned (e.g. "Nordic Spices AB", "Hamburg Imports", or domain-based name).
   - "intent": Main purpose ("Price Quote Inquiry", "Catalog & Specifications Request", "Sample Order Request", "Container Shipment & Logistics", or "General Spice Inquiry")
   - "detectedProducts": Array of specific spice products requested (e.g. ["Malabar Black Pepper (550GL)", "Alleppey Green Cardamom (8mm)", "Curcumin Turmeric", "Cinnamon", "Cloves"])
   - "requestedVolume": Estimated volume or container quantity if mentioned (e.g. "2 FCL containers", "5 MT", "Sample package", or "Not specified")
   - "destinationPort": Mentioned port or delivery location (e.g. "Hamburg", "Rotterdam", "Jebel Ali, Dubai", "Gothenburg", or "Not specified")
   - "priority": "High" (if requesting quotation, MOQ, containers, urgent shipment), "Medium", or "Low"
   - "sentiment": "Positive", "Urgent", or "Neutral"
   - "summary": 1 crisp sentence summarizing the core commercial request.

2. DRAFT CONTEXTUAL B2B REPLY:
   - Write a warm, professional, concise reply (under 120 words).
   - Directly acknowledge their specific products (${subject}) and location/volume.
   - Mention our ISO/HACCP certified export quality and direct-from-origin Malabar / Kerala processing.
   - State our export desk is preparing the exact specification sheet and FOB/CIF quote.
   - Sign off as:
     The SpiceCoast Export Desk
     The Spice Coast | Cochin, Kerala, India
     ${config.SENDER_MAILBOX}
   - Do NOT invent specific numerical price values.

Output strictly JSON:
{
  "buyerName": "...",
  "buyerCompany": "...",
  "intent": "...",
  "detectedProducts": ["..."],
  "requestedVolume": "...",
  "destinationPort": "...",
  "priority": "High|Medium|Low",
  "sentiment": "Positive|Urgent|Neutral",
  "summary": "...",
  "reply": "..."
}
`;

      const response = await client.chat.completions.create({
        model: config.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are an AI export assistant. Return valid JSON only with extracted metadata and drafted reply.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 600,
        temperature: 0.6,
      });

      const raw = response.choices?.[0]?.message?.content?.trim() || '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.reply) {
          return {
            reply: parsed.reply.trim(),
            metadata: {
              buyerName: parsed.buyerName || senderName || senderEmail.split('@')[0],
              buyerCompany: parsed.buyerCompany || (senderEmail.includes('@') ? senderEmail.split('@')[1] : ''),
              receiverEmail: receiverEffective,
              receiverName: receiverName || 'The Spice Coast (Sales)',
              intent: parsed.intent || 'Price Quote Inquiry',
              detectedProducts: Array.isArray(parsed.detectedProducts) ? parsed.detectedProducts : [],
              requestedVolume: parsed.requestedVolume || 'Not specified',
              destinationPort: parsed.destinationPort || 'Not specified',
              priority: parsed.priority || 'Medium',
              sentiment: parsed.sentiment || 'Positive',
              summary: parsed.summary || 'Inquiry regarding spice export specifications and availability.',
            },
          };
        }
      }
    } catch (e) {
      console.warn(`[DeepSeek Metadata Extraction Error]: ${e.message}`);
    }
  }

  // Fallback rule-based metadata extraction + template
  const textLower = `${subject} ${body}`.toLowerCase();
  const detectedProducts = [];
  if (textLower.includes('pepper')) detectedProducts.push('Malabar Black Pepper');
  if (textLower.includes('cardamom')) detectedProducts.push('Alleppey Green Cardamom');
  if (textLower.includes('turmeric')) detectedProducts.push('Alleppey Turmeric');
  if (textLower.includes('clove')) detectedProducts.push('Tellicherry Cloves');
  if (textLower.includes('cinnamon')) detectedProducts.push('Ceylon Cinnamon');
  if (textLower.includes('ginger')) detectedProducts.push('Cochin Ginger');

  // Detect volume
  let requestedVolume = 'Not specified';
  if (textLower.includes('fcl') || textLower.includes('container')) {
    const match = textLower.match(/(\d+)\s*(fcl|container|containers)/);
    requestedVolume = match ? `${match[1]} FCL Container(s)` : 'Container Bulk Volume';
  } else if (textLower.includes('mt') || textLower.includes('metric ton') || textLower.includes('ton')) {
    const match = textLower.match(/(\d+)\s*(mt|metric ton|tons|ton)/);
    requestedVolume = match ? `${match[1]} Metric Tons` : 'Metric Ton Volume';
  } else if (textLower.includes('sample')) {
    requestedVolume = 'Product Samples';
  }

  // Detect port / country
  let destinationPort = 'Not specified';
  const ports = ['hamburg', 'rotterdam', 'jebel ali', 'dubai', 'gothenburg', 'felixstowe', 'singapore', 'new york', 'antwerp'];
  for (const p of ports) {
    if (textLower.includes(p)) {
      destinationPort = p.charAt(0).toUpperCase() + p.slice(1);
      break;
    }
  }

  const intent =
    textLower.includes('price') || textLower.includes('quote') || textLower.includes('fob') || textLower.includes('cif')
      ? 'Price Quote Inquiry'
      : textLower.includes('sample')
      ? 'Sample Request'
      : textLower.includes('catalog') || textLower.includes('spec')
      ? 'Catalog & Specifications'
      : 'General Spice Inquiry';

  const priority =
    textLower.includes('container') || textLower.includes('fcl') || textLower.includes('urgent') || textLower.includes('quote')
      ? 'High'
      : 'Medium';

  const buyerName = senderName || senderEmail.split('@')[0];
  const buyerCompany = senderEmail.includes('@') ? senderEmail.split('@')[1] : '';

  const greeting = buyerName ? `Dear ${buyerName},` : 'Hello,';
  const reply = `${greeting}

Thank you for contacting The Spice Coast! We appreciate your interest in our premium export-grade spices.

We specialize in direct-origin Malabar Black Pepper, Alleppey Green Cardamom, High-Curcumin Turmeric, and Cinnamon. Our export desk is currently preparing our updated product catalog and seasonal export pricing for you.

To provide an accurate quote, could you please confirm your estimated order volume and preferred delivery terms (FOB / CIF destination port)?

Warm regards,
The SpiceCoast Export Desk
The Spice Coast | Cochin, Kerala, India
${config.SENDER_MAILBOX}`;

  return {
    reply,
    metadata: {
      buyerName,
      buyerCompany,
      receiverEmail: receiverEffective,
      receiverName: receiverName || 'The Spice Coast (Sales)',
      intent,
      detectedProducts,
      requestedVolume,
      destinationPort,
      priority,
      sentiment: textLower.includes('urgent') ? 'Urgent' : 'Positive',
      summary: `Inquiry for ${detectedProducts.join(', ') || 'spices'}${requestedVolume !== 'Not specified' ? ` (${requestedVolume})` : ''}${destinationPort !== 'Not specified' ? ` to ${destinationPort}` : ''}.`,
    },
  };
}

export async function draftReply(subject, body, senderName = '') {
  const result = await extractMetadataAndDraftReply(subject, body, '', senderName);
  return result.reply;
}
