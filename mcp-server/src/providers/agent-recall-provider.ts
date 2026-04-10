import type { Config } from "../config.js";
import type { Memory, MemorySearchResult, MemoryProvider, MemoryProviderInfo } from "./memory-provider.js";

interface AgentRecallObservation {
  id: number;
  type: string;
  title: string;
  subtitle: string;
  narrative: string;
  concepts: string[];
  created_at_epoch: number;
}

export class AgentRecallProvider implements MemoryProvider {
  private readonly url: string;
  private readonly project: string;
  private readonly timeoutMs: number;
  private healthCache: { healthy: boolean; checkedAt: number } | null = null;
  private static readonly HEALTH_CACHE_TTL = 30_000; // 30 seconds

  constructor(config: Config) {
    this.url = config.memory.agentRecall.url;
    this.project = config.memory.agentRecall.project;
    this.timeoutMs = config.memory.agentRecall.timeoutMs;
  }

  info(): MemoryProviderInfo {
    return {
      name: "agent-recall",
      label: `Agent Recall (${this.url})`,
      healthy: this.healthCache?.healthy ?? false,
    };
  }

  async write(params: {
    type: Memory["type"];
    content: string;
    source?: string;
    tags?: string[];
    confidence?: Memory["confidence"];
    expires_at?: string | null;
  }): Promise<{ id: string; status: string }> {
    const tagsSuffix = params.tags?.length ? " " + params.tags.map((t) => `#${t}`).join(" ") : "";
    const title = `[${params.type}][${params.confidence ?? "medium"}] ${params.content.slice(0, 60)}${tagsSuffix}`;

    const body = {
      text: params.content,
      title,
      project: this.project,
    };

    const res = await this.fetch("/api/memory/save", { method: "POST", body });
    if (res && res.success) {
      return { id: `ar_${res.id}`, status: "created" };
    }
    return { id: "", status: "error" };
  }

  async read(id: string): Promise<Memory | null> {
    const numericId = this.toNumericId(id);
    if (numericId === null) return null;

    const res = await this.fetch(`/api/observation/${numericId}`);
    if (!res) return null;

    return this.observationToMemory(res);
  }

  async search(query: string, options?: { limit?: number; type?: string }): Promise<MemorySearchResult[]> {
    const limit = options?.limit ?? 10;
    const params = new URLSearchParams({
      query,
      limit: String(limit),
      project: this.project,
      type: "observations",
    });

    const res = await this.fetch(`/api/search?${params}`);
    if (!res?.content?.[0]?.text) return [];

    return this.parseSearchResults(res.content[0].text);
  }

  async update(
    _id: string,
    _params: { content?: string; tags?: string[]; confidence?: Memory["confidence"]; expires_at?: string | null },
  ): Promise<{ status: string }> {
    return { status: "not_supported" };
  }

  async delete(_id: string): Promise<{ status: string }> {
    return { status: "not_supported" };
  }

  async gc(_options?: { maxAgeDays?: number; dryRun?: boolean }): Promise<{ removed: string[]; kept: number }> {
    return { removed: [], kept: 0 };
  }

  async count(): Promise<number> {
    const res = await this.fetch("/api/stats");
    return res?.database?.observations ?? 0;
  }

  async isHealthy(): Promise<boolean> {
    const now = Date.now();
    if (this.healthCache && now - this.healthCache.checkedAt < AgentRecallProvider.HEALTH_CACHE_TTL) {
      return this.healthCache.healthy;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const response = await globalThis.fetch(`${this.url}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await response.json();
      const healthy = data?.status === "ok";
      this.healthCache = { healthy, checkedAt: now };
      return healthy;
    } catch {
      this.healthCache = { healthy: false, checkedAt: now };
      return false;
    }
  }

  // ── Private helpers ──────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetch(path: string, opts?: { method?: string; body?: unknown }): Promise<any> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const fetchOpts: RequestInit = {
        method: opts?.method ?? "GET",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      };
      if (opts?.body) {
        fetchOpts.body = JSON.stringify(opts.body);
      }
      const response = await globalThis.fetch(`${this.url}${path}`, fetchOpts);
      clearTimeout(timeout);
      if (!response.ok) {
        console.error(`auto-learning: agent-recall ${opts?.method ?? "GET"} ${path} returned ${response.status}`);
        return null;
      }
      return (await response.json()) as Record<string, unknown>;
    } catch (err) {
      console.error(`auto-learning: agent-recall ${path} failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private toNumericId(id: string): number | null {
    if (id.startsWith("ar_")) {
      const num = parseInt(id.slice(3), 10);
      return isNaN(num) ? null : num;
    }
    const num = parseInt(id, 10);
    return isNaN(num) ? null : num;
  }

  private observationToMemory(obs: AgentRecallObservation): Memory {
    const { type, confidence } = this.parseTitleMeta(obs.title);
    return {
      id: `ar_${obs.id}`,
      type,
      content: obs.narrative || obs.title,
      tags: obs.concepts ?? [],
      confidence,
      source: obs.subtitle || "agent-recall",
      created_at: new Date(obs.created_at_epoch * 1000).toISOString(),
      updated_at: new Date(obs.created_at_epoch * 1000).toISOString(),
      expires_at: null,
      file_path: "",
    };
  }

  private parseTitleMeta(title: string): { type: Memory["type"]; confidence: Memory["confidence"] } {
    let type: Memory["type"] = "fact";
    let confidence: Memory["confidence"] = "medium";

    const typeMatch = title.match(/\[(preference|fact|feedback)\]/);
    if (typeMatch) type = typeMatch[1] as Memory["type"];

    const confMatch = title.match(/\[(high|medium|low)\]/);
    if (confMatch) confidence = confMatch[1] as Memory["confidence"];

    return { type, confidence };
  }

  private parseSearchResults(text: string): MemorySearchResult[] {
    const results: MemorySearchResult[] = [];
    const lines = text.split("\n").filter((l) => l.trim());

    for (const line of lines) {
      // Agent Recall search returns formatted text lines like:
      // "#123 | title | 2024-01-01"
      const idMatch = line.match(/#(\d+)/);
      if (!idMatch) continue;

      const id = `ar_${idMatch[1]}`;
      // Extract the content portion after the ID
      const parts = line.split("|").map((p) => p.trim());
      const content = parts[1] ?? line;
      const { type, confidence } = this.parseTitleMeta(content);

      results.push({
        id,
        content,
        type,
        tags: [],
        confidence,
        rank: results.length,
      });
    }

    return results;
  }
}
