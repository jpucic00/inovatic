import type { PartialBlock } from '@blocknote/core'
import { ArticleRenderer } from './article-renderer'

interface Props {
  content: PartialBlock[]
}

export function ArticleContent({ content }: Props) {
  return <ArticleRenderer content={content} />
}
