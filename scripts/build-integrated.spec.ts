/**
 * Tests for `build-integrated.ts`. The build owns the integrated skill's resource
 * directories; these tests pin that ownership from both sides: what the file map
 * carries (both sources, never a spec, never an ambiguous name collision), and that
 * `--check` turns any divergence into a non-zero exit while a plain run repairs it.
 *
 * Run with: node --test scripts/build-integrated.spec.ts
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, test } from 'node:test'
import { INTEGRATED_SKILL, integratedDiff, integratedFileMap } from './build-integrated.ts'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const BUILD = join(SCRIPT_DIR, 'build-integrated.ts')
const SKILLS_ROOT = resolve(SCRIPT_DIR, '..', 'skills')

const roots: string[] = []
function tracked(): string {
  const root = mkdtempSync(join(tmpdir(), 'build-integrated-'))
  roots.push(root)
  return root
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

describe('the file map', () => {
  test('carries both sources, and never a spec', () => {
    // One file only each skill ships proves the union; the exclusion keeps this
    // repository's own tests (which assert the two-skill layout) out of a product
    // adopters install.
    const files = [...integratedFileMap(SKILLS_ROOT).keys()]
    assert.ok(files.includes('references/bilingual.md'), 'agent-notes references missing')
    assert.ok(files.includes('references/gates.md'), 'project-harness references missing')
    assert.ok(files.includes('scripts/aliases.ts'), 'agent-notes scripts missing')
    assert.ok(files.includes('scripts/bootstrap.ts'), 'project-harness scripts missing')
    assert.ok(files.includes('templates/implemented.zh.md'), 'agent-notes templates missing')
    assert.ok(files.includes('templates/lefthook.zh.yml'), 'project-harness templates missing')
    for (const rel of files) {
      assert.ok(!rel.endsWith('.spec.ts'), `${rel} must not ship in the integrated skill`)
    }
  })

  test('rejects a name that ships in both skills with different bytes', () => {
    // `harness-root.ts` is shared byte-identically on purpose; anything else that
    // collides has no defined winner, so the build refuses rather than guessing.
    const root = tracked()
    mkdirSync(join(root, 'agent-notes/scripts'), { recursive: true })
    mkdirSync(join(root, 'project-harness/scripts'), { recursive: true })
    writeFileSync(join(root, 'agent-notes/scripts/shared.ts'), 'one\n')
    writeFileSync(join(root, 'project-harness/scripts/shared.ts'), 'two\n')
    assert.throws(() => integratedFileMap(root), /shared\.ts ships in both skills with different bytes/)
  })
})

describe('the committed integrated skill', () => {
  test('--check exits 0 and reports the sync', () => {
    const run = spawnSync(process.execPath, [BUILD, '--check'], { encoding: 'utf8' })
    assert.equal(run.status, 0, `${run.stdout ?? ''}${run.stderr ?? ''}`)
    assert.match(run.stdout ?? '', /in sync with the sources/)
  })
})

/** A minimal skills tree: one source file, an integrated copy of it, and a facade. */
function drifted(): string {
  const root = tracked()
  mkdirSync(join(root, 'agent-notes/references'), { recursive: true })
  writeFileSync(join(root, 'agent-notes/references/one.md'), 'one\n')
  const integrated = join(root, INTEGRATED_SKILL)
  mkdirSync(join(integrated, 'references'), { recursive: true })
  writeFileSync(join(integrated, 'SKILL.md'), `---\nname: ${INTEGRATED_SKILL}\ndescription: facade\n---\n`)
  writeFileSync(join(integrated, 'references/one.md'), 'DRIFTED\n')
  return root
}

describe('--check against a drifted copy', () => {
  test('exits 1 and names the drifted file', () => {
    const root = drifted()
    const run = spawnSync(process.execPath, [BUILD, '--root', root, '--check'], { encoding: 'utf8' })
    assert.equal(run.status, 1)
    assert.match(run.stdout ?? '', /refresh references\/one\.md/)
    assert.match(run.stderr ?? '', /out of sync with the sources/)
  })

  test('writes nothing: the drift survives a check', () => {
    const root = drifted()
    spawnSync(process.execPath, [BUILD, '--root', root, '--check'], { encoding: 'utf8' })
    assert.equal(readFileSync(join(root, INTEGRATED_SKILL, 'references/one.md'), 'utf8'), 'DRIFTED\n')
  })

  test('a plain run repairs the drift, and the repair is idempotent', () => {
    const root = drifted()
    const repair = spawnSync(process.execPath, [BUILD, '--root', root], { encoding: 'utf8' })
    assert.equal(repair.status, 0, String(repair.stderr))
    assert.equal(readFileSync(join(root, INTEGRATED_SKILL, 'references/one.md'), 'utf8'), 'one\n')
    assert.equal(integratedDiff(root, join(root, INTEGRATED_SKILL)).length, 0)
    const again = spawnSync(process.execPath, [BUILD, '--root', root], { encoding: 'utf8' })
    assert.match(again.stdout ?? '', /0 copied, 0 refreshed, 0 deleted/)
  })

  test('refuses to run without the hand-written facade', () => {
    // The facade is the one file the build does not generate; a run that proceeded
    // would ship a directory no client can load.
    const root = tracked()
    mkdirSync(join(root, INTEGRATED_SKILL), { recursive: true })
    const run = spawnSync(process.execPath, [BUILD, '--root', root], { encoding: 'utf8' })
    assert.equal(run.status, 1)
    assert.match(run.stderr ?? '', /SKILL\.md is missing/)
  })
})
