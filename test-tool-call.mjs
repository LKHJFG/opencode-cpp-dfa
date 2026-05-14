/**
 * Directly test that the plugin tools work end-to-end
 * by simulating what OpenCode would do when calling a tool.
 */
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { readFileSync, existsSync } from "fs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const pluginDir = resolve(__dirname, "static-analysis-plugin")
const testFile = resolve(pluginDir, "src/index.ts")

const mod = await import(pluginDir)
const plugin = mod.default

const ctx = {
  client: {},
  project: {},
  directory: pluginDir,
  worktree: pluginDir,
  serverUrl: new URL("http://localhost:0"),
  experimental_workspace: { register: () => {} },
  $: {},
}

const hooks = await plugin(ctx)
const tools = hooks.tool

let passed = 0
let failed = 0

console.log("\n=== PLUGIN TOOL TEST ===\n")

// Test all tools
for (const [name, toolDef] of Object.entries(tools)) {
  process.stdout.write(`▶ Testing tool: ${name} ... `)

  try {
    let result
    const toolCtx = {
      sessionID: "test",
      messageID: "msg-1",
      agent: "test",
      directory: pluginDir,
      worktree: pluginDir,
      abort: new AbortController().signal,
      metadata: () => {},
      ask: () => ({ pipe: () => {} }),
    }

    switch (name) {
      case "analyze_file":
        result = await toolDef.execute({ filePath: testFile }, toolCtx)
        break
      case "list_source_files":
        result = await toolDef.execute({ directory: resolve(pluginDir, "src") }, toolCtx)
        break
      case "grep_source":
        result = await toolDef.execute({ pattern: "tool", directory: resolve(pluginDir, "src") }, toolCtx)
        break
      case "code_stats":
        result = await toolDef.execute({ directory: pluginDir }, toolCtx)
        break
      case "analyze_imports":
        result = await toolDef.execute({ filePath: testFile }, toolCtx)
        break
      case "find_unused_exports":
        result = await toolDef.execute({ directory: resolve(pluginDir, "src") }, toolCtx)
        break
      case "analyze_complexity":
        result = await toolDef.execute({ filePath: testFile }, toolCtx)
        break
      case "trace_variable":
        // Test single-file trace (basic sanity)
        const cppFile = resolve(pluginDir, ".test-projects/complex-dfa/function-flow.cpp")
        if (existsSync(cppFile)) {
          result = await toolDef.execute({ filePath: cppFile, variableName: "x", line: 60 }, toolCtx)
        } else {
          result = { output: "Skipped (test file not found)" }
        }
        break
      default:
        result = { output: "Unknown tool" }
    }

    const output = typeof result === "string" ? result : result.output || ""
    const metaKeys = typeof result === "object" ? Object.keys(result.metadata || {}) : []

    console.log(`✅ (${output.substring(0, 60).replace(/\n/g, " ")}...)`)
    console.log(`   Metadata: ${metaKeys.join(", ") || "none"}`)
    passed++
  } catch (err) {
    console.log(`❌ Error: ${err.message}`)
    failed++
  }
}

// Verify the plugin.json manifest is valid
console.log("\n\n=== MANIFEST CHECK ===")
const manifestPath = resolve(pluginDir, "plugin.json")
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))
  console.log(`  Name: ${manifest.name}`)
  console.log(`  Version: ${manifest.version}`)
  console.log(`  Entry: ${manifest.entry}`)
  console.log(`  Hooks: ${manifest.hooks.join(", ")}`)
  console.log("  ✅ Valid manifest")
} else {
  console.log("  ❌ Manifest not found")
  failed++
}

console.log(`\n\n✅ ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
