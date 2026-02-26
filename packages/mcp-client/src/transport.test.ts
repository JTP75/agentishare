import { describe, it, expect } from 'vitest';
import { HubClient } from './hub-client.js';
import type { ITransport } from './transport.js';

describe('HubClient satisfies ITransport', () => {
  it('is structurally compatible with ITransport', () => {
    const client: ITransport = new HubClient({
      hubUrl: 'http://localhost:3000',
      apiKey: 'test-key',
      agentName: 'test-agent',
    });
    expect(client).toBeDefined();
  });
});

describe('HubClient.isConfigured()', () => {
  it('returns true when apiKey and agentName are set', () => {
    const client = new HubClient({ hubUrl: 'http://localhost:3000', apiKey: 'key', agentName: 'agent' });
    expect(client.isConfigured()).toBe(true);
  });

  it('returns false when apiKey is empty', () => {
    const client = new HubClient({ hubUrl: 'http://localhost:3000', apiKey: '', agentName: 'agent' });
    expect(client.isConfigured()).toBe(false);
  });

  it('returns false when agentName is empty', () => {
    const client = new HubClient({ hubUrl: 'http://localhost:3000', apiKey: 'key', agentName: '' });
    expect(client.isConfigured()).toBe(false);
  });

  it('returns false when both are empty', () => {
    const client = new HubClient({ hubUrl: 'http://localhost:3000', apiKey: '', agentName: '' });
    expect(client.isConfigured()).toBe(false);
  });
});

describe('HubClient.identity()', () => {
  it('returns agentName and hubUrl', () => {
    const client = new HubClient({ hubUrl: 'http://hub.example.com', apiKey: 'key', agentName: 'alice' });
    expect(client.identity()).toEqual({ agentName: 'alice', hubUrl: 'http://hub.example.com' });
  });
});

describe('HubClient.configure()', () => {
  it('updates agentName and isConfigured state', () => {
    const client = new HubClient({ hubUrl: 'http://localhost:3000', apiKey: '', agentName: '' });
    expect(client.isConfigured()).toBe(false);
    client.configure({ hubUrl: 'http://localhost:3000', apiKey: 'new-key', agentName: 'bob' });
    expect(client.isConfigured()).toBe(true);
    expect(client.identity()).toMatchObject({ agentName: 'bob' });
  });

  it('updates hubUrl in identity after configure', () => {
    const client = new HubClient({ hubUrl: 'http://old.example.com', apiKey: 'key', agentName: 'agent' });
    client.configure({ hubUrl: 'http://new.example.com', apiKey: 'key', agentName: 'agent' });
    expect(client.identity()).toMatchObject({ hubUrl: 'http://new.example.com' });
  });
});

describe('HubClient.flushMessages()', () => {
  it('returns empty array when no messages buffered', () => {
    const client = new HubClient({ hubUrl: 'http://localhost:3000', apiKey: 'key', agentName: 'agent' });
    expect(client.flushMessages()).toEqual([]);
  });

  it('returns empty array on second call (buffer cleared)', () => {
    const client = new HubClient({ hubUrl: 'http://localhost:3000', apiKey: 'key', agentName: 'agent' });
    expect(client.flushMessages()).toEqual([]);
    expect(client.flushMessages()).toEqual([]);
  });
});

describe('HubClient.exportConfig()', () => {
  it('returns apiKey, agentName, hubUrl', () => {
    const client = new HubClient({ hubUrl: 'http://hub.example.com', apiKey: 'mykey', agentName: 'alice' });
    expect(client.exportConfig()).toEqual({ apiKey: 'mykey', agentName: 'alice', hubUrl: 'http://hub.example.com' });
  });

  it('reflects updated config after configure()', () => {
    const client = new HubClient({ hubUrl: 'http://old', apiKey: 'old', agentName: 'old' });
    client.configure({ hubUrl: 'http://new', apiKey: 'new', agentName: 'new' });
    expect(client.exportConfig()).toEqual({ apiKey: 'new', agentName: 'new', hubUrl: 'http://new' });
  });
});
