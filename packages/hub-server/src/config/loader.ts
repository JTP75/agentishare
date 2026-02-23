import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ini from 'ini';

type IniSection = Record<string, string | boolean | number>;
type IniConfig = Record<string, IniSection>;

export class ConfigLoader {
  private config: IniConfig;

  constructor(env?: string, configDir?: string) {
    const dir = configDir ?? this.resolveConfigDir();

    const base = this.readFile(path.join(dir, 'config.props'));
    const override = env ? this.readFile(path.join(dir, `config.${env}.props`)) : {};

    this.config = this.deepMerge(base, override);
  }

  get<T extends string | number | boolean = string>(
    section: string,
    key: string,
    fallback?: T
  ): T {
    const sectionData = this.config[section];
    if (!sectionData) return fallback as T;

    const raw = sectionData[key];
    if (raw === undefined || raw === '') return fallback as T;

    // ini may parse `true`/`false` as actual booleans — normalise to string first
    const rawStr = String(raw);

    // Resolve ${ENV_VAR} placeholders
    if (rawStr.startsWith('${') && rawStr.endsWith('}')) {
      const envKey = rawStr.slice(2, -1);
      const resolved = process.env[envKey];
      if (resolved === undefined) return fallback as T;
      return this.coerce<T>(resolved, fallback);
    }

    return this.coerce<T>(rawStr, fallback);
  }

  private coerce<T>(value: string, fallback?: T): T {
    if (typeof fallback === 'number') return Number(value) as T;
    if (typeof fallback === 'boolean') return (value === 'true') as T;
    return value as T;
  }

  private resolveConfigDir(): string {
    // Works in both tsx (src/) and compiled (dist/) contexts:
    //   src/config/ → src/ → hub-server/ → packages/ → repo root
    //   dist/config/ → dist/ → hub-server/ → packages/ → repo root
    const __filename = fileURLToPath(import.meta.url);
    return path.resolve(path.dirname(__filename), '..', '..', '..', '..', 'config');
  }

  private readFile(filePath: string): IniConfig {
    if (!fs.existsSync(filePath)) return {};
    return ini.parse(fs.readFileSync(filePath, 'utf-8')) as IniConfig;
  }

  private deepMerge(base: IniConfig, override: IniConfig): IniConfig {
    const result: IniConfig = { ...base };
    for (const section of Object.keys(override)) {
      result[section] = { ...(base[section] ?? {}), ...override[section] };
    }
    return result;
  }
}
