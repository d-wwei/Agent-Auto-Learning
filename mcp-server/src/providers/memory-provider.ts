import type { Memory, MemorySearchResult } from "../storage/memory-store.js";

export type { Memory, MemorySearchResult };

export interface MemoryProviderInfo {
  name: string;
  label: string;
  healthy: boolean;
}

export interface MemoryProvider {
  info(): MemoryProviderInfo;

  write(params: {
    type: Memory["type"];
    content: string;
    source?: string;
    tags?: string[];
    confidence?: Memory["confidence"];
    expires_at?: string | null;
  }): Promise<{ id: string; status: string }>;

  read(id: string): Promise<Memory | null>;

  search(query: string, options?: { limit?: number; type?: string }): Promise<MemorySearchResult[]>;

  update(
    id: string,
    params: {
      content?: string;
      tags?: string[];
      confidence?: Memory["confidence"];
      expires_at?: string | null;
    },
  ): Promise<{ status: string }>;

  delete(id: string): Promise<{ status: string }>;

  gc(options?: { maxAgeDays?: number; dryRun?: boolean }): Promise<{ removed: string[]; kept: number }>;

  count(): Promise<number>;

  isHealthy(): Promise<boolean>;
}
