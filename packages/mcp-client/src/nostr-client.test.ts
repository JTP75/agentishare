import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ITransport } from './transport.js';

// Mock ws before importing NostrClient
vi.mock('ws', () => {
  const MockWebSocket = vi.fn().mockImplementation(() => ({
    readyState: 1, // OPEN
    on: vi.fn(),
    send: vi.fn((_data: string, cb?: (err?: Error) => void) => { cb?.(); }),
    close: vi.fn(),
  }));
  (MockWebSocket as unknown as Record<string, number>)['OPEN'] = 1;
  return { default: MockWebSocket, WebSocket: MockWebSocket };
});

const { NostrClient } = await import('./nostr-client.js');

// Relay URL used throughout tests — mirrors the default in config/config.props
const DEFAULT_RELAY_URL = 'wss://nos.lol';

describe('NostrClient satisfies ITransport', () => {
  it('is structurally compatible with ITransport', () => {
    const client: ITransport = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice' });
    expect(client).toBeDefined();
  });
});

describe('NostrClient.isConfigured()', () => {
  it('returns false when no teamId', () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice' });
    expect(c.isConfigured()).toBe(false);
  });

  it('returns false when agentName is empty', () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: '', teamId: 'abc' });
    expect(c.isConfigured()).toBe(false);
  });

  it('returns true when both teamId and agentName are set', () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice', teamId: 'teamabc' });
    expect(c.isConfigured()).toBe(true);
  });
});

describe('NostrClient.configure()', () => {
  it('accepts relayUrl and teamId', () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: '' });
    expect(c.isConfigured()).toBe(false);
    c.configure({ relayUrl: DEFAULT_RELAY_URL, agentName: 'bob', teamId: 'team1' });
    expect(c.isConfigured()).toBe(true);
  });

  it('maps apiKey → teamId for hub-style configure calls', () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: '' });
    c.configure({ relayUrl: DEFAULT_RELAY_URL, agentName: 'carol', apiKey: 'myteamid' });
    expect(c.isConfigured()).toBe(true);
    expect(c.identity().agentName).toBe('carol');
  });

  it('maps hubUrl → relayUrl for hub-style configure calls', () => {
    const c = new NostrClient({ relayUrl: 'wss://old.relay', agentName: 'a', teamId: 't' });
    c.configure({ hubUrl: 'wss://new.relay', agentName: 'a', teamId: 't' });
    expect(c.identity().relayUrl).toBe('wss://new.relay');
  });

  it('preserves existing privateKey when not supplied in opts', () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'a', teamId: 't', privateKey: 'deadbeef' });
    // configure without a privateKey — existing key should be preserved
    c.configure({ relayUrl: DEFAULT_RELAY_URL, agentName: 'a', teamId: 't' });
    // identity() uses ensurePrivkey() — should not generate a new one
    const cfg = c.exportConfig();
    expect(cfg['privateKey']).toBe('deadbeef');
  });
});

describe('NostrClient.identity()', () => {
  it('returns agentName and relayUrl', () => {
    const c = new NostrClient({ relayUrl: 'wss://relay.example.com', agentName: 'alice', teamId: 't' });
    const id = c.identity();
    expect(id.agentName).toBe('alice');
    expect(id.relayUrl).toBe('wss://relay.example.com');
  });

  it('returns a valid hex pubkey', () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice', teamId: 't' });
    const { pubkey } = c.identity();
    expect(pubkey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same pubkey on repeated calls', () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice', teamId: 't' });
    expect(c.identity().pubkey).toBe(c.identity().pubkey);
  });

  it('two clients with different keys have different pubkeys', () => {
    const a = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'a', teamId: 't' });
    const b = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'b', teamId: 't' });
    expect(a.identity().pubkey).not.toBe(b.identity().pubkey);
  });
});

describe('NostrClient.createTeam()', () => {
  it('returns a teamId and apiKey (same value)', async () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice' });
    const result = await c.createTeam();
    expect(result.teamId).toBeTruthy();
    expect(result.apiKey).toBe(result.teamId);
  });

  it('makes the client configured after the call', async () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice' });
    expect(c.isConfigured()).toBe(false);
    await c.createTeam();
    expect(c.isConfigured()).toBe(true);
  });

  it('generates unique teamIds', async () => {
    const ids = await Promise.all(
      Array.from({ length: 5 }, () =>
        new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'a' }).createTeam().then(r => r.teamId)
      )
    );
    expect(new Set(ids).size).toBe(5);
  });
});

describe('NostrClient.flushMessages()', () => {
  it('returns empty array when nothing buffered', () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice', teamId: 't' });
    expect(c.flushMessages()).toEqual([]);
  });

  it('returns empty on second flush (buffer cleared)', () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice', teamId: 't' });
    expect(c.flushMessages()).toEqual([]);
    expect(c.flushMessages()).toEqual([]);
  });
});

describe('NostrClient.exportConfig()', () => {
  it('includes transport: nostr', async () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice' });
    await c.createTeam();
    const cfg = c.exportConfig();
    expect(cfg['transport']).toBe('nostr');
  });

  it('maps teamId → apiKey, relayUrl → hubUrl in exported config', async () => {
    const c = new NostrClient({ relayUrl: 'wss://my.relay', agentName: 'alice' });
    const { teamId } = await c.createTeam();
    const cfg = c.exportConfig();
    expect(cfg['apiKey']).toBe(teamId);
    expect(cfg['hubUrl']).toBe('wss://my.relay');
    expect(cfg['agentName']).toBe('alice');
  });

  it('always includes a privateKey after export', async () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice' });
    await c.createTeam();
    const cfg = c.exportConfig();
    expect(cfg['privateKey']).toMatch(/^[0-9a-f]+$/);
    expect(cfg['privateKey']!.length).toBeGreaterThan(0);
  });

  it('preserves a supplied privateKey', () => {
    const key = 'a'.repeat(64); // fake 64-char hex key
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice', teamId: 'team', privateKey: key });
    const cfg = c.exportConfig();
    expect(cfg['privateKey']).toBe(key);
  });
});

describe('NostrClient.connect()', () => {
  it('does nothing when not configured (no teamId)', () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice' });
    expect(() => c.connect()).not.toThrow();
  });

  it('opens a WebSocket when configured', async () => {
    const { default: WS } = await import('ws');
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice' });
    await c.createTeam();
    c.connect();
    expect(WS).toHaveBeenCalledWith(DEFAULT_RELAY_URL);
  });
});

describe('NostrClient.listAgents()', () => {
  it('returns empty array before any events arrive', async () => {
    const c = new NostrClient({ relayUrl: DEFAULT_RELAY_URL, agentName: 'alice', teamId: 't' });
    const agents = await c.listAgents();
    expect(agents).toEqual([]);
  });
});
