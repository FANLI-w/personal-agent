import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Official --patch overlay; the user's profile and installed plugin list remain owned by DSH. */
export async function prepareAccountProfile(home: string, gateway: { baseURL: string; protocol: string; provider?: string; model: string; maxTokens: number }) {
  // Official model metadata checked 2026-10-28: https://api-docs.deepseek.com/api/list-models/
  // Keep unknown/custom providers conservative; a matching model name alone is not authority.
  const contextWindow = gateway.provider === 'deepseek' && ['deepseek-flash', 'deepseek-v4-pro'].includes(gateway.model) ? 1048576 : 65536;
  const nativeDeepSeek = gateway.provider === 'deepseek' && gateway.protocol === 'anthropic-messages'
    && ['deepseek-flash', 'deepseek-v4-pro'].includes(gateway.model);
  const file = path.join(home, 'acceptcat-managed.patch.json');
  const entries = [
    { id: 'llm-pi-ai', config: { providers: { acceptcat: {
      displayName: 'AcceptCat', apiKeyEnv: 'ACCEPTCAT_DSH_TOKEN', api: gateway.protocol,
      baseURL: gateway.baseURL + (gateway.protocol === 'openai-completions' ? '/v1' : ''),
      defaultContextWindow: contextWindow, defaultMaxTokens: gateway.maxTokens,
      ...(gateway.protocol === 'openai-completions' ? { compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' } } : {}),
      retryPolicy: { mode: 'normal', maxRetries: 0 },
      models: [{ id: gateway.model, name: `${gateway.model} · AcceptCat`, contextWindow, maxTokens: gateway.maxTokens }],
    } } } },
    // Keep the old acceptcat route for existing sessions. New DeepSeek sessions use
    // DSH's own adapter, which owns the model/effort menu and serializes off/low/high/max
    // correctly (Anthropic pi-ai thinking budgets do not express DeepSeek effort).
    ...(nativeDeepSeek ? [{ id: 'llm-deepseek', config: {
      apiKeyEnv: 'ACCEPTCAT_DSH_TOKEN', baseURL: gateway.baseURL,
      maxTokens: gateway.maxTokens, defaultContextWindow: contextWindow,
      retryPolicy: { mode: 'normal', maxRetries: 0 },
      models: [
        { id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash', contextWindow, maxTokens: gateway.maxTokens },
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', contextWindow, maxTokens: gateway.maxTokens },
      ],
    } }] : []),
    { id: 'agent-default-model', config: { provider: nativeDeepSeek ? 'deepseek-official' : 'acceptcat', model: gateway.model } },
    // The relay carries inference only, as before. Native adapter telemetry must
    // not add full session logs or installed-package inventories to that request.
    { id: 'session-log-deepseek', config: { enabled: false } },
    { id: 'plugin-package-inventory-deepseek', config: { enabled: false } },
    // AcceptCat handles onboarding. Suppress only the pinned DSH rc.3 product notice
    // through its public settings field; tool permissions and other prompts stay intact.
    { id: 'ui-settings-general', config: { welcomeNoticeVersion: '2026-09-28.1' } },
  ];
  await fs.mkdir(home, { recursive: true });
  await fs.writeFile(file + '.tmp', JSON.stringify(entries, null, 2), { mode: 0o600 });
  await fs.rename(file + '.tmp', file);
  return file;
}
