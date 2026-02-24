import { afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync } from 'fs';
import { VolumeStore } from './volume.js';
import { runStoreContractTests } from './contract.js';

// Use a unique temp file per test run; clean up after each test
let tmpPath = '';

afterEach(() => {
  if (tmpPath && existsSync(tmpPath)) rmSync(tmpPath);
  if (tmpPath && existsSync(`${tmpPath}.tmp`)) rmSync(`${tmpPath}.tmp`);
});

runStoreContractTests('VolumeStore', async () => {
  tmpPath = join(tmpdir(), `agent-hub-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  return new VolumeStore(tmpPath);
});
