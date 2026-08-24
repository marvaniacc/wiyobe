import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { error, handleError } from '@/lib/api'
import { authorizeBookingChat } from '@/lib/chat-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/chat/attachment?id=<attachmentId>&download=1
 *
 * Serves the raw bytes of a chat attachment with proper Content-Type /
 * Content-Disposition headers. Authorization is re-checked here against the
 * booking the attachment's message belongs to — the patient, the provider,
 * or an admin may download. Nobody else.
 *
 * Pass ?download=1 to force a download (attachment disposition); otherwise
 * the file is served inline (useful for image previews / PDF viewing).
 */
export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return error(400, 'id required')

    const attachment = await db.chatAttachment.findUnique({
      where: { id },
      include: { message: { select: { bookingId: true } } },
    })
    if (!attachment) return error(404, 'Attachment not found')

    // Re-check booking-chat authorization for this specific attachment's booking
    const auth = await authorizeBookingChat(attachment.message.bookingId, session)
    if (!auth) return error(403, 'Forbidden')

    // Decode the data URL → raw bytes
    const match = attachment.dataUrl.match(/^data:([^;]+);base64,([\s\S]*)$/)
    if (!match) return error(500, 'Invalid attachment encoding')

    const base64 = match[2]
    const bytes = Buffer.from(base64, 'base64')

    // Serve the VALIDATED fileType metadata — never the client-controlled
    // MIME embedded in the dataUrl, which could smuggle text/html or SVG
    // and execute on the app origin when previewed inline.
    const mimeType = attachment.fileType || 'application/octet-stream'

    const forceDownload = searchParams.get('download') === '1'
    // Anything that is not a safely-renderable image/PDF is forced to download.
    const safeInline = !forceDownload && /^(image\/(jpeg|png|gif|webp|bmp)|application\/pdf)$/.test(mimeType)
    const disposition = safeInline ? 'inline' : 'attachment'
    // Sanitize filename for the header (strip quotes / newlines)
    const safeName = (attachment.fileName || 'attachment').replace(/["\r\n]/g, '')

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `${disposition}; filename="${safeName}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) { return handleError(e) }
}
