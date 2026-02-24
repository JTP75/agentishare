import type { AgentMessage } from '../types.js';
import { VolumeStore } from './volume.js';
import type { IStore } from './types.js';

export type { IStore, TeamRecord, AgentRecord } from './types.js';

// Active store — swap this import for a different implementation (Memory, Redis, etc.)
export const store: IStore = new VolumeStore();

// In-memory push callbacks for live /agent/stream SSE connections.
// These are never persisted — they hold Node.js function references.
// Key: `${teamId}:${agentName}`
export const connections = new Map<string, (msg: AgentMessage) => void>();
