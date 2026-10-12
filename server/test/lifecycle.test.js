import test from 'node:test';
import assert from 'node:assert/strict';
import { LIFECYCLE_CONFIG } from '../config/mailLifecycleConfig.js';
import {
  computeLeadEngagementScore,
  hasBuyingIntentKeywords,
  isFastReply,
} from '../services/lifecycleScoringService.js';
import { generateFollowUpDraft } from '../services/followUpEngine.js';

test('mail lifecycle configuration constants are explicitly defined and non-hardcoded', () => {
  assert.equal(LIFECYCLE_CONFIG.FIRST_FOLLOW_UP_DAYS, 3);
  assert.equal(LIFECYCLE_CONFIG.SECOND_FOLLOW_UP_DAYS, 7);
  assert.equal(LIFECYCLE_CONFIG.AUTO_CLOSE_DAYS, 14);
  assert.equal(LIFECYCLE_CONFIG.HOT_LEAD_THRESHOLD, 6);
  assert.ok(Array.isArray(LIFECYCLE_CONFIG.BUYING_INTENT_KEYWORDS));
  assert.ok(LIFECYCLE_CONFIG.BUYING_INTENT_KEYWORDS.includes('pricing'));
  assert.ok(LIFECYCLE_CONFIG.BUYING_INTENT_KEYWORDS.includes('quote'));
  assert.ok(LIFECYCLE_CONFIG.BUYING_INTENT_KEYWORDS.includes('sample'));
  assert.ok(LIFECYCLE_CONFIG.BUYING_INTENT_KEYWORDS.includes('moq'));
  assert.ok(LIFECYCLE_CONFIG.BUYING_INTENT_KEYWORDS.includes('interested'));
  assert.ok(LIFECYCLE_CONFIG.BUYING_INTENT_KEYWORDS.includes('catalog'));
});

test('engagement scoring correctly recognizes buying intent keywords and fast replies', () => {
  assert.equal(hasBuyingIntentKeywords('Please send your latest FOB pricing and MOQ specs'), true);
  assert.equal(hasBuyingIntentKeywords('We need sample containers of cardamom'), true);
  assert.equal(hasBuyingIntentKeywords('Just confirming office address'), false);

  const sentAt = '2026-10-01 10:00:00';
  const fastReply = '2026-10-01 18:30:00'; // 8.5 hours later
  const slowReply = '2026-10-03 10:00:00'; // 48 hours later
  assert.equal(isFastReply(sentAt, fastReply), true);
  assert.equal(isFastReply(sentAt, slowReply), false);
});

test('10-point engagement scoring assigns points accurately and flags 6+ as hot', async () => {
  const lead = {
    first_contacted_at: '2026-10-05 09:00:00',
    company: 'EuroSpice Hamburg',
  };

  // Case 1: High engagement reply (Replied + Fast <24h + Buying intent + Positive sentiment = 8 pts -> HOT)
  const hotInbound = [
    {
      subject: 'Re: Spice Partnership - Price quote & sample request',
      body: 'We are very interested in 2 FCL Malabar Black Pepper. Please share pricing and catalog.',
      receivedAt: '2026-10-05 14:00:00', // 5 hours later
      metadata: { sentiment: 'Positive' },
    },
  ];

  const hotScore = await computeLeadEngagementScore(lead, hotInbound, [{ sentAt: lead.first_contacted_at }]);
  assert.equal(hotScore.signals.replied, true);
  assert.equal(hotScore.signals.fastReply, true);
  assert.equal(hotScore.signals.buyingIntent, true);
  assert.equal(hotScore.signals.positiveSentiment, true);
  assert.ok(hotScore.score >= 6, `Expected score >= 6, got ${hotScore.score}`);
  assert.equal(hotScore.isHot, true);

  // Case 2: Low engagement reply (Replied slow, no buying keywords, neutral tone = 2 pts -> NOT hot)
  const coldInbound = [
    {
      subject: 'Re: Hello',
      body: 'Will review this when we return next month.',
      receivedAt: '2026-10-10 10:00:00', // 5 days later
      metadata: { sentiment: 'Neutral' },
    },
  ];

  const coldScore = await computeLeadEngagementScore(lead, coldInbound, [{ sentAt: lead.first_contacted_at }]);
  assert.equal(coldScore.signals.replied, true);
  assert.equal(coldScore.signals.fastReply, false);
  assert.equal(coldScore.signals.buyingIntent, false);
  assert.equal(coldScore.signals.positiveSentiment, false);
  assert.equal(coldScore.score, 2);
  assert.equal(coldScore.isHot, false);
});

test('follow-up engine generates Turn 1 and Turn 2 follow-up drafts without auto-sending', () => {
  const sampleLead = {
    id: 'outreach-lead-123',
    company: 'Nordic Spices AB',
    leadName: 'Lars Svensson',
    subject: 'Direct Origin Spices Partnership: Kerala -> Stockholm',
  };

  const draftTurn1 = generateFollowUpDraft(sampleLead, 1);
  assert.equal(draftTurn1.turn, 1);
  assert.ok(draftTurn1.subject.includes('Direct Origin Spices Partnership'));
  assert.ok(draftTurn1.body.includes('Lars Svensson'));
  assert.ok(draftTurn1.body.includes('Malabar Black Pepper'));
  assert.doesNotMatch(draftTurn1.body, /container allocations|550GL|8mm|High-Curcumin/);

  const draftTurn2 = generateFollowUpDraft(sampleLead, 2);
  assert.equal(draftTurn2.turn, 2);
  assert.ok(draftTurn2.subject.includes('Final follow-up'));
  assert.ok(draftTurn2.body.includes('Nordic Spices AB'));
});
