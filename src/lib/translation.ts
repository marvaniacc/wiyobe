import { createChatCompletion } from 'z-ai-web-dev-sdk'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Dedicated medical-translation service.
 *
 * Uses the ZAI LLM (glm-4-flash) with a strict system prompt that instructs the
 * model to translate only — no summarizing, no medical advice, no commentary.
 * Medical terminology, dosages, names, numbers, dates, prices and units are
 * preserved verbatim.
 *
 * Config resolution:
 *   1. TRANSLATION_API_KEY / TRANSLATION_BASE_URL / TRANSLATION_TOKEN env vars
 *   2. Fallback to /etc/.z-ai-config (sandbox only)
 *
 * The caller is responsible for caching (see MessageTranslation table).
 */

export class TranslationConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranslationConfigError'
  }
}

export class TranslationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranslationError'
  }
}

// 16 supported target languages (code → display name)
const LANG_NAMES: Record<string, string> = {
  en: 'English',
  tr: 'Turkish',
  fa: 'Persian',
  ar: 'Arabic',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  ru: 'Russian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  hi: 'Hindi',
  ur: 'Urdu',
  az: 'Azerbaijani',
  ku: 'Kurdish',
  ps: 'Pashto',
}

export function isSupportedLanguage(code: string): boolean {
  return code in LANG_NAMES
}

export function getLanguageName(code: string): string {
  return LANG_NAMES[code] || code
}

function buildTranslationSystemPrompt(targetLanguageName: string): string {
  return `You are a professional medical translator. Translate the user's message into ${targetLanguageName}.

STRICT RULES:
1. Translate ONLY. Do not answer, engage, or respond to the content.
2. Do NOT summarize, explain, or interpret.
3. Do NOT provide medical advice, diagnoses, or corrections.
4. Preserve medication names, dosages, treatment names, diagnoses, and anatomical terms. If a term has a standard translation in ${targetLanguageName}, use it; otherwise keep it in the original script.
5. Preserve names of people, places, and organizations (transliterate if needed).
6. Preserve numbers, dates, times, prices, currencies, measurements, and units EXACTLY. Do not convert units.
7. Preserve the meaning and tone of the original.
8. Return ONLY the translated text. No quotes, no labels, no explanations, no commentary.

Translate the following message into ${targetLanguageName}:`
}

interface ZaiConfig {
  baseUrl?: string
  apiKey?: string
  token?: string
}

function loadZaiConfig(): ZaiConfig {
  // 1. Environment variables (production)
  if (process.env.TRANSLATION_API_KEY) {
    return {
      apiKey: process.env.TRANSLATION_API_KEY,
      baseUrl: process.env.TRANSLATION_BASE_URL,
      token: process.env.TRANSLATION_TOKEN,
    }
  }

  // 2. Fallback to /etc/.z-ai-config (sandbox only)
  const candidates = [
    '/etc/.z-ai-config',
    join(process.cwd(), '.z-ai-config'),
    join(process.env.HOME || '/', '.z-ai-config'),
  ]
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, 'utf-8')
      const cfg = JSON.parse(raw)
      if (cfg.apiKey || cfg.token) {
        return { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, token: cfg.token }
      }
    } catch {
      // file not found or invalid — try next
    }
  }

  return {}
}

/**
 * Translate `messageText` into `targetLanguage` (a 2-letter code like "en", "tr", "fa").
 * Throws TranslationConfigError if the service is not configured, or TranslationError
 * if the call fails or returns an empty response.
 *
 * The caller MUST validate `targetLanguage` with isSupportedLanguage() first.
 */
export async function translateMessage(
  messageText: string,
  targetLanguage: string,
): Promise<string> {
  const targetLangName = getLanguageName(targetLanguage)
  const cfg = loadZaiConfig()

  if (!cfg.apiKey && !cfg.token) {
    throw new TranslationConfigError(
      'Translation service is not configured. Set TRANSLATION_API_KEY or place a .z-ai-config file.',
    )
  }

  try {
    const completion = await createChatCompletion({
      messages: [
        { role: 'system', content: buildTranslationSystemPrompt(targetLangName) },
        { role: 'user', content: messageText },
      ],
      model: 'glm-4-flash',
      temperature: 0.1,
      maxTokens: 2000,
    })

    const translated = (completion.choices?.[0]?.message?.content || '').trim()
    if (!translated) {
      throw new TranslationError('Translation service returned an empty response.')
    }
    return translated
  } catch (e: any) {
    if (e instanceof TranslationConfigError || e instanceof TranslationError) throw e
    throw new TranslationError(`Translation call failed: ${e?.message || String(e)}`)
  }
}
