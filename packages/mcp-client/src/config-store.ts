import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface StoredConfig {
  apiKey: string;
  agentName: string;
  hubUrl: string;
  transport?: 'hub' | 'nostr';
  privateKey?: string; // nostr only: hex-encoded secp256k1 private key
}

interface WorkspacesConfig {
  [workspacePath: string]: StoredConfig;
}

function configPath(): string {
  return join(homedir(), '.config', 'agent-hub', 'config.json');
}

export function loadConfig(workspace: string = process.cwd()): StoredConfig | null {
  try {
    const raw = readFileSync(configPath(), 'utf-8');
    const all = JSON.parse(raw) as WorkspacesConfig;
    return all[workspace] ?? null;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: StoredConfig, workspace: string = process.cwd()): void {
  const dir = join(homedir(), '.config', 'agent-hub');
  mkdirSync(dir, { recursive: true });
  let all: WorkspacesConfig = {};
  try {
    const raw = readFileSync(configPath(), 'utf-8');
    all = JSON.parse(raw) as WorkspacesConfig;
  } catch { /* first write */ }
  all[workspace] = cfg;
  writeFileSync(configPath(), JSON.stringify(all, null, 2), 'utf-8');
}
