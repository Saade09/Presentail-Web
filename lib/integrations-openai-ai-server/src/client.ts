import OpenAI from "openai";

const REPLIT_PROXY_BASE_URL = "https://openai-proxy.replit.com/v1";
export type ManagedOpenAIClient = OpenAI;

let client: OpenAI | undefined;

export function createOpenAIClient(options: {
  apiKey: string;
  baseURL: string;
}): ManagedOpenAIClient {
  return new OpenAI({ ...options, maxRetries: 0 });
}

/**
 * Return the process-wide OpenAI client, or null when the integration is not
 * configured. Keeping construction lazy lets fail-open catalog jobs start and
 * serve their deterministic/DB fallbacks in test and maintenance processes.
 */
export function getOpenAIClient(): OpenAI | null {
  if (client) return client;

  const apiKey = process.env.REPLIT_AI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.REPLIT_AI_API_KEY
    ? REPLIT_PROXY_BASE_URL
    : process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

  if (!apiKey || !baseURL) return null;
  // Retries are owned by executeAiRequest so provider attempts and telemetry
  // cannot be multiplied by the SDK's independent retry loop.
  client = createOpenAIClient({ apiKey, baseURL });
  return client;
}

/**
 * Backwards-compatible client facade. It resolves the managed client only
 * when a method is accessed, so merely importing the package stays safe for
 * fail-open jobs and test processes without AI credentials.
 */
export const openai = new Proxy({} as OpenAI, {
  get(_target, property) {
    const configured = getOpenAIClient();
    if (!configured) {
      throw new Error(
        "OpenAI AI integration is not configured. Set the managed OpenAI integration before using this helper.",
      );
    }
    const value = Reflect.get(configured, property, configured);
    return typeof value === "function" ? value.bind(configured) : value;
  },
});
