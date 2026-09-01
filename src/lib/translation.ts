import OpenAI from 'openai'

/**
 * Dedicated medical-translation service.
 *
 * Uses the AvalAI gateway (OpenAI-compatible, https://api.avalai.ir/v1) with a
 * strict system prompt that instructs the model to translate only — no
 * summarizing, no medical advice, no commentary. Medical terminology, dosages,
 * names, numbers, dates, prices and units are preserved verbatim.
 *
 * Config resolution:
 *   1. TRANSLATION_API_KEY / TRANSLATION_BASE_URL / TRANSLATION_MODEL env vars
 *      (TRANSLATION_BASE_URL defaults to the AvalAI endpoint)
 *   2. AVALAI_API_KEY (primary AvalAI credential in .env)
 *
 * Model: AVALAI_TRANSLATION_MODEL (default gpt-4o-mini — winner of the
 * 2026-08-31 bake-off vs gemini-2.5-flash on naturalness, cost and latency).
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

  const apiKey = process.env.TRANSLATION_API_KEY || process.env.AVALAI_API_KEY
  const baseURL = process.env.TRANSLATION_BASE_URL || 'https://api.avalai.ir/v1'
  const model = process.env.AVALAI_TRANSLATION_MODEL || 'gpt-4o-mini'

  if (!apiKey) {
    throw new TranslationConfigError(
      'Translation service is not configured. Set AVALAI_API_KEY in the environment.',
    )
  }

  try {
    const client = new OpenAI({ apiKey, baseURL, timeout: 30_000, maxRetries: 1 })
    const completion = await client.chat.completions.create({
      messages: [
        { role: 'system', content: buildTranslationSystemPrompt(targetLangName) },
        { role: 'user', content: messageText },
      ],
      model,
      temperature: 0.1,
      max_tokens: 2000,
      stream: false,
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

/** Identifier stored in MessageTranslation.provider for rows created via AvalAI. */
export const TRANSLATION_PROVIDER = 'avalai'
