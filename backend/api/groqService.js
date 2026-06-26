/**
 * CivicPulse Groq Service (Milestone 8)
 * 
 * Provides fast LLM inference via Groq Cloud for:
 * - Priority scoring (Llama 3.3 70B — 280 tok/s, strong structured reasoning)
 * - Escalation summaries (Llama 3.3 70B)
 * - Prediction summaries (GPT-OSS 20B — 1000 tok/s, ultra-fast)
 */

import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY;

let groqClient = null;

function getGroq() {
  if (!groqClient) {
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY environment variable not set');
    }
    groqClient = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groqClient;
}

/**
 * Send a chat completion to Groq with JSON mode.
 * 
 * @param {string} systemPrompt - System instructions
 * @param {string} userMessage - User/data message
 * @param {object} options - { model, temperature, maxTokens }
 * @returns {object} Parsed JSON response
 */
export async function groqChat(systemPrompt, userMessage, options = {}) {
  const groq = getGroq();

  const model = options.model || 'llama-3.3-70b-versatile';
  const temperature = options.temperature ?? 0.3;
  const maxTokens = options.maxTokens || 2048;

  const response = await groq.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  });

  const text = response.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error('Empty response from Groq');
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    console.error('Failed to parse Groq response:', text);
    throw new Error('Failed to parse Groq JSON response');
  }
}

/**
 * Fast summary generation using GPT-OSS 20B (1000 tok/s)
 */
export async function groqFastSummary(prompt, data) {
  return groqChat(
    prompt,
    typeof data === 'string' ? data : JSON.stringify(data),
    { model: 'openai/gpt-oss-20b', temperature: 0.4, maxTokens: 1024 }
  );
}

/**
 * Reasoning-heavy task using Llama 3.3 70B (280 tok/s, strong reasoning)
 */
export async function groqReason(prompt, data) {
  return groqChat(
    prompt,
    typeof data === 'string' ? data : JSON.stringify(data),
    { model: 'llama-3.3-70b-versatile', temperature: 0.2, maxTokens: 2048 }
  );
}
