/**
 * chatService.js
 * AI chat with two providers, chosen by which API key is configured:
 *
 *   1. Gemini  (VITE_GEMINI_API_KEY)  — gemini-2.5-flash via @google/genai.
 *      Uses the CURRENT Google SDK, which supports the new AI Studio
 *      authorization keys starting with "AQ." (the old @google/generative-ai
 *      package rejects them with 401 ACCESS_TOKEN_TYPE_UNSUPPORTED).
 *      Natively multimodal: attached images are sent as inlineData.
 *   2. Groq    (VITE_GROQ_API_KEY)    — llama-3.3-70b for text, qwen3.6 vision
 *      model when an image is attached (https://console.groq.com/docs/vision).
 *
 * Both read the key from .env (VITE_* vars are baked in at build time).
 */

const TEXT_SYSTEM_PROMPT = `You are SatQueryAI Assistant, an expert AI embedded in SatQueryAI — a satellite imagery analysis platform.
You help users understand their satellite imagery analysis results with precise, data-driven answers.

IMPORTANT RULES:
- When analysis results are provided in the context (detections, area, coverage, confidence), always use those EXACT numbers in your answer.
- If the user asks about water bodies and the context says "3 detections, 1.24 km²", answer with those exact figures.
- If no analysis has been run yet, tell the user to upload an image and run an analysis first.
- Never make up or estimate numbers — only report what is in the context.
- Keep answers concise and specific. Lead with the key numbers, then explain what they mean.
- You are a geospatial expert — explain results in terms of NDWI, NDVI, spectral indices, land cover, etc. when relevant.`

const IMAGE_SYSTEM_PROMPT = TEXT_SYSTEM_PROMPT + `
- When the user attaches an image, analyze what is actually visible: describe land cover,
  water bodies, built-up structures, vegetation, roads, and anything notable.
- For satellite/aerial imagery, estimate the dominant land-cover composition and point out
  features of interest. Be concrete about what you can and cannot see.`

// Current stable models available via AI Studio AQ. keys (as of Sep 2026).
// Current Gemini models available via AI Studio (as of Sep 2026)
const GEMINI_MODEL = 'gemini-3.5-flash'
const GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash'  // same — no lite variant yet
const GROQ_MODEL = 'llama-3.3-70b-versatile'
// Multimodal model used when the user attaches an image (Groq vision).
// Docs: https://console.groq.com/docs/vision
const GROQ_VISION_MODEL = 'qwen/qwen3.6-27b'

/** Which provider will actually be used ('gemini' | 'groq' | null). */
export function getProvider() {
  if (import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_AI_API_KEY) return 'gemini'
  if (import.meta.env.VITE_GROQ_API_KEY) return 'groq'
  return null
}

/** Human-readable provider label for the chat header. */
export function providerLabel() {
  switch (getProvider()) {
    case 'gemini': return 'Gemini · Google'
    case 'groq': return 'Llama 3.3 · Groq'
    default: return 'No API key'
  }
}

/**
 * Get the full context stored by the app (location, image, analysis results).
 */
function getContext() {
  try {
    return JSON.parse(localStorage.getItem('satquery:context') || 'null')
  } catch {
    return null
  }
}

/**
 * Build a rich context string from stored app state.
 */
function buildContextBlock(pageHint) {
  const ctx = getContext()
  const parts = []
  if (pageHint) parts.push(`Current page: ${pageHint}`)
  if (ctx?.location_label) parts.push(`Location: ${ctx.location_label}`)
  else if (ctx?.latitude != null) parts.push(`Coordinates: ${ctx.latitude.toFixed(4)}, ${ctx.longitude?.toFixed(4)}`)
  if (ctx?.image_filename) parts.push(`Image file: ${ctx.image_filename}`)
  if (ctx?.analysis_type) parts.push(`Analysis type: ${ctx.analysis_type?.replace(/_/g, ' ')}`)
  if (ctx?.detection_count != null) parts.push(`Detections found: ${ctx.detection_count}`)
  if (ctx?.total_area_m2 != null) parts.push(`Total detected area: ${(ctx.total_area_m2 / 1e6).toFixed(3)} km²`)
  if (ctx?.coverage_percent != null) parts.push(`Coverage: ${ctx.coverage_percent}%`)
  if (ctx?.confidence != null) parts.push(`Model confidence: ${(ctx.confidence * 100).toFixed(1)}%`)
  if (ctx?.method) parts.push(`Detection method: ${ctx.method}`)
  if (ctx?.summary) parts.push(`Full summary: ${ctx.summary}`)
  return parts.length ? parts.join(' | ') : ''
}

function systemPrompt(hasImage, pageHint) {
  const base = hasImage ? IMAGE_SYSTEM_PROMPT : TEXT_SYSTEM_PROMPT
  const contextBlock = buildContextBlock(pageHint)
  return contextBlock ? `${base}\n\nCurrent app context: ${contextBlock}` : base
}

/** Split a base64 data URL into { mimeType, data } for Gemini inlineData. */
function dataUrlParts(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

async function askGemini(history, userMessage, pageHint, image) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_AI_API_KEY
  // @google/genai (current SDK) — required for the new "AQ." AI Studio keys.
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })

  const contents = [
    ...history.map(m => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [{ text: m.text || '(image attached)' }],
    })),
    {
      role: 'user',
      parts: [
        { text: userMessage || 'What do you see in this image?' },
        ...(image?.dataUrl ? (() => {
          const p = dataUrlParts(image.dataUrl)
          return p ? [{ inlineData: p }] : []
        })() : []),
      ],
    },
  ]

  const call = (model) => ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemPrompt(!!image?.dataUrl, pageHint),
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  })

  let response
  try {
    response = await call(GEMINI_MODEL)
  } catch (err) {
    // Older API keys may not have 2.5 access — retry once on the fallback model.
    if (!/404|not found|not supported/i.test(String(err?.message || err))) throw err
    response = await call(GEMINI_FALLBACK_MODEL)
  }
  return response.text?.trim() || 'No response received.'
}

async function askGroq(history, userMessage, pageHint, image) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY
  const Groq = (await import('groq-sdk')).default
  const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true })

  // Prior conversation history (text-only — attached images are not re-sent
  // on later turns to keep the payload small)
  const messages = [
    { role: 'system', content: systemPrompt(!!image?.dataUrl, pageHint) },
    ...history.map(m => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text,
    })),
    // New user message (multimodal content array when an image is attached)
    image?.dataUrl
      ? {
          role: 'user',
          content: [
            { type: 'text', text: userMessage || 'What do you see in this image?' },
            { type: 'image_url', image_url: { url: image.dataUrl } },
          ],
        }
      : { role: 'user', content: userMessage },
  ]

  const completion = await groq.chat.completions.create({
    model: image?.dataUrl ? GROQ_VISION_MODEL : GROQ_MODEL,
    messages,
    max_tokens: image?.dataUrl ? 1024 : 512,
    temperature: 0.7,
  })
  return completion.choices?.[0]?.message?.content?.trim() || 'No response received.'
}

/**
 * Send a chat message to the configured AI provider.
 *
 * @param {Array<{role:'user'|'ai', text:string}>} history  Prior turns
 * @param {string} userMessage  The new message from the user
 * @param {string} [pageHint]   Optional page name for context injection
 * @param {{name:string, dataUrl:string}|null} [image]  Optional attached image
 *        (base64 data URL) — analyzed by the provider's vision model.
 * @returns {Promise<string>}   The assistant reply text
 */
/** Turn a provider error into a short, actionable message. */
function describe(provider, err) {
  const raw = String(err?.message || err)
  const isAuthKey = provider === 'gemini' && String(import.meta.env.VITE_GEMINI_API_KEY || '').startsWith('AQ.')
  if (isAuthKey && /401|UNAUTHENTICATED|ACCESS_TOKEN_TYPE_UNSUPPORTED|invalid authentication credentials/i.test(raw)) {
    return `${provider}: your AQ. auth key was REJECTED — most likely TRUNCATED when copied (real ones are longer) or expired. Re-copy the FULL key from aistudio.google.com/apikey into .env, or create a new one`
  }
  if (/API_KEY_SERVICE_BLOCKED/i.test(raw)) {
    return `${provider}: key is blocked — enable the "Generative Language API" for the key's Google Cloud project (console.cloud.google.com → APIs & Services), or create a fresh key at aistudio.google.com/apikey`
  }
  if (/Invalid Auth key/i.test(raw)) {
    return `${provider}: the AQ. auth key was rejected as invalid — it is usually TRUNCATED when copied. Re-copy the FULL key from aistudio.google.com/apikey (open the key → copy icon), or create a new one`
  }
  if (/invalid[_ ]api[_ ]key|Invalid API Key/i.test(raw)) {
    return `${provider}: API key invalid — create a new one at ${provider === 'groq' ? 'console.groq.com/keys' : 'aistudio.google.com/apikey'}`
  }
  if (/API_KEY_INVALID|API key not valid/i.test(raw)) {
    return `${provider}: API key not valid — check VITE_${provider === 'gemini' ? 'GEMINI' : 'GROQ'}_API_KEY in .env (restart the dev server after editing)`
  }
  if (/429|quota|rate.?limit/i.test(raw)) {
    return `${provider}: rate limit / quota exceeded — wait a moment and retry`
  }
  return `${provider}: ${raw.slice(0, 160)}`
}

export async function sendChatMessage(history, userMessage, pageHint = '', image = null) {
  const primary = getProvider()
  if (!primary) {
    throw new Error(
      'No AI provider configured. Add VITE_GEMINI_API_KEY to your .env file and restart the dev server.'
    )
  }
  const fallback = primary === 'gemini' ? 'groq' : 'gemini'
  const attempt = (p) => p === 'gemini'
    ? askGemini(history, userMessage, pageHint, image)
    : askGroq(history, userMessage, pageHint, image)
  try {
    return await attempt(primary)
  } catch (primaryErr) {
    console.warn(`[chat] ${primary} failed — trying ${fallback}:`, primaryErr?.message || primaryErr)
    // Only try the fallback if it has a key configured
    if (getProvider() === primary && fallback === 'groq' && !import.meta.env.VITE_GROQ_API_KEY) {
      throw new Error(describe(primary, primaryErr))
    }
    try {
      return await attempt(fallback)
    } catch (fallbackErr) {
      throw new Error(
        `AI request failed. ${describe(primary, primaryErr)}`,
        { cause: fallbackErr }
      )
    }
  }
}
