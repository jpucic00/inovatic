'use client'

import { useEffect, useRef } from 'react'
import { BlockNoteSchema, defaultBlockSpecs, defaultStyleSpecs } from '@blocknote/core'
import { hr } from '@blocknote/core/locales'
import {
  BasicTextStyleButton,
  BlockTypeSelect,
  CreateLinkButton,
  FormattingToolbar,
  FormattingToolbarController,
  createReactStyleSpec,
  useActiveStyles,
  useBlockNoteEditor,
  useCreateBlockNote,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { EMAIL_FONT_SIZES, type EmailRichBlock } from '@/lib/email-rich-text'

/**
 * The three size steps, as the picker labels them. `''` is normal — the ABSENCE
 * of the style rather than a value, so unstyled text keeps rendering at the
 * mail layout's own size.
 */
const SIZE_OPTIONS = [
  { value: '', label: 'Normalno' },
  { value: 'sm', label: 'Malo' },
  { value: 'lg', label: 'Veliko' },
] as const

const fontSize = createReactStyleSpec(
  { type: 'fontSize', propSchema: 'string' },
  {
    render: ({ value, contentRef }) => (
      <span
        ref={contentRef}
        style={{ fontSize: EMAIL_FONT_SIZES[value as keyof typeof EMAIL_FONT_SIZES] }}
      />
    ),
  },
)

/**
 * A deliberately narrow subset of BlockNote.
 *
 * Only what an e-mail can carry: text, headings and lists. Images, video,
 * tables, code blocks, quotes and check lists are all left out — mail clients
 * render them inconsistently at best, and an image would additionally need an
 * upload path and an absolute URL. Colours are dropped for a different reason:
 * they are the one formatting an admin can use to make a message unreadable, or
 * to clash with the layout the mail is already wearing.
 *
 * The schema is the enforcement point, not the toolbar. A block type absent
 * here cannot arrive by paste, by slash menu or by keyboard shortcut either,
 * which is what lets `parseRichBlocks` on the server stay a narrowing step
 * rather than a second policy.
 */
const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
  },
  styleSpecs: {
    bold: defaultStyleSpecs.bold,
    italic: defaultStyleSpecs.italic,
    underline: defaultStyleSpecs.underline,
    strike: defaultStyleSpecs.strike,
    fontSize,
  },
})

function FontSizeSelect() {
  const editor = useBlockNoteEditor(schema)
  // Re-renders on every selection change, so the dropdown shows the size of the
  // text the cursor is actually in rather than the last one applied.
  const active = useActiveStyles(editor)

  return (
    <select
      aria-label="Veličina slova"
      value={active.fontSize ?? ''}
      onChange={(e) => {
        const next = e.target.value
        if (next === '') {
          editor.removeStyles({ fontSize: active.fontSize })
        } else {
          editor.addStyles({ fontSize: next })
        }
        editor.focus()
      }}
      className="h-7 rounded border border-gray-200 bg-white px-1.5 text-sm text-gray-700"
    >
      {SIZE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

interface Props {
  initialContent?: EmailRichBlock[] | null
  onChange: (blocks: EmailRichBlock[]) => void
}

export function EmailBodyEditor({ initialContent, onChange }: Readonly<Props>) {
  const editor = useCreateBlockNote({
    schema,
    // BlockNote ships a Croatian dictionary; without it the placeholder, the
    // slash menu and every toolbar tooltip are English in an otherwise
    // Croatian admin.
    dictionary: hr,
    // Non-empty seed so the editor initializes with something to type into.
    initialContent:
      initialContent && initialContent.length > 0
        ? (initialContent as never)
        : [{ type: 'paragraph', content: [] }],
  })

  // Latest callback in a ref so the subscription below is not torn down and
  // rebuilt on every keystroke-driven re-render of the parent.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    return editor.onChange(() => {
      onChangeRef.current(editor.document as unknown as EmailRichBlock[])
    })
  }, [editor])

  return (
    // min-h keeps the compose area the size the textarea it replaced was
    // (rows={10}); an editor that grows from one line makes a long message feel
    // like it does not fit.
    <div className="min-h-[220px] rounded-lg border border-gray-200 bg-white py-2">
      <BlockNoteView editor={editor} theme="light" formattingToolbar={false}>
        {/* Replaces the default toolbar rather than extending it: the defaults
            include colour pickers and file buttons that this schema has no
            blocks for. */}
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar>
              <BlockTypeSelect key="blockTypeSelect" />
              <BasicTextStyleButton basicTextStyle="bold" key="boldStyleButton" />
              <BasicTextStyleButton basicTextStyle="italic" key="italicStyleButton" />
              <BasicTextStyleButton basicTextStyle="underline" key="underlineStyleButton" />
              <BasicTextStyleButton basicTextStyle="strike" key="strikeStyleButton" />
              <FontSizeSelect key="fontSizeSelect" />
              <CreateLinkButton key="createLinkButton" />
            </FormattingToolbar>
          )}
        />
      </BlockNoteView>
    </div>
  )
}
