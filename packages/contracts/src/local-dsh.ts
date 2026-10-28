import { z } from 'zod'

/** Desktop-only model relay. Provider credentials and endpoint selection stay on the server. */
export const localDshPaths = {
  configuration: '/api/v1/local-dsh/configuration',
  completion: '/api/v1/local-dsh/completion',
} as const
export const LocalDshConfiguration = z.strictObject({
  memberId: z.string(), enabled: z.boolean(),
  provider: z.enum(['deepseek', 'qwen', 'doubao']), model: z.string(),
  protocol: z.enum(['anthropic-messages', 'openai-completions']),
  fingerprint: z.string(), maxTokens: z.literal(8192),
})
export const LocalDshCompletion = z.strictObject({
  fingerprint: z.string().min(1).max(512),
  protocol: z.enum(['anthropic-messages', 'openai-completions']),
  request: z.record(z.string(), z.unknown()),
})
