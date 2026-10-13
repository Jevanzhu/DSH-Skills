/**
 * Invariants of this repository itself. Each skill is copied out on its own, so
 * the per-skill specs cannot see the failures that live *between* the copies:
 * a shared file edited on one side only, a skill whose frontmatter name drifts
 * from its directory, or a template set that loses a language.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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
