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

function collectListItems(content: PartialBlock[], start: number, type: ListType): [React.ReactNode[], number] {
  const items: React.ReactNode[] = []
  let i = start
  while (i < content.length && content[i].type === type) {
    const b = content[i]
    items.push(<li key={i}>{renderInline((b.content ?? []) as InlineItem[], `li-${i}`)}</li>)
    i++
  }
  return [items, i]
}

function renderBlock(block: PartialBlock, index: number): React.ReactNode | null {
  const inner = renderInline((block.content ?? []) as InlineItem[], `block-${index}`)
  const props = (block.props ?? {}) as BlockProps

  if (block.type === 'heading') {
    const { level = 2 } = props as HeadingProps
    return level <= 2 ? <h2 key={index}>{inner}</h2> : <h3 key={index}>{inner}</h3>
  }

  if (block.type === 'paragraph') {
    return <p key={index}>{inner}</p>
  }

  if (block.type === 'image') {
    const { url, caption } = props as ImageProps
    if (!url) return null
    return (
      <figure key={index}>
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
      <video key={index} controls>
        <source src={url} />
        <track kind="captions" src="" label="Titlovi" default />
      </video>
    )
  }

  return null
}

interface Props {
  content: PartialBlock[]
}

export function ArticleRenderer({ content }: Readonly<Props>) {
  const blocks: React.ReactNode[] = []
  let i = 0

  while (i < content.length) {
    const block = content[i]

    if (block.type === 'bulletListItem') {
      const [items, next] = collectListItems(content, i, 'bulletListItem')
      blocks.push(<ul key={`ul-${i}`}>{items}</ul>)
      i = next
      continue
    }

    if (block.type === 'numberedListItem') {
      const [items, next] = collectListItems(content, i, 'numberedListItem')
      blocks.push(<ol key={`ol-${i}`}>{items}</ol>)
      i = next
      continue
    }

    const node = renderBlock(block, i)
    if (node) blocks.push(node)
    i++
  }

  return <div className="article-body">{blocks}</div>
}
