import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// Upload avatar — accepts base64 image data, stores as data URL in avatarUrl field.
// In production this would upload to S3/Cloudinary and store the URL.
// SVG is explicitly rejected: it can carry scripts (stored-XSS vector).
const SAFE_AVATAR = /^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/
const schema = z.object({
  image: z.string().refine(
    (val) => SAFE_AVATAR.test(val) && val.length < 2_000_000, // max ~2MB
    'Image must be a base64 data URL (jpeg/png/gif/webp) under 2MB'
  ),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { image } = await parseBody(req, schema)

    await db.user.update({
      where: { id: session.id },
      data: { avatarUrl: image },
    })

    return json({ avatarUrl: image })
  } catch (e) { return handleError(e) }
}
