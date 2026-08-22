import { Heading, Hr, Link, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'
import { formatDateKey } from '../src/lib/format'
import { type ReleaseNote } from '../src/lib/releases'

interface ReleaseNotesProps {
  release: ReleaseNote
  /** Where "Otvori aplikaciju" goes — the deployed origin, no path. */
  appUrl: string
}

/**
 * "Evo što je novo" — the one e-mail that goes to staff rather than to families.
 *
 * `showSignature={false}` for the same reason the upit notification drops it: a
 * mail TO the association must not close with the association's own contact
 * card and phone numbers. The admins reading this are the association.
 *
 * The body is assembled entirely from `ReleaseNote`, which is written in plain
 * Croatian by the `/release` skill — this template adds no wording of its own
 * beyond the frame, so what an admin reads is exactly what was reviewed in the
 * release commit.
 */
function ReleaseNotesEmail({ release, appUrl }: ReleaseNotesProps) {
  return (
    <EmailLayout preview={release.title} showSignature={false}>
      <Heading style={emailStyles.h1}>Nova verzija aplikacije</Heading>

      <Section style={versionBox}>
        {/* Single text nodes: interpolating `Verzija {x}` splits the string with
            React's `<!-- -->` separators, which renders fine but defeats every
            assertion on the rendered HTML. */}
        <Text style={versionText}>
          <strong>{`Verzija ${release.version}`}</strong>
          {` · ${formatDateKey(release.date)}`}
        </Text>
      </Section>

      {/* `title` is deliberately NOT repeated here. It is the subject line and
          the preheader — the two places a reader meets it before opening — and
          a third copy at the top of the body only pushed the first real section
          below the fold. */}
      {/* One block per part of the app, in the order the note wrote them. The
          headings are the NOTE's, never the template's: this file adds no
          grouping of its own, and in particular never a novo/poboljšano split,
          which would tear one feature in two the moment it both added and
          changed something. Staff use different halves of this application, so
          the area heading is how a teacher finds Dolazak without reading past
          everyone else's changes. */}
      {release.sections.map((section) => (
        <Section key={section.area} style={areaBlock}>
          <Text style={areaHeading}>{section.area}</Text>
          {section.changes.map((item, i) => (
            <Text key={i} style={bulletText}>
              {`• ${item}`}
            </Text>
          ))}
        </Section>
      ))}

      <Section style={{ textAlign: 'center', margin: '32px 0 8px' }}>
        <Link href={appUrl} style={button}>
          Otvori aplikaciju
        </Link>
      </Section>

      <Hr style={emailStyles.hr} />

      <Text style={emailStyles.textSmall}>
        Ovu poruku primaju administratori aplikacije, jednom po objavljenoj verziji.
        Promjene su već uživo — nema ništa što trebate instalirati ni potvrditi.
      </Text>
    </EmailLayout>
  )
}

const versionBox = {
  backgroundColor: '#ecfeff',
  border: '1px solid #a5f3fc',
  borderRadius: '8px',
  padding: '10px 16px',
  margin: '0 0 20px',
}

const versionText = {
  color: '#0e7490',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0',
}

// Each area is its own block with a rule above it. A border is the one
// separator every mail client renders the same way — a background panel per
// section is what Outlook loses.
const areaBlock = {
  borderTop: '1px solid #e5e7eb',
  paddingTop: '16px',
  margin: '20px 0 0',
}

const areaHeading = {
  color: '#0e7490',
  fontSize: '15px',
  fontWeight: '700' as const,
  margin: '0 0 10px',
}

// Hanging indent: the bullet sits in the left padding so a wrapped second line
// aligns under the text rather than under the dot. `<ul>` margins are the one
// thing Outlook and Gmail reliably disagree about, so the list is plain rows.
const bulletText = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 8px',
  paddingLeft: '4px',
}

const button = {
  backgroundColor: '#0891b2',
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: '600' as const,
  padding: '12px 28px',
  textDecoration: 'none',
}

ReleaseNotesEmail.PreviewProps = {
  appUrl: 'https://udruga-inovatic.hr',
  release: {
    version: '1.1.0',
    date: '2026-08-18',
    title: 'Upiti sada odmah pokazuju je li dijete već bilo polaznik.',
    sections: [
      {
        area: 'Upiti',
        changes: [
          'Uz dijete koje kod nas već ima račun stoji oznaka "Ponovni upis", i po njoj se može filtrirati.',
        ],
      },
      {
        area: 'Pristupni podaci',
        changes: [
          'Šaljete ih porukom Pristupni podaci na E-mailu, kad su ugovori potpisani.',
        ],
      },
      {
        area: 'Javne stranice',
        changes: ['Radionica se nudi samo do dana kad počinje.'],
      },
    ],
  },
} satisfies ReleaseNotesProps

export default ReleaseNotesEmail
