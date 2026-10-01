import { z } from 'zod';

export const reorderItemSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
  position: z.number().int().min(1, 'Position must be a positive integer'),
});

export const reorderSchema = z.object({
  items: z.array(reorderItemSchema).min(1, 'At least one item is required to reorder'),
});

export type ReorderItemDto = z.infer<typeof reorderItemSchema>;
export type ReorderDto = z.infer<typeof reorderSchema>;
