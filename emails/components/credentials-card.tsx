import { Section, Text } from '@react-email/components'
import type { CredentialsCard } from '../../src/lib/credentials-email-recipients'

/**
 * One child's portal login, rendered for an e-mail.
 *
 * Sibling of {@link EvaluationCardBlock}, and subject to the same one-per-mail
 * rule for a stronger reason: two children on one address have two different
 * logins, and a merged mail would hand a parent someone else's account. The
 * campaign builds this per recipient row, inside the send loop.
 *
 * The child's name heads the block so a parent with two children can tell the
 * two mails apart at a glance — the same job the per-recipient subject suffix
 * does in the inbox list.
 */
export function CredentialsCardBlock({ card }: Readonly<{ card: CredentialsCard }>) {
  return (
    <Section style={cardBox}>
      <Text style={childName}>{card.childName}</Text>

      <Section style={credentialsBox}>
        <Text style={credentialRow}>
          <span style={credentialLabel}>Korisničko ime</span>
          <br />
          <span style={credentialValue}>{card.username}</span>
        </Text>
        <Text style={credentialRow}>
          <span style={credentialLabel}>Lozinka</span>
          <br />
          <span style={credentialValue}>{card.password}</span>
        </Text>
      </Section>

      {card.groups.length > 0 && (
        <>
          <Text style={groupsHeading}>Upisane grupe</Text>
          {card.groups.map((group, i) => (
            <Section key={i} style={groupBox}>
              <Text style={groupText}>
                <strong>{group.label}</strong>
                <br />
                {group.schedule}
                <br />
                📍 {group.locationName}
                <br />
                <span style={groupAddress}>{group.locationAddress}</span>
              </Text>
            </Section>
          ))}
        </>
      )}
    </Section>
  )
}

const cardBox = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '16px',
  margin: '16px 0',
}

const childName = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#111827',
  margin: '0 0 12px',
}

const credentialsBox = {
  backgroundColor: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: '6px',
  padding: '12px 16px',
  margin: '0 0 16px',
}

const credentialRow = {
  margin: '0 0 8px',
  lineHeight: '1.5',
}

const credentialLabel = {
  fontSize: '12px',
  color: '#92400e',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.03em',
}

const credentialValue = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#111827',
  fontFamily: 'monospace',
}

const groupsHeading = {
  fontSize: '13px',
  fontWeight: 'bold',
  color: '#6b7280',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.03em',
  margin: '0 0 8px',
}

const groupBox = {
  backgroundColor: '#f0fdfa',
  border: '1px solid #99f6e4',
  borderRadius: '6px',
  padding: '10px 14px',
  margin: '0 0 8px',
}

const groupText = {
  fontSize: '14px',
  color: '#134e4a',
  margin: '0',
  lineHeight: '1.6',
}

const groupAddress = {
  fontSize: '13px',
  color: '#4b5563',
}
