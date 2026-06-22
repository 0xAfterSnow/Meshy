/**
 * Meshy Engine
 * Handles embedding generation, semantic search, memory extraction,
 * and importance scoring entirely in-process (no external vector DB needed).
 */

import { Memory, MemoryBlob } from "./0g-storage";
import crypto from "crypto";

// Simple but effective embedding using TF-IDF-like token weighting
// In production, swap this for OpenAI embeddings or a local model
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "are", "was", "have",
  "been", "from", "they", "will", "one", "all", "can", "her", "what",
  "there", "their", "said", "each", "which", "she", "how", "its", "our",
  "out", "about", "who", "get", "when", "would", "make", "like", "into",
  "him", "time", "has", "look", "two", "more", "write", "but", "not",
]);

function buildVocab(texts: string[]): string[] {
  const freq = new Map<string, number>();
  for (const text of texts) {
    const tokens = new Set(tokenize(text));
    for (const t of tokens) {
      if (!STOP_WORDS.has(t)) freq.set(t, (freq.get(t) || 0) + 1);
    }
  }
  // Top 512 terms by frequency
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 512)
    .map(([term]) => term);
}

function embed(text: string, vocab: string[]): number[] {
  const tokens = tokenize(text);
  const termFreq = new Map<string, number>();
  for (const t of tokens) termFreq.set(t, (termFreq.get(t) || 0) + 1);
  
  const vec = vocab.map((term) => termFreq.get(term) || 0);
  
  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map((v) => v / norm) : vec;
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both are L2-normalized so this is cosine similarity
}

// ─── Category classifier ────────────────────────────────────────────────────

const CATEGORY_SIGNALS: Record<Memory["category"], string[]> = {
  architecture: ["architecture", "design", "pattern", "structure", "system", "layer", "service", "api", "database", "schema", "infra"],
  preference: ["prefer", "always", "never", "like", "dislike", "want", "style", "convention", "format", "naming"],
  decision: ["decided", "chose", "going with", "switched", "reason", "because", "tradeoff", "instead"],
  context: ["project", "app", "building", "working on", "goal", "purpose", "team", "user", "customer"],
  bug: ["bug", "error", "fix", "issue", "problem", "broken", "crash", "fail", "exception", "warning"],
  feature: ["feature", "add", "implement", "todo", "plan", "need", "require", "support", "should"],
};

function classifyMemory(content: string): Memory["category"] {
  const lower = content.toLowerCase();
  let best: Memory["category"] = "context";
  let bestScore = 0;

  for (const [cat, signals] of Object.entries(CATEGORY_SIGNALS)) {
    const score = signals.filter((s) => lower.includes(s)).length;
    if (score > bestScore) {
      bestScore = score;
      best = cat as Memory["category"];
    }
  }
  return best;
}

// ─── Importance scorer ───────────────────────────────────────────────────────

function scoreImportance(content: string, category: Memory["category"]): number {
  let score = 0.4; // base

  // Category weights
  const catBonus: Record<Memory["category"], number> = {
    architecture: 0.3,
    decision: 0.25,
    preference: 0.2,
    feature: 0.15,
    bug: 0.1,
    context: 0.05,
  };
  score += catBonus[category];

  // Length signal (more detail = more important)
  if (content.length > 200) score += 0.1;
  if (content.length > 500) score += 0.1;

  // Specificity signals
  const specifics = ["must", "never", "always", "critical", "important", "key", "core"];
  if (specifics.some((s) => content.toLowerCase().includes(s))) score += 0.1;

  return Math.min(score, 1.0);
}

// ─── Main MemoryEngine class ─────────────────────────────────────────────────

export class MemoryEngine {
  private vocab: string[] = [];
  private vocabBuilt = false;

  /**
   * Extract discrete memories from a conversation turn.
   * Returns an array of Memory objects ready to be stored.
   */
  extractMemories(userMessage: string, assistantResponse: string, existingMemories: Memory[]): Memory[] {
    const extracted: Memory[] = [];
    
    // Rebuild vocab from all context
    const allTexts = [
      userMessage,
      assistantResponse,
      ...existingMemories.map((m) => m.content),
    ];
    this.vocab = buildVocab(allTexts);
    this.vocabBuilt = true;

    // Split message into semantic chunks (sentences / clauses)
    const chunks = this.chunkText(userMessage + "\n" + assistantResponse);

    for (const chunk of chunks) {
      if (chunk.trim().length < 20) continue;
      if (!this.isWorthRemembering(chunk)) continue;

      const category = classifyMemory(chunk);
      const importance = scoreImportance(chunk, category);
      
      if (importance < 0.4) continue; // filter low-signal chunks

      const embedding = embed(chunk, this.vocab);
      
      // Dedup: skip if too similar to existing memory
      const isDupe = existingMemories.some(
        (m) => m.embedding.length > 0 && cosineSim(m.embedding, embedding) > 0.92
      );
      if (isDupe) continue;

      extracted.push({
        id: crypto.randomUUID(),
        content: chunk.trim(),
        category,
        embedding,
        importance,
        accessCount: 0,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        tags: this.extractTags(chunk),
      });
    }

    return extracted;
  }

  /**
   * Find the most relevant memories for a given query.
   */
  search(query: string, memories: Memory[], topK = 5): Memory[] {
    if (memories.length === 0) return [];

    // Ensure vocab covers the query
    if (!this.vocabBuilt || this.vocab.length === 0) {
      this.vocab = buildVocab([query, ...memories.map((m) => m.content)]);
    }

    const queryVec = embed(query, this.vocab);

    return memories
      .map((m) => ({
        memory: m,
        score: m.embedding.length > 0
          ? cosineSim(queryVec, m.embedding) * 0.7 + m.importance * 0.3
          : m.importance * 0.3,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ memory }) => memory);
  }

  /**
   * Apply memory decay - reduce importance of stale, unaccessed memories.
   */
  applyDecay(memories: Memory[]): Memory[] {
    const now = Date.now();
    const DAY_MS = 86400000;

    return memories.map((m) => {
      const ageDays = (now - m.lastAccessed) / DAY_MS;
      const decayFactor = Math.exp(-0.05 * ageDays); // slow exponential decay
      return {
        ...m,
        importance: m.importance * decayFactor,
      };
    }).filter((m) => m.importance > 0.1); // prune dead memories
  }

  /**
   * Build a context string from relevant memories to inject into the prompt.
   */
  buildContext(relevantMemories: Memory[]): string {
    if (relevantMemories.length === 0) return "";

    const grouped = relevantMemories.reduce((acc, m) => {
      if (!acc[m.category]) acc[m.category] = [];
      acc[m.category].push(m.content);
      return acc;
    }, {} as Record<string, string[]>);

    const lines = ["## What I remember about this project:\n"];

    const catLabels: Record<string, string> = {
      architecture: "🏗 Architecture & Design",
      decision: "🎯 Key Decisions",
      preference: "💡 Your Preferences",
      context: "📋 Project Context",
      feature: "⚙️ Features & Todos",
      bug: "🐛 Known Issues",
    };

    for (const [cat, contents] of Object.entries(grouped)) {
      lines.push(`**${catLabels[cat] || cat}**`);
      for (const c of contents) lines.push(`- ${c}`);
      lines.push("");
    }

    return lines.join("\n");
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private chunkText(text: string): string[] {
    // Split on sentence boundaries and newlines
    return text
      .split(/(?<=[.!?])\s+|\n+/)
      .filter((s) => s.trim().length > 0);
  }

  private isWorthRemembering(text: string): boolean {
    const lower = text.toLowerCase();
    // Skip filler phrases
    const fillers = ["okay", "sure", "got it", "let me", "i'll", "here is", "here's", "you can"];
    if (fillers.some((f) => lower.startsWith(f) && text.length < 60)) return false;
    // Must have at least some content signal
    const signals = [
      ...Object.values(CATEGORY_SIGNALS).flat(),
      "use", "using", "build", "built", "write", "wrote", "store",
    ];
    return signals.some((s) => lower.includes(s));
  }

  private extractTags(text: string): string[] {
    const lower = text.toLowerCase();
    const tags: string[] = [];
    
    const techTerms = [
      "react", "next.js", "typescript", "python", "flask", "sqlite", "postgres",
      "docker", "api", "graphql", "rest", "tailwind", "node", "express",
      "redis", "kafka", "aws", "vercel", "github", "git", "testing", "ci/cd",
    ];
    
    for (const term of techTerms) {
      if (lower.includes(term)) tags.push(term);
    }
    
    return tags.slice(0, 5);
  }
}

export const memoryEngine = new MemoryEngine();
