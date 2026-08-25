import { readFile, stat } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

// Media files live in public/uploads on disk. Next.js (Turbopack) snapshots
// public/ at startup, so files uploaded after the server starts are NOT
// served statically — this route streams them from disk instead, making
// copied links work immediately and across restarts.
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain', '.csv': 'text/csv',
}

/**
 * GET /api/media/file/[name] — public media serving (matches the previous
 * static /uploads/* behavior: no auth, immutable cache — filenames are UUIDs).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name: rawName } = await params
  // Path-traversal guard: only a bare filename is accepted.
  const name = path.basename(rawName)
  if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.')) {
    return new Response('Bad request', { status: 400 })
  }

  const fullPath = path.join(UPLOAD_DIR, name)
  try {
    await stat(fullPath)
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const buffer = await readFile(fullPath)

  const ext = path.extname(name).toLowerCase()
  const contentType = MIME_BY_EXT[ext] || 'application/octet-stream'
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
