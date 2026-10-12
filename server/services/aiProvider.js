import config from '../config/env.js';

export function getAiSettings() {
  return { provider: 'groq', label: 'Groq', apiKey: config.GROQ_API_KEY, model: config.GROQ_MODEL, baseURL: 'https://api.groq.com/openai/v1' };
}
