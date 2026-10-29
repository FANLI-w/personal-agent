import type { FastifyInstance } from 'fastify'
import type { DatabaseSync } from 'node:sqlite'
import { Readable } from 'node:stream'
import { LocalDshConfiguration, LocalDshCompletion, localDshPaths } from '@research-agent-platform/contracts'
import { authenticate, cookieToken, requireCsrf } from './auth.js'
import { planningModelRuntime } from './planning-model.js'
import { personalModelKey } from './personal-models.js'
import type { Config } from './config.js'
import { fail } from './errors.js'

export type DshTransport = typeof fetch
const endpoints = {
  deepseek: 'https://api.deepseek.com/anthropic/v1/messages',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
} as const

export function registerLocalDsh(app: FastifyInstance, database: () => DatabaseSync, config: Config, transport: DshTransport = fetch) {
  const active = new Map<string, number>(), recent = new Map<string, number[]>()
  const controllers = new Set<AbortController>()
  app.addHook('onClose', async () => { for (const c of controllers) c.abort() })
  function authorized(cookie: string | undefined) {
    const db = database(), actor = authenticate(db, cookieToken(cookie))
    // Same private-work authority as planning: no ordinary member inherits a manager's key.
    const runtime = planningModelRuntime(db, actor, config)
    const metadata = LocalDshConfiguration.parse({ memberId: actor.id, enabled: runtime.enabled,
      provider: runtime.provider, model: runtime.model, fingerprint: runtime.fingerprint,
      protocol: runtime.provider === 'deepseek' ? 'anthropic-messages' : 'openai-completions', maxTokens: 8192 })
    return { db, actor, metadata }
  }
  app.get(localDshPaths.configuration, async request => ({ data: authorized(request.headers.cookie).metadata }))
  app.post(localDshPaths.completion, { bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    if (request.headers.origin !== config.origin) fail('FORBIDDEN')
    const initial = authorized(request.headers.cookie)
    requireCsrf(initial.actor, request.headers['x-csrf-token'])
    const input = LocalDshCompletion.safeParse(request.body)
    if (!input.success) fail('VALIDATION_ERROR')
    const { metadata, actor } = initial, body = input.data.request
    if (!metadata.enabled) fail('MODEL_UNAVAILABLE')
    if (metadata.fingerprint !== input.data.fingerprint || metadata.protocol !== input.data.protocol) fail('VERSION_CONFLICT')
    // The native menu may select either supported DeepSeek model under the same
    // owned provider credential. Never cross providers or accept arbitrary IDs.
    const models = metadata.provider === 'deepseek' && ['deepseek-flash', 'deepseek-v4-pro'].includes(metadata.model)
      ? ['deepseek-flash', 'deepseek-v4-pro'] : [metadata.model]
    if (typeof body.model !== 'string' || !models.includes(body.model) || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 2000 || typeof body.stream !== 'boolean') fail('VALIDATION_ERROR')
    // Whitelist inference fields. No arbitrary endpoint, batch, file-fetch, or provider-native server tools.
    const allowed = ['model','messages','system','tools','tool_choice','stream','stream_options','store','max_tokens','max_completion_tokens','temperature','top_p','top_k','stop','stop_sequences','thinking','reasoning_effort','output_config','parallel_tool_calls']
    if (Object.keys(body).some(key => !allowed.includes(key))) fail('VALIDATION_ERROR')
    // DSH's native DeepSeek adapter sends the selected effort here; accept only
    // that documented field, not arbitrary provider options or other protocols.
    if (body.output_config !== undefined) {
      const output = body.output_config as Record<string, unknown> | null
      if (metadata.provider !== 'deepseek' || metadata.protocol !== 'anthropic-messages'
        || !output || Array.isArray(output) || typeof output !== 'object'
        || Object.keys(output).length !== 1 || typeof output.effort !== 'string' || !['low', 'high', 'max'].includes(output.effort)) fail('VALIDATION_ERROR')
    }
    if (body.store !== undefined && body.store !== false) fail('VALIDATION_ERROR')
    if (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.length > 128 || body.tools.some((t: any) => !t || (metadata.protocol === 'anthropic-messages' ? t.type !== undefined && t.type !== 'custom' : t.type !== 'function')))) fail('VALIDATION_ERROR')
    const cap = body.max_tokens ?? body.max_completion_tokens
    if ([body.max_tokens, body.max_completion_tokens].some(value => value !== undefined && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > metadata.maxTokens))) fail('VALIDATION_ERROR')
    const payload = { ...body, ...(body.max_completion_tokens === undefined ? { max_tokens: cap ?? metadata.maxTokens } : {}) }
    const now = Date.now()
    for (const [key, times] of recent) if (!times.some(t => t > now - 60000)) recent.delete(key)
    const times = (recent.get(actor.id) ?? []).filter(t => t > now - 60000)
    if ((active.get(actor.id) ?? 0) >= 2 || controllers.size >= 16 || times.length >= 30) {
      reply.header('Retry-After', '30'); return reply.code(429).send({ error: { code: 'RATE_LIMIT', message: '本地模型调用繁忙，请稍后重试。' } })
    }
    recent.set(actor.id, [...times, now]); active.set(actor.id, (active.get(actor.id) ?? 0) + 1)
    const controller = new AbortController(); controllers.add(controller)
    const abort = () => controller.abort()
    request.raw.once('aborted', abort)
    const closed = () => { if (!reply.raw.writableEnded) abort() }; reply.raw.once('close', closed)
    const deadline = setTimeout(abort, 120000)
    const fence = () => {
      const current = authorized(request.headers.cookie).metadata
      if (!current.enabled || current.memberId !== metadata.memberId || current.fingerprint !== metadata.fingerprint) throw Error('Authority changed')
    }
    const poll = setInterval(() => { try { fence() } catch { abort() } }, 1000)
    let finished = false
    const release = () => {
      if (finished) return; finished = true
      clearTimeout(deadline); clearInterval(poll); controllers.delete(controller)
      const count = (active.get(actor.id) ?? 1) - 1; if (count) active.set(actor.id, count); else active.delete(actor.id)
      request.raw.off('aborted', abort); reply.raw.off('close', closed)
    }
    try {
      const key = personalModelKey(initial.db, actor, config)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (metadata.protocol === 'anthropic-messages') { headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01' }
      else headers.Authorization = `Bearer ${key}`
      const upstream = await transport(endpoints[metadata.provider], { method: 'POST', headers, body: JSON.stringify(payload), redirect: 'error', signal: controller.signal })
      fence()
      if (!upstream.ok || !upstream.body) {
        await upstream.body?.cancel(); release()
        return reply.code(upstream.status === 429 ? 429 : 502).send({ error: { code: 'MODEL_UNAVAILABLE', message: '模型服务未完成请求，请检查 AcceptCat 模型设置后重试。' } })
      }
      const contentType = body.stream ? 'text/event-stream; charset=utf-8' : 'application/json'
      if (!(upstream.headers.get('content-type') ?? '').includes(body.stream ? 'text/event-stream' : 'application/json')) throw Error('Unexpected model response')
      const source = upstream.body
      async function* stream() {
        const reader = source!.getReader(); let bytes = 0
        try {
          while (true) {
            const next = await reader.read(); if (next.done) break
            fence(); if (controller.signal.aborted) throw Error('Model request ended')
            bytes += next.value.byteLength; if (bytes > 16 * 1024 * 1024) throw Error('Model response too large')
            yield next.value
          }
        } finally { controller.abort(); await reader.cancel().catch(() => {}); release() }
      }
      const readable = Readable.from(stream()); readable.once('close', () => { abort(); release() })
      reply.header('X-Accel-Buffering', 'no').type(contentType)
      return reply.send(readable)
    } catch {
      controller.abort(); release()
      return reply.code(502).send({ error: { code: 'MODEL_UNAVAILABLE', message: '模型连接中断，或当前登录/模型设置已变化。请重试。' } })
    }
  })
}
