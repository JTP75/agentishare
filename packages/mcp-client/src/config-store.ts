import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface StoredConfig {
  apiKey: string;
  agentName: string;
  hubUrl: string;
}

function configPath(): string {
  return join(homedir(), '.config', 'agent-hub', 'config.json');
}

export function loadConfig(): StoredConfig | null {
  try {
    const raw = readFileSync(configPath(), 'utf-8');
    return JSON.parse(raw) as StoredConfig;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: StoredConfig): void {
  const dir = join(homedir(), '.config', 'agent-hub');
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf-8');
}
