/**
 * Invariants of this repository itself. Each skill is copied out on its own, so
 * the per-skill specs cannot see the failures that live *between* the copies:
 * a shared file edited on one side only, a skill whose frontmatter name drifts
 * from its directory, or a template set that loses a language.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS_ROOT = join(REPO_ROOT, 'skills')

const SKILLS = readdirSync(SKILLS_ROOT, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()

describe('repository structure', () => {
  test('every shared file is byte-identical across the skills that carry it', () => {
    for (const file of ['harness-root.ts']) {
      const copies = SKILLS
        .map(skill => join(SKILLS_ROOT, skill, 'scripts', file))
        .filter(path => existsSync(path))
      assert.ok(copies.length >= 2, `${file} is expected under every skill`)
      const first = copies[0] ?? ''
      const reference = readFileSync(first, 'utf8')
      for (const copy of copies.slice(1)) {
        assert.equal(readFileSync(copy, 'utf8'), reference, `${copy} diverged from ${first}`)
      }
    }
  })

  test('every skill declares a frontmatter name matching its directory', () => {
    for (const skill of SKILLS) {
      const skillFile = join(SKILLS_ROOT, skill, 'SKILL.md')
      assert.ok(existsSync(skillFile), `${skill}/SKILL.md is missing`)
      const name = /^name: (.+)$/m.exec(readFileSync(skillFile, 'utf8'))?.[1]
      assert.equal(name, skill, `${skill}/SKILL.md must declare \`name: ${skill}\``)
    }
  })

  test('the note templates cover both languages for every lifecycle', () => {
    const templates = readdirSync(join(SKILLS_ROOT, 'agent-notes/templates'))
    for (const lifecycle of ['implemented', 'proposed', 'rejected']) {
      for (const locale of ['en', 'zh']) {
        assert.ok(templates.includes(`${lifecycle}.${locale}.md`), `templates/${lifecycle}.${locale}.md is missing`)
      }
    }
  })
})

describe('every shipped gate runs when it is invoked', () => {
  /** Every verifier in every skill, found rather than listed, so a new gate joins this test. */
  const verifiers = SKILLS.flatMap(skill =>
    readdirSync(join(SKILLS_ROOT, skill, 'scripts'))
      .filter(name => name.startsWith('verify-') && name.endsWith('.ts') && !name.includes('.spec.'))
      .map(name => join(SKILLS_ROOT, skill, 'scripts', name)),
  )

  test('the scan found the verifiers rather than an empty list', () => {
    assert.ok(verifiers.length >= 10, `expected the shipped verifiers, found ${verifiers.length}`)
  })

  test('an invoked verifier reports itself instead of exiting green in silence', () => {
    // The guard that decides whether a gate runs at all must not read a runtime feature:
    // `import.meta.main` does not exist below Node 24.2 / 22.18, and where it is missing
    // the old guard answered "not the entry point", so the gate exited 0 having checked
    // nothing. Every gate therefore has to prove, by running in a bare directory, that
    // being invoked actually reaches its own report line.
    const root = mkdtempSync(join(tmpdir(), 'harness-entry-'))
    try {
      for (const verifier of verifiers) {
        const name = basename(verifier, '.ts')
        const run = spawnSync(process.execPath, [verifier], { cwd: root, encoding: 'utf8' })
        const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
        assert.match(
          output,
          new RegExp(`${name}:`),
          `${name} produced no report line when invoked directly — its entry guard answered false (exit ${String(run.status)})`,
        )
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
