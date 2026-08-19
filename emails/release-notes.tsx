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

      <Text style={emailStyles.text}>{release.title}</Text>

      <Section>
        {/* One flat list, ordered feature by feature. The heading is the
            template's, not the note's: grouping the lines by novo/poboljšano
            would split a single feature in two the moment it both adds and
            changes something. */}
        <Text style={sectionHeading}>Što je novo</Text>
        {release.changes.map((item, i) => (
          <Text key={i} style={bulletText}>
            {`• ${item}`}
          </Text>
        ))}
      </Section>

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

const sectionHeading = {
  color: '#111827',
  fontSize: '15px',
  fontWeight: '700' as const,
  margin: '24px 0 8px',
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
    changes: [
      'Na Upitima stoji oznaka "Ponovni upis" kad dijete već ima račun kod nas, i po njoj se može filtrirati.',
      'Pristupne podatke za polaznički portal šaljete porukom Pristupni podaci na E-mailu, kad su ugovori potpisani.',
      'Radionica se na javnim stranicama nudi samo do dana kad počinje.',
    ],
  },
} satisfies ReleaseNotesProps

export default ReleaseNotesEmail
