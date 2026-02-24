import { afterAll, beforeAll, describe } from 'vitest';
import { Redis } from 'ioredis';
import { RedisStore } from './redis.js';
import { runStoreContractTests } from './contract.js';

// Use Redis database 15 as a dedicated test database
const TEST_DB = 15;
const TEST_URL = `redis://localhost:6379/${TEST_DB}`;

let available = false;
let probe: Redis;

beforeAll(async () => {
  probe = new Redis(TEST_URL, { lazyConnect: true, enableOfflineQueue: false });
  try {
    await probe.connect();
    available = true;
  } catch {
    available = false;
  }
});

afterAll(async () => {
  await probe.quit().catch(() => {});
});

if (process.env['CI']) {
  // Skip Redis tests in CI unless REDIS_URL is explicitly set
  describe.skip('RedisStore', () => {});
} else {
  runStoreContractTests('RedisStore', async () => {
    if (!available) throw new Error('Redis not available at localhost:6379 — skipping');
    // Flush test db before each test for a clean slate
    const store = new RedisStore(TEST_URL);
    await store.connect();
    await store.client.flushdb();
    return store;
  });
}
