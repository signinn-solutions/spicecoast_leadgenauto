import { LIFECYCLE_CONFIG } from '../config/mailLifecycleConfig.js';
import { classifyReplySentiment } from './deepseekService.js';

/**
 * Checks if text contains any buying-intent keywords.
 */
export function hasBuyingIntentKeywords(text = '') {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return LIFECYCLE_CONFIG.BUYING_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Checks if a reply occurred within 24 hours of the initial outreach.
 */
export function isFastReply(outreachSentAt, replyReceivedAt) {
  if (!outreachSentAt || !replyReceivedAt) return false;
  const sentTime = new Date(outreachSentAt).getTime();
  const replyTime = new Date(replyReceivedAt).getTime();
  if (Number.isNaN(sentTime) || Number.isNaN(replyTime)) return false;

  const diffMs = replyTime - sentTime;
  // Reply must be after or simultaneous with sent, and within 24 hours (86,400,000 ms)
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  return diffMs >= 0 && diffMs <= twentyFourHoursMs;
}

/**
 * Computes the 10-point engagement score for a lead based on:
 * 1. Replied at all: +2
 * 2. Replied within 24 hours: +2
 * 3. Buying-intent keywords present: +2
 * 4. More than one back-and-forth exchange: +2
 * 5. Positive sentiment classified by DeepSeek: +2
 *
 * Threshold: Score >= 6 is classified as "hot".
 */
export async function computeLeadEngagementScore(lead = {}, inboundMessages = [], outboundMessages = []) {
  // Aggregate thread details
  const initialSentAt =
    lead.first_contacted_at ||
    lead.sentAt ||
    (outboundMessages[0]?.sentAt) ||
    lead.createdAt;

  const hasInbound = inboundMessages.length > 0;
  const firstInbound = inboundMessages[0] || null;

  // Signal 1: Replied at all (+2)
  const repliedEarned = hasInbound;

  // Signal 2: Replied within 24 hours (+2)
  let fastReplyEarned = false;
  if (hasInbound && initialSentAt && firstInbound?.receivedAt) {
    fastReplyEarned = isFastReply(initialSentAt, firstInbound.receivedAt);
  }

  // Signal 3: Buying intent keywords (+2)
  let buyingIntentEarned = false;
  if (hasInbound) {
    const combinedInboundText = inboundMessages
      .map((m) => `${m.subject || ''} ${m.body || ''}`)
      .join(' ');
    buyingIntentEarned = hasBuyingIntentKeywords(combinedInboundText);
  }

  // Signal 4: More than one back-and-forth exchange in the thread (+2)
  // For example: initial outreach + inbound reply + our reply/follow-up + second reply,
  // or total inbound messages >= 2, or total messages across thread >= 3.
  const totalThreadExchanges = outboundMessages.length + inboundMessages.length;
  const multiExchangeEarned =
    inboundMessages.length >= 2 || (outboundMessages.length >= 2 && inboundMessages.length >= 1) || totalThreadExchanges >= 3;

  // Signal 5: DeepSeek sentiment classification is positive (+2)
  let positiveSentimentEarned = false;
  if (hasInbound) {
    // Check if sentiment was already recorded in metadata
    const existingSentiment =
      firstInbound?.metadata?.sentiment ||
      inboundMessages.find((m) => m.metadata?.sentiment)?.metadata?.sentiment;

    if (existingSentiment && typeof existingSentiment === 'string') {
      const lower = existingSentiment.toLowerCase();
      positiveSentimentEarned = lower === 'positive' || lower === 'urgent';
    } else {
      // Classify using DeepSeek or heuristic
      const sentiment = await classifyReplySentiment(firstInbound.subject || '', firstInbound.body || '');
      positiveSentimentEarned = sentiment === 'positive';
      firstInbound.metadata = firstInbound.metadata || {};
      firstInbound.metadata.sentiment = positiveSentimentEarned ? 'Positive' : 'Neutral';
    }
  }

  // Calculate total score (max 10)
  let totalScore = 0;
  if (repliedEarned) totalScore += 2;
  if (fastReplyEarned) totalScore += 2;
  if (buyingIntentEarned) totalScore += 2;
  if (multiExchangeEarned) totalScore += 2;
  if (positiveSentimentEarned) totalScore += 2;

  const isHot = totalScore >= LIFECYCLE_CONFIG.HOT_LEAD_THRESHOLD;

  const breakdown = [
    {
      id: 'replied',
      label: 'Inbound Response Received',
      points: 2,
      earned: repliedEarned,
      icon: 'Mail',
      description: 'Lead responded to cold outreach or initiated direct inquiry',
    },
    {
      id: 'fast_reply',
      label: 'Fast Reply (<24h)',
      points: 2,
      earned: fastReplyEarned,
      icon: 'Clock',
      description: 'Responded within 24 hours of email dispatch',
    },
    {
      id: 'buying_intent',
      label: 'Commercial Buying Intent',
      points: 2,
      earned: buyingIntentEarned,
      icon: 'Target',
      description: 'Mentioned pricing, quotes, samples, MOQ, or catalog',
    },
    {
      id: 'multi_exchange',
      label: 'Multi-Turn Thread (2+ Exchanges)',
      points: 2,
      earned: multiExchangeEarned,
      icon: 'MessageSquare',
      description: 'Thread has sustained active conversation beyond single reply',
    },
    {
      id: 'positive_sentiment',
      label: 'Positive Sentiment (AI Classified)',
      points: 2,
      earned: positiveSentimentEarned,
      icon: 'Sparkles',
      description: 'DeepSeek classified reply tone as commercially receptive',
    },
  ];

  return {
    score: totalScore,
    maxScore: 10,
    isHot,
    signals: {
      replied: repliedEarned,
      fastReply: fastReplyEarned,
      buyingIntent: buyingIntentEarned,
      multiExchange: multiExchangeEarned,
      positiveSentiment: positiveSentimentEarned,
    },
    breakdown,
  };
}
