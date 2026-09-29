import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

const SALT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * A real bcrypt hash of a random secret nobody ever sees: the account exists,
 * but no password opens it until its owner sets one. Hashed rather than a
 * sentinel string so a login attempt against it costs exactly what a real
 * account costs — a fast refusal would tell a caller which accounts have no
 * password yet.
 */
export async function unusablePasswordHash(): Promise<string> {
  return hashPassword(randomBytes(32).toString('base64url'))
}
