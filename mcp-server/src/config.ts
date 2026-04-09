import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { parse as parseYaml } from "yaml";

export interface Config {
  dataDir: string;
  review: {
    enabled: boolean;
    model: string;
    provider: "anthropic";
    apiKeyEnv: string;
    maxTokens: number;
    temperature: number;
  };
  limits: {
    memoryMaxChars: number;
    skillMaxChars: number;
    skillNameMaxLen: number;
    skillDescMaxLen: number;
    skillFileMaxBytes: number;
  };
}

const DEFAULT_DATA_DIR = join(homedir(), ".auto-learning");

const DEFAULT_CONFIG: Config = {
  dataDir: DEFAULT_DATA_DIR,
  review: {
    enabled: true,
    model: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    maxTokens: 2000,
    temperature: 0.3,
  },
  limits: {
    memoryMaxChars: 2000,
    skillMaxChars: 100_000,
    skillNameMaxLen: 64,
    skillDescMaxLen: 1024,
    skillFileMaxBytes: 1_048_576,
  },
};

export function loadConfig(): Config {
  const configPath = join(DEFAULT_DATA_DIR, "config.yaml");
  let userConfig: Partial<Config> = {};

  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf-8");
    userConfig = parseYaml(raw) ?? {};
  }

  const config: Config = {
    dataDir: userConfig.dataDir ?? DEFAULT_CONFIG.dataDir,
    review: { ...DEFAULT_CONFIG.review, ...userConfig.review },
    limits: { ...DEFAULT_CONFIG.limits, ...userConfig.limits },
  };

  for (const sub of ["memory/preferences", "memory/facts", "memory/feedback", "skills", "sessions"]) {
    mkdirSync(join(config.dataDir, sub), { recursive: true });
  }

  return config;
}
