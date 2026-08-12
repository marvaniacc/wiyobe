/**
 * Server-safe TipTap JSON → HTML renderer.
 *
 * `generateHTML` from `@tiptap/core` references `window` (browser-only), so
 * it cannot be used in Next.js Server Components. This is a minimal, custom
 * renderer that walks the TipTap JSON tree and produces an HTML string
 * without any browser dependencies. It supports the node/mark types used by
 * the admin editor (StarterKit + Image + Link).
 *
 * Supported nodes: doc, paragraph, heading, bulletList, orderedList,
 * listItem, blockquote, codeBlock, hardBreak, horizontalRule, image, text.
 * Supported marks: bold, italic, code, link, strike, underline.
 */

type TiptapNode = {
  type: string
  attrs?: Record<string, any>
  content?: TiptapNode[]
  marks?: Array<{ type: string; attrs?: Record<string, any> }>
  text?: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderMarks(node: TiptapNode, innerHtml: string): string {
  if (!node.marks || node.marks.length === 0) return innerHtml
  let html = innerHtml
  // Apply marks from outermost to innermost (reverse order so the first
  // mark in the array wraps the others).
  for (const mark of node.marks) {
    switch (mark.type) {
      case 'bold':
        html = `<strong>${html}</strong>`
        break
      case 'italic':
        html = `<em>${html}</em>`
        break
      case 'strike':
      case 'strikeThrough':
        html = `<s>${html}</s>`
        break
      case 'underline':
        html = `<u>${html}</u>`
        break
      case 'code':
        html = `<code>${html}</code>`
        break
      case 'link': {
        const href = escapeHtml(mark.attrs?.href || '#')
        const target = mark.attrs?.target || '_blank'
        const rel = mark.attrs?.rel || 'noopener noreferrer'
        html = `<a href="${href}" target="${target}" rel="${rel}" class="text-primary underline">${html}</a>`
        break
      }
      default:
        // Unknown mark — skip (content already rendered)
        break
    }
  }
  return html
}

function renderNode(node: TiptapNode): string {
  // Text node — the leaf of every tree branch.
  if (node.type === 'text') {
    const text = escapeHtml(node.text || '')
    return renderMarks(node, text)
  }

  // Recursively render children.
  const inner = (node.content || []).map(renderNode).join('')

  switch (node.type) {
    case 'doc':
      return inner

    case 'paragraph':
      return `<p>${inner}</p>`

    case 'heading': {
      const level = Math.min(Math.max(node.attrs?.level || 2, 1), 6)
      return `<h${level}>${inner}</h${level}>`
    }

    case 'bulletList':
      return `<ul>${inner}</ul>`

    case 'orderedList':
      return `<ol>${inner}</ol>`

    case 'listItem':
      return `<li>${inner}</li>`

    case 'blockquote':
      return `<blockquote>${inner}</blockquote>`

    case 'codeBlock': {
      const lang = node.attrs?.language
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : ''
      return `<pre><code${cls}>${escapeHtml((node.content || []).map((c) => c.text || '').join(''))}</code></pre>`
    }

    case 'horizontalRule':
      return '<hr/>'

    case 'hardBreak':
      return '<br/>'

    case 'image': {
      const src = escapeHtml(node.attrs?.src || '')
      const alt = escapeHtml(node.attrs?.alt || '')
      const title = node.attrs?.title ? ` title="${escapeHtml(node.attrs.title)}"` : ''
      return `<img src="${src}" alt="${alt}"${title} />`
    }

    default:
      // Unknown node — render its children if any, otherwise skip.
      return inner
  }
}

/**
 * Convert TipTap JSON content to an HTML string. Returns a fallback
 * message for null/invalid content so the page never crashes.
 */
export function renderTiptapToHtml(content: unknown): string {
  try {
    if (!content || typeof content !== 'object') {
      return '<p><em>This post has no content.</em></p>'
    }
    const html = renderNode(content as TiptapNode)
    return html || '<p><em>This post has no content.</em></p>'
  } catch (e) {
    console.error('[blog render] Failed to render TipTap JSON to HTML:', e)
    return '<p><em>This post content could not be displayed.</em></p>'
  }
}
