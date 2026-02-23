import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigLoader } from './loader.js';

function writeProps(dir: string, name: string, content: string) {
  fs.writeFileSync(path.join(dir, name), content, 'utf-8');
}

describe('ConfigLoader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
    vi.restoreAllMocks();
  });

  it('loads base config values', () => {
    writeProps(tmpDir, 'config.props', '[server]\nport=3000\nhost=0.0.0.0\n');
    const cfg = new ConfigLoader(undefined, tmpDir);
    expect(cfg.get('server', 'port', 0)).toBe(3000);
    expect(cfg.get('server', 'host', '')).toBe('0.0.0.0');
  });

  it('env override replaces base values', () => {
    writeProps(tmpDir, 'config.props', '[server]\nport=3000\n');
    writeProps(tmpDir, 'config.dev.props', '[server]\nport=4000\n');
    const cfg = new ConfigLoader('dev', tmpDir);
    expect(cfg.get('server', 'port', 0)).toBe(4000);
  });

  it('env override only replaces specified keys, not whole section', () => {
    writeProps(tmpDir, 'config.props', '[server]\nport=3000\nhost=0.0.0.0\n');
    writeProps(tmpDir, 'config.dev.props', '[server]\nport=4000\n');
    const cfg = new ConfigLoader('dev', tmpDir);
    expect(cfg.get('server', 'port', 0)).toBe(4000);
    expect(cfg.get('server', 'host', '')).toBe('0.0.0.0'); // retained from base
  });

  it('returns fallback when key is missing', () => {
    writeProps(tmpDir, 'config.props', '[server]\n');
    const cfg = new ConfigLoader(undefined, tmpDir);
    expect(cfg.get('server', 'port', 9999)).toBe(9999);
  });

  it('returns fallback when section is missing', () => {
    writeProps(tmpDir, 'config.props', '');
    const cfg = new ConfigLoader(undefined, tmpDir);
    expect(cfg.get('missing', 'key', 'default')).toBe('default');
  });

  it('resolves ${ENV_VAR} placeholders from process.env', () => {
    writeProps(tmpDir, 'config.props', '[auth]\ntoken_secret=${MY_SECRET}\n');
    vi.stubEnv('MY_SECRET', 'supersecret');
    const cfg = new ConfigLoader(undefined, tmpDir);
    expect(cfg.get('auth', 'token_secret', '')).toBe('supersecret');
  });

  it('returns fallback when ${ENV_VAR} is not set', () => {
    writeProps(tmpDir, 'config.props', '[auth]\ntoken_secret=${UNSET_VAR}\n');
    delete process.env['UNSET_VAR'];
    const cfg = new ConfigLoader(undefined, tmpDir);
    expect(cfg.get('auth', 'token_secret', 'fallback')).toBe('fallback');
  });

  it('does not throw if env override file does not exist', () => {
    writeProps(tmpDir, 'config.props', '[server]\nport=3000\n');
    expect(() => new ConfigLoader('nonexistent', tmpDir)).not.toThrow();
  });

  it('coerces values to number when fallback is a number', () => {
    writeProps(tmpDir, 'config.props', '[rate_limit]\nmax_requests=500\n');
    const cfg = new ConfigLoader(undefined, tmpDir);
    const val = cfg.get<number>('rate_limit', 'max_requests', 100);
    expect(val).toBe(500);
    expect(typeof val).toBe('number');
  });

  it('coerces values to boolean when fallback is a boolean', () => {
    writeProps(tmpDir, 'config.props', '[flags]\nenabled=true\n');
    const cfg = new ConfigLoader(undefined, tmpDir);
    const val = cfg.get<boolean>('flags', 'enabled', false);
    expect(val).toBe(true);
    expect(typeof val).toBe('boolean');
  });
});
