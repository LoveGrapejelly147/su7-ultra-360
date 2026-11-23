import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const templatePath = resolve(__dirname, 'template.html')
const outPath = resolve(__dirname, 'index.html')

const moduleFiles = [
  'src/01-materials.js',
  'src/02-car-body.js',
  'src/03-car-internals.js',
  'src/04-physics.js',
  'src/05-app.js',
]

const template = readFileSync(templatePath, 'utf8')
const chunks = moduleFiles.map((rel) => {
  const full = resolve(__dirname, rel)
  const content = readFileSync(full, 'utf8')
  return `// === ${rel} ===\n${content}`
})

const combinedJs = chunks.join('\n\n')
const marker = '/* __INJECT_MODULES__ */'
if (!template.includes(marker)) {
  throw new Error(`Missing marker ${marker} in template.html`)
}

const html = template.replace(marker, () => combinedJs)

// Extract module script content to syntax check with Node
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/)
if (!scriptMatch) {
  throw new Error('Could not locate <script type="module"> in output HTML')
}

const checkJs = scriptMatch[1]
const checkRes = spawnSync(process.execPath, ['--input-type=module', '--check'], {
  input: checkJs,
  encoding: 'utf8',
})

if (checkRes.status !== 0) {
  console.error('Syntax check failed:\n', checkRes.stderr)
  process.exit(checkRes.status || 1)
}

writeFileSync(outPath, html, 'utf8')
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)
console.log(`Built ${outPath} (${kb} KB) — syntax check passed.`)
