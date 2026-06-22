# Meshy

**Persistent AI agent memory, stored on 0G.**

Built for the [Zero Cup](https://0g.ai/arena/zero-cup) hackathon.

## The problem

Every AI coding assistant has amnesia. Close the tab, lose the context. You re-explain your stack, your conventions, your past decisions — every single session.

## The fix

Meshy is a coding assistant that **extracts, scores, and persists memories** about your project to **0G Storage** as you chat. Kill the session, come back next week — it still knows your architecture, your preferences, and the decisions you made.

```
You chat  →  Memory engine extracts facts  →  Stored on 0G (root hash + tx)
                                                        ↓
Next session  →  Semantic search over memories  →  Injected into agent context
```

## What's real here

- **Memory extraction**: every chat turn is chunked, classified (architecture / decision / preference / context / feature / bug), scored for importance, embedded, and deduped against existing memory — all in `lib/memory-engine.ts`, no external service required.
- **Semantic search**: cosine similarity over an in-process TF-IDF-style embedding pulls the most relevant memories for the current question before the agent responds.
- **Memory decay**: stale, unused memories lose importance over time and get pruned — so the store doesn't bloat into noise.
- **0G Storage integration**: every memory update is serialized and pushed to 0G via `lib/0g-storage.ts`. Each write returns a **root hash** (content-addressed, verifiable) and a transaction hash, both shown live in the UI.

## Demo flow

1. Click **+** in the sidebar to create a new project (e.g. "My App").
2. Ask the agent something about the project ("what's the entry point script again?").
3. Watch the right panel — new memories animate in, tagged by category, with an importance score.
4. Watch the 0G badge in the sidebar — root hash + tx hash update on every turn.
5. Refresh the page. The memories are still there. Start a new project and the agent has zero context — proving the memory is genuinely project-scoped and persistent, not just chat history.

## Running it

```bash
npm install
cp .env.example .env.local
# fill in OPENAI_API_KEY (required)
# fill in ZG_RPC_URL + ZG_PRIVATE_KEY (optional — runs in demo mode without it)
npm run dev
```

Demo mode (no 0G credentials): the app still runs end-to-end, computing real root hashes locally and showing the full UX, but doesn't push bytes to the live 0G network. Drop in `ZG_RPC_URL` + `ZG_PRIVATE_KEY` from the [0G docs](https://docs.0g.ai) to go live — no code changes needed.

## Stack

- Next.js 16 (App Router) + TypeScript
- In-process memory engine (no vector DB dependency)
- 0G Storage (via indexer API + ethers.js for chain interaction)
- OpenAI API for the agent itself

## Architecture

```
app/
  page.tsx              — full UI: project sidebar, chat, memory panel
  api/chat/route.ts     — handles a chat turn, calls OpenAI, triggers memory extraction
  api/memories/route.ts — fetch memories for a project
  api/project/route.ts  — list/create/fetch projects
lib/
  0g-storage.ts          — 0G Storage client (store/retrieve memory blobs)
  memory-engine.ts        — extraction, classification, scoring, search, decay
  project-store.ts        — in-memory project/chat/memory cache, syncs to 0G
```

## Roadmap (next rounds)

- Swap the TF-IDF embedding for a real embedding model once latency budget allows
- Multi-agent memory sharing (Agent A's memories readable by Agent B with permissioning)
- Shareable "memory card" for social proof / community voting virality
- Replace in-memory cache with a persisted DB; 0G becomes the canonical durable layer with the DB as a fast read cache
