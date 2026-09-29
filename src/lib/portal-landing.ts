import type { UserRole } from '@prisma/client'

/**
 * Where a login lands, as a pure function of what the account can open — kept
 * apart from `portal-children.ts` (which reads the database) so the rule can be
 * tested and imported without pulling `@/lib/db` along.
 */

export type PortalPanel = 'admin' | 'teacher'

export type PortalChild = { id: string; firstName: string; lastName: string }

export type PortalChoices = {
  panels: PortalPanel[]
  children: PortalChild[]
}

const PANEL_PATH: Record<PortalPanel, string> = { admin: '/admin', teacher: '/nastavnik' }

export function panelPath(panel: PortalPanel): string {
  return PANEL_PATH[panel]
}

/**
 * One option → straight there; more than one → the picker. A parent with a
 * single child already carries that child's `studentId` from `authorize()`, so
 * `/portal` opens it directly.
 */
export function landingFor(role: UserRole, choices: PortalChoices): string {
  if (role === 'CLASSROOM') return '/portal'
  const options = choices.panels.length + choices.children.length
  if (options > 1) return '/portal/odabir'
  if (choices.panels.length === 1) return panelPath(choices.panels[0])
  return '/portal'
}
