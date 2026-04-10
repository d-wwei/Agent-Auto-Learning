import type { MemoryStore } from "../storage/memory-store.js";
import type { Memory, MemorySearchResult, MemoryProvider, MemoryProviderInfo } from "./memory-provider.js";

export class BuiltinMemoryProvider implements MemoryProvider {
  constructor(private store: MemoryStore) {}

  info(): MemoryProviderInfo {
    return { name: "builtin", label: "Auto-Learning built-in (SQLite FTS5)", healthy: true };
  }

  async write(params: {
    type: Memory["type"];
    content: string;
    source?: string;
    tags?: string[];
    confidence?: Memory["confidence"];
    expires_at?: string | null;
  }): Promise<{ id: string; status: string }> {
    return this.store.write(params);
  }

  async read(id: string): Promise<Memory | null> {
    return this.store.read(id);
  }

  async search(query: string, options?: { limit?: number; type?: string }): Promise<MemorySearchResult[]> {
    return this.store.search(query, options);
  }

  async update(
    id: string,
    params: { content?: string; tags?: string[]; confidence?: Memory["confidence"]; expires_at?: string | null },
  ): Promise<{ status: string }> {
    return this.store.update(id, params);
  }

  async delete(id: string): Promise<{ status: string }> {
    return this.store.delete(id);
  }

  async gc(options?: { maxAgeDays?: number; dryRun?: boolean }): Promise<{ removed: string[]; kept: number }> {
    return this.store.gc(options);
  }

  async count(): Promise<number> {
    return this.store.count();
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
