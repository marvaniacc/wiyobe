import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { authorizeBookingChat } from '@/lib/chat-auth'
import { translateMessage, isSupportedLanguage, TranslationConfigError, TranslationError, TRANSLATION_PROVIDER } from '@/lib/translation'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  messageId: z.string(),
  targetLanguage: z.string().min(2).max(10),
})

/**
 * POST /api/chat/translate
 *
 * On-demand AI translation of a single chat message into the caller's preferred
 * language. Caches results in the MessageTranslation table (unique on
 * [messageId, targetLanguage]) so repeat requests are instant.
 *
 * Authorization: the caller must be the patient, provider, or admin on the
 * booking that owns the message — verified via authorizeBookingChat.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { messageId, targetLanguage } = await parseBody(req, schema)

    if (!isSupportedLanguage(targetLanguage)) {
      return error(400, `Unsupported target language: ${targetLanguage}`)
    }

    const message = await db.chatMessage.findUnique({
      where: { id: messageId },
      select: { id: true, message: true, bookingId: true },
    })
    if (!message) return error(404, 'Message not found')
    if (!message.message) return error(400, 'Message has no text to translate')

    // Verify the caller is authorized on the booking that owns this message
    const auth = await authorizeBookingChat(message.bookingId, session)
    if (!auth) return error(403, 'Forbidden')

    // Read-through cache: check DB first
    const cached = await db.messageTranslation.findUnique({
      where: { messageId_targetLanguage: { messageId, targetLanguage } },
    })
    if (cached) {
      return json({ translatedText: cached.translatedText, cached: true })
    }

    // Call the LLM
    let translatedText: string
    try {
      translatedText = await translateMessage(message.message, targetLanguage)
    } catch (e: any) {
      if (e instanceof TranslationConfigError) return error(503, e.message)
      if (e instanceof TranslationError) return error(502, e.message)
      throw e
    }

    // Persist (best-effort — swallow unique-constraint race on concurrent requests)
    await db.messageTranslation.create({
      data: { messageId, targetLanguage, translatedText, provider: TRANSLATION_PROVIDER },
    }).catch(() => {})

    return json({ translatedText, cached: false })
  } catch (e) { return handleError(e) }
}
