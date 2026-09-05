import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { authorizeBookingChat, getOtherParticipant } from '@/lib/chat-auth'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// 5 MB per individual attachment (base64 ≈ 33% larger than raw bytes)
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
// Up to 6 attachments per message
const MAX_ATTACHMENTS = 6
// Allow common document / image types
const ALLOWED_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'application/zip',
])

/**
 * GET /api/chat?bookingId=X
 *
 * Returns chat messages for a booking. Both the patient and the provider
 * (and admins) can view the message thread for any booking they're party to.
 * Attachments are returned as metadata only (id/fileName/fileType/fileSize);
 * the raw bytes are served through /api/chat/attachment which re-checks auth.
 */
export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { searchParams } = new URL(req.url)
    const bookingId = searchParams.get('bookingId')
    if (!bookingId) return error(400, 'bookingId required')

    const auth = await authorizeBookingChat(bookingId, session)
    if (!auth) return error(403, 'Forbidden')

    const messages = await db.chatMessage.findMany({
      where: { bookingId },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true, role: true } },
        attachments: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    })

    // Mark messages from the other party as read
    await db.chatMessage.updateMany({
      where: { bookingId, senderId: { not: session.id }, read: false },
      data: { read: true },
    })

    return json({ messages })
  } catch (e) { return handleError(e) }
}

const attachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100),
  fileSize: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  dataUrl: z.string().refine(
    (v) => v.startsWith('data:') && v.length < MAX_ATTACHMENT_BYTES * 1.5,
    'Invalid data URL',
  ),
})

const sendSchema = z.object({
  bookingId: z.string(),
  message: z.string().trim().max(2000).optional(),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
}).refine(
  (d) => (d.message && d.message.length > 0) || (d.attachments && d.attachments.length > 0),
  'Message or at least one attachment is required',
)

function decodeAndValidateAttachment(dataUrl: string, declaredType: string, declaredSize: number): boolean {
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match || match[1] !== declaredType) return false

  try {
    // Never trust fileSize supplied by the browser: validate decoded bytes
    // before persisting the data URL in the database.
    return Buffer.from(match[2], 'base64').length === declaredSize
  } catch {
    return false
  }
}

/**
 * POST /api/chat
 *
 * Send a message (with optional attachments) in a booking's chat thread.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { bookingId, message, attachments } = await parseBody(req, sendSchema)

    const auth = await authorizeBookingChat(bookingId, session)
    if (!auth) return error(403, 'Forbidden')

    // Validate attachment MIME types server-side
    if (attachments && attachments.length > 0) {
      for (const a of attachments) {
        if (!ALLOWED_TYPES.has(a.fileType)) {
          return error(400, `Unsupported file type: ${a.fileType}`)
        }
        if (!decodeAndValidateAttachment(a.dataUrl, a.fileType, a.fileSize)) {
          return error(400, `Invalid attachment: ${a.fileName}`)
        }
      }
    }

    const msg = await db.chatMessage.create({
      data: {
        bookingId,
        senderId: session.id,
        message: message && message.length > 0 ? message : null,
        attachments: attachments && attachments.length > 0
          ? { create: attachments.map((a) => ({ fileName: a.fileName, fileType: a.fileType, fileSize: a.fileSize, dataUrl: a.dataUrl })) }
          : undefined,
      },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true, role: true } },
        attachments: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } },
      },
    })

    // Notify the other party
    const other = getOtherParticipant(auth.booking, auth.providerUserId, session)
    if (other.id) {
      const { notify } = await import('@/lib/notify')
      const body = attachments && attachments.length > 0
        ? `${session.name || 'Someone'} sent you ${attachments.length} file${attachments.length > 1 ? 's' : ''}${message ? ' and a message' : ''}.`
        : `${session.name || 'Someone'} sent you a message.`
      await notify({
        userId: other.id,
        type: 'chat_message',
        title: 'New message',
        body,
        link: 'messages',
        meta: { bookingId, messageId: msg.id },
      })
    }

    return json({ message: msg }, 201)
  } catch (e) { return handleError(e) }
}
