// Build the trimmed Graph spec from spec/exclusions.json.
// Usage: node scripts/trim-spec.mjs <out.json> [local-openapi.yaml]
// Fails if a mustKeep path is missing, so a new exclusion cannot silently drop one.
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import yaml from "js-yaml"

const here = dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(readFileSync(join(here, "..", "exclusions.json"), "utf8"))
const [out, local] = process.argv.slice(2)
if (!out) throw new Error("Usage: trim-spec.mjs <out.json> [local-openapi.yaml]")

const { repository, commit, path } = config.source
const url = `https://raw.githubusercontent.com/${repository}/${commit}/${path}`
const text = local ? readFileSync(local, "utf8") : await (await fetch(url)).text()
const document = yaml.load(text, { schema: yaml.JSON_SCHEMA })

const verbs = ["get", "post", "put", "patch", "delete"]
const operations = (paths) => Object.values(paths).reduce((n, item) => n + verbs.filter((v) => v in item).length, 0)
const patterns = config.exclude.flatMap((group) => group.patterns.map((source) => new RegExp(source)))
const paths = Object.fromEntries(
  Object.entries(document.paths).filter(([key]) => !patterns.some((pattern) => pattern.test(key))),
)

const lost = config.mustKeep.filter((key) => !(key in paths))
if (lost.length > 0) throw new Error(`mustKeep paths are missing: ${lost.join(", ")}`)

// Keep only the components the remaining paths reach.
const refs = (value) => [...JSON.stringify(value).matchAll(/#\/components\/(\w+)\/([^"]+)/g)].map((m) => [m[1], m[2]])
const components = {}
const seen = new Set()
const queue = refs(paths)
while (queue.length > 0) {
  const [kind, name] = queue.pop()
  const key = `${kind}/${name}`
  if (seen.has(key)) continue
  seen.add(key)
  const value = document.components?.[kind]?.[name]
  if (value === undefined) continue
  ;(components[kind] ??= {})[name] = value
  queue.push(...refs(value))
}

const json = JSON.stringify({ ...document, paths, components })
writeFileSync(out, json)
console.log(
  JSON.stringify({
    sourceCommit: commit,
    sourceOperations: operations(document.paths),
    operations: operations(paths),
    paths: Object.keys(paths).length,
    bytes: Buffer.byteLength(json),
    sha256: createHash("sha256").update(json).digest("hex"),
  }),
)
