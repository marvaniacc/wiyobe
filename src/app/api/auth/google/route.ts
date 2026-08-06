import { json, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Returns Google OAuth configuration so the client knows whether to use real
// Google Identity Services (GIS) or demo mode.
export async function GET() {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const hasGoogle = !!clientId
    return json({
      hasGoogle,
      clientId: clientId || null,
      demoMode: !hasGoogle,
    })
  } catch (e) { return handleError(e) }
}
