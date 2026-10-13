# AI draft provider

The local application is configured for Groq. Set these server-only values in `.env`:

```dotenv
GROQ_API_KEY=your-key
GROQ_MODEL=openai/gpt-oss-120b
```

Restart the backend after changing environment values. Superadmin's AI connection check verifies authentication; generating a draft verifies completion access. Existing saved drafts are retained; use Regenerate with AI to replace them.

Groq requests reserve estimated prompt and output tokens in a rolling minute budget, reconciled against actual usage. Small batches start immediately; requests wait only when that budget or the request allowance is full. Limits remain account-dependent; this is not a guarantee against throttling. Drafts use the website-based brand context, JSON validation and local template fallback. No provider calls run while idle. Human approval is still required before sending.

Groq is the only AI provider. Regression tests use mocked clients and never send test contacts to a provider.

Identical successful AI completions are reused for ten minutes (bounded, process-local cache). Concurrent identical requests share one provider call. Explicit regeneration bypasses completed cache entries; retrying an unusable result also bypasses cache. Groq 429 responses establish a shared cooldown so other jobs do not keep hitting the provider. Page-level lifecycle scoring uses stored sentiment or local keyword rules, with no AI call. Hunter Domain Search and email verification use a separate ten-minute success cache and in-flight deduplication. Account checks and discovery searches remain explicit fresh operations. Caches clear on process restart and do not change saved CRM records.
