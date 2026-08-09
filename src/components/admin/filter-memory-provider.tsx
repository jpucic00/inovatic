'use client'

import { createContext, useContext } from 'react'

/**
 * The logged-in admin's id, so the filter memory can be keyed to them. Empty
 * outside the admin layout, which every helper reads as "don't remember
 * anything" rather than falling back to a shared key.
 */
const AdminIdContext = createContext<string>('')

export function AdminIdProvider({
  adminId,
  children,
}: Readonly<{ adminId: string; children: React.ReactNode }>) {
  return <AdminIdContext.Provider value={adminId}>{children}</AdminIdContext.Provider>
}

export function useAdminId(): string {
  return useContext(AdminIdContext)
}
