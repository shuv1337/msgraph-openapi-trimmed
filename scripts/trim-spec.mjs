// Build the trimmed Graph spec from spec/exclusions.json.
// Usage: node scripts/trim-spec.mjs <out.json> [local-openapi.yaml]
// Fails if a mustKeep path is missing, so a new exclusion cannot silently drop one.
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import yaml from "js-yaml"

const here = dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(readFileSync(join(here, "..", "spec", "exclusions.json"), "utf8"))
const [out, local] = process.argv.slice(2)
if (!out) throw new Error("Usage: trim-spec.mjs <out.json> [local-openapi.yaml]")

const { repository, commit, path } = config.source
const url = `https://raw.githubusercontent.com/${repository}/${commit}/${path}`
const text = local ? readFileSync(local, "utf8") : await (await fetch(url)).text()
const document = yaml.load(text, { schema: yaml.JSON_SCHEMA })

const verbs = ["get", "post", "put", "patch", "delete"]
const operations = (paths) => Object.values(paths).reduce((n, item) => n + verbs.filter((v) => v in item).length, 0)
const sourceOperations = operations(document.paths)
const patterns = config.exclude.flatMap((group) => group.patterns.map((source) => new RegExp(source)))
const paths = Object.fromEntries(
  Object.entries(document.paths).filter(([key]) => !patterns.some((pattern) => pattern.test(key))),
)

// Drop single operations that would hand a fresh credential to the caller.
let removedOperations = 0
for (const group of config.excludeOperations ?? []) {
  for (const { method, path } of group.operations) {
    const item = paths[path]
    if (item === undefined || !(method in item)) throw new Error(`excludeOperations: ${method.toUpperCase()} ${path} is not in the spec`)
    delete item[method]
    removedOperations++
    if (!verbs.some((verb) => verb in item)) delete paths[path]
  }
}

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

// Microsoft marks @odata.type required on every entity, so request bodies fail validation
// unless agents send it. Graph itself only needs it to pick a derived type.
let relaxed = 0
const relax = (value) => {
  if (Array.isArray(value)) return value.forEach(relax)
  if (value === null || typeof value !== "object") return
  if (Array.isArray(value.required) && value.required.includes("@odata.type")) {
    value.required = value.required.filter((key) => key !== "@odata.type")
    if (value.required.length === 0) delete value.required
    relaxed++
  }
  Object.values(value).forEach(relax)
}
relax(components)
relax(paths)

const json = JSON.stringify({ ...document, paths, components })
writeFileSync(out, json)
console.log(
  JSON.stringify({
    sourceCommit: commit,
    sourceOperations,
    operations: operations(paths),
    paths: Object.keys(paths).length,
    relaxedOdataType: relaxed,
    removedOperations,
    bytes: Buffer.byteLength(json),
    sha256: createHash("sha256").update(json).digest("hex"),
  }),
)
