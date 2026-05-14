/**
 * Verify that OpenCode can load our plugin.
 * Simulates the import mechanism OpenCode uses.
 *
 * This does NOT require any config changes - it tests the plugin module directly.
 */

const pluginPath = "C:/work/plugin4opencode/static-analysis-plugin"

try {
  // Step 1: OpenCode resolves the plugin specifier and calls import()
  console.log(`[1] Importing plugin from: ${pluginPath}`)
  const mod = await import(pluginPath)

  // Step 2: Check default export
  const pluginFn = mod.default
  if (typeof pluginFn !== "function") {
    console.error("[FAIL] default export is not a function (Plugin)")
    process.exit(1)
  }
  console.log("[PASS] default export is a valid Plugin function")

  // Step 3: Call the plugin function with mock context (as OpenCode would)
  const mockCtx = {
    client: {},
    project: {},
    directory: process.cwd(),
    worktree: process.cwd(),
    serverUrl: new URL("http://localhost:0"),
    experimental_workspace: { register: () => {} },
    $: {},
  }

  console.log("[2] Calling plugin function with PluginInput...")
  const hooks = await pluginFn(mockCtx)

  if (!hooks || typeof hooks !== "object") {
    console.error("[FAIL] plugin did not return a Hooks object")
    process.exit(1)
  }
  console.log("[PASS] plugin returned Hooks object")

  // Step 4: Check tool registration
  if (!hooks.tool || typeof hooks.tool !== "object") {
    console.error("[FAIL] Hooks missing 'tool' property")
    process.exit(1)
  }

  const toolNames = Object.keys(hooks.tool)
  console.log(`[PASS] Plugin registered ${toolNames.length} tool(s): ${toolNames.join(", ")}`)

  // Step 5: Test calling a tool
  const analyzeTool = hooks.tool.analyze_file
  if (!analyzeTool) {
    console.error("[FAIL] 'analyze_file' tool not found")
    process.exit(1)
  }
  console.log(`[PASS] 'analyze_file' tool: ${analyzeTool.description}`)

  // Step 6: Execute tool (simulates OpenCode LLM agent calling it)
  console.log("[3] Executing analyze_file tool (reading its own dist/index.js)...")
  const result = await analyzeTool.execute(
    { filePath: `${pluginPath}/dist/index.js` },
    {
      sessionID: "verify",
      messageID: "msg-1",
      agent: "test",
      directory: pluginPath,
      worktree: pluginPath,
      abort: new AbortController().signal,
      metadata: () => {},
      ask: () => ({ pipe: () => {} }),
    },
  )

  if (typeof result === "string") {
    console.log(`[PASS] Tool returned string result (${result.length} chars)`)
    console.log("--- OUTPUT ---")
    console.log(result.substring(0, 500))
  } else {
    console.log(`[PASS] Tool returned object result`)
    console.log(`       output: ${result.output.substring(0, 200)}...`)
    console.log(`       metadata:`, JSON.stringify(result.metadata, null, 2))
  }

  console.log("\n✅ PLUGIN VERIFICATION PASSED")
  console.log("   Plugin loads, registers tools, and executes successfully.")
} catch (err) {
  console.error(`\n❌ PLUGIN VERIFICATION FAILED:`, err)
  process.exit(1)
}
