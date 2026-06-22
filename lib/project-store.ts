/**
 * Project Store
 * In-memory cache of projects + memory blobs, synced to 0G Storage.
 * In production, you'd replace the in-memory cache with a proper DB
 * and use 0G as the canonical persistent layer.
 */

import { MemoryBlob, Memory, zgStorage, StorageResult } from "./0g-storage";
import { memoryEngine } from "./memory-engine";
import crypto from "crypto";

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  lastActive: number;
  storageRootHash: string | null; // 0G Storage root hash
  storageTxHash: string | null;
  memoryCount: number;
  messageCount: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  memoriesExtracted?: number;
}

// ─── In-memory store (replace with DB in production) ─────────────────────────

const projectStore = new Map<string, Project>();
const memoryStore = new Map<string, Memory[]>(); // projectId → memories
const chatStore = new Map<string, ChatMessage[]>(); // projectId → messages

// ─── Public API ───────────────────────────────────────────────────────────────

export function getAllProjects(): Project[] {
  return [...projectStore.values()].sort((a, b) => b.lastActive - a.lastActive);
}

export function getProject(id: string): Project | null {
  return projectStore.get(id) || null;
}

export function createProject(name: string, description: string): Project {
  const project: Project = {
    id: crypto.randomUUID(),
    name,
    description,
    createdAt: Date.now(),
    lastActive: Date.now(),
    storageRootHash: null,
    storageTxHash: null,
    memoryCount: 0,
    messageCount: 0,
  };
  projectStore.set(project.id, project);
  memoryStore.set(project.id, []);
  chatStore.set(project.id, []);
  return project;
}

export function getMemories(projectId: string): Memory[] {
  return memoryStore.get(projectId) || [];
}

export function getChat(projectId: string): ChatMessage[] {
  return chatStore.get(projectId) || [];
}

/**
 * Process a chat turn: extract memories, build context, return updated state.
 */
export async function processChatTurn(
  projectId: string,
  userMessage: string,
  assistantResponse: string
): Promise<{ memoriesAdded: number; storageResult: StorageResult | null }> {
  const existingMemories = memoryStore.get(projectId) || [];

  // Extract new memories from this turn
  const newMemories = memoryEngine.extractMemories(
    userMessage,
    assistantResponse,
    existingMemories
  );

  // Update access counts on relevant existing memories
  const relevant = memoryEngine.search(userMessage, existingMemories, 5);
  for (const m of relevant) {
    m.accessCount++;
    m.lastAccessed = Date.now();
  }

  // Apply decay and merge
  const decayed = memoryEngine.applyDecay(existingMemories);
  const merged = [...decayed, ...newMemories];
  memoryStore.set(projectId, merged);

  // Add chat messages
  const chat = chatStore.get(projectId) || [];
  chat.push(
    { role: "user", content: userMessage, timestamp: Date.now() },
    {
      role: "assistant",
      content: assistantResponse,
      timestamp: Date.now() + 1,
      memoriesExtracted: newMemories.length,
    }
  );
  chatStore.set(projectId, chat);

  // Update project metadata
  const project = projectStore.get(projectId);
  if (project) {
    project.lastActive = Date.now();
    project.memoryCount = merged.length;
    project.messageCount = chat.length;
  }

  // Persist to 0G Storage
  let storageResult: StorageResult | null = null;
  try {
    const blob: MemoryBlob = {
      projectId,
      memories: merged,
      lastUpdated: Date.now(),
      version: (project?.memoryCount || 0) + 1,
    };
    storageResult = await zgStorage.store(blob);

    if (project) {
      project.storageRootHash = storageResult.rootHash;
      project.storageTxHash = storageResult.txHash;
      (project as any).onChain = storageResult.onChain;
    }
  } catch (e) {
    console.error("0G Storage sync failed:", e);
  }

  return { memoriesAdded: newMemories.length, storageResult };
}

/**
 * Get relevant memory context for a query (to inject into AI prompt).
 */
export function getMemoryContext(projectId: string, query: string): string {
  const memories = memoryStore.get(projectId) || [];
  const relevant = memoryEngine.search(query, memories, 6);
  return memoryEngine.buildContext(relevant);
}

export function getStorageStatus() {
  return zgStorage.getStatus();
}
