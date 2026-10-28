import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Official --patch overlay; the user's profile and installed plugin list remain owned by DSH. */
export async function prepareAccountProfile(home: string, gateway: { baseURL: string; protocol: string; model: string; maxTokens: number }) {
  const file = path.join(home, 'acceptcat-managed.patch.json');
  const entries = [
    { id: 'llm-pi-ai', config: { providers: { acceptcat: {
      displayName: 'AcceptCat', apiKeyEnv: 'ACCEPTCAT_DSH_TOKEN', api: gateway.protocol,
      baseURL: gateway.baseURL + (gateway.protocol === 'openai-completions' ? '/v1' : ''),
      defaultContextWindow: 65536, defaultMaxTokens: gateway.maxTokens,
      ...(gateway.protocol === 'openai-completions' ? { compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' } } : {}),
      retryPolicy: { mode: 'normal', maxRetries: 0 },
      models: [{ id: gateway.model, name: `${gateway.model} · AcceptCat`, contextWindow: 65536, maxTokens: gateway.maxTokens }],
    } } } },
    { id: 'agent-default-model', config: { provider: 'acceptcat', model: gateway.model } },
  ];
  await fs.mkdir(home, { recursive: true });
  await fs.writeFile(file + '.tmp', JSON.stringify(entries, null, 2), { mode: 0o600 });
  await fs.rename(file + '.tmp', file);
  return file;
}
