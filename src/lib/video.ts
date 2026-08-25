// Video consultation integration — generates real meeting links via external services.
// Supports: Daily.co, Whereby, Zoom (via server-to-server OAuth), and Jitsi (free fallback).
//
// Configure with env vars:
//   VIDEO_PROVIDER=daily|whereby|zoom|jitsi (default: jitsi)
//   DAILY_API_KEY=your_daily_api_key
//   WHEREBY_API_KEY=your_whereby_api_key
//   ZOOM_ACCOUNT_ID=your_zoom_account_id
//   ZOOM_CLIENT_ID=your_zoom_client_id
//   ZOOM_CLIENT_SECRET=your_zoom_client_secret

interface VideoSession {
  url: string
  provider: string
  meetingId?: string
  password?: string
}

export function getVideoProvider(): string {
  return process.env.VIDEO_PROVIDER || 'jitsi'
}

export function isVideoConfigured(): boolean {
  const provider = getVideoProvider()
  if (provider === 'jitsi') return true // always available, free
  if (provider === 'daily') return !!process.env.DAILY_API_KEY
  if (provider === 'whereby') return !!process.env.WHEREBY_API_KEY
  if (provider === 'zoom') return !!process.env.ZOOM_ACCOUNT_ID && !!process.env.ZOOM_CLIENT_ID
  return false
}

export async function createVideoSession(bookingId: string, patientName: string, providerName: string): Promise<VideoSession> {
  const provider = getVideoProvider()
  const roomName = `wishubest-${bookingId.slice(-8)}`

  switch (provider) {
    case 'daily':
      return createDailyRoom(roomName, patientName, providerName)
    case 'whereby':
      return createWherebyRoom(roomName, patientName, providerName)
    case 'zoom':
      return createZoomMeeting(roomName, patientName, providerName)
    case 'jitsi':
    default:
      return {
        url: `https://meet.jit.si/${roomName}`,
        provider: 'jitsi',
      }
  }
}

// === Daily.co ===
async function createDailyRoom(roomName: string, patientName: string, providerName: string): Promise<VideoSession> {
  const apiKey = process.env.DAILY_API_KEY
  if (!apiKey) return jitsiFallback(roomName)

  try {
    const res = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: roomName,
        properties: {
          enable_chat: true,
          enable_screenshare: true,
          enable_recording: 'cloud',
          exp: Math.floor(Date.now() / 1000) + 4 * 3600, // 4 hours expiry
          nbf: Math.floor(Date.now() / 1000),
        },
      }),
    })

    if (!res.ok) throw new Error(`Daily.co API error: ${res.status}`)
    const data = await res.json()
    return {
      url: data.url,
      provider: 'daily',
      meetingId: data.id,
    }
  } catch (error) {
    console.error('Daily.co room creation failed:', error)
    return jitsiFallback(roomName)
  }
}

// === Whereby ===
async function createWherebyRoom(roomName: string, patientName: string, providerName: string): Promise<VideoSession> {
  const apiKey = process.env.WHEREBY_API_KEY
  if (!apiKey) return jitsiFallback(roomName)

  try {
    const res = await fetch('https://api.whereby.dev/v1/meetings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endDate: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
        fields: ['hostRoomUrl'],
      }),
    })

    if (!res.ok) throw new Error(`Whereby API error: ${res.status}`)
    const data = await res.json()
    return {
      url: data.roomUrl || data.hostRoomUrl,
      provider: 'whereby',
      meetingId: data.meetingId,
    }
  } catch (error) {
    console.error('Whereby room creation failed:', error)
    return jitsiFallback(roomName)
  }
}

// === Zoom (Server-to-Server OAuth) ===
let zoomAccessToken: { token: string; expiresAt: number } | null = null

async function getZoomAccessToken(): Promise<string | null> {
  if (zoomAccessToken && zoomAccessToken.expiresAt > Date.now() + 60000) {
    return zoomAccessToken.token
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID
  const clientId = process.env.ZOOM_CLIENT_ID
  const clientSecret = process.env.ZOOM_CLIENT_SECRET

  if (!accountId || !clientId || !clientSecret) return null

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const res = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=account_credentials&account_id=' + accountId,
    })

    if (!res.ok) throw new Error(`Zoom OAuth error: ${res.status}`)
    const data = await res.json()

    zoomAccessToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }
    return data.access_token
  } catch (error) {
    console.error('Zoom OAuth failed:', error)
    return null
  }
}

async function createZoomMeeting(roomName: string, patientName: string, providerName: string): Promise<VideoSession> {
  const token = await getZoomAccessToken()
  if (!token) return jitsiFallback(roomName)

  try {
    const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: `Wishubest: ${providerName} & ${patientName}`,
        type: 2, // Scheduled meeting
        start_time: new Date().toISOString(),
        duration: 60,
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: true,
          waiting_room: false,
          mute_upon_entry: false,
        },
      }),
    })

    if (!res.ok) throw new Error(`Zoom API error: ${res.status}`)
    const data = await res.json()
    return {
      url: data.join_url,
      provider: 'zoom',
      meetingId: String(data.id),
      password: data.password,
    }
  } catch (error) {
    console.error('Zoom meeting creation failed:', error)
    return jitsiFallback(roomName)
  }
}

// === Jitsi fallback (always free, no config needed) ===
function jitsiFallback(roomName: string): VideoSession {
  return {
    url: `https://meet.jit.si/${roomName}`,
    provider: 'jitsi',
  }
}

// === Get embeddable URL for iframe ===
export function getEmbedUrl(sessionUrl: string, provider: string): string {
  if (provider === 'jitsi') {
    // Jitsi can be embedded directly
    return sessionUrl
  }
  if (provider === 'daily') {
    // Daily.co supports iframe embedding
    return sessionUrl
  }
  if (provider === 'whereby') {
    // Whereby supports iframe embedding with ?embed param
    return sessionUrl + (sessionUrl.includes('?') ? '&' : '?') + 'embed'
  }
  if (provider === 'zoom') {
    // Zoom requires SDK for embedding, return the URL for redirect
    return sessionUrl
  }
  return sessionUrl
}

// === Check if provider supports iframe embedding ===
export function supportsEmbed(provider: string): boolean {
  return provider === 'jitsi' || provider === 'daily' || provider === 'whereby'
}
