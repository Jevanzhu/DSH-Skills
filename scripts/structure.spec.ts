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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'
import { integratedDiff } from './build-integrated.ts'

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

  test('the harness templates cover both languages for every starter', () => {
    // Bootstrap picks a starter by the adopter's language, so a starter missing its
    // English half hands an English repository Chinese rules — the same defect the
    // note templates guard against, one directory over.
    const templates = readdirSync(join(SKILLS_ROOT, 'project-harness/templates'))
    for (const [starter, ext] of [['AGENTS', 'md'], ['docs-AGENTS', 'md'], ['ledger', 'md'], ['docs-index', 'md'], ['lefthook', 'yml']] as const) {
      for (const locale of ['en', 'zh']) {
        assert.ok(templates.includes(`${starter}.${locale}.${ext}`), `templates/${starter}.${locale}.${ext} is missing`)
      }
    }
  })

  test('every Markdown template ships both languages, and the guard rejects a single-language set', () => {
    // A template is a starter the adopter picks by language, so a lone language is a
    // half-written starter nobody notices: the copy step succeeds and the reader gets
    // the other language's placeholder. Pairing is checked per directory rather than
    // against a list, so a new template joins the guard by existing.
    const unpaired = (dir: string): string[] => {
      const names = readdirSync(dir)
      const missing: string[] = []
      for (const name of names.filter(entry => entry.endsWith('.md'))) {
        const match = /^(.*)\.(zh|en)\.md$/.exec(name)
        if (match === null) {
          missing.push(`${name} (no .zh/.en suffix)`)
          continue
        }
        const counterpart = `${match[1]}.${match[2] === 'zh' ? 'en' : 'zh'}.md`
        if (!names.includes(counterpart)) missing.push(counterpart)
      }
      return missing
    }
    const guard = (dir: string): void => {
      const missing = unpaired(dir)
      assert.equal(missing.length, 0, `${dir}: template(s) without a language counterpart: ${missing.join(', ')}`)
    }
    const templateDirs = ['project-harness/templates', 'agent-notes/templates', 'dsh-project-harness/templates'].map(dir => join(SKILLS_ROOT, dir))
    for (const dir of templateDirs) {
      assert.ok(existsSync(dir), `${dir} is missing`)
      assert.ok(readdirSync(dir).some(name => name.endsWith('.md')), `${dir} holds no Markdown template to pair`)
      guard(dir)
    }

    // Negative control: the same guard must reject a set that carries one language only,
    // otherwise the green above would also pass if nothing had been read.
    const root = mkdtempSync(join(tmpdir(), 'template-pairs-'))
    try {
      writeFileSync(join(root, 'paired.zh.md'), '# paired\n')
      writeFileSync(join(root, 'paired.en.md'), '# paired\n')
      guard(root)
      writeFileSync(join(root, 'solo.zh.md'), '# solo\n')
      assert.throws(() => guard(root), /solo\.en\.md/, 'a single-language template set must be rejected')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('the integrated skill mirrors the two source skills byte for byte', () => {
    // The integrated skill is a build product: its references/, scripts/ and
    // templates/ are copied from the two source skills and never edited in place —
    // a divergence is a hand edit the next build silently reverts. The rule is the
    // builder's own diff, so this test and `node scripts/build-integrated.ts`
    // cannot disagree about what "in sync" means.
    assert.equal(
      integratedDiff(SKILLS_ROOT, join(SKILLS_ROOT, 'dsh-project-harness')).length, 0,
      'the integrated skill drifted from its sources; run node scripts/build-integrated.ts',
    )

    // Negative control: the same diff must see a forged byte, an orphaned file and a
    // missing one, otherwise the green above would also pass if nothing was compared.
    const drift = mkdtempSync(join(tmpdir(), 'integrated-drift-'))
    try {
      mkdirSync(join(drift, 'agent-notes/references'), { recursive: true })
      mkdirSync(join(drift, 'project-harness/scripts'), { recursive: true })
      writeFileSync(join(drift, 'agent-notes/references/shared.md'), 'A\n')
      writeFileSync(join(drift, 'project-harness/scripts/own.ts'), 'B\n')
      const integrated = join(drift, 'dsh-project-harness')
      mkdirSync(join(integrated, 'references'), { recursive: true })
      writeFileSync(join(integrated, 'references/shared.md'), 'DRIFTED\n')
      writeFileSync(join(integrated, 'references/orphan.md'), 'X\n')
      const verbs = new Map(integratedDiff(drift, integrated).map(action => [action.rel, action.verb]))
      assert.equal(verbs.get('references/shared.md'), 'refresh')
      assert.equal(verbs.get('references/orphan.md'), 'delete')
      assert.equal(verbs.get('scripts/own.ts'), 'copy')
    } finally {
      rmSync(drift, { recursive: true, force: true })
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
