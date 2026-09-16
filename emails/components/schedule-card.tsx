import { Section, Text } from '@react-email/components'
import { GroupTerminBox } from './group-termin-box'
import type { ScheduleCard } from '../../src/lib/schedule-email-recipients'

/**
 * One child's groups, rendered for the schedule e-mail. A mail carries one of
 * these per child on the address, so the child's name heads the block — a
 * parent with two children reads two named blocks, not one merged list.
 */
export function ScheduleCardBlock({ card }: Readonly<{ card: ScheduleCard }>) {
  return (
    <Section style={cardBox}>
      <Text style={childName}>{card.childName}</Text>
      {card.groups.length > 0 ? (
        card.groups.map((group, i) => <GroupTerminBox key={i} termin={group} />)
      ) : (
        // Reachable only when an enrollment was removed between the cohort
        // being resolved and this mail going out — say so rather than render a
        // name with nothing under it.
        <Text style={emptyText}>Trenutno nema upisane grupe u ovoj školskoj godini.</Text>
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

const emptyText = {
  color: '#6b7280',
  fontSize: '14px',
  margin: '0',
}
