import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * No `'use client'` module may reach `@/lib/db`, however indirectly.
 *
 * The browser build swaps in Prisma's stub client, which throws on any property
 * access. `db.ts` calls `$extends` when it loads, so one such import crashes the
 * whole page in the browser while the server still answers 200 — no build step
 * catches it. That is how `/admin/ucenici/[id]` broke (2026-09-25, through
 * `family-discount.ts`).
 *
 * Import edges into a `'use server'` module are not followed: the client bundle
 * gets a reference to each action, never the module body.
 */

const SRC = path.resolve(__dirname, '../../../src')
const DB = path.join(SRC, 'lib/db.ts')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return /\.tsx?$/.test(e.name) ? [p] : []
  })
}

const files = new Map(walk(SRC).map((p) => [p, readFileSync(p, 'utf8')]))

const DIRECTIVE = /^(?:\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*['"]use (client|server)['"]/
const directive = (p: string) => DIRECTIVE.exec(files.get(p) ?? '')?.[1]

// Value imports and re-exports only — `import type` is erased.
const IMPORT = /^\s*(?:import|export)\s+(?!type\b)[^'"]*?\bfrom\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm

function resolve(spec: string, from: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
  else return null
  const candidates = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
  return candidates.find((c) => files.has(c)) ?? null
}

function chainToDb(entry: string): string[] | null {
  const parent = new Map<string, string | null>([[entry, null]])
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.shift()!
    for (const m of (files.get(file) ?? '').matchAll(IMPORT)) {
      const dep = resolve(m[1] ?? m[2], file)
      if (!dep || parent.has(dep)) continue
      parent.set(dep, file)
      if (dep === DB) {
        const chain = [dep]
        for (let p = parent.get(dep); p; p = parent.get(p)) chain.push(p)
        return chain.reverse().map((p) => path.relative(SRC, p))
      }
      if (directive(dep) !== 'server') queue.push(dep)
    }
  }
  return null
}

describe('client bundles never import @/lib/db', () => {
  const clientFiles = [...files.keys()].filter((p) => directive(p) === 'client')

  it('finds the client modules to check', () => {
    expect(clientFiles.length).toBeGreaterThan(50)
  })

  it('no client module reaches src/lib/db.ts', () => {
    const leaks = clientFiles.map(chainToDb).filter((c): c is string[] => c !== null)
    expect(leaks.map((c) => c.join(' → '))).toEqual([])
  })
})
