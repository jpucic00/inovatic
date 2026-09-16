import { Section, Text } from '@react-email/components'
import type { GroupTermin } from '../../src/lib/group-termin'

/**
 * One group's termin as a parent reads it — program, group, when, where. The
 * same teal box the invitation's schedule options and the credentials card
 * use, so a termin looks the same in every mail that mentions one.
 *
 * The program title leads, since that is what the parent chose on the form;
 * the group's own name is a second line when the admin gave it one.
 */
export function GroupTerminBox({ termin }: Readonly<{ termin: GroupTermin }>) {
  return (
    <Section style={box}>
      <Text style={text}>
        <strong>{termin.programTitle}</strong>
        {termin.groupName && (
          <>
            <br />
            {termin.groupName}
          </>
        )}
        <br />
        {termin.schedule}
        <br />
        📍 {termin.locationName}
        <br />
        <span style={address}>{termin.locationAddress}</span>
      </Text>
    </Section>
  )
}

const box = {
  backgroundColor: '#f0fdfa',
  border: '1px solid #99f6e4',
  borderRadius: '8px',
  padding: '12px 16px',
  margin: '0 0 8px',
}

const text = {
  color: '#134e4a',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0',
}

const address = {
  color: '#4b5563',
  fontSize: '13px',
}
