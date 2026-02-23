export class Sections {
  static readonly DATABASE = 'database';
  static readonly SERVER = 'server';
  static readonly AUTH = 'auth';
  static readonly RATE_LIMIT = 'rate_limit';
  static readonly SSE = 'sse';
  static readonly TEAM = 'team';
}

export class Keys {
  // server
  static readonly HOST = 'host';
  static readonly PORT = 'port';
  static readonly CORS_ORIGINS = 'cors_origins';
  // auth
  static readonly TOKEN_SECRET = 'token_secret';
  static readonly TOKEN_EXPIRY_SECONDS = 'token_expiry_seconds';
  // rate_limit
  static readonly WINDOW_MS = 'window_ms';
  static readonly MAX_REQUESTS = 'max_requests';
  // sse
  static readonly KEEP_ALIVE_INTERVAL_MS = 'keep_alive_interval_ms';
  static readonly MAX_MESSAGE_BUFFER_SIZE = 'max_message_buffer_size';
  // team
  static readonly MAX_AGENTS_PER_TEAM = 'max_agents_per_team';
}
