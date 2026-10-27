export const URL_GITHUB = 'https://github.com/NeousAxis/regenvox'
export const URL_REGENERE = 'https://regenereplus.ch'
export const EMAIL_CONTACT = 'hello@regenereplus.com'
export const URL_CLE_ANTHROPIC = 'https://console.anthropic.com/'
export const URL_CLE_MISTRAL = 'https://console.mistral.ai/'
export const URL_CLE_OPENAI = 'https://platform.openai.com/api-keys'

// Autres services compatibles OpenAI : chacun accepte les appels directs depuis le navigateur (vérifié le 27.10.2026).
// GLM (Zhipu) refuse ces appels : il est accessible par OpenRouter.
export const SERVICES_AUTRES = [
  { code: 'deepseek', nom: 'DeepSeek', adresse: 'https://api.deepseek.com/v1', cles: 'https://platform.deepseek.com/api_keys' },
  { code: 'kimi', nom: 'Kimi (Moonshot AI)', adresse: 'https://api.moonshot.ai/v1', cles: 'https://platform.moonshot.ai/' },
  { code: 'qwen', nom: 'Qwen (Alibaba Cloud)', adresse: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', cles: 'https://www.alibabacloud.com/en/product/modelstudio' },
  { code: 'meta', nom: 'Meta (Llama API)', adresse: 'https://api.llama.com/compat/v1', cles: 'https://llama.developer.meta.com/' },
  { code: 'openrouter', nom: 'OpenRouter', adresse: 'https://openrouter.ai/api/v1', cles: 'https://openrouter.ai/keys' },
] as const
