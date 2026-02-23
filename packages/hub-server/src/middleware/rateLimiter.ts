import rateLimit from 'express-rate-limit';
import { ConfigLoader, Sections, Keys } from '../config/index.js';

const config = new ConfigLoader(process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV === 'development' ? 'dev' : undefined);

export const apiLimiter = rateLimit({
  windowMs: config.get<number>(Sections.RATE_LIMIT, Keys.WINDOW_MS, 60000),
  max: config.get<number>(Sections.RATE_LIMIT, Keys.MAX_REQUESTS, 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
