import { type ReactNode } from 'react'
import { ProviderListRenderer } from './blocks/provider-list-renderer'
import { AuthFormBlockSSR } from './blocks/auth-form-block-ssr'
import { FeaturedDoctorsSSR } from './blocks/featured-doctors-ssr'

type BlockNoteSSRRendererProps = {
  content: any
  htmlContent?: string | null
  locale?: string
}

function extractText(content: any): string {
  if (!content || !Array.isArray(content)) return ''
  return content.map((item: any) => {
    if (typeof item === 'string') return item
    if (item?.type === 'text') return item.text || ''
    return ''
  }).join('')
}

type RenderItem =
  | { kind: 'element'; node: any }
  | { kind: 'list'; listType: 'ul' | 'ol'; items: any[] }

export async function BlockNoteSSRRenderer({ content, htmlContent, locale = 'en' }: BlockNoteSSRRendererProps) {
  let renderItems: RenderItem[] | null = null

  try {
    if (content && Array.isArray(content) && content.length > 0) {
      const isBlockNote = content.every(
        (item: any) => item && typeof item === 'object' && typeof item.type === 'string'
      )
      if (isBlockNote) {
        const items: RenderItem[] = []
        let listBuffer: any[] = []
        let currentListType: 'ul' | 'ol' | null = null

        for (let idx = 0; idx < content.length; idx++) {
          const block = content[idx]
          const isBullet = block.type === 'bulletListItem'
          const isNumbered = block.type === 'numberedListItem'

          if (isBullet || isNumbered) {
            const newListType = isBullet ? 'ul' : 'ol'
            if (currentListType && currentListType !== newListType) {
              items.push({ kind: 'list', listType: currentListType, items: listBuffer })
              listBuffer = []
            }
            currentListType = newListType
            listBuffer.push(await renderBlock(block, locale, idx))
          } else {
            if (currentListType && listBuffer.length > 0) {
              items.push({ kind: 'list', listType: currentListType, items: listBuffer })
              listBuffer = []
              currentListType = null
            }
            items.push({ kind: 'element', node: await renderBlock(block, locale, idx) })
          }
        }
        if (currentListType && listBuffer.length > 0) {
          items.push({ kind: 'list', listType: currentListType, items: listBuffer })
        }
        renderItems = items
      }
    }
  } catch (err) {
    console.error('BlockNoteSSRRenderer: rendering failed:', err)
  }

  // Create JSX outside try/catch
  if (renderItems !== null) {
    const jsxElements = renderItems.map((item, idx) => {
      if (item.kind === 'element') {
        return <div key={`el-${idx}`}>{item.node}</div>
      }
      const Tag = item.listType
      const listClass = item.listType === 'ol' ? 'list-decimal' : 'list-disc'
      return (
        <Tag key={`list-${idx}`} className={`my-2 ps-6 ${listClass}`}>
          {item.items}
        </Tag>
      )
    })
    return <div className="blocknote-ssr-renderer">{jsxElements}</div>
  }

  if (htmlContent && typeof htmlContent === 'string') {
    // Parse shortcodes like [[module:auth type="signup" role="doctor"]]
    // from the raw HTML and render React components in their place.
    return <div className="blocknote-ssr-renderer">{renderHtmlWithShortcodes(htmlContent)}</div>
  }

  return null
}

/* -------------------------------------------------------------------------
 * Shortcode parser — extracts [[module:NAME attr="value"]] patterns from
 * raw HTML strings and renders React components in their place.
 *
 * Supported shortcodes:
 *   [[module:auth type="signup" role="doctor"]]
 *   [[module:auth type="login" role="patient"]]
 *
 * The parser splits the HTML into segments and renders:
 *  - HTML segments via dangerouslySetInnerHTML
 *  - Module segments via the corresponding React component
 * ----------------------------------------------------------------------- */

type ShortcodeSegment =
  | { kind: 'html'; content: string }
  | { kind: 'module'; module: string; attrs: Record<string, string> }

function parseShortcodes(html: string): ShortcodeSegment[] {
  const segments: ShortcodeSegment[] = []
  // Match [[module:NAME attr1="val1" attr2="val2"]]
  const pattern = /\[\[module:(\w+)((?:\s+\w+="[^"]*")*)\s*\]\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html)) !== null) {
    // Push preceding HTML
    if (match.index > lastIndex) {
      segments.push({ kind: 'html', content: html.slice(lastIndex, match.index) })
    }
    // Parse module + attrs
    const module = match[1]
    const attrsStr = match[2] || ''
    const attrs: Record<string, string> = {}
    const attrPattern = /\s+(\w+)="([^"]*)"/g
    let attrMatch: RegExpExecArray | null
    while ((attrMatch = attrPattern.exec(attrsStr)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2]
    }
    segments.push({ kind: 'module', module, attrs })
    lastIndex = pattern.lastIndex
  }

  // Push trailing HTML
  if (lastIndex < html.length) {
    segments.push({ kind: 'html', content: html.slice(lastIndex) })
  }

  return segments
}

function renderHtmlWithShortcodes(html: string): ReactNode[] {
  const segments = parseShortcodes(html)
  return segments.map((seg, idx) => {
    if (seg.kind === 'html') {
      return <div key={`html-${idx}`} dangerouslySetInnerHTML={{ __html: seg.content }} />
    }
    // Module rendering
    if (seg.module === 'auth') {
      // Auth forms are now handled by standalone /login and /signup pages.
      // Shortcode-based auth on Custom Pages is deprecated.
      return (
        <div key={`module-${idx}`} className="my-8 rounded-[16px] border border-dashed border-divider p-6 text-center">
          <p className="text-sm font-medium text-foreground">Auth Form</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use{' '}
            <a href="/login" className="font-medium text-primary hover:underline">/login</a>
            {' '}or{' '}
            <a href="/signup" className="font-medium text-primary hover:underline">/signup</a>
            {' '}instead.
          </p>
        </div>
      )
    }
    // Future: support other modules here (doctors, hospitals, etc.)
    return (
      <div key={`unknown-${idx}`} className="rounded-[12px] border border-dashed border-divider p-4 text-center text-sm text-muted-foreground">
        Unknown module: {seg.module}
      </div>
    )
  })
}

async function renderBlock(block: any, locale: string, idx: number): Promise<any> {
  if (!block || typeof block !== 'object') return null
  const type = block.type
  const props = block.props || {}
  const content = block.content
  const key = block.id || idx

  if (type === 'paragraph') {
    const text = extractText(content)

    // Check if the paragraph text contains a shortcode like
    // [[module:auth type="signup" role="doctor"]]
    // If so, render the module component instead of plain text.
    const shortcodeMatch = text.match(/\[\[module:(\w+)((?:\s+\w+="[^"]*")*)\s*\]\]/)
    if (shortcodeMatch) {
      const moduleName = shortcodeMatch[1]
      const attrsStr = shortcodeMatch[2] || ''
      const attrs: Record<string, string> = {}
      const attrPattern = /\s+(\w+)="([^"]*)"/g
      let attrMatch: RegExpExecArray | null
      while ((attrMatch = attrPattern.exec(attrsStr)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2]
      }

      if (moduleName === 'auth') {
        // Auth forms are now handled by standalone /login and /signup pages.
        return (
          <div key={key} className="my-8 rounded-[16px] border border-dashed border-divider p-6 text-center">
            <p className="text-sm font-medium text-foreground">Auth Form</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use{' '}
              <a href="/login" className="font-medium text-primary hover:underline">/login</a>
              {' '}or{' '}
              <a href="/signup" className="font-medium text-primary hover:underline">/signup</a>
              {' '}instead.
            </p>
          </div>
        )
      }
      // Unknown module — render as info box
      return (
        <div key={key} className="rounded-[12px] border border-dashed border-divider p-4 text-center text-sm text-muted-foreground">
          Unknown module: {moduleName}
        </div>
      )
    }

    // Also check if the shortcode is embedded within other text
    // (e.g., "Sign up here: [[module:auth...]]")
    if (text.includes('[[module:')) {
      // Split the text at shortcode boundaries and render each part
      const parts: ReactNode[] = []
      const pattern = /\[\[module:(\w+)((?:\s+\w+="[^"]*")*)\s*\]\]/g
      let lastIndex = 0
      let match: RegExpExecArray | null
      let partIdx = 0
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push(<span key={`text-${partIdx++}`}>{text.slice(lastIndex, match.index)}</span>)
        }
        const mn = match[1]
        const as = match[2] || ''
        const a: Record<string, string> = {}
        const ap = /\s+(\w+)="([^"]*)"/g
        let am: RegExpExecArray | null
        while ((am = ap.exec(as)) !== null) { a[am[1]] = am[2] }
        if (mn === 'auth') {
          // Auth forms are now handled by standalone /login and /signup pages.
          parts.push(
            <div key={`module-${partIdx++}`} className="my-4 rounded-[16px] border border-dashed border-divider p-6 text-center">
              <p className="text-sm font-medium text-foreground">Auth Form</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Use{' '}
                <a href="/login" className="font-medium text-primary hover:underline">/login</a>
                {' '}or{' '}
                <a href="/signup" className="font-medium text-primary hover:underline">/signup</a>
                {' '}instead.
              </p>
            </div>
          )
        }
        lastIndex = pattern.lastIndex
      }
      if (lastIndex < text.length) {
        parts.push(<span key={`text-${partIdx++}`}>{text.slice(lastIndex)}</span>)
      }
      return <div key={key}>{parts}</div>
    }

    return <p key={key} className="my-2 text-base leading-relaxed text-foreground">{text}</p>
  }
  if (type === 'heading') {
    const level = props.level || 1
    const text = extractText(content)
    const sizes: Record<number, string> = {
      1: 'text-4xl font-bold my-4 text-foreground',
      2: 'text-3xl font-bold my-4 text-foreground',
      3: 'text-2xl font-semibold my-3 text-foreground',
    }
    const cls = sizes[level] || sizes[1]
    const Tag = `h${Math.min(Math.max(level, 1), 6)}` as any
    return <Tag key={key} className={cls}>{text}</Tag>
  }
  if (type === 'bulletListItem' || type === 'numberedListItem') {
    const text = extractText(content)
    return <li key={key} className="my-1 text-base text-foreground">{text}</li>
  }
  if (type === 'image') {
    return <img key={key} src={props.url || ''} alt={props.caption || ''} className="my-4 w-full rounded-[16px]" />
  }

  // ---- codeBlock ----
  // Admins often paste raw HTML into a code block. If the content looks
  // like HTML (starts with <), render it as raw HTML via
  // dangerouslySetInnerHTML. Otherwise, render as a styled <pre><code>.
  if (type === 'codeBlock') {
    const text = extractText(content)
    const lang = props.language || 'text'
    const trimmed = text.trim()

    // Check if the content is HTML (starts with <, <!DOCTYPE, or <html)
    if (trimmed.startsWith('<')) {
      // Parse shortcodes from the HTML content before rendering
      const segments = parseShortcodes(trimmed)
      if (segments.length > 0) {
        return (
          <div key={key} className="blocknote-codeblock-html">
            {renderHtmlWithShortcodes(trimmed)}
          </div>
        )
      }
      // No shortcodes — render raw HTML directly
      return (
        <div
          key={key}
          className="blocknote-codeblock-html"
          dangerouslySetInnerHTML={{ __html: trimmed }}
        />
      )
    }

    // Non-HTML code block — render as styled <pre><code>
    return (
      <pre key={key} className="my-4 overflow-x-auto rounded-[12px] border border-divider bg-surface-secondary p-4">
        <code className={`language-${lang} text-sm text-foreground`}>{text}</code>
      </pre>
    )
  }

  // ---- Custom Wishubest blocks (admin-embeddable dynamic widgets) ----
  // These blocks let admins compose landing pages that pull live data
  // (provider lists, featured doctors, auth forms) without writing code.

  if (type === 'providerList') {
    const providerType = (props.providerType as 'DOCTOR' | 'HOSPITAL' | 'HOTEL' | 'TRANSLATOR') || 'DOCTOR'
    const country = typeof props.country === 'string' ? props.country : undefined
    const limit = typeof props.limit === 'number' ? props.limit : 6
    const layout = props.layout === 'list' ? 'list' : 'grid'
    return (
      <ProviderListRenderer
        key={key}
        providerType={providerType}
        country={country}
        limit={limit}
        layout={layout}
        locale={locale}
      />
    )
  }

  if (type === 'featuredDoctors') {
    const title = typeof props.title === 'string' ? props.title : 'Top Doctors'
    const limit = typeof props.limit === 'number' ? props.limit : 4
    return <FeaturedDoctorsSSR key={key} title={title} limit={limit} locale={locale} />
  }

  if (type === 'authForm') {
    const authType = props.type === 'signup' ? 'signup' : 'login'
    const role = (props.role as 'patient' | 'doctor' | 'hospital' | 'hotel' | 'translator' | 'affiliate') || 'patient'
    const display = props.display === 'modal' ? 'modal' : 'inline'
    const buttonText = typeof props.buttonText === 'string' ? props.buttonText : ''
    return <AuthFormBlockSSR key={key} type={authType} role={role} display={display} buttonText={buttonText} />
  }

  return null
}
