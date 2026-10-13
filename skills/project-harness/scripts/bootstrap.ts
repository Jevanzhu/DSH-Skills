/**
 * Scaffold the governance skeleton in a target repository: the Agent Note lifecycle
 * tree, an empty frozen-archive manifest, a doc-budget manifest measured from the
 * target's real files, and a copy of the bundled verifiers.
 *
 * Verifiers are COPIED, never referenced: a gate must run in a fresh clone and in CI
 * without this skill installed. Re-run with `--force` to refresh the copies after
 * upgrading the harness.
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASELINE_REL } from './baseline.ts'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SKILL_ROOT = resolve(SCRIPT_DIR, '..')
const AGENT_NOTES_SKILL = resolve(SKILL_ROOT, '../agent-notes/scripts')
const HARNESS_DIR = 'scripts/harness'

/**
 * Gates that can record day-one debt. Adopting the harness on a repository that
 * already has violations records them in the ledger, so the gate blocks the next
 * violation instead of failing on all the old ones.
 */
const BASELINE_GATES: ReadonlyArray<readonly [gate: string, file: string]> = [
  ['markdown-links', 'verify-md-links.ts'],
  ['markdown-wrap', 'verify-md-wrap.ts'],
  ['comment-hygiene', 'verify-comment-hygiene.ts'],
]

/**
 * Verifier files copied into the target repository, paired with their source directory.
 *
 * `paired` marks the verifiers that live in the sibling `agent-notes` skill. The
 * copied `run-gates.ts` invokes every one of them, so a missing pair does not degrade
 * gracefully — it produces a repository whose gates die with MODULE_NOT_FOUND. The
 * precondition is therefore checked up front and reported as an error, never skipped.
 */
const VERIFIER_FILES: ReadonlyArray<readonly [file: string, sourceDir: string, paired?: boolean]> = [
  // Shared by every gate in both skills.
  ['harness-root.ts', SCRIPT_DIR],
  // The shared Markdown scanner the documentation gates import.
  ['markdown.ts', SCRIPT_DIR],
  // The debt ledger every baseline-aware gate records into.
  ['baseline.ts', SCRIPT_DIR],
  // The Agent Note corpus gates, owned by the `agent-notes` skill.
  ['aliases.ts', AGENT_NOTES_SKILL, true],
  ['harness-config.ts', AGENT_NOTES_SKILL, true],
  ['agent-note-tree.ts', AGENT_NOTES_SKILL, true],
  ['pair-record.ts', AGENT_NOTES_SKILL, true],
  ['archived-agent-notes.ts', AGENT_NOTES_SKILL, true],
  ['verify-agent-note-format.ts', AGENT_NOTES_SKILL, true],
  ['verify-agent-note-classification.ts', AGENT_NOTES_SKILL, true],
  ['verify-archived-agent-notes.ts', AGENT_NOTES_SKILL, true],
  // The repository-wide gates.
  ['verify-comment-hygiene.ts', SCRIPT_DIR],
  ['verify-doc-budgets.ts', SCRIPT_DIR],
  ['verify-doc-index.ts', SCRIPT_DIR],
  ['verify-md-links.ts', SCRIPT_DIR],
  ['verify-md-wrap.ts', SCRIPT_DIR],
  ['run-gates.ts', SCRIPT_DIR],
]

/**
 * Directories the comment-hygiene seed scans, measured from the target's own tree.
 * `scripts/` is first because the verifiers were just copied into it and a toolchain is
 * narrative surface too; a source tree joins the list only when it exists, so the seed
 * never declares a scan root the fail-closed gate would report as missing.
 */
const COMMENT_SCAN_CANDIDATES = ['scripts', 'src', 'app', 'lib']

/**
 * Starter comment rules: shapes that are chronology in any repository, so the gate has
 * a real first day instead of an empty shell. Shapes are extended by the adopter;
 * exceptions are how a real technical term colliding with one of them is admitted.
 */
const COMMENT_HYGIENE_STARTER = {
  labels: [
    { name: '日期戳', pattern: '\\d{4}-\\d{2}-\\d{2}' },
    { name: '年月戳', pattern: '\\d{4}\\s*年\\s*\\d{1,2}\\s*月' },
    { name: '轮次', pattern: '第\\s*(?:\\d{1,3}|[一二三四五六七八九十百]{1,3})\\s*轮' },
    { name: '批次括注', pattern: '[（(]\\s*批\\s*\\d{1,3}' },
  ],
  residue: [
    { name: '括注被切空', pattern: '（\\s*）' },
    { name: '括注只剩破折号', pattern: '（\\s*[-—–]+\\s*）' },
  ],
}

/** Standing docs the budget manifest measures on first run. */
const BUDGET_CANDIDATES = ['AGENTS.md', 'docs/AGENTS.md', 'README.md', 'docs/architecture.md']

/** Headroom added above the current measurement when seeding a ceiling. */
const BUDGET_HEADROOM = 1.15

/** Agent Note classes; the archive mirrors this closed set. */
const CLASSES = ['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing']

/** Relative path of the archive's own instruction file, required by the archive gate. */
const ARCHIVED_AGENTS = '.agents/notes/archived/AGENTS.md'

/** Notes-tree configuration: the corpus's primary language and paired-document mode. */
const NOTES_CONFIG = '.agents/notes/harness.json'

/** What the archive gate requires at its root. Sealed artifacts are immutable. */
const ARCHIVED_AGENTS_CONTENT = `# Archived Agent Notes

Sealed decision records. Every artifact here is frozen: never edit, reformat, translate,
repair, move, or delete one. \`manifest.json\` records a content hash per file and is
append-only, so any change to sealed bytes is rejected by
\`scripts/harness/verify-archived-agent-notes.ts\`.

Archiving a note is the only way files appear here:

1. Move the complete artifact set from \`implemented/<class>/\`.
2. Insert an identical \`Archived: YYYY-MM-DD\` line directly below \`Status: implemented\`
   in every language file.
3. Re-record any paired-content hashes.
4. Repair or remove inbound links.
5. Seal with \`node scripts/harness/verify-archived-agent-notes.ts --write\`.

Archive links are checked inbound only: links pointing into this tree are validated, but
links this tree makes to the outside are not, because they may be stale by design.
`

interface Options {
  target: string
  dryRun: boolean
  force: boolean
  adopt: boolean
}

function usage(): never {
  console.error('usage: node bootstrap.ts --target <repo> [--adopt] [--dry-run] [--force]')
  console.error('  --adopt   record the violations already in the target as accepted debt,')
  console.error('            so the Markdown gates fail only on violations added from now on')
  process.exit(1)
}

function parseArgs(argv: readonly string[]): Options {
  let target: string | undefined
  let dryRun = false
  let force = false
  let adopt = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--target') {
      index += 1
      target = argv[index]
      if (target === undefined) usage()
    } else if (arg === '--dry-run') dryRun = true
    else if (arg === '--force') force = true
    else if (arg === '--adopt') adopt = true
    else usage()
  }
  if (target === undefined) usage()
  return { target: resolve(target), dryRun, force, adopt }
}

/** Count whitespace-delimited tokens, matching `wc -w`. */
function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  if (!existsSync(options.target) || !statSync(options.target).isDirectory()) {
    console.error(`bootstrap: target ${JSON.stringify(options.target)} is not a directory`)
    process.exit(1)
  }

  // The paired verifiers are a precondition, not a nice-to-have: the copied
  // `run-gates.ts` runs all of them, so a target built without them has gates that
  // cannot start. Both skills ship together from this repository; a partial copy is
  // therefore a mistake worth failing on, not a configuration worth supporting.
  const missingPaired = VERIFIER_FILES
    .filter(([, sourceDir, paired]) => paired === true)
    .filter(([file, sourceDir]) => !existsSync(join(sourceDir, file)))
  if (missingPaired.length > 0) {
    console.error(`bootstrap: this build is missing the paired \`agent-notes\` skill (expected at ${AGENT_NOTES_SKILL}):`)
    for (const [file, sourceDir] of missingPaired) console.error(`  ${file} not found in ${sourceDir}`)
    console.error(`
Refusing to continue: the verifiers copied from that skill are called by the copied
run-gates.ts, so the target would end up with gates that die on MODULE_NOT_FOUND.
The two skills are installed as a pair: copy both directories side by side into your
skill directory (~/.agents/skills/agent-notes and ~/.agents/skills/project-harness).`)
    process.exit(1)
  }

  const planned: string[] = []
  const skipped: string[] = []
  const notes: string[] = []

  const write = (relPath: string, content: string | Buffer): void => {
    const abs = join(options.target, relPath)
    if (existsSync(abs) && !options.force) {
      skipped.push(relPath)
      return
    }
    planned.push(relPath)
    if (options.dryRun) return
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }

  // 1. Agent Note lifecycle tree with a README placeholder per lifecycle root.
  for (const lifecycle of ['proposed', 'implemented', 'rejected'] as const) {
    for (const cls of CLASSES) {
      const keep = join('.agents/notes', lifecycle, cls, '.gitkeep')
      const abs = join(options.target, keep)
      if (existsSync(abs)) continue
      planned.push(keep)
      if (!options.dryRun) {
        mkdirSync(dirname(abs), { recursive: true })
        writeFileSync(abs, '')
      }
    }
  }

  // 2. Archive tree: all six class directories are required by the gate, even empty.
  for (const cls of CLASSES) {
    const keep = join('.agents/notes/archived', cls, '.gitkeep')
    const abs = join(options.target, keep)
    if (existsSync(abs)) continue
    planned.push(keep)
    if (!options.dryRun) {
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, '')
    }
  }
  write(ARCHIVED_AGENTS, ARCHIVED_AGENTS_CONTENT)
  if (!existsSync(join(options.target, '.agents/notes/archived/manifest.json'))) {
    write('.agents/notes/archived/manifest.json', '{\n  "version": 1,\n  "files": {}\n}\n')
  } else {
    skipped.push('.agents/notes/archived/manifest.json')
  }
  // English primary files, no paired counterparts required: both are the deliberate
  // choices, so the scaffold spells them out instead of hiding them behind defaults.
  if (!existsSync(join(options.target, NOTES_CONFIG))) {
    write(NOTES_CONFIG, `{\n  "primaryLanguage": "en",\n  "pairedDocuments": false\n}\n`)
  } else {
    skipped.push(NOTES_CONFIG)
  }

  // 3. Copy the verifiers so gates run in a fresh clone with no skill installed.
  for (const [file, sourceDir] of VERIFIER_FILES) {
    const source = join(sourceDir, file)
    const rel = join(HARNESS_DIR, file)
    const abs = join(options.target, rel)
    if (existsSync(abs) && !options.force) {
      skipped.push(rel)
      continue
    }
    planned.push(rel)
    if (!options.dryRun) {
      mkdirSync(dirname(abs), { recursive: true })
      cpSync(source, abs)
    }
  }

  // 4. Seed the doc-budget manifest from the target's measured word counts.
  //
  // This runs BEFORE the templates are copied, on purpose: measuring a freshly copied
  // skeleton would set a ceiling that the first real paragraph blows through, and "a
  // too-low ceiling is a budget bug". A repository whose only standing docs are the
  // templates therefore starts with an empty manifest and seeds it on a later run.
  const budgetPath = join(options.target, HARNESS_DIR, 'doc-budgets.manifest.json')
  if (existsSync(budgetPath) && !options.force) {
    skipped.push(relative(options.target, budgetPath))
  } else {
    const budgets: Record<string, number> = {}
    for (const candidate of BUDGET_CANDIDATES) {
      const abs = join(options.target, candidate)
      if (!existsSync(abs)) continue
      const words = countWords(readFileSync(abs, 'utf8'))
      budgets[candidate] = Math.ceil(words * BUDGET_HEADROOM)
    }
    if (Object.keys(budgets).length === 0) {
      notes.push(`no standing documents to measure yet (${BUDGET_CANDIDATES.join(', ')}); the budget manifest starts empty`)
      notes.push('once AGENTS.md and the other standing docs have real content, re-run bootstrap to seed their ceilings')
    }
    write(join(HARNESS_DIR, 'doc-budgets.manifest.json'), `${JSON.stringify(budgets, null, 2)}\n`)
  }

  // 5. Seed the document-chain manifest empty. `{}` declares no chain, so the index
  // gate passes until this repository writes an index and declares its slots; the
  // gate's "no manifest" error then stays reserved for a repository that deleted it.
  const docIndexPath = join(options.target, HARNESS_DIR, 'doc-index.manifest.json')
  if (existsSync(docIndexPath) && !options.force) {
    skipped.push(relative(options.target, docIndexPath))
  } else {
    write(join(HARNESS_DIR, 'doc-index.manifest.json'), '{}\n')
    notes.push('doc-index.manifest.json declares no chain yet; start from templates/ledger.md and templates/docs-index.md when this repository keeps an indexed document chain')
  }

  // 6. Seed the comment rules against the target's own tree. Which candidate roots
  // exist is measured rather than guessed: the gate fails closed on a declared root
  // that is missing, so the seed never writes one.
  const commentPath = join(options.target, HARNESS_DIR, 'comment-hygiene.manifest.json')
  if (existsSync(commentPath) && !options.force) {
    skipped.push(relative(options.target, commentPath))
  } else {
    const scan = COMMENT_SCAN_CANDIDATES.filter(candidate => existsSync(join(options.target, candidate)))
    write(join(HARNESS_DIR, 'comment-hygiene.manifest.json'), `${JSON.stringify({ scan, ...COMMENT_HYGIENE_STARTER }, null, 2)}\n`)
    notes.push(`comment-hygiene scans ${scan.join(', ')} for the starter shapes; add a root to the manifest when code lands elsewhere, and register a real term that collides with a shape as an exception`)
  }

  // 7. Copy the starter templates only when the target has no equivalent yet.
  for (const [template, destination] of [
    ['AGENTS.md', 'AGENTS.md'],
    ['lefthook.yml', 'lefthook.yml'],
    ['docs-AGENTS.md', 'docs/AGENTS.md'],
  ] as const) {
    const source = join(SKILL_ROOT, 'templates', template)
    if (!existsSync(source)) continue
    const abs = join(options.target, destination)
    if (existsSync(abs)) {
      skipped.push(destination)
      continue
    }
    planned.push(destination)
    if (!options.dryRun) {
      mkdirSync(dirname(abs), { recursive: true })
      cpSync(source, abs)
    }
  }

  // 8. Adoption: record the debt that predates the harness. Without this an existing
  // repository goes red on its own history, and a gate that is red on day one gets
  // switched off on day two. The ledger is the difference between "this repository is
  // dirty" and "this change made it dirtier".
  const adopted: string[] = []
  if (options.adopt) {
    for (const [gate, file] of BASELINE_GATES) {
      const script = join(options.target, HARNESS_DIR, file)
      if (options.dryRun) {
        notes.push(`--adopt would record the target's current ${gate} violations in ${BASELINE_REL}`)
        continue
      }
      if (!existsSync(script)) {
        notes.push(`--adopt skipped ${gate}: ${join(HARNESS_DIR, file)} was not copied`)
        continue
      }
      const run = spawnSync(process.execPath, [script, '--root', options.target, '--write-baseline'], {
        cwd: options.target,
        encoding: 'utf8',
      })
      const line = (run.stdout ?? '').split('\n').find(text => text.includes('recorded'))
      if (line !== undefined) adopted.push(line.trim())
      // Exit 0 with nothing recorded means the gate found no debt to record — an empty
      // or disabled manifest, not a failure worth a note. A non-zero exit is.
      else if (run.status !== 0) notes.push(`--adopt: ${gate} did not record (exit ${String(run.status)}): ${(run.stderr ?? '').trim().split('\n')[0] ?? ''}`)
    }
  } else if (existsSync(join(options.target, 'README.md'))) {
    notes.push(`this target already has documents; re-run with --adopt to record its existing violations as debt instead of failing on them`)
  }

  const verb = options.dryRun ? 'would create' : 'created'
  console.log(`harness bootstrap: ${planned.length} path(s) ${verb} in ${options.target}`)
  for (const path of planned) console.log(`  + ${path}`)
  if (skipped.length > 0) {
    console.log(`preserved ${skipped.length} existing path(s)${options.force ? '' : ' (pass --force to overwrite)'}:`)
    for (const path of skipped) console.log(`  = ${path}`)
  }
  for (const line of adopted) console.log(`adopted: ${line}`)
  for (const note of notes) console.log(`note: ${note}`)

  console.log(`
Next steps that need your judgment (the harness cannot infer these):
  1. Write AGENTS.md: standing orders only, one to three lines per rule.
  2. Pick the checks this repository must run, then list them in scripts/harness/run-gates.ts.
  3. Add a package.json script per gate so editors and CI share one entry point.
  4. Install the git hooks (lefthook.yml) and wire the same gates into CI.
  5. To require the archive gate, seal the tree with:
       node ${HARNESS_DIR}/verify-archived-agent-notes.ts --write
  6. If this repository keeps an indexed document chain (an index document, slot
     directories, a ledger of open items), start it from templates/ledger.md and
     templates/docs-index.md, then declare the slots in
     ${HARNESS_DIR}/doc-index.manifest.json.${options.adopt ? `

The ledger shows what was adopted. Pay it down deliberately: fix a batch, then
re-record with \`--write-baseline\` so the file visibly shrinks. Each entry left in
${BASELINE_REL} is a violation the gates will not stop from spreading.` : ''}`)
}

main()
