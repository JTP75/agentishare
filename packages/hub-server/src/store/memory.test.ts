import { MemoryStore } from './memory.js';
import { runStoreContractTests } from './contract.js';

runStoreContractTests('MemoryStore', async () => new MemoryStore());
