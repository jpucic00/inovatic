import React from 'react'
import { Heading, Link, Text } from '@react-email/components'
import { emailStyles } from './email-layout'
import {
  EMAIL_FONT_SIZES,
  type EmailInline,
  type EmailRichBlock,
  type EmailStyledText,
} from '../../src/lib/email-rich-text'

/**
 * The composed message body, rendered for an inbox.
 *
 * This is the deliberate twin of `src/components/article/article-renderer.tsx`,
 * NOT a reuse of it — the same reason `SKILL_LEVEL_BADGE_STYLE` exists beside
 * the Tailwind chip classes. That renderer emits bare semantics (`<p>`, `<h2>`)
 * and leans on the `.article-body` stylesheet for every dimension of its look;
 * a mail client has no stylesheet, so each rule has to travel inline on the
 * element itself. Sharing the walk would mean sharing the styling assumption,
 * which is the half that does not survive the trip.
 */

const headingStyle = (level: number) => ({
  color: '#111827',
  fontSize: level <= 1 ? '22px' : level === 2 ? '19px' : '17px',
  fontWeight: '700' as const,
  lineHeight: '1.35',
  margin: '0 0 12px',
})

const listStyle = {
  ...emailStyles.text,
  paddingLeft: '22px',
}

const listItemStyle = {
  margin: '0 0 6px',
}

function renderInline(items: readonly EmailInline[], keyPrefix: string): React.ReactNode {
  return items.map((item, i) => {
    const key = `${keyPrefix}-${i}`
    if (item.type === 'link') {
      return (
        <Link key={key} href={item.href} style={emailStyles.link}>
          {renderInline(item.content, key)}
        </Link>
      )
    }
    return <React.Fragment key={key}>{styledText(item)}</React.Fragment>
  })
}

function styledText(item: EmailStyledText): React.ReactNode {
  let node: React.ReactNode = item.text
  // Nested elements rather than one merged style object: `<strong>` and `<em>`
  // carry meaning a screen reader announces, and a client stripping inline CSS
  // still shows the emphasis.
  if (item.styles.bold) node = <strong>{node}</strong>
  if (item.styles.italic) node = <em>{node}</em>
  if (item.styles.underline) node = <u>{node}</u>
  if (item.styles.strike) node = <s>{node}</s>
  if (item.styles.fontSize) {
    node = <span style={{ fontSize: EMAIL_FONT_SIZES[item.styles.fontSize] }}>{node}</span>
  }
  return node
}

type ListType = 'bulletListItem' | 'numberedListItem'

/** One run of adjacent list items becomes one list — the walk's only lookahead. */
function collectListItems(
  blocks: readonly EmailRichBlock[],
  start: number,
  type: ListType,
  keyPrefix: string,
): [React.ReactNode[], number] {
  const items: React.ReactNode[] = []
  let i = start
  while (i < blocks.length && blocks[i].type === type) {
    const block = blocks[i]
    const key = `${keyPrefix}-${i}`
    const children = block.children ?? []
    items.push(
      <li key={key} style={listItemStyle}>
        {renderInline(block.content, key)}
        {children.length > 0 && renderBlocks(children, key)}
      </li>,
    )
    i++
  }
  return [items, i]
}

function renderBlock(block: EmailRichBlock, key: string): React.ReactNode | null {
  const inner = renderInline(block.content, key)

  if (block.type === 'heading') {
    const level = block.props?.level ?? 2
    // Always an <h2> element whatever the level: the visual weight travels in
    // the inline style, and the document outline of a one-message e-mail is not
    // worth three tag variants.
    return (
      <Heading key={key} as="h2" style={headingStyle(level)}>
        {inner}
      </Heading>
    )
  }

  // An empty paragraph is the blank line an admin typed between two thoughts.
  // The plain-text path drops those (`.filter(Boolean)`), but here the author
  // placed it deliberately in a visual editor, so it renders as spacing.
  if (block.content.length === 0) {
    return <Text key={key} style={{ ...emailStyles.text, margin: '0 0 8px' }} />
  }

  return (
    <Text key={key} style={emailStyles.text}>
      {inner}
    </Text>
  )
}

function renderBlocks(blocks: readonly EmailRichBlock[], keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let i = 0

  while (i < blocks.length) {
    const block = blocks[i]
    const key = `${keyPrefix}-${i}`

    if (block.type === 'bulletListItem' || block.type === 'numberedListItem') {
      const [items, next] = collectListItems(blocks, i, block.type, key)
      const Tag = block.type === 'bulletListItem' ? 'ul' : 'ol'
      nodes.push(
        <Tag key={`list-${key}`} style={listStyle}>
          {items}
        </Tag>,
      )
      i = next
      continue
    }

    const node = renderBlock(block, key)
    if (node) nodes.push(node)

    // A list renders its own nested items; everything else keeps indented
    // blocks as following siblings, since a <p> cannot legally contain them.
    const children = block.children ?? []
    if (children.length > 0) nodes.push(...renderBlocks(children, `${key}-c`))

    i++
  }

  return nodes
}

export function RichTextBody({ blocks }: Readonly<{ blocks: readonly EmailRichBlock[] }>) {
  return <>{renderBlocks(blocks, 'rt')}</>
}
