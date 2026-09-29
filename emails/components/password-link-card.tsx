import { Link, Section, Text } from '@react-email/components'
import type { PasswordLinkCard } from '../../src/lib/credentials-email-recipients'

/**
 * The "choose your password" block: whose login this is, the children it opens
 * (for a parent), and the one button. Shared by the single mail sent from a
 * profile and by the setup-link campaign, so a parent reads the same thing
 * whichever way it reached them.
 *
 * The e-mail address is printed because it IS the login — a parent who used to
 * type a child's username needs to see that this changed.
 */
export function PasswordLinkBlock({ card }: Readonly<{ card: PasswordLinkCard }>) {
  return (
    <Section style={cardBox}>
      <Text style={label}>Prijava na portal</Text>
      <Text style={loginEmail}>{card.email}</Text>

      {card.children.length > 0 && (
        <>
          <Text style={label}>Na ovom računu {card.children.length === 1 ? 'je' : 'su'}</Text>
          {card.children.map((child, i) => (
            <Section key={i} style={childBox}>
              <Text style={childName}>{child.name}</Text>
              {child.groups.map((group, j) => (
                <Text key={j} style={groupText}>
                  {group.label}
                  <br />
                  <span style={groupMeta}>
                    {group.schedule} · {group.locationName}
                  </span>
                </Text>
              ))}
            </Section>
          ))}
        </>
      )}

      <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
        <Link href={card.url} style={button}>
          Postavi lozinku
        </Link>
      </Section>
      <Text style={note}>
        Poveznica vrijedi {card.validFor} i može se iskoristiti jednom. Ako ste lozinku već
        postavili i prijava vam radi, ovu poruku možete zanemariti — ili je iskoristite da
        lozinku promijenite. Dosadašnja lozinka vrijedi dok ne postavite novu.
      </Text>
      <Text style={note}>
        Ne prosljeđujte ovu poruku: tko ima poveznicu, može postaviti lozinku za ovaj račun.
      </Text>
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

const label = {
  fontSize: '12px',
  color: '#6b7280',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.03em',
  margin: '0 0 4px',
}

const loginEmail = {
  fontSize: '17px',
  fontWeight: 'bold',
  color: '#111827',
  margin: '0 0 16px',
}

const childBox = {
  backgroundColor: '#f0fdfa',
  border: '1px solid #99f6e4',
  borderRadius: '6px',
  padding: '10px 14px',
  margin: '0 0 8px',
}

const childName = {
  fontSize: '15px',
  fontWeight: 'bold',
  color: '#134e4a',
  margin: '0',
}

const groupText = {
  fontSize: '13px',
  color: '#134e4a',
  margin: '6px 0 0',
  lineHeight: '1.5',
}

const groupMeta = {
  color: '#4b5563',
}

const button = {
  backgroundColor: '#0891b2',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontSize: '15px',
  fontWeight: '600' as const,
  display: 'inline-block',
}

const note = {
  fontSize: '13px',
  color: '#6b7280',
  lineHeight: '1.5',
  margin: '8px 0 0',
}
