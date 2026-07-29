import type { PartialBlock } from '@blocknote/core'
import React from 'react'

type InlineStyle = { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; code?: boolean }

type InlineItem =
  | { type: 'text'; text: string; styles: InlineStyle }
  | { type: 'link'; href: string; content: InlineItem[] }

interface HeadingProps { level?: number }
interface ImageProps { url?: string; caption?: string }
interface VideoProps { url?: string }

type BlockProps = HeadingProps | ImageProps | VideoProps
type ListType = 'bulletListItem' | 'numberedListItem'

function renderInline(items: InlineItem[], keyPrefix: string): React.ReactNode {
  return items.map((item, i) => {
    const key = `${keyPrefix}-${i}`
    if (item.type === 'link') {
      const isInternal = item.href.startsWith('/')
      return (
        <a
          key={key}
          href={item.href}
          {...(!isInternal && { target: '_blank', rel: 'noopener noreferrer' })}
        >
          {renderInline(item.content, key)}
        </a>
      )
    }
    let node: React.ReactNode = item.text
    if (item.styles?.bold) node = <strong>{node}</strong>
    if (item.styles?.italic) node = <em>{node}</em>
    if (item.styles?.underline) node = <u>{node}</u>
    if (item.styles?.strikethrough) node = <s>{node}</s>
    if (item.styles?.code) node = <code>{node}</code>
    return <React.Fragment key={key}>{node}</React.Fragment>
  })
}

/* A table's content is an object ({ rows: … }), not an inline array — reading it
   blindly would throw and take the whole article page down. */
function inlineOf(block: PartialBlock): InlineItem[] {
  return Array.isArray(block.content) ? (block.content as unknown as InlineItem[]) : []
}

/* Indented blocks (a toggle's body, a nested bullet) live under `children`. */
function childrenOf(block: PartialBlock): PartialBlock[] {
  return Array.isArray(block.children) ? (block.children as PartialBlock[]) : []
}

function collectListItems(
  content: PartialBlock[],
  start: number,
  type: ListType,
  keyPrefix: string,
): [React.ReactNode[], number] {
  const items: React.ReactNode[] = []
  let i = start
  while (i < content.length && content[i].type === type) {
    const b = content[i]
    const key = `${keyPrefix}-${i}`
    const kids = childrenOf(b)
    items.push(
      <li key={key}>
        {renderInline(inlineOf(b), `li-${key}`)}
        {kids.length > 0 && renderBlocks(kids, key)}
      </li>,
    )
    i++
  }
  return [items, i]
}

function renderBlock(block: PartialBlock, key: string): React.ReactNode | null {
  const inner = renderInline(inlineOf(block), key)
  const props = (block.props ?? {}) as BlockProps

  if (block.type === 'toggleListItem') {
    const kids = childrenOf(block)
    // Rendered open: the body is content the author wrote, not a footnote, and a
    // collapsed <details> reads as missing. Still collapsible by click.
    return (
      <details key={key} open>
        <summary>{inner}</summary>
        {kids.length > 0 && renderBlocks(kids, key)}
      </details>
    )
  }

  if (block.type === 'heading') {
    const { level = 2 } = props as HeadingProps
    return level <= 2 ? <h2 key={key}>{inner}</h2> : <h3 key={key}>{inner}</h3>
  }

  if (block.type === 'paragraph') {
    return <p key={key}>{inner}</p>
  }

  if (block.type === 'image') {
    const { url, caption } = props as ImageProps
    if (!url) return null
    return (
      <figure key={key}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={caption ?? ''} loading="lazy" />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    )
  }

  if (block.type === 'video') {
    const { url } = props as VideoProps
    if (!url) return null
    return (
      <video key={key} controls>
        <source src={url} />
        <track kind="captions" />
      </video>
    )
  }

  // Any block type without its own branch (quote, checkListItem, codeBlock, …)
  // still shows its text — an author's words must never vanish silently.
  const fallback = inlineOf(block)
  return fallback.length > 0 ? <p key={key}>{inner}</p> : null
}

function renderBlocks(content: PartialBlock[], keyPrefix: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = []
  let i = 0

  while (i < content.length) {
    const block = content[i]
    const key = `${keyPrefix}-${i}`

    if (block.type === 'bulletListItem') {
      const [items, next] = collectListItems(content, i, 'bulletListItem', key)
      blocks.push(<ul key={`ul-${key}`}>{items}</ul>)
      i = next
      continue
    }

    if (block.type === 'numberedListItem') {
      const [items, next] = collectListItems(content, i, 'numberedListItem', key)
      blocks.push(<ol key={`ol-${key}`}>{items}</ol>)
      i = next
      continue
    }

    const node = renderBlock(block, key)
    if (node) blocks.push(node)

    // A toggle renders its own body; everything else keeps indented blocks as
    // following siblings (a <p> cannot legally contain them).
    if (block.type !== 'toggleListItem') {
      const kids = childrenOf(block)
      if (kids.length > 0) blocks.push(...renderBlocks(kids, `${key}-c`))
    }

    i++
  }

  return blocks
}

interface Props {
  content: PartialBlock[]
}

export function ArticleRenderer({ content }: Readonly<Props>) {
  return <div className="article-body">{renderBlocks(content, 'b')}</div>
}
