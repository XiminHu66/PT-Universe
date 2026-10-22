# AnythingLLM · PT Chat

An independent PT Universe chat tool inspired by AnythingLLM's workspace and provider selection UX. It is not the upstream AnythingLLM server and does not claim its vector RAG, agents, or full document ingestion features.

- Static frontend: `apps/anythingllm/`; linked from the PT Universe homepage and Daily Nexus toolbox.
- Streaming API: existing PT Universe Worker, `/api/anythingllm/{chat,models,status,quota}`.
- `providers.json` records official registration/docs links, quota category, account requirements, and verification date. Model availability and free tiers can change. Trial/conditional/paid providers require explicit acknowledgement before use. The catalog is broad, not exhaustive.
- User API keys stay in tab sessionStorage. The Worker forwards them only to fixed official HTTPS endpoints; it does not persist keys or conversation content. Custom endpoints and localhost run directly from the browser and need CORS. Runtime platform observability settings still apply.
- Existing backend Gemini requires an authenticated, already-enrolled PT Universe sync account. Shared-key usage has an atomic global 6/minute, 150/day and per-account 60/day reservation. Shared access cannot call arbitrary or paid model IDs.
- Chat/workspace data stays in browser localStorage, outside the existing `ptu.*` sync scope. JSON backups and Markdown exports exclude keys. Import replaces current chats only after confirmation.
- Text attachments only (up to 5, combined 55,000 characters); one message limited to 60,000 characters; requests to 120,000. Latest 40 completed messages plus workspace system prompt are sent to the selected backend. Switching provider sends that conversation context to the newly selected service. No automatic cross-provider fallback.
- OpenRouter's default free mode only permits `openrouter/free` or `:free`. Other providers require the appropriate free account plan; the UI cannot guarantee zero billing on a paid account. Trial expiry and usage billing are controlled by the upstream provider.

Checks: `node scripts/anythingllm/core-test.mjs` and, inside the Worker directory, `node tests/anythingllm.test.mjs`, `npm run check`, `npx wrangler deploy --dry-run`. The connection test makes one small real completion when clicked. Model listing does not verify generation or free entitlement.
