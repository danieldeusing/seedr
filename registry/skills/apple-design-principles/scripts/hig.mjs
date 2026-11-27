#!/usr/bin/env node
// Reads Apple's Human Interface Guidelines from the JSON that developer.apple.com serves.
//   node hig.mjs list                 every page: section, slug, title
//   node hig.mjs fetch <slug>...      the live page(s) as Markdown on stdout
//   node hig.mjs dump <dir>           every page as <dir>/<slug>.md (a local, private mirror)
//   node hig.mjs check                compare the live pages with references/manifest.json
//   node hig.mjs check --write        the same, then record the live state in the manifest
// Needs Node 18 or newer (global fetch). No dependencies.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = 'https://developer.apple.com'
const ROOT = '/design/human-interface-guidelines'
const MANIFEST = join(dirname(fileURLToPath(import.meta.url)), '..', 'references', 'manifest.json')

async function getJson(path) {
  const response = await fetch(`${ORIGIN}/tutorials/data${path}`)
  if (!response.ok) throw new Error(`${response.status} for ${path}`)
  return response.json()
}

/** Every article of the HIG, in Apple's order: { slug, title, section }. */
async function listPages() {
  const index = await getJson('/index/design--human-interface-guidelines')
  const pages = []
  const walk = (node, trail) => {
    if (node.type === 'article') {
      pages.push({ slug: node.path.split('/').pop(), title: node.title, section: trail.join(' / ') })
    }
    const next = node.type === 'collection' ? [...trail, node.title] : trail
    for (const child of node.children ?? []) walk(child, next)
  }
  walk(index.interfaceLanguages.swift[0], [])
  return pages
}

const absolute = (url = '') => (url.startsWith('/') ? `${ORIGIN}${url}` : url)
const getPage = (slug) => getJson(`${ROOT}/${slug}.json`)

function inline(nodes = [], refs) {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.text
        case 'codeVoice':
          return `\`${node.code}\``
        case 'emphasis':
          return `*${inline(node.inlineContent, refs)}*`
        case 'strong':
          return `**${inline(node.inlineContent, refs)}**`
        case 'link':
          return `[${node.title}](${node.destination})`
        case 'reference': {
          const ref = refs[node.identifier] ?? {}
          const title = node.overridingTitle ?? ref.title ?? node.identifier
          return ref.url ? `[${title}](${absolute(ref.url)})` : title
        }
        case 'image':
          return media(node.identifier, refs)
        default:
          return inline(node.inlineContent, refs)
      }
    })
    .join('')
}

function media(identifier, refs) {
  const ref = refs[identifier] ?? {}
  const path = ref.variants?.[0]?.url ?? ref.poster
  const url = path?.startsWith('/') ? `${ORIGIN}/tutorials${path}` : path
  return `[${ref.type ?? 'media'}: ${ref.alt ?? identifier}${url ? ` — ${url}` : ''}]`
}

const cell = (blocks, refs) => block(blocks, refs).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim()

function block(nodes = [], refs) {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'heading':
          return `${'#'.repeat(node.level)} ${node.text}`
        case 'paragraph':
          return inline(node.inlineContent, refs)
        case 'unorderedList':
          return node.items.map((item) => `- ${block(item.content, refs).replace(/\n/g, '\n  ')}`).join('\n')
        case 'orderedList':
          return node.items.map((item, i) => `${i + 1}. ${block(item.content, refs).replace(/\n/g, '\n   ')}`).join('\n')
        case 'aside':
          return `> **${node.name ?? node.style}:** ${block(node.content, refs).replace(/\n/g, '\n> ')}`
        case 'codeListing':
          return `\`\`\`${node.syntax ?? ''}\n${node.code.join('\n')}\n\`\`\``
        case 'table': {
          const rows = node.rows.map((row) => `| ${row.map((c) => cell(c, refs)).join(' | ')} |`)
          rows.splice(1, 0, `|${' --- |'.repeat(node.rows[0].length)}`)
          return rows.join('\n')
        }
        case 'termList':
          return node.items
            .map((item) => `- **${inline(item.term.inlineContent, refs)}**: ${cell(item.definition.content, refs)}`)
            .join('\n')
        case 'tabNavigator':
          return node.tabs.map((tab) => `**${tab.title}**\n\n${block(tab.content, refs)}`).join('\n\n')
        case 'row':
          return node.columns.map((column) => block(column.content, refs)).join('\n\n')
        case 'links':
          return node.items
            .map((id) => `- [${refs[id]?.title ?? id}](${absolute(refs[id]?.url)})`)
            .join('\n')
        case 'small':
          return inline(node.inlineContent, refs)
        case 'video':
          return media(node.identifier, refs)
        default:
          return node.content ? block(node.content, refs) : node.inlineContent ? inline(node.inlineContent, refs) : ''
      }
    })
    .filter(Boolean)
    .join('\n\n')
}

function toMarkdown(slug, page) {
  const refs = page.references ?? {}
  const body = (page.primaryContentSections ?? []).map((section) => block(section.content, refs)).join('\n\n')
  const topics = (page.topicSections ?? [])
    .map((t) => `## ${t.title}\n\n${t.identifiers.map((id) => `- [${refs[id]?.title ?? id}](${absolute(refs[id]?.url)})`).join('\n')}`)
    .join('\n\n')
  return [
    `# ${page.metadata.title}`,
    `Source: ${ORIGIN}${ROOT}/${slug}`,
    inline(page.abstract, refs),
    body,
    topics,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** The state of one page that the manifest records. The hash covers the text only, not the media URLs. */
function fingerprint(page) {
  const text = JSON.stringify([page.metadata.title, page.abstract, page.primaryContentSections])
  const custom = page.metadata.customMetadata ?? {}
  return {
    hash: createHash('sha256').update(text).digest('hex').slice(0, 16),
    changed: custom['alert-date'] ?? null,
    note: custom['alert-text'] ?? null,
  }
}

async function inBatches(items, size, work) {
  const results = []
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(work))))
  }
  return results
}

async function check(write) {
  const pages = await listPages()
  const live = Object.fromEntries(
    await inBatches(pages, 8, async (p) => [p.slug, { title: p.title, section: p.section, ...fingerprint(await getPage(p.slug)) }]),
  )
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8').catch(() => '{"pages":{}}'))
  const stored = manifest.pages
  // Pages about Apple-only assets and services: the skill leaves them out on purpose.
  const excluded = manifest.excluded ?? []
  const lines = []
  for (const [slug, now] of Object.entries(live)) {
    if (excluded.includes(slug)) {
      delete live[slug]
      continue
    }
    const before = stored[slug]
    const where = `${slug} (${now.section})`
    if (!before) lines.push(`NEW      ${where}`)
    else if (before.hash !== now.hash) lines.push(`CHANGED  ${where}${now.changed ? ` — ${now.changed}: ${now.note}` : ''}`)
    else if (before.section !== now.section) lines.push(`MOVED    ${slug}: ${before.section} -> ${now.section}`)
  }
  for (const slug of Object.keys(stored)) if (!live[slug]) lines.push(`REMOVED  ${slug} (${stored[slug].section})`)
  console.log(lines.length ? lines.join('\n') : `No change: ${Object.keys(live).length} pages match the manifest (${excluded.length} left out).`)
  if (write) {
    await writeFile(MANIFEST, `${JSON.stringify({ source: `${ORIGIN}${ROOT}`, excluded, pages: live }, null, 2)}\n`)
    console.log(`Wrote ${MANIFEST}`)
  }
  if (lines.length && !write) process.exitCode = 1
}

const [command, ...args] = process.argv.slice(2)
if (command === 'list') {
  for (const p of await listPages()) console.log(`${p.section}\t${p.slug}\t${p.title}`)
} else if (command === 'fetch' && args.length) {
  for (const slug of args) console.log(`${toMarkdown(slug, await getPage(slug))}\n`)
} else if (command === 'dump' && args[0]) {
  await mkdir(args[0], { recursive: true })
  const pages = await listPages()
  await inBatches(pages, 8, async (p) => writeFile(join(args[0], `${p.slug}.md`), `${toMarkdown(p.slug, await getPage(p.slug))}\n`))
  console.log(`Wrote ${pages.length} pages to ${args[0]}`)
} else if (command === 'check') {
  await check(args.includes('--write'))
} else {
  console.error('Usage: hig.mjs list | fetch <slug>... | dump <dir> | check [--write]')
  process.exitCode = 2
}
