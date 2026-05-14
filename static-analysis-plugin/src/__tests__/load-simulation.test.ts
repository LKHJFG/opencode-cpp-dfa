import { describe, it, expect, beforeAll } from "bun:test"
import { resolve } from "path"

/**
 * Simulate how OpenCode loads a plugin:
 *
 * 1. The runtime resolves the plugin specifier (npm package or local path)
 * 2. Calls `import()` to get the default export
 * 3. The default export should be a Plugin function or PluginModule
 * 4. OpenCode calls the plugin function with PluginInput
 * 5. The plugin returns Hooks with tool definitions
 * 6. When the agent calls a tool, OpenCode invokes tool.execute(args, context)
 */
describe("OpenCode Plugin Load Simulation", () => {
  let pluginModule: any

  beforeAll(async () => {
    // Step 1-2: OpenCode imports the plugin
    // The plugin's package.json "main" / "exports" points to dist/index.js
    // OpenCode does: const mod = await import(pluginSpecifier)
    pluginModule = await import(resolve(import.meta.dir, "../../dist/index.js"))
  })

  it("should export default as a function (Plugin)", () => {
    // OpenCode expects: mod.default OR mod.server (for PluginModule)
    expect(pluginModule.default).toBeDefined()
    expect(typeof pluginModule.default).toBe("function")
  })

  it("should load as PluginModule format if wrapped", async () => {
    // Some plugins export: { server: Plugin } as default (PluginModule format)
    // Our plugin exports: default = Plugin directly
    // Both should work
    const directPlugin = pluginModule.default
    const ctx = createMinimalMockContext()
    const hooks = await directPlugin(ctx)
    expect(hooks).toBeDefined()
    expect(hooks.tool).toBeDefined()
  })

  it("tool should be callable via LLM agent simulation", async () => {
    // Step 3-4: OpenCode creates context and calls the plugin
    const plugin = pluginModule.default
    const ctx = createMinimalMockContext()

    // Step 5: Plugin returns Hooks with tools
    const hooks = await plugin(ctx)

    // Step 6: OpenCode registers the tools from hooks.tool
    const tools = hooks.tool ?? {}
    expect(Object.keys(tools).length).toBeGreaterThan(0)

    // Simulate agent calling the tool with OpenCode-provided context
    const analyzeTool = tools.analyze_file!
    const result = await analyzeTool.execute(
      { filePath: resolve(import.meta.dir, "../../dist/index.js") },
      createMockToolContext(),
    )

    // OpenCode gets the result back
    expect(result).toBeDefined()

    if (typeof result === "object") {
      // OpenCode processes the tool result
      expect(result.output).toBeDefined()
      expect(result.output).toContain("Total lines:")
    }
  })

  it("should handle tool errors gracefully (no crash)", async () => {
    const plugin = pluginModule.default
    const hooks = await plugin(createMinimalMockContext())
    const analyzeTool = hooks.tool?.analyze_file!

    // Simulate error case: non-existent file
    const result = await analyzeTool.execute(
      { filePath: "/definitely/does/not/exist.ts" },
      createMockToolContext(),
    )

    // OpenCode must not crash - tool should return error gracefully
    expect(result).toBeDefined()
    if (typeof result === "object") {
      expect(result.output).toContain("Error")
      expect(result.metadata?.error).toBeDefined()
    }
  })
})

function createMinimalMockContext() {
  return {
    client: {} as any,
    project: {} as any,
    directory: import.meta.dir,
    worktree: import.meta.dir,
    serverUrl: new URL("http://localhost:0"),
    experimental_workspace: { register: () => {} },
    $: {} as any,
  }
}

function createMockToolContext() {
  return {
    sessionID: "sim-test",
    messageID: "msg-1",
    agent: "test",
    directory: import.meta.dir,
    worktree: import.meta.dir,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: () => ({ pipe: () => {} }) as any,
  }
}
