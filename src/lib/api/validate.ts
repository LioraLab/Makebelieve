import { z, type ZodError, type ZodTypeAny } from 'zod';

export function parseBody<T extends ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  return schema.parse(raw);
}

export const uploadSignSchema = z.object({
  fileName: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  kind: z.string().trim().min(1),
});

export const createStorySchema = z.object({
  childName: z.string().trim().min(1),
  ageBand: z.string().trim().optional(),
  theme: z.string().trim().min(1),
  tone: z.string().trim().optional(),
  language: z.string().trim().max(16).default('en'),
  photos: z.array(z.string().url()).optional().default([]),
});

export function formatValidationErrors(error: ZodError) {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}
