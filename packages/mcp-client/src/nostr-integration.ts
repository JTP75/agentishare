#!/usr/bin/env node
/**
 * Nostr transport integration tests — runs against a live relay.
 *
 * Usage:
 *   npm run test:integration -w packages/mcp-client
 *
 * Env vars:
 *   RELAY_URL=wss://...   override default relay (default: wss://relay.nostr.band)
 *   DELIVERY_WAIT=8000    ms to wait for relay to deliver events (default: 6000)
 *   CONNECT_WAIT=2000     ms to wait for WebSocket handshake (default: 2000)
 *
 * Alternative relays to try if the default fails:
 *   wss://nos.lol
 *   wss://relay.damus.io
 *   wss://nostr.mom
 */

import WebSocket from 'ws';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { NostrClient } from './nostr-client.js';

const RELAY         = process.env['RELAY_URL']      ?? 'wss://relay.nostr.band';
const DELIVERY_WAIT = Number(process.env['DELIVERY_WAIT'] ?? '6000');
const CONNECT_WAIT  = Number(process.env['CONNECT_WAIT']  ?? '2000');

// ─── helpers ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assert: ${msg}`);
}

function log(msg: string): void {
  console.log(msg);
}

// ─── test runner ─────────────────────────────────────────────────────────────

interface TestResult { name: string; ok: boolean; ms: number; err?: string; }
const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  log(`\n┌─ ${name}`);
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    log(`└─ ✓ PASS (${ms}ms)`);
    results.push({ name, ok: true, ms });
  } catch (err) {
    const ms = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    log(`└─ ✗ FAIL (${ms}ms)`);
    log(`   ${error}`);
    results.push({ name, ok: false, ms, err: error });
  }
}

// ─── banner ──────────────────────────────────────────────────────────────────

log('\n' + '═'.repeat(62));
log(' Nostr Transport — Integration Tests');
log('═'.repeat(62));
log(` Relay:         ${RELAY}`);
log(` Delivery wait: ${DELIVERY_WAIT}ms`);
log(` Connect wait:  ${CONNECT_WAIT}ms`);
log('═'.repeat(62));

// ─── TEST 1: raw WebSocket connectivity ──────────────────────────────────────

await test('1. Raw WebSocket connectivity', async () => {
  log(`│  Opening WebSocket to ${RELAY} ...`);
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(RELAY);
    const t = setTimeout(() => {
      ws.close();
      reject(new Error('No open event within 5s — relay may be down or unreachable'));
    }, 5000);
    ws.on('open', () => {
      log(`│  ← WebSocket open`);
      clearTimeout(t);
      ws.close();
      resolve();
    });
    ws.on('error', e => { clearTimeout(t); reject(new Error(`WebSocket error: ${(e as Error).message}`)); });
  });
});

// ─── TEST 2: relay responds to REQ with EOSE ─────────────────────────────────

await test('2. Relay handles REQ and returns EOSE', async () => {
  const subId = 'itest-' + Math.random().toString(36).slice(2, 8);
  let gotEose = false;

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(RELAY);
    const t = setTimeout(() => {
      ws.close();
      reject(new Error(`No EOSE within ${DELIVERY_WAIT}ms — relay may not support subscriptions or is requiring auth`));
    }, DELIVERY_WAIT);

    ws.on('open', () => {
      const req = JSON.stringify(['REQ', subId, { kinds: [1337, 1338], limit: 0 }]);
      log(`│  → ${req}`);
      ws.send(req);
    });

    ws.on('message', (data: Buffer) => {
      const raw = data.toString();
      const msg = JSON.parse(raw) as unknown[];
      log(`│  ← ${raw.slice(0, 120)}`);

      if (msg[0] === 'NOTICE') {
        log(`│    (relay NOTICE — informational, not a failure)`);
      }
      if (msg[0] === 'AUTH') {
        clearTimeout(t); ws.close();
        reject(new Error(`Relay requires NIP-42 auth. Try: RELAY_URL=wss://nos.lol`));
      }
      if (msg[0] === 'EOSE' && msg[1] === subId) {
        gotEose = true;
        ws.send(JSON.stringify(['CLOSE', subId]));
        clearTimeout(t); ws.close(); resolve();
      }
    });

    ws.on('error', e => { clearTimeout(t); reject(new Error(`WebSocket error: ${(e as Error).message}`)); });
  });

  assert(gotEose, 'EOSE not received');
});

// ─── TEST 3: relay accepts EVENT with kind 1337 ───────────────────────────────

await test('3. Relay accepts EVENT publication (kind 1337)', async () => {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  log(`│  Signing pubkey: ${pk.slice(0, 16)}...`);

  const event = finalizeEvent({
    kind: 1337,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['t', 'agentishare-itest-' + Math.random().toString(36).slice(2)]],
    content: 'integration test probe',
  }, sk);

  log(`│  Event ID: ${event.id.slice(0, 16)}...`);
  log(`│  Sig:      ${event.sig.slice(0, 16)}...`);

  let accepted = false;
  let okReason = '';

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(RELAY);
    const t = setTimeout(() => {
      ws.close();
      reject(new Error(`No OK within ${DELIVERY_WAIT}ms — relay may not send NIP-20 acknowledgements, or dropped the connection`));
    }, DELIVERY_WAIT);

    ws.on('open', () => {
      log(`│  → EVENT kind=1337`);
      ws.send(JSON.stringify(['EVENT', event]));
    });

    ws.on('message', (data: Buffer) => {
      const raw = data.toString();
      const msg = JSON.parse(raw) as unknown[];
      log(`│  ← ${raw.slice(0, 120)}`);
      if (msg[0] === 'OK' && msg[1] === event.id) {
        accepted  = msg[2] as boolean;
        okReason  = (msg[3] as string) ?? '';
        clearTimeout(t); ws.close(); resolve();
      }
    });

    ws.on('error', e => { clearTimeout(t); reject(new Error(`WebSocket error: ${(e as Error).message}`)); });
  });

  if (!accepted) {
    throw new Error(
      `Relay rejected the event: "${okReason}". ` +
      `The relay may block custom kinds. Try: RELAY_URL=wss://nos.lol`
    );
  }
  log(`│  Accepted — reason: "${okReason || 'none'}"`);
});

// ─── TEST 4: NostrClient.createTeam() state transitions ──────────────────────

let sharedTeamId = ''; // shared between tests that only need one client

await test('4. NostrClient.createTeam() — state transitions', async () => {
  const client = new NostrClient({ relayUrl: RELAY, agentName: 'alice' });

  log(`│  isConfigured() before: ${client.isConfigured()}`);
  assert(!client.isConfigured(), 'Should be unconfigured before createTeam()');

  const { teamId, apiKey } = await client.createTeam();
  sharedTeamId = teamId;

  log(`│  teamId:       ${teamId}`);
  log(`│  apiKey:       ${apiKey}`);
  log(`│  isConfigured() after: ${client.isConfigured()}`);

  assert(client.isConfigured(), 'Should be configured after createTeam()');
  assert(teamId === apiKey, 'teamId and apiKey should be the same value');
  assert(teamId.length >= 16, `teamId too short: "${teamId}"`);
  assert(/^[0-9a-f]+$/.test(teamId), `teamId is not hex: "${teamId}"`);

  const { pubkey, agentName, relayUrl } = client.identity();
  log(`│  identity.agentName: ${agentName}`);
  log(`│  identity.pubkey:    ${pubkey.slice(0, 16)}...`);
  log(`│  identity.relayUrl:  ${relayUrl}`);
  assert(/^[0-9a-f]{64}$/.test(pubkey), `pubkey should be 64-char hex, got: ${pubkey}`);
  assert(agentName === 'alice', `Expected agentName=alice, got ${agentName}`);
  assert(relayUrl === RELAY, `Expected relayUrl=${RELAY}, got ${relayUrl}`);

  const cfg = client.exportConfig();
  log(`│  exportConfig: transport=${cfg['transport']}, privateKey=${cfg['privateKey']?.slice(0, 8)}...`);
  assert(cfg['transport'] === 'nostr', `Expected transport=nostr, got ${cfg['transport']}`);
  assert(!!cfg['privateKey'], 'exportConfig should include privateKey');
  assert(cfg['apiKey'] === teamId, 'exportConfig.apiKey should equal teamId');
  assert(cfg['hubUrl'] === RELAY, 'exportConfig.hubUrl should be relay URL');
});

// ─── TEST 5: Single client connect() ─────────────────────────────────────────

await test('5. Single client: connect() opens relay connection', async () => {
  const client = new NostrClient({ relayUrl: RELAY, agentName: 'solo', teamId: sharedTeamId });
  log(`│  Calling connect()...`);
  client.connect();

  log(`│  Waiting ${CONNECT_WAIT}ms for WebSocket handshake and subscription...`);
  await sleep(CONNECT_WAIT);

  log(`│  flushMessages(): ${client.flushMessages().length} message(s) (expected 0 — no senders)`);
  client.close();
  log(`│  close() called`);
});

// ─── TEST 6: Two clients, presence discovery ──────────────────────────────────
// Each multi-client test creates its own fresh teamId to avoid cross-test event pollution.

await test('6. Two clients: presence discovery via kind-1338 events', async () => {
  const alice = new NostrClient({ relayUrl: RELAY, agentName: 'alice' });
  const { teamId } = await alice.createTeam();
  const bob = new NostrClient({ relayUrl: RELAY, agentName: 'bob', teamId });

  log(`│  Fresh teamId: ${teamId}`);
  log(`│  Alice pubkey: ${alice.identity().pubkey.slice(0, 16)}...`);
  log(`│  Bob pubkey:   ${bob.identity().pubkey.slice(0, 16)}...`);

  alice.connect();
  bob.connect();
  log(`│  Both connected. Waiting ${DELIVERY_WAIT}ms for presence events...`);
  await sleep(DELIVERY_WAIT);

  const aliceAgents = await alice.listAgents();
  const bobAgents   = await bob.listAgents();

  log(`│  Alice sees: [${aliceAgents.map(a => a.name).join(', ')}]`);
  log(`│  Bob sees:   [${bobAgents.map(a => a.name).join(', ')}]`);

  assert(
    bobAgents.some(a => a.name === 'alice'),
    `Bob does not see alice. Bob sees: [${bobAgents.map(a => a.name).join(', ')}]`
  );
  assert(
    aliceAgents.some(a => a.name === 'bob'),
    `Alice does not see bob. Alice sees: [${aliceAgents.map(a => a.name).join(', ')}]`
  );

  alice.close();
  bob.close();
});

// ─── TEST 7: Direct message delivery ─────────────────────────────────────────

await test('7. Direct message delivery: alice → bob', async () => {
  const alice = new NostrClient({ relayUrl: RELAY, agentName: 'alice' });
  const { teamId } = await alice.createTeam();
  const bob = new NostrClient({ relayUrl: RELAY, agentName: 'bob', teamId });

  log(`│  Fresh teamId: ${teamId}`);
  alice.connect();
  bob.connect();
  log(`│  Waiting ${CONNECT_WAIT}ms for subscriptions to settle...`);
  await sleep(CONNECT_WAIT);

  log(`│  Alice → send('bob', 'question', 'hello bob')`);
  const result = await alice.send('bob', 'question', 'hello bob');
  log(`│  send() returned: ok=${result.ok}, messageId=${result.messageId.slice(0, 16)}...`);
  assert(result.ok, 'send() returned ok: false');
  assert(result.messageId.length === 64, `messageId should be 64-char hex, got length ${result.messageId.length}`);

  log(`│  Waiting ${DELIVERY_WAIT}ms for relay delivery...`);
  await sleep(DELIVERY_WAIT);

  const msgs = bob.flushMessages();
  log(`│  Bob received ${msgs.length} message(s)`);
  msgs.forEach(m => log(`│    { from: ${m.from}, to: ${m.to}, type: ${m.type}, content: "${m.content}" }`));

  assert(msgs.length > 0,
    `Bob received 0 messages after ${DELIVERY_WAIT}ms. ` +
    `Relay may not be storing kind 1337 events, or DELIVERY_WAIT is too short. ` +
    `Try: DELIVERY_WAIT=12000 or RELAY_URL=wss://nos.lol`
  );
  assert(msgs[0].from === 'alice',   `Expected from=alice, got from=${msgs[0].from}`);
  assert(msgs[0].to === 'bob',       `Expected to=bob, got to=${msgs[0].to}`);
  assert(msgs[0].type === 'question', `Expected type=question, got type=${msgs[0].type}`);
  assert(msgs[0].content === 'hello bob', `Expected content="hello bob", got "${msgs[0].content}"`);
  assert(/^[0-9a-f]{64}$/.test(msgs[0].id), `Message id should be 64-char hex`);
  assert(msgs[0].timestamp > 0, 'Message timestamp should be positive');

  alice.close();
  bob.close();
});

// ─── TEST 8: Broadcast delivery ──────────────────────────────────────────────

await test('8. Broadcast delivery: alice → all', async () => {
  const alice = new NostrClient({ relayUrl: RELAY, agentName: 'alice' });
  const { teamId } = await alice.createTeam();
  const bob = new NostrClient({ relayUrl: RELAY, agentName: 'bob', teamId });

  log(`│  Fresh teamId: ${teamId}`);
  alice.connect();
  bob.connect();
  await sleep(CONNECT_WAIT);

  log(`│  Alice → send('broadcast', 'decision', 'team announcement')`);
  const result = await alice.send('broadcast', 'decision', 'team announcement');
  log(`│  send() returned: ok=${result.ok}`);

  log(`│  Waiting ${DELIVERY_WAIT}ms for relay delivery...`);
  await sleep(DELIVERY_WAIT);

  const bobMsgs = bob.flushMessages();
  log(`│  Bob inbox: ${bobMsgs.length} message(s)`);
  bobMsgs.forEach(m => log(`│    { from: ${m.from}, to: ${m.to}, type: ${m.type}, content: "${m.content}" }`));

  assert(bobMsgs.length > 0, `Bob received 0 broadcast messages after ${DELIVERY_WAIT}ms`);
  assert(bobMsgs.some(m => m.to === 'broadcast'), 'Expected a message with to=broadcast');
  assert(bobMsgs.some(m => m.content === 'team announcement'), 'Expected content="team announcement"');

  alice.close();
  bob.close();
});

// ─── TEST 9: Message isolation ────────────────────────────────────────────────

await test('9. Message isolation: alice → charlie (bob must not receive)', async () => {
  const alice = new NostrClient({ relayUrl: RELAY, agentName: 'alice' });
  const { teamId } = await alice.createTeam();
  const bob = new NostrClient({ relayUrl: RELAY, agentName: 'bob', teamId });

  log(`│  Fresh teamId: ${teamId}`);
  alice.connect();
  bob.connect();
  await sleep(CONNECT_WAIT);

  log(`│  Alice → send('charlie', 'todo', 'for charlie only')`);
  await alice.send('charlie', 'todo', 'for charlie only');

  log(`│  Waiting ${DELIVERY_WAIT}ms...`);
  await sleep(DELIVERY_WAIT);

  const bobMsgs = bob.flushMessages();
  log(`│  Bob inbox: ${bobMsgs.length} message(s) (expected 0)`);

  assert(
    bobMsgs.length === 0,
    `Bob received ${bobMsgs.length} message(s) that were addressed to charlie — filtering is broken`
  );

  alice.close();
  bob.close();
});

// ─── TEST 10: flushMessages clears buffer ─────────────────────────────────────

await test('10. flushMessages() drains buffer (idempotent on second call)', async () => {
  const alice = new NostrClient({ relayUrl: RELAY, agentName: 'alice' });
  const { teamId } = await alice.createTeam();
  const bob = new NostrClient({ relayUrl: RELAY, agentName: 'bob', teamId });

  log(`│  Fresh teamId: ${teamId}`);
  alice.connect();
  bob.connect();
  await sleep(CONNECT_WAIT);

  await alice.send('bob', 'api_spec', 'payload');
  log(`│  Waiting ${DELIVERY_WAIT}ms for delivery...`);
  await sleep(DELIVERY_WAIT);

  const first  = bob.flushMessages();
  const second = bob.flushMessages();

  log(`│  First flush:  ${first.length} message(s)`);
  log(`│  Second flush: ${second.length} message(s)`);

  assert(first.length > 0,   `First flush returned 0 — message not delivered within ${DELIVERY_WAIT}ms`);
  assert(second.length === 0, `Second flush should be empty, got ${second.length}`);

  alice.close();
  bob.close();
});

// ─── TEST 11: joiner uses configure() path (exact index.ts sequence) ─────────
// The existing tests bypass configure() and pass teamId directly to the constructor.
// This test replicates what agent_hub_setup_join does step-by-step.

await test('11. Joiner path: configure() → exportConfig() → connect() sequence', async () => {
  // Step 1: creator creates team (simulates agent_hub_setup_create)
  const alice = new NostrClient({ relayUrl: RELAY, agentName: 'alice' });
  const { teamId } = await alice.createTeam();
  alice.connect();
  log(`│  Alice created team ${teamId.slice(0, 12)}... and connected`);
  await sleep(CONNECT_WAIT);

  // Step 2: joiner starts unconfigured (as index.ts initialises hub)
  const bob = new NostrClient({ relayUrl: RELAY, agentName: '' });
  log(`│  Bob starts unconfigured: isConfigured=${bob.isConfigured()}`);
  assert(!bob.isConfigured(), 'Bob should be unconfigured before configure()');

  // Step 3: configure() called (simulates agent_hub_setup_join)
  bob.configure({ relayUrl: RELAY, agentName: 'bob', teamId });
  log(`│  After configure(): isConfigured=${bob.isConfigured()}, relayUrl=${bob.identity().relayUrl}`);
  assert(bob.isConfigured(), 'Bob should be configured after configure()');
  assert(bob.identity().relayUrl === RELAY, `relayUrl mismatch: got ${bob.identity().relayUrl}`);
  assert(bob.identity().agentName === 'bob', `agentName mismatch: got ${bob.identity().agentName}`);

  // Step 4: exportConfig() then connect() (saveConfig skipped — not needed for test)
  const cfg = bob.exportConfig();
  log(`│  exportConfig(): transport=${cfg['transport']}, hasPrivateKey=${!!cfg['privateKey']}, apiKey=${cfg['apiKey']?.slice(0,12)}...`);
  assert(cfg['transport'] === 'nostr', `Expected transport=nostr, got ${cfg['transport']}`);
  assert(cfg['apiKey'] === teamId, `exportConfig.apiKey should be teamId`);
  assert(!!cfg['privateKey'], 'exportConfig should include a privateKey');

  bob.connect();
  log(`│  Bob connect() called`);
  await sleep(CONNECT_WAIT);

  // Step 5: Alice sends to Bob — this is the message Bob must receive
  log(`│  Alice → send('bob', 'question', 'can you hear me?')`);
  const r = await alice.send('bob', 'question', 'can you hear me?');
  log(`│  send() ok=${r.ok}, messageId=${r.messageId.slice(0,16)}...`);
  assert(r.ok, 'Alice send() failed');

  log(`│  Waiting ${DELIVERY_WAIT}ms for delivery...`);
  await sleep(DELIVERY_WAIT);

  const msgs = bob.flushMessages();
  log(`│  Bob received ${msgs.length} message(s)`);
  msgs.forEach(m => log(`│    { from: ${m.from}, to: ${m.to}, content: "${m.content}" }`));
  assert(msgs.length > 0,   'Bob (configure path) received 0 messages — joiner subscription not working');
  assert(msgs[0].from === 'alice', `Expected from=alice, got ${msgs[0].from}`);
  assert(msgs[0].content === 'can you hear me?', `Unexpected content: ${msgs[0].content}`);

  alice.close();
  bob.close();
});

// ─── TEST 12: joiner → creator (reverse direction) ───────────────────────────

await test('12. Reverse direction: joiner (bob) → creator (alice)', async () => {
  const alice = new NostrClient({ relayUrl: RELAY, agentName: 'alice' });
  const { teamId } = await alice.createTeam();
  alice.connect();
  log(`│  Alice created team and connected`);

  // Bob joins via configure() path
  const bob = new NostrClient({ relayUrl: RELAY, agentName: '' });
  bob.configure({ relayUrl: RELAY, agentName: 'bob', teamId });
  bob.exportConfig(); // triggers ensurePrivkey() so Bob has a key
  bob.connect();
  log(`│  Bob configured and connected`);

  await sleep(CONNECT_WAIT);
  log(`│  Bob pubkey: ${bob.identity().pubkey.slice(0,16)}...`);

  log(`│  Bob → send('alice', 'file_change', 'reply from bob')`);
  const r = await bob.send('alice', 'file_change', 'reply from bob');
  log(`│  send() ok=${r.ok}, messageId=${r.messageId.slice(0,16)}...`);
  assert(r.ok, 'Bob send() failed');

  log(`│  Waiting ${DELIVERY_WAIT}ms for delivery...`);
  await sleep(DELIVERY_WAIT);

  const msgs = alice.flushMessages();
  log(`│  Alice received ${msgs.length} message(s)`);
  msgs.forEach(m => log(`│    { from: ${m.from}, to: ${m.to}, type: ${m.type}, content: "${m.content}" }`));
  assert(msgs.length > 0,   'Alice received 0 messages from joiner Bob — reverse direction broken');
  assert(msgs[0].from === 'bob',   `Expected from=bob, got ${msgs[0].from}`);
  assert(msgs[0].to === 'alice',   `Expected to=alice, got ${msgs[0].to}`);
  assert(msgs[0].type === 'file_change', `Expected type=file_change, got ${msgs[0].type}`);

  alice.close();
  bob.close();
});

// ─── TEST 13: joiner broadcasts ──────────────────────────────────────────────

await test('13. Joiner broadcast: bob → all (alice must receive)', async () => {
  const alice = new NostrClient({ relayUrl: RELAY, agentName: 'alice' });
  const { teamId } = await alice.createTeam();
  alice.connect();

  const bob = new NostrClient({ relayUrl: RELAY, agentName: '' });
  bob.configure({ relayUrl: RELAY, agentName: 'bob', teamId });
  bob.exportConfig();
  bob.connect();

  log(`│  Both connected. Waiting ${CONNECT_WAIT}ms...`);
  await sleep(CONNECT_WAIT);

  log(`│  Bob → send('broadcast', 'decision', 'joiner broadcast')`);
  const r = await bob.send('broadcast', 'decision', 'joiner broadcast');
  log(`│  send() ok=${r.ok}`);
  assert(r.ok, 'Bob broadcast send() failed');

  await sleep(DELIVERY_WAIT);

  const aliceMsgs = alice.flushMessages();
  log(`│  Alice inbox: ${aliceMsgs.length} message(s)`);
  aliceMsgs.forEach(m => log(`│    { from: ${m.from}, to: ${m.to}, content: "${m.content}" }`));
  assert(aliceMsgs.length > 0, 'Alice received 0 messages from joiner broadcast');
  assert(aliceMsgs[0].to === 'broadcast', `Expected to=broadcast, got ${aliceMsgs[0].to}`);
  assert(aliceMsgs[0].from === 'bob', `Expected from=bob, got ${aliceMsgs[0].from}`);

  alice.close();
  bob.close();
});

// ─── TEST 14: simultaneous bidirectional messaging ───────────────────────────

await test('14. Simultaneous bidirectional: alice→bob and bob→alice at the same time', async () => {
  const alice = new NostrClient({ relayUrl: RELAY, agentName: 'alice' });
  const { teamId } = await alice.createTeam();
  alice.connect();

  const bob = new NostrClient({ relayUrl: RELAY, agentName: '' });
  bob.configure({ relayUrl: RELAY, agentName: 'bob', teamId });
  bob.exportConfig();
  bob.connect();

  await sleep(CONNECT_WAIT);

  log(`│  Alice and Bob sending simultaneously...`);
  const [rA, rB] = await Promise.all([
    alice.send('bob',   'todo',     'from alice'),
    bob.send('alice', 'api_spec', 'from bob'),
  ]);
  log(`│  Alice send ok=${rA.ok}, Bob send ok=${rB.ok}`);
  assert(rA.ok, 'Alice simultaneous send() failed');
  assert(rB.ok, 'Bob simultaneous send() failed');

  await sleep(DELIVERY_WAIT);

  const bobMsgs   = bob.flushMessages();
  const aliceMsgs = alice.flushMessages();

  log(`│  Bob received ${bobMsgs.length} message(s):`);
  bobMsgs.forEach(m => log(`│    { from: ${m.from}, type: ${m.type}, content: "${m.content}" }`));
  log(`│  Alice received ${aliceMsgs.length} message(s):`);
  aliceMsgs.forEach(m => log(`│    { from: ${m.from}, type: ${m.type}, content: "${m.content}" }`));

  assert(bobMsgs.length > 0,   'Bob received 0 messages in bidirectional test');
  assert(aliceMsgs.length > 0, 'Alice received 0 messages in bidirectional test');
  assert(bobMsgs.some(m => m.from === 'alice' && m.content === 'from alice'), 'Bob missing Alice message');
  assert(aliceMsgs.some(m => m.from === 'bob' && m.content === 'from bob'),   'Alice missing Bob message');

  alice.close();
  bob.close();
});

// ─── TEST 15: configure() with hubUrl mapping (hub-style call) ───────────────
// index.ts calls configure({ hubUrl, ... }) when transport selection happens
// after startup. NostrClient must map hubUrl → relayUrl.

await test('15. configure() correctly maps hubUrl → relayUrl', async () => {
  const alice = new NostrClient({ relayUrl: RELAY, agentName: 'alice' });
  const { teamId } = await alice.createTeam();
  alice.connect();
  await sleep(CONNECT_WAIT);

  // Simulate hub-style configure call (hubUrl not relayUrl)
  const bob = new NostrClient({ relayUrl: RELAY, agentName: '' });
  bob.configure({ hubUrl: RELAY, agentName: 'bob', apiKey: teamId }); // hub-style: hubUrl + apiKey
  log(`│  After hub-style configure(): isConfigured=${bob.isConfigured()}`);
  log(`│  relayUrl=${bob.identity().relayUrl}, agentName=${bob.identity().agentName}`);

  assert(bob.isConfigured(), 'Bob not configured after hub-style configure()');
  assert(bob.identity().relayUrl === RELAY, `relayUrl wrong after hubUrl mapping: got ${bob.identity().relayUrl}`);
  bob.exportConfig();
  bob.connect();
  await sleep(CONNECT_WAIT);

  await alice.send('bob', 'question', 'testing hubUrl mapping');
  await sleep(DELIVERY_WAIT);

  const msgs = bob.flushMessages();
  log(`│  Bob received ${msgs.length} message(s) after hubUrl-mapped configure`);
  msgs.forEach(m => log(`│    { from: ${m.from}, content: "${m.content}" }`));
  assert(msgs.length > 0, 'Bob received nothing after hub-style configure — hubUrl→relayUrl mapping broken');

  alice.close();
  bob.close();
});

// ─── TEST 16: three clients (creator + 2 joiners) ────────────────────────────

await test('16. Three clients: creator + 2 joiners can all communicate', async () => {
  // Creator
  const alice = new NostrClient({ relayUrl: RELAY, agentName: 'alice' });
  const { teamId } = await alice.createTeam();
  alice.connect();

  // Joiner 1
  const bob = new NostrClient({ relayUrl: RELAY, agentName: '' });
  bob.configure({ relayUrl: RELAY, agentName: 'bob', teamId });
  bob.exportConfig();
  bob.connect();

  // Joiner 2
  const charlie = new NostrClient({ relayUrl: RELAY, agentName: '' });
  charlie.configure({ relayUrl: RELAY, agentName: 'charlie', teamId });
  charlie.exportConfig();
  charlie.connect();

  log(`│  Alice (creator) + Bob + Charlie all connected, waiting ${CONNECT_WAIT}ms...`);
  await sleep(CONNECT_WAIT);

  // Alice broadcasts — Bob and Charlie should both receive
  log(`│  Alice broadcasts...`);
  await alice.send('broadcast', 'decision', 'alice-to-all');

  // Bob → Charlie direct
  log(`│  Bob → Charlie direct...`);
  await bob.send('charlie', 'todo', 'bob-to-charlie');

  // Charlie → Alice direct
  log(`│  Charlie → Alice direct...`);
  await charlie.send('alice', 'question', 'charlie-to-alice');

  log(`│  Waiting ${DELIVERY_WAIT}ms...`);
  await sleep(DELIVERY_WAIT);

  const aliceMsgs   = alice.flushMessages();
  const bobMsgs     = bob.flushMessages();
  const charlieMsgs = charlie.flushMessages();

  log(`│  Alice inbox   (${aliceMsgs.length}): ${aliceMsgs.map(m => `${m.from}→${m.to}: "${m.content}"`).join(' | ')}`);
  log(`│  Bob inbox     (${bobMsgs.length}): ${bobMsgs.map(m => `${m.from}→${m.to}: "${m.content}"`).join(' | ')}`);
  log(`│  Charlie inbox (${charlieMsgs.length}): ${charlieMsgs.map(m => `${m.from}→${m.to}: "${m.content}"`).join(' | ')}`);

  // Bob receives Alice's broadcast
  assert(
    bobMsgs.some(m => m.from === 'alice' && m.to === 'broadcast'),
    `Bob missing Alice broadcast. Bob inbox: [${bobMsgs.map(m => m.content).join(', ')}]`
  );
  // Charlie receives Alice's broadcast
  assert(
    charlieMsgs.some(m => m.from === 'alice' && m.to === 'broadcast'),
    `Charlie missing Alice broadcast. Charlie inbox: [${charlieMsgs.map(m => m.content).join(', ')}]`
  );
  // Charlie receives Bob's direct message
  assert(
    charlieMsgs.some(m => m.from === 'bob' && m.content === 'bob-to-charlie'),
    `Charlie missing Bob's direct message`
  );
  // Alice receives Charlie's direct message
  assert(
    aliceMsgs.some(m => m.from === 'charlie' && m.content === 'charlie-to-alice'),
    `Alice missing Charlie's message`
  );
  // Bob must NOT receive Charlie→Alice message
  assert(
    !bobMsgs.some(m => m.from === 'charlie' && m.content === 'charlie-to-alice'),
    `Bob received Charlie→Alice message — isolation failure`
  );

  alice.close();
  bob.close();
  charlie.close();
});

// ─── TEST 17: team isolation (two separate teams) ────────────────────────────

await test('17. Team isolation: messages stay within their team', async () => {
  // Team A
  const aliceA = new NostrClient({ relayUrl: RELAY, agentName: 'alice' });
  const { teamId: teamA } = await aliceA.createTeam();
  aliceA.connect();

  // Team B (separate team)
  const aliceB = new NostrClient({ relayUrl: RELAY, agentName: 'alice' });
  const { teamId: teamB } = await aliceB.createTeam();
  aliceB.connect();

  // Bob on team A only
  const bobA = new NostrClient({ relayUrl: RELAY, agentName: '' });
  bobA.configure({ relayUrl: RELAY, agentName: 'bob', teamId: teamA });
  bobA.exportConfig();
  bobA.connect();

  log(`│  teamA: ${teamA.slice(0,12)}...  teamB: ${teamB.slice(0,12)}...`);
  log(`│  AliceA + BobA on teamA. AliceB on teamB (separate). Waiting ${CONNECT_WAIT}ms...`);
  await sleep(CONNECT_WAIT);

  // AliceB broadcasts on team B — BobA (team A) must not receive it
  log(`│  AliceB broadcasts on teamB: "team-b-only"`);
  await aliceB.send('broadcast', 'decision', 'team-b-only');

  // AliceA sends to BobA on team A
  log(`│  AliceA → BobA on teamA: "team-a-message"`);
  await aliceA.send('bob', 'todo', 'team-a-message');

  await sleep(DELIVERY_WAIT);

  const bobAMsgs = bobA.flushMessages();
  log(`│  BobA inbox (${bobAMsgs.length}): ${bobAMsgs.map(m => `"${m.content}"`).join(', ')}`);

  assert(
    bobAMsgs.some(m => m.content === 'team-a-message'),
    'BobA did not receive AliceA message on teamA'
  );
  assert(
    !bobAMsgs.some(m => m.content === 'team-b-only'),
    `BobA received teamB message — team isolation broken! Messages: [${bobAMsgs.map(m => m.content).join(', ')}]`
  );

  aliceA.close();
  aliceB.close();
  bobA.close();
});

// ─── Summary ─────────────────────────────────────────────────────────────────

log('\n' + '═'.repeat(62));
log(' Results');
log('═'.repeat(62));

let passed = 0, failed = 0;
for (const r of results) {
  const icon = r.ok ? '✓' : '✗';
  log(`${icon} ${r.name}  (${r.ms}ms)${r.err ? `\n  → ${r.err}` : ''}`);
  if (r.ok) passed++; else failed++;
}

log('');
log(`${passed} / ${results.length} passed`);

if (failed > 0) {
  log('\nTroubleshooting:');
  log('  Relay rejecting events?   Try: RELAY_URL=wss://nos.lol');
  log('  Messages not arriving?    Try: DELIVERY_WAIT=12000');
  log('  Auth errors?              Try: RELAY_URL=wss://nostr.mom');
}

log('');
process.exit(failed > 0 ? 1 : 0);
