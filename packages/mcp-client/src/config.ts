import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ini from 'ini';

type IniSection = Record<string, string | boolean | number>;
type IniConfig = Record<string, IniSection>;

let _config: IniConfig | undefined;

function loadConfig(): IniConfig {
  if (_config) return _config;
  try {
    const __filename = fileURLToPath(import.meta.url);
    // src/config.ts → src/ → mcp-client/ → packages/ → repo root → config/
    const configPath = path.resolve(path.dirname(__filename), '..', '..', '..', 'config', 'config.props');
    _config = fs.existsSync(configPath)
      ? (ini.parse(fs.readFileSync(configPath, 'utf-8')) as IniConfig)
      : {};
  } catch {
    _config = {};
  }
  return _config;
}

export function getConfig<T extends string | number = string>(
  section: string,
  key: string,
  fallback: T,
): T {
  const cfg = loadConfig();
  const raw = cfg[section]?.[key];
  if (raw === undefined || raw === '') return fallback;
  if (typeof fallback === 'number') return Number(raw) as T;
  return String(raw) as T;
}
