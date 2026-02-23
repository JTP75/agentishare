import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

export const sendMessageSchema = z.object({
  to: z.string().min(1),
  type: z.enum(['api_spec', 'file_change', 'decision', 'todo', 'question']),
  content: z.string().min(1).max(65536),
});

export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
      return;
    }
    req.body = result.data;
    next();
  };
}
