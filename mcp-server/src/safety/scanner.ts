export interface ScanResult {
  safe: boolean;
  threats: Array<{ type: string; pattern: string; match: string; line: number }>;
}

const THREAT_PATTERNS: Array<{ pattern: RegExp; type: string; description: string }> = [
  // Prompt injection
  { pattern: /ignore\s+(previous|all|above|prior)\s+instructions/i, type: "prompt_injection", description: "Attempts to override system instructions" },
  { pattern: /system\s+prompt\s+override/i, type: "prompt_injection", description: "Attempts to override system prompt" },
  { pattern: /you\s+are\s+now\s+/i, type: "prompt_injection", description: "Attempts to redefine agent identity" },
  { pattern: /do\s+not\s+tell\s+the\s+user/i, type: "deception", description: "Attempts to hide information from user" },

  // Command injection — only match shell execution patterns, not markdown code fences
  { pattern: /\$\([^)]+\)/, type: "command_substitution", description: "Shell command substitution" },
  { pattern: /;\s*(rm|curl|wget|nc|bash|sh|eval)\s/i, type: "command_chain", description: "Chained shell command execution" },

  // Exfiltration
  { pattern: /curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, type: "exfil_curl", description: "Curl with sensitive variable" },
  { pattern: /cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass|\.ssh)/i, type: "read_secrets", description: "Reading secret files" },
  { pattern: /wget\s+.*\|\s*(bash|sh)/i, type: "remote_exec", description: "Remote script execution" },

  // Hidden content
  { pattern: /[\u200B-\u200F\u2028-\u202F\uFEFF]/, type: "hidden_unicode", description: "Invisible unicode characters" },
];

export function scanContent(content: string): ScanResult {
  const threats: ScanResult["threats"] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, type } of THREAT_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        threats.push({
          type,
          pattern: pattern.source,
          match: match[0].slice(0, 100),
          line: i + 1,
        });
      }
    }
  }

  return { safe: threats.length === 0, threats };
}

export function formatScanReport(result: ScanResult): string {
  if (result.safe) return "Security scan: PASS";
  const lines = ["Security scan: BLOCKED", ""];
  for (const t of result.threats) {
    lines.push(`- [${t.type}] line ${t.line}: "${t.match}"`);
  }
  return lines.join("\n");
}
