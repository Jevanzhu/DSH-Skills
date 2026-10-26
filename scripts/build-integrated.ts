/**
 * Build the integrated skill: one directory (`skills/dsh-project-harness`) carrying
 * everything the two source skills ship, for clients and adopters that prefer a
 * single-copy install. The resource directories (references/, scripts/, templates/)
 * are mirrored from the sources byte for byte — the build owns them, so a hand edit
 * inside them is a bug the next run reverts. SKILL.md is deliberately outside the
 * build: it is the hand-written facade whose prose merges the two source skills, and
 * the build only refuses to run without it.
 *
 * `*.spec.ts` files are not carried over. The specs assert the two-skill layout
 * (sibling directories, partial-install refusals) and are this repository's own
 * tests, not part of what an adopter installs.
 *
 * A file shipping in both skills under the same relative path must be byte-identical
 * (the shared `harness-root.ts` is); a name collision with different bytes is an
 * error, never a silent winner.
 *
 *   node scripts/build-integrated.ts [--root <path>] [--check]
 *
 * `--check` writes nothing and exits 1 on any divergence, so it doubles as the gate
 * that keeps the committed integrated skill in sync with its sources.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const INTEGRATED_SKILL = 'dsh-project-harness'
export const SOURCE_SKILLS = ['agent-notes', 'project-harness'] as const
export const RESOURCE_DIRS = ['references', 'scripts', 'templates'] as const

/** Spec files assert the two-skill layout and are not part of the install surface. */
export const isExcluded = (name: string): boolean => name.endsWith('.spec.ts')

/**
 * Every file the integrated skill must carry, keyed by its path relative to the
 * integrated root (`references/format.md`, `scripts/bootstrap.ts`, …) and valued
 * with the absolute path of the source it is mirrored from. Directories are walked
 * recursively, so a future subdirectory joins the build by existing.
 */
export function integratedFileMap(skillsRoot: string): Map<string, string> {
  const files = new Map<string, string>()
  for (const skill of SOURCE_SKILLS) {
    for (const dir of RESOURCE_DIRS) {
      const root = join(skillsRoot, skill, dir)
      if (!existsSync(root)) continue
      const walk = (absDir: string, relDir: string): void => {
        for (const entry of readdirSync(absDir)) {
          const abs = join(absDir, entry)
          if (statSync(abs).isDirectory()) {
            walk(abs, `${relDir}/${entry}`)
            continue
          }
          if (isExcluded(entry)) continue
          const rel = `${relDir}/${entry}`
          const existing = files.get(rel)
          if (existing !== undefined && readFileSync(existing, 'utf8') !== readFileSync(abs, 'utf8')) {
            throw new Error(`build-integrated: ${rel} ships in both skills with different bytes`)
          }
          files.set(rel, abs)
        }
      }
      walk(root, dir)
    }
  }
  return files
}

interface Action {
  verb: 'copy' | 'refresh' | 'delete'
  rel: string
}

/** The difference between the integrated skill on disk and what the sources dictate. */
export function integratedDiff(skillsRoot: string, integratedRoot: string): Action[] {
  const actions: Action[] = []
  const files = integratedFileMap(skillsRoot)
  for (const [rel, source] of files) {
    const target = join(integratedRoot, rel)
    if (!existsSync(target)) {
      actions.push({ verb: 'copy', rel })
      continue
    }
    if (readFileSync(target, 'utf8') !== readFileSync(source, 'utf8')) {
      actions.push({ verb: 'refresh', rel })
    }
  }
  // Mirror, not append: a file the sources no longer ship must leave the copy too.
  for (const dir of RESOURCE_DIRS) {
    const target = join(integratedRoot, dir)
    if (!existsSync(target)) continue
    const walk = (absDir: string, relDir: string): void => {
      for (const entry of readdirSync(absDir)) {
        const abs = join(absDir, entry)
        const rel = `${relDir}/${entry}`
        if (statSync(abs).isDirectory()) {
          walk(abs, rel)
          continue
        }
        if (!files.has(rel)) actions.push({ verb: 'delete', rel })
      }
    }
    walk(target, dir)
  }
  return actions
}

function main(): void {
  const argv = process.argv.slice(2)
  let root: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root') {
      index += 1
      root = argv[index]
      if (root === undefined) {
        console.error('build-integrated: --root requires a path')
        process.exit(1)
      }
    } else if (argv[index] === '--check') {
      // handled below
    } else {
      console.error(`build-integrated: unknown argument ${JSON.stringify(argv[index])}`)
      console.error('usage: node scripts/build-integrated.ts [--root <path>] [--check]')
      process.exit(1)
    }
  }
  const check = argv.includes('--check')
  const skillsRoot = resolve(root ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'skills'))
  const integratedRoot = join(skillsRoot, INTEGRATED_SKILL)

  // The facade is hand-written and outside the build, but an integrated skill without
  // one is half a product: the build reports it rather than shipping a directory no
  // client can load.
  if (!existsSync(join(integratedRoot, 'SKILL.md'))) {
    console.error(`build-integrated: ${relative(process.cwd(), join(integratedRoot, 'SKILL.md'))} is missing — write the facade first; the build only mirrors references/, scripts/ and templates/`)
    process.exit(1)
  }

  const actions = integratedDiff(skillsRoot, integratedRoot)
  if (check) {
    for (const action of actions) console.log(`build-integrated: ${action.verb} ${action.rel}`)
    if (actions.length > 0) {
      console.error(`build-integrated: ${actions.length} file(s) out of sync with the sources; run without --check to update`)
      process.exit(1)
    }
    console.log('build-integrated: in sync with the sources')
    return
  }

  for (const action of actions) {
    const target = join(integratedRoot, action.rel)
    if (action.verb === 'delete') {
      rmSync(target)
      continue
    }
    const source = integratedFileMap(skillsRoot).get(action.rel)
    if (source === undefined) continue
    mkdirSync(dirname(target), { recursive: true })
    cpSync(source, target)
  }
  const byVerb = (verb: Action['verb']): number => actions.filter(action => action.verb === verb).length
  console.log(`build-integrated: ${byVerb('copy')} copied, ${byVerb('refresh')} refreshed, ${byVerb('delete')} deleted`)
  if (actions.length === 0) console.log('build-integrated: in sync with the sources')
}

// Run only when invoked directly: the specs import the pure functions, and a bare
// import must not perform (or check) a build as a side effect.
const invokedAsScript = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedAsScript) main()
