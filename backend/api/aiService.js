/**
 * CivicPulse AI Service — v2.1
 * 
 * Single-call analysis pipeline (combined validation + classification):
 *   One API call does BOTH media validation AND deep analysis.
 *   Saves quota by merging Stage 1 & Stage 2 into one request.
 * 
 * Model Cascade (spreads load across free-tier quotas):
 *   1. Gemini 2.5 Flash (stable, multimodal, native video)
 *   2. Gemini 3.5 Flash (stable, frontier-class, higher quota pool)
 *   3. Groq Llama 4 Scout 17B (multimodal — supports images up to 20MB)
 *   4. Groq Llama 3.3 70B (text-only fallback)
 *   5. Deterministic default (last resort)
 * 
 * Features:
 *   - Native video support (no ffmpeg — Gemini handles video directly)
 *   - Per-model exponential backoff retry
 *   - Model rotation across Gemini model pools to avoid per-model daily limits
 *   - Groq multimodal fallback with Llama 4 Scout for images
 *   - Deterministic severity validation via severityEngine
 */

import fs from 'fs';
import path from 'path';
import { VALIDATE_MEDIA_PROMPT, CLASSIFY_ISSUE_PROMPT, SUMMARIZE_ISSUE_PROMPT, TRANSCRIBE_AUDIO_PROMPT, RESOLVE_ISSUE_PROMPT } from './prompts.js';
import { calculateSeverity } from './severityEngine.js';
import { GoogleGenAI } from '@google/genai';
import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js for local embeddings
env.allowLocalModels = true;
env.allowRemoteModels = true;
env.useBrowserCache = false;

// ═══════════════════════════════════════════════════════════════
// GEMINI CLIENT
// ═══════════════════════════════════════════════════════════════

// Model cascade: try each in order; each has its own free-tier daily quota
const GEMINI_MODELS = [
  'gemini-2.5-flash',       // Primary: stable, fast, 20 RPD free tier
  'gemini-3.5-flash',       // Secondary: frontier-class, separate quota pool
  'gemini-2.5-flash-lite',  // Tertiary: budget, highest free-tier limits
];

let aiClient = null;
function getAI() {
  if (!aiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable not set');
    }
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

// ═══════════════════════════════════════════════════════════════
// LOCAL EMBEDDING PIPELINE
// ═══════════════════════════════════════════════════════════════

let embeddingPipeline = null;
async function getEmbedder() {
  if (!embeddingPipeline) {
    console.log("Loading local Embedding Model (Xenova/all-MiniLM-L6-v2)...");
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log("Embedding model loaded ✓");
  }
  return embeddingPipeline;
}

// ═══════════════════════════════════════════════════════════════
// MIME TYPE DETECTION
// ═══════════════════════════════════════════════════════════════

const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

function isVideoFile(mimeType) {
  return mimeType.startsWith('video/');
}

function isImageFile(mimeType) {
  return mimeType.startsWith('image/');
}

// ═══════════════════════════════════════════════════════════════
// COMBINED PROMPT (Validation + Classification in one call)
// ═══════════════════════════════════════════════════════════════

const COMBINED_ANALYSIS_PROMPT = `${VALIDATE_MEDIA_PROMPT}

---

IMPORTANT: If and ONLY IF the media IS a civic issue (is_civic_issue = true), then ALSO perform the full classification below. If it is NOT a civic issue, skip the classification and return only the validation fields.

${CLASSIFY_ISSUE_PROMPT}

CRITICAL: Return a SINGLE JSON object. If the media is NOT a civic issue, return:
{"is_civic_issue": false, "rejection_reason": "...", "detected_content": "..."}

If it IS a civic issue, return the full classification JSON with is_civic_issue set to true.`;

// ═══════════════════════════════════════════════════════════════
// FILE TO INLINE PART
// ═══════════════════════════════════════════════════════════════

/**
 * Convert a local file to a Gemini inline data part.
 * Works for both images and videos — Gemini handles video natively.
 */
function fileToInlinePart(filePath) {
  const mimeType = getMimeType(filePath);
  const data = fs.readFileSync(filePath).toString('base64');
  return {
    inlineData: { data, mimeType },
  };
}

// ═══════════════════════════════════════════════════════════════
// GEMINI API CALL WITH MODEL CASCADE + RETRY
// ═══════════════════════════════════════════════════════════════

/**
 * Try calling Gemini across multiple models in cascade.
 * Each model gets exponential backoff retry for transient (non-quota) errors.
 * On 429/RESOURCE_EXHAUSTED, immediately skip to the next model in cascade.
 */
async function callGeminiCascade(parts, options = {}) {
  const ai = getAI();
  const models = options.models || GEMINI_MODELS;
  const maxRetries = options.maxRetries ?? 2;
  const initialDelay = options.initialDelayMs ?? 1000;

  for (const model of models) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Gemini] Trying ${model} (attempt ${attempt + 1}/${maxRetries + 1})...`);

        const response = await ai.models.generateContent({
          model,
          contents: parts,
          config: {
            responseMimeType: "application/json",
          },
        });

        let text = response.text;
        if (!text) throw new Error('Empty response from Gemini');

        // Strip markdown code fences if present
        if (text.startsWith('```')) {
          text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        const parsed = JSON.parse(text);
        console.log(`[Gemini] Success with ${model}`);
        return { result: parsed, model_used: model };
      } catch (err) {
        const status = err.status || err.httpStatusCode || 0;
        const errorBody = err.message || '';
        const isQuotaExhausted = status === 429 || errorBody.includes('RESOURCE_EXHAUSTED') || errorBody.includes('quota');
        const isRetryable = status === 500 || status === 503;
        const isLastAttempt = attempt === maxRetries;

        if (isQuotaExhausted) {
          // Skip to next model immediately — this model's quota is exhausted
          console.warn(`[Gemini] ${model} quota exhausted, trying next model...`);
          break;
        }

        if (isRetryable && !isLastAttempt) {
          const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 500;
          console.warn(`[Gemini] Retryable error (${status}), retrying in ${Math.round(delay)}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Non-retryable, non-quota error on last attempt — move to next model
        console.warn(`[Gemini] ${model} failed: ${err.message?.substring(0, 100)}`);
        break;
      }
    }
  }

  // All Gemini models exhausted
  throw new Error('All Gemini models exhausted or unavailable');
}

// ═══════════════════════════════════════════════════════════════
// GROQ MULTIMODAL FALLBACK (Llama 4 Scout)
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze image using Groq's Llama 4 Scout model.
 * Llama 4 Scout is multimodal — it accepts image input directly.
 * This is the fallback when all Gemini models are quota-exhausted.
 */
async function groqMultimodalAnalyze(filePath, textDescription) {
  const { default: Groq } = await import('groq-sdk');

  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not set');
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const mimeType = getMimeType(filePath);

  if (!isImageFile(mimeType)) {
    // Llama 4 Scout supports images only, not video
    throw new Error('Groq multimodal only supports images, not video');
  }

  const imageData = fs.readFileSync(filePath).toString('base64');
  const imageUrl = `data:${mimeType};base64,${imageData}`;

  console.log('[Groq] Trying multimodal analysis with Llama 4 Scout...');

  const userContent = [
    {
      type: 'text',
      text: `${COMBINED_ANALYSIS_PROMPT}\n\n${textDescription ? `User's description: "${textDescription}"` : 'No description provided. Analyze the image only.'}`,
    },
    {
      type: 'image_url',
      image_url: { url: imageUrl },
    },
  ];

  const response = await groq.chat.completions.create({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    messages: [
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
  });

  const text = response.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response from Groq Scout');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    else throw new Error('Failed to parse Groq Scout JSON');
  }

  console.log('[Groq] Llama 4 Scout analysis succeeded');
  return { result: parsed, model_used: 'groq/llama-4-scout-17b-16e' };
}

// ═══════════════════════════════════════════════════════════════
// GROQ TEXT-ONLY FALLBACK (Llama 3.3 70B)
// ═══════════════════════════════════════════════════════════════

/**
 * When all multimodal options fail, fall back to text-only reasoning.
 * Uses Llama 3.3 70B which excels at structured reasoning tasks.
 */
async function groqTextOnlyAnalyze(textDescription) {
  const { groqReason } = await import('./groqService.js');

  console.log('[Groq] Using text-only fallback with Llama 3.3 70B...');

  const result = await groqReason(
    CLASSIFY_ISSUE_PROMPT,
    `Analyze this civic issue based on the text description only (no image available). Provide your best classification.\n\n"${textDescription}"`
  );

  console.log('[Groq] Text-only analysis succeeded');
  return { result, model_used: 'groq/llama-3.3-70b-versatile' };
}

// ═══════════════════════════════════════════════════════════════
// PROCESS ANALYSIS RESULT
// ═══════════════════════════════════════════════════════════════

/**
 * Takes raw model output and normalizes it through the severity engine.
 * Handles both rejection and classification results.
 */
function processAnalysisResult(rawResult, modelUsed) {
  // Check if media was rejected
  if (rawResult.is_civic_issue === false) {
    return {
      is_civic_issue: false,
      rejection_reason: rawResult.rejection_reason || 'The uploaded media does not appear to show a civic infrastructure issue.',
      detected_content: rawResult.detected_content || null,
      title: null,
      description: null,
      category: null,
      severity: null,
      confidence: 0,
      danger_score: 0,
      model_used: modelUsed,
    };
  }

  // Pass through deterministic severity engine
  const calibrated = calculateSeverity(rawResult);

  return {
    is_civic_issue: true,
    rejection_reason: null,
    title: rawResult.title || 'Civic Issue Report',
    description: rawResult.description || 'Issue detected — details pending review.',
    category: calibrated.category,
    severity: calibrated.severity,
    confidence: calibrated.confidence,
    danger_score: calibrated.danger_score,
    danger_breakdown: calibrated.danger_breakdown,
    recommended_action: rawResult.recommended_action || 'Review and dispatch appropriate team.',
    estimated_affected_radius_meters: rawResult.estimated_affected_radius_meters || null,
    recommended_response_time: calibrated.recommended_response_time,
    calculation_method: calibrated.calculation_method,
    model_used: modelUsed,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN ENTRY POINT: analyzeIssue()
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze a civic issue from media (image/video) and/or text.
 * 
 * Model Cascade:
 *   1. Gemini 2.5 Flash → 2. Gemini 3.5 Flash → 3. Gemini 2.5 Flash-Lite
 *   4. Groq Llama 4 Scout (images only)
 *   5. Groq Llama 3.3 70B (text only)
 *   6. Hardcoded default
 * 
 * @param {string|null} mediaPath - Path to uploaded image or video file
 * @param {string} textDescription - User's text description
 * @returns {object} Analysis result with category, severity, etc.
 */
export async function analyzeIssue(mediaPath, textDescription) {
  const hasMedia = mediaPath && fs.existsSync(mediaPath);
  const hasText = textDescription && textDescription.trim().length > 0;

  if (!hasMedia && !hasText) {
    return {
      is_civic_issue: false,
      rejection_reason: 'No media or description provided.',
      title: null, description: null, category: null, severity: null,
      confidence: 0, danger_score: 0,
    };
  }

  // Build Gemini content parts (single combined prompt)
  const geminiParts = [{ text: COMBINED_ANALYSIS_PROMPT }];

  if (hasText) {
    geminiParts.push({ text: `\nUser's description: "${textDescription}"` });
  } else {
    geminiParts.push({ text: '\nNo text description provided. Analyze the media only.' });
  }

  if (hasMedia) {
    const mimeType = getMimeType(mediaPath);
    if (isVideoFile(mimeType)) {
      geminiParts.push({ text: '\n[The following is a short video. Analyze all visible frames for civic infrastructure issues.]' });
    }
    geminiParts.push(fileToInlinePart(mediaPath));
  }

  // ── Tier 1: Gemini Model Cascade ──
  try {
    const { result, model_used } = await callGeminiCascade(geminiParts);
    const processed = processAnalysisResult(result, model_used);
    console.log(`[AI] Analysis complete via ${model_used}: ${processed.category} / ${processed.severity} (confidence: ${processed.confidence})`);
    return processed;
  } catch (geminiError) {
    console.warn(`[AI] All Gemini models failed: ${geminiError.message}`);
  }

  // ── Tier 2: Groq Multimodal (Llama 4 Scout — images only) ──
  if (hasMedia && isImageFile(getMimeType(mediaPath))) {
    try {
      const { result, model_used } = await groqMultimodalAnalyze(mediaPath, textDescription);
      const processed = processAnalysisResult(result, model_used);
      // Cap confidence slightly lower for Groq vs Gemini
      processed.confidence = Math.min(processed.confidence, 0.8);
      console.log(`[AI] Analysis complete via ${model_used}: ${processed.category} / ${processed.severity}`);
      return processed;
    } catch (groqImageError) {
      console.warn(`[AI] Groq multimodal failed: ${groqImageError.message}`);
    }
  }

  // ── Tier 3: Groq Text-Only (Llama 3.3 70B) ──
  // Build a text description from whatever context we have
  const fallbackText = hasText
    ? textDescription.trim()
    : hasMedia
      ? `An image/video was uploaded showing a potential civic issue. File: ${path.basename(mediaPath)}`
      : null;

  if (fallbackText) {
    try {
      const { result, model_used } = await groqTextOnlyAnalyze(fallbackText);
      const processed = processAnalysisResult(result, model_used);
      // Cap confidence for text-only — no visual verification
      processed.confidence = Math.min(processed.confidence, hasText ? 0.6 : 0.3);
      console.log(`[AI] Analysis complete via ${model_used}: ${processed.category} / ${processed.severity}`);
      return processed;
    } catch (groqTextError) {
      console.warn(`[AI] Groq text fallback failed: ${groqTextError.message}`);
    }
  }

  // ── Tier 4: Hardcoded Default (absolute last resort) ──
  console.error('[AI] ALL analysis methods exhausted — returning safe default');
  return {
    is_civic_issue: true,
    rejection_reason: null,
    title: 'Civic Issue Report',
    description: textDescription || 'Issue reported — AI analysis temporarily unavailable. Manual review required.',
    category: 'Other',
    severity: 'Medium',
    confidence: 0.1,
    danger_score: 3.0,
    danger_breakdown: null,
    recommended_action: 'Manual review required — AI services temporarily unavailable.',
    recommended_response_time: 'Within 3 days',
    calculation_method: 'hardcoded_fallback',
    model_used: 'none',
  };
}

// ═══════════════════════════════════════════════════════════════
// SUMMARIZE ISSUE
// ═══════════════════════════════════════════════════════════════

export async function summarizeIssue(title, description) {
  const prompt = `${SUMMARIZE_ISSUE_PROMPT}\n\nTitle: "${title}"\nDescription: "${description}"`;
  try {
    const { result } = await callGeminiCascade([{ text: prompt }]);
    return result;
  } catch (e) {
    console.warn('[AI] Summarization via Gemini failed, trying Groq...');
    try {
      const { groqFastSummary } = await import('./groqService.js');
      return await groqFastSummary(SUMMARIZE_ISSUE_PROMPT, { title, description });
    } catch (groqErr) {
      console.error('[AI] All summarization failed:', groqErr.message);
      return { summary: description?.substring(0, 200), keywords: [] };
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// LOCAL EMBEDDINGS (no API dependency)
// ═══════════════════════════════════════════════════════════════

export async function generateEmbedding(text) {
  try {
    const embedder = await getEmbedder();
    const out = await embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(out.data);
  } catch (err) {
    console.error('Local Embedding failed:', err);
    return [];
  }
}

export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function findDuplicates(newEmbedding, existingIssues, threshold = 0.85) {
  const duplicates = [];
  for (const issue of existingIssues) {
    if (!issue.embedding || newEmbedding.length !== issue.embedding.length) continue;
    const similarity = cosineSimilarity(newEmbedding, issue.embedding);
    if (similarity >= threshold) {
      duplicates.push({
        existing_issue_id: issue.id,
        similarity_score: Math.round(similarity * 100) / 100,
        title: issue.title,
      });
    }
  }
  duplicates.sort((a, b) => b.similarity_score - a.similarity_score);
  return {
    duplicates,
    is_likely_duplicate: duplicates.length > 0,
    best_match_id: duplicates.length > 0 ? duplicates[0].existing_issue_id : null,
  };
}

// ═══════════════════════════════════════════════════════════════
// TRANSCRIBE AUDIO (Feature 2)
// ═══════════════════════════════════════════════════════════════

export async function transcribeAudio(mediaPath) {
  if (!mediaPath || !fs.existsSync(mediaPath)) {
    throw new Error("Audio file not found for transcription");
  }

  const audioPart = fileToInlinePart(mediaPath);
  // The browser records audio as .webm. Gemini's video parser expects frames if we send 'video/webm'.
  // Since it's purely audio, we must explicitly tell Gemini it's audio.
  if (audioPart.inlineData.mimeType === 'video/webm') {
    audioPart.inlineData.mimeType = 'audio/webm';
  }

  const geminiParts = [
    { text: TRANSCRIBE_AUDIO_PROMPT },
    audioPart
  ];

  try {
    const { result, model_used } = await callGeminiCascade(geminiParts);
    console.log(`[AI] Audio transcribed via ${model_used}`);
    return result;
  } catch (err) {
    console.error('[AI] Transcription failed:', err.message);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════
// VERIFY RESOLUTION (Feature 4)
// ═══════════════════════════════════════════════════════════════
// In a real scenario, we might download the beforeMediaUrl to a local temp file,
// or if Gemini accepts URLs directly, we can pass it.
// To keep it simple and robust, we will assume we can fetch the image and convert it.

import https from 'https';
import http from 'http';

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Handle redirects
        return downloadFile(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

export async function verifyResolution(beforeMediaUrl, afterMediaPath) {
  if (!afterMediaPath || !fs.existsSync(afterMediaPath)) {
    throw new Error("After media file not found for verification");
  }

  let beforeBuffer = null;
  let beforeMime = 'image/jpeg';
  try {
    beforeBuffer = await downloadFile(beforeMediaUrl);
    if (beforeMediaUrl.toLowerCase().includes('.png')) beforeMime = 'image/png';
    else if (beforeMediaUrl.toLowerCase().match(/\.(mp4|webm|mov|avi)($|\?)/)) beforeMime = 'video/mp4';
  } catch (err) {
    console.warn("[AI] Failed to download before media for resolution check:", err.message);
    // Proceed without before image? We shouldn't.
    throw new Error("Could not fetch the original issue media to compare against.");
  }

  const beforePart = {
    inlineData: {
      data: beforeBuffer.toString('base64'),
      mimeType: beforeMime
    }
  };

  const geminiParts = [
    { text: RESOLVE_ISSUE_PROMPT },
    { text: "Here is the ORIGINAL media (Before state):" },
    beforePart,
    { text: "Here is the NEW media (After state):" },
    fileToInlinePart(afterMediaPath)
  ];

  try {
    const { result, model_used } = await callGeminiCascade(geminiParts);
    console.log(`[AI] Resolution verified via ${model_used}: ${result.is_resolved} (confidence: ${result.confidence})`);
    return result;
  } catch (err) {
    console.error('[AI] Resolution verification failed:', err.message);
    throw err;
  }
}
