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
    return <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
  }

  return null
}

async function renderBlock(block: any, locale: string, idx: number): Promise<any> {
  if (!block || typeof block !== 'object') return null
  const type = block.type
  const props = block.props || {}
  const content = block.content
  const key = block.id || idx

  if (type === 'paragraph') {
    const text = extractText(content)
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
  return null
}
