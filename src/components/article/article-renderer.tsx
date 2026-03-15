import type { PartialBlock } from '@blocknote/core'
import React from 'react'

type InlineStyle = { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; code?: boolean }

type InlineItem =
  | { type: 'text'; text: string; styles: InlineStyle }
  | { type: 'link'; href: string; content: InlineItem[] }

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

interface Props {
  content: PartialBlock[]
}

export function ArticleRenderer({ content }: Props) {
  const blocks: React.ReactNode[] = []
  let i = 0

  while (i < content.length) {
    const block = content[i]

    if (block.type === 'bulletListItem') {
      const items: React.ReactNode[] = []
      while (i < content.length && content[i].type === 'bulletListItem') {
        const b = content[i]
        items.push(
          <li key={i}>{renderInline((b.content ?? []) as InlineItem[], `li-${i}`)}</li>,
        )
        i++
      }
      blocks.push(<ul key={`ul-${i}`}>{items}</ul>)
      continue
    }

    if (block.type === 'numberedListItem') {
      const items: React.ReactNode[] = []
      while (i < content.length && content[i].type === 'numberedListItem') {
        const b = content[i]
        items.push(
          <li key={i}>{renderInline((b.content ?? []) as InlineItem[], `li-${i}`)}</li>,
        )
        i++
      }
      blocks.push(<ol key={`ol-${i}`}>{items}</ol>)
      i++
      continue
    }

    const inner = renderInline((block.content ?? []) as InlineItem[], `block-${i}`)
    const props = (block.props ?? {}) as Record<string, unknown>

    if (block.type === 'heading') {
      const level = (props.level as number) ?? 2
      if (level <= 2) {
        blocks.push(<h2 key={i}>{inner}</h2>)
      } else {
        blocks.push(<h3 key={i}>{inner}</h3>)
      }
    } else if (block.type === 'paragraph') {
      blocks.push(<p key={i}>{inner}</p>)
    } else if (block.type === 'image') {
      const url = props.url as string
      const caption = props.caption as string | undefined
      if (url) {
        blocks.push(
          <figure key={i}>
            <img src={url} alt={caption ?? ''} loading="lazy" />
            {caption && <figcaption>{caption}</figcaption>}
          </figure>,
        )
      }
    } else if (block.type === 'video') {
      const url = props.url as string
      if (url) {
        blocks.push(
          <video key={i} controls>
            <source src={url} />
          </video>,
        )
      }
    }

    i++
  }

  return <div className="article-body">{blocks}</div>
}
