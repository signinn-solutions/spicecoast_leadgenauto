# AI draft provider

The local application is configured for Groq. Set these server-only values in `.env`:

```dotenv
GROQ_API_KEY=your-key
GROQ_MODEL=openai/gpt-oss-120b
```

Restart the backend after changing environment values. Superadmin's AI connection check verifies authentication; generating a draft verifies completion access. Existing saved drafts are retained; use Regenerate with AI to replace them.

Groq requests reserve estimated prompt and output tokens in a rolling minute budget, reconciled against actual usage. Small batches start immediately; requests wait only when that budget or the request allowance is full. Limits remain account-dependent; this is not a guarantee against throttling. Drafts use the website-based brand context, JSON validation and local template fallback. No provider calls run while idle. Human approval is still required before sending.

Groq is the only AI provider. Regression tests use mocked clients and never send test contacts to a provider.
