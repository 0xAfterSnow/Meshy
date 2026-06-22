/**
 * 0G Storage Client
 * Uses the official @0gfoundation/0g-storage-ts-sdk (ethers v5)
 *
 * SETUP — add to .env.local:
 *   ZG_RPC_URL=https://evmrpc-testnet.0g.ai
 *   ZG_PRIVATE_KEY=your_wallet_private_key
 *   ZG_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai
 */

import { createHash } from "crypto";

export interface StorageResult {
  rootHash: string;
  txHash: string | null;
  timestamp: number;
  size: number;
  onChain: boolean;
}

export interface MemoryBlob {
  projectId: string;
  memories: Memory[];
  lastUpdated: number;
  version: number;
}

export interface Memory {
  id: string;
  content: string;
  category: "architecture" | "preference" | "decision" | "context" | "bug" | "feature";
  embedding: number[];
  importance: number;
  accessCount: number;
  createdAt: number;
  lastAccessed: number;
  tags: string[];
}

function localRootHash(data: Buffer): string {
  return "0x" + createHash("sha256").update(data).digest("hex");
}

class ZeroGStorageClient {
  private isConfigured: boolean;
  private rpcUrl: string;
  private indexerUrl: string;
  private privateKey: string;

  constructor() {
    this.rpcUrl = process.env.ZG_RPC_URL || "https://evmrpc-testnet.0g.ai";
    this.indexerUrl =
      process.env.ZG_INDEXER_URL || "https://indexer-storage-testnet-turbo.0g.ai";
    this.privateKey = process.env.ZG_PRIVATE_KEY || "";
    this.isConfigured = !!this.privateKey;

    if (!this.isConfigured) {
      console.warn("[0G] No ZG_PRIVATE_KEY — running in demo mode.");
    }
  }

  async store(blob: MemoryBlob): Promise<StorageResult> {
    const bytes = Buffer.from(JSON.stringify(blob), "utf-8");
    const fallbackHash = localRootHash(bytes);

    if (!this.isConfigured) {
      return {
        rootHash: fallbackHash,
        txHash: null,
        timestamp: Date.now(),
        size: bytes.length,
        onChain: false,
      };
    }

    try {
      const { Indexer, MemData } = await import("@0gfoundation/0g-storage-ts-sdk");
      // ethers v6 API
      const { JsonRpcProvider, Wallet } = await import("ethers");
      const provider = new JsonRpcProvider(this.rpcUrl);
      const signer = new Wallet(this.privateKey, provider);
      const indexer = new Indexer(this.indexerUrl);

      const memData = new MemData(new Uint8Array(bytes));
      const [uploadResult, err] = await indexer.upload(memData, this.rpcUrl, signer);

      if (err) throw err;

      // SDK returns either single {rootHash, txHash} or batch {rootHashes, txHashes}
      const result = uploadResult as any;
      const rootHash: string = result?.rootHash ?? result?.rootHashes?.[0] ?? fallbackHash;
      const txHash: string = result?.txHash ?? result?.txHashes?.[0] ?? rootHash;

      return {
        rootHash,
        txHash,
        timestamp: Date.now(),
        size: bytes.length,
        onChain: true,
      };
    } catch (e: any) {
      console.error("[0G] Upload failed:", e?.message || e);
      return {
        rootHash: fallbackHash,
        txHash: null,
        timestamp: Date.now(),
        size: bytes.length,
        onChain: false,
      };
    }
  }

  async retrieve(rootHash: string, outPath: string): Promise<MemoryBlob | null> {
    if (!this.isConfigured) return null;
    try {
      const { Indexer } = await import("@0gfoundation/0g-storage-ts-sdk");
      const indexer = new Indexer(this.indexerUrl);
      const err = await indexer.download(rootHash, outPath, true);
      if (err) throw err;
      const fs = await import("fs");
      const raw = fs.readFileSync(outPath, "utf-8");
      return JSON.parse(raw) as MemoryBlob;
    } catch (e) {
      console.error("[0G] Download failed:", e);
      return null;
    }
  }

  getStatus() {
    return {
      configured: this.isConfigured,
      network: this.rpcUrl,
      indexer: this.indexerUrl,
    };
  }
}

export const zgStorage = new ZeroGStorageClient();
