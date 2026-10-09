/**
 * Configurable constants for the Outbound/Inbound Mail Lifecycle and Follow-Up Engine.
 *
 * All thresholds can be tuned here without code alterations across services.
 */
export const LIFECYCLE_CONFIG = {
  // Days elapsed since first_contacted_at before the first follow-up is due
  FIRST_FOLLOW_UP_DAYS: 3,

  // Days elapsed since last_contacted_at (after follow-up 1) before the second and final follow-up is due
  SECOND_FOLLOW_UP_DAYS: 7,

  // Total days elapsed since first_contacted_at with zero replies before the lead is auto-closed
  AUTO_CLOSE_DAYS: 14,

  // Score threshold on the 10-point scale for a lead to be classified as "hot"
  HOT_LEAD_THRESHOLD: 6,

  // Commercial buying intent keywords (+2 score signal)
  BUYING_INTENT_KEYWORDS: [
    'pricing',
    'price',
    'quote',
    'quotation',
    'sample',
    'moq',
    'interested',
    'catalog',
    'catalogue',
    'container',
    'fob',
    'cif',
    'fcl',
    'specification',
    'spec sheet',
  ],
};
