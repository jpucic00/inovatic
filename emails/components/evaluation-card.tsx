import { Section, Text } from '@react-email/components'
import {
  skillCategories,
  SKILL_LEVELS,
  SKILL_LEVEL_BADGE_STYLE,
  SKILL_LEVEL_LABELS,
} from '../../src/lib/assessment-rubric'
import type { EvaluationCard } from '../../src/lib/evaluation-email-cards'

/**
 * One child's report card, rendered for an e-mail.
 *
 * The rubric comes from `skillCategories(kind)` — the same source the staff card
 * and the portal read — so a competition card shows razrada ideja / izvedivost
 * and an SLR card shows slaganje / programiranje without this file knowing the
 * difference, and neither can drift from the other.
 *
 * All three levels are shown per skill with the achieved one filled, matching
 * the portal: it keeps the scale visible so a parent reads the result without
 * hunting for a legend.
 */
export function EvaluationCardBlock({ card }: Readonly<{ card: EvaluationCard }>) {
  return (
    <Section style={cardBox}>
      <Text style={childName}>{card.childName}</Text>
      {card.groupLabel && <Text style={groupLine}>{card.groupLabel}</Text>}

      {skillCategories(card.kind).map((category) => (
        <Section key={category.title}>
          <Text style={categoryTitle}>{category.title}</Text>
          {category.skills.map((skill) => {
            const value = card.skills[skill.key]
            return (
              <Section key={skill.key} style={skillRow}>
                <Text style={skillLabel}>{skill.label}</Text>
                {value === null ? (
                  <Text style={notGraded}>Nije ocijenjeno</Text>
                ) : (
                  <Text style={chipRow}>
                    {SKILL_LEVELS.map((level) => (
                      <span
                        key={level}
                        style={{
                          ...chipBase,
                          ...(level === value
                            ? SKILL_LEVEL_BADGE_STYLE[level]
                            : chipInactive),
                        }}
                      >
                        {SKILL_LEVEL_LABELS[level]}
                      </span>
                    ))}
                  </Text>
                )}
              </Section>
            )
          })}
        </Section>
      ))}

      {card.opisnaOcjena?.trim() && (
        <Section>
          <Text style={categoryTitle}>Opisna ocjena</Text>
          <Text style={opisna}>{card.opisnaOcjena}</Text>
        </Section>
      )}

      {card.recommendationLabel && (
        <Section style={recommendationBox}>
          <Text style={recommendationTitle}>Preporuka mentora</Text>
          <Text style={recommendationValue}>{card.recommendationLabel}</Text>
        </Section>
      )}

      <Text style={authorLine}>
        Ocijenio/la: {card.authorName} · {card.updatedAtLabel}
      </Text>
    </Section>
  )
}

const cardBox = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '16px 18px',
  margin: '0 0 12px',
}

const childName = {
  color: '#111827',
  fontSize: '17px',
  fontWeight: '700' as const,
  margin: '0',
}

const groupLine = {
  color: '#6b7280',
  fontSize: '13px',
  margin: '2px 0 14px',
}

const categoryTitle = {
  color: '#374151',
  fontSize: '11px',
  fontWeight: '700' as const,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  margin: '14px 0 6px',
}

const skillRow = {
  margin: '0 0 6px',
}

const skillLabel = {
  color: '#374151',
  fontSize: '14px',
  margin: '0 0 3px',
}

const chipRow = {
  margin: '0',
  lineHeight: '1',
}

// Inline-block spans rather than a table: three short chips wrap acceptably on a
// narrow phone, and a table here would out-width the 560px container.
const chipBase = {
  display: 'inline-block',
  border: '1px solid #e5e7eb',
  borderRadius: '4px',
  padding: '4px 8px',
  marginRight: '4px',
  fontSize: '11px',
  fontWeight: '600' as const,
}

const chipInactive = {
  backgroundColor: '#ffffff',
  color: '#9ca3af',
}

const notGraded = {
  color: '#9ca3af',
  fontSize: '12px',
  fontStyle: 'italic' as const,
  margin: '0',
}

const opisna = {
  color: '#374151',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0',
  whiteSpace: 'pre-wrap' as const,
}

const recommendationBox = {
  backgroundColor: '#ecfeff',
  borderRadius: '6px',
  padding: '10px 12px',
  margin: '14px 0 0',
}

const recommendationTitle = {
  color: '#155e75',
  fontSize: '11px',
  fontWeight: '700' as const,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  margin: '0 0 2px',
}

const recommendationValue = {
  color: '#111827',
  fontSize: '14px',
  fontWeight: '600' as const,
  margin: '0',
}

const authorLine = {
  borderTop: '1px solid #f3f4f6',
  color: '#9ca3af',
  fontSize: '12px',
  margin: '14px 0 0',
  paddingTop: '10px',
}
