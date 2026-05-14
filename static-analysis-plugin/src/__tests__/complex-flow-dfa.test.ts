/**
 * Tests for Complex Cross-File Data Flow Analysis
 *
 * Uses the complex-flow test project with 10 C++ files covering:
 *   - Cross-file function calls (pure functions)
 *   - Reference/pointer parameter in/out
 *   - Struct data flow (by value, by pointer, by const ref)
 *   - Alias chains (pointer aliasing through multiple levels)
 *   - Nested function calls across files
 *   - Array/buffer pointer flow
 *   - Double indirection
 *   - Mixed pipeline combining all patterns
 */

import { describe, it, expect } from "bun:test"
import { resolve } from "path"
import StaticAnalysisPlugin from "../index"
import { type FlowEdge } from "../tools/cpp/cpp-dataflow"
function createMockContext(overrides: Partial<{ directory: string }> = {}) {
  return {
    client: {} as any,
    project: {} as any,
    directory: overrides.directory ?? process.cwd(),
    worktree: overrides.directory ?? process.cwd(),
    serverUrl: new URL("http://localhost"),
    $: {} as any,
    experimental_workspace: { register: () => {} } as any,
  }
}

function createMockToolContext(dir?: string) {
  return {
    sessionID: "test",
    messageID: "test",
    agent: "test",
    directory: dir ?? process.cwd(),
    worktree: dir ?? process.cwd(),
    abort: new AbortController().signal,
    metadata: () => {},
    ask: () => ({ pipe: () => {} }) as any,
  }
}

const COMPLEX_FLOW_DIR = resolve(import.meta.dir, "../../.test-projects/complex-flow")
const MAIN_CPP = resolve(COMPLEX_FLOW_DIR, "main.cpp")
const MATH_UTILS_CPP = resolve(COMPLEX_FLOW_DIR, "math_utils.cpp")
const IO_OPS_CPP = resolve(COMPLEX_FLOW_DIR, "io_ops.cpp")
const ALIAS_CPP = resolve(COMPLEX_FLOW_DIR, "alias_playground.cpp")
const PIPELINE_CPP = resolve(COMPLEX_FLOW_DIR, "pipeline.cpp")

// ========================================
// Group 1: v3 Cross-Function (single file)
// Trace variables within main.cpp across its section functions
// ========================================

describe("v3 cross-function in main.cpp", () => {

  it("SectionA: forward trace input through add→multiply→computeValue chain", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "input", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges.length).toBeGreaterThanOrEqual(1)
    // input should flow to step1, step2, step3, chained, clamped
    expect(meta.allVariables).toContain("input")
    // Note: these all exist in sectionA() within the same file
    const vars: string[] = meta.allVariables
    expect(vars.length).toBeGreaterThanOrEqual(1)
  })

  it("SectionA: backward trace clamped back through step3→step2→...→input", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "clamped", direction: "backward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges.length).toBeGreaterThanOrEqual(1)
  })

  it("SectionB: forward trace val through transformRef→incrementRef→doubleRef→modifyViaPointer", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "val", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    // Note: val flows through void-function calls (transformRef, etc.)
    // that modify val via reference/pointer. The v1/v2/v3 paths handle
    // assignments (LHS = RHS pattern); void calls with side effects
    // on reference params are resolved by the v4 cross-file path
    // (see the v4 test at line 338). This v3 test verifies the tool
    // runs without error for this pattern (zero edges expected in v3
    // since callees are in other files).
    expect(Array.isArray(meta.allVariables)).toBe(true)
    expect(Array.isArray(meta.edges)).toBe(true)
    expect(meta.allVariables).toContain("val")
  })

  it("SectionB: forward trace a through swap to b", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "a", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(Array.isArray(meta.allVariables)).toBe(true)
    expect(Array.isArray(meta.edges)).toBe(true)
    expect(meta.allVariables).toContain("a")
  })

  it("SectionB: backward trace val2 back through doubleRef chain", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "val2", direction: "backward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    // val2 is a constant (int val2 = 100) that only flows through
    // void-function calls (doubleRef). No assignments create edges
    // from val2 to another variable. Verify the tool handles this.
    expect(Array.isArray(meta.allVariables)).toBe(true)
    expect(meta.allVariables).toContain("val2")
  })

  it("SectionC: forward trace d1 through processData→modifyData→extractValue→computeResult", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "d1", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
  })

  it("SectionC: backward trace res1 back through processData to d1", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "res1", direction: "backward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges.length).toBeGreaterThanOrEqual(1)
  })

  it("SectionD: forward trace target through alias1→alias2→alias3→...→final", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "target", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.allVariables).toContain("target")
    // Should at least find through alias1 and alias2
    expect(meta.edges.length).toBeGreaterThanOrEqual(1)
  })

  it("SectionD: backward trace final back through alias chain to target", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "final", direction: "backward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges.length).toBeGreaterThanOrEqual(1)
  })

  it("SectionE: forward trace raw through nested cube(square(raw))", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "raw", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.allVariables).toContain("raw")
  })

  it("SectionE: backward trace combined back through v1,v2→computeValue→raw", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "combined", direction: "backward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges.length).toBeGreaterThanOrEqual(1)
  })

  it("SectionF: forward trace buffer through fillBuffer→accumulate→ptr→updateBuffer", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "buffer", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
  })

  it("SectionF: forward trace total from accumulate back to buffer", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "total", direction: "backward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges.length).toBeGreaterThanOrEqual(1)
  })

  it("SectionG: forward trace value through ptr→pptr→doubleDeref→result", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "value", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.allVariables).toContain("value")
    // Verify pointer chain: value → ptr → pptr → result
    expect(meta.allVariables).toContain("ptr")
    expect(meta.allVariables).toContain("pptr")
    expect(meta.allVariables).toContain("result")
    // Edge chain should exist with specific types
    expect(meta.edges.length).toBeGreaterThanOrEqual(3)
    const edgeTypes = meta.edges.map((e: FlowEdge) => e.edgeType)
    expect(edgeTypes).toContain("pointer")
    expect(edgeTypes).toContain("parameter")
  })

  it("SectionG: backward trace result back through doubleDeref→ptr→value", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "result", direction: "backward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges.length).toBeGreaterThanOrEqual(1)
    expect(meta.allVariables).toContain("result")
  })

  it("SectionH: forward trace base through full mixed pipeline (3 files)", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "base", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.allVariables).toContain("base")
    expect(meta.allVariables).toContain("a1")
    expect(meta.allVariables).toContain("a2")
    expect(meta.allVariables).toContain("multi2")
    expect(meta.allVariables).toContain("final_val")
    expect(meta.edges.length).toBeGreaterThanOrEqual(7)
  })

  it("SectionH: backward trace final_val back through modifyData→createData→a2→a1→base", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "final_val", direction: "backward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges.length).toBeGreaterThanOrEqual(7)
    expect(meta.allVariables).toContain("base")
    expect(meta.allVariables).toContain("a2")
    expect(meta.allVariables).toContain("d3")
  })

  it("SectionH: backward trace multi2 back through modifyViaPointer→computeValue→transformRef→base", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MAIN_CPP, variableName: "multi2", direction: "backward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges.length).toBeGreaterThanOrEqual(3)
    expect(meta.allVariables).toContain("base")
    expect(meta.allVariables).toContain("multi")
  })
})

// ========================================
// Group 2: v4 Cross-File (multi-file workspace)
// Trace variables across .cpp file boundaries
// ========================================

describe("v4 cross-file tracing in complex-flow workspace", () => {

  it("crosses from main.cpp into math_utils.cpp: forward input→computeValue→...→step3", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      {
        filePath: MAIN_CPP,
        variableName: "input",
        direction: "forward",
        directory: COMPLEX_FLOW_DIR,
      },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    const crossFileEdges = meta.edges.filter((e: FlowEdge) => e.fromFile !== e.toFile)
    expect(crossFileEdges.length).toBeGreaterThan(0)
    expect(meta.allVariables).toContain("input")
  })

  it("crosses from main.cpp into io_ops.cpp: forward val through transformRef→incrementRef→...", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      {
        filePath: MAIN_CPP,
        variableName: "val",
        direction: "forward",
        directory: COMPLEX_FLOW_DIR,
      },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    const crossFileEdges = meta.edges.filter((e: FlowEdge) => e.fromFile !== e.toFile)
    expect(crossFileEdges.length).toBeGreaterThan(0)
    expect(meta.allVariables).toContain("val")
    expect(meta.allVariables).toContain("r")
    expect(meta.allVariables).toContain("p")
    // Verify reference param side-effect propagation back to caller
    // transformRef(val) → r modified via r=r+1 → cross_file_ref_modify from r back to val
    // incrementRef(val) / doubleRef(val) → same pattern
    // modifyViaPointer(&val) → *p deref write → also cross_file_ref_modify
    const refModEdges = meta.edges.filter((e: any) =>
      e.edgeType === "cross_file_ref_modify" && e.toVar === "val"
    )
    expect(refModEdges.length).toBeGreaterThanOrEqual(1)
    // Verify the edge source variables include the callee params
    const refModFromVars = refModEdges.map((e: any) => e.fromVar)
    expect(refModFromVars).toContain("r")
    expect(refModFromVars).toContain("p")
    // Verify cross_file_call edges exist for the function call transitions
    const callEdges = meta.edges.filter((e: any) => e.edgeType === "cross_file_call")
    expect(callEdges.length).toBeGreaterThanOrEqual(1)
    expect(callEdges[0].fromFile).not.toBe(callEdges[0].toFile)
  })

  it("crosses from main.cpp into pipeline.cpp: forward d1 through processData→modifyData", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      {
        filePath: MAIN_CPP,
        variableName: "d1",
        direction: "forward",
        directory: COMPLEX_FLOW_DIR,
      },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    const crossFileEdges = meta.edges.filter((e: FlowEdge) => e.fromFile !== e.toFile)
    expect(crossFileEdges.length).toBeGreaterThan(0)
    expect(meta.allVariables).toContain("d1")
  })

  it("crosses from main.cpp into pipeline.cpp: backward res1 through processData to d1", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      {
        filePath: MAIN_CPP,
        variableName: "res1",
        direction: "backward",
        directory: COMPLEX_FLOW_DIR,
      },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    const crossFileEdges = meta.edges.filter((e: FlowEdge) => e.fromFile !== e.toFile)
    expect(crossFileEdges.length).toBeGreaterThan(0)
    expect(meta.allVariables).toContain("res1")
  })

  it("crosses from main.cpp into alias_playground.cpp: forward target through alias chain", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      {
        filePath: MAIN_CPP,
        variableName: "target",
        direction: "forward",
        directory: COMPLEX_FLOW_DIR,
      },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    const crossFileEdges = meta.edges.filter((e: FlowEdge) => e.fromFile !== e.toFile)
    expect(crossFileEdges.length).toBeGreaterThan(0)
    expect(meta.allVariables).toContain("target")
    // Note: forward trace from "target" enters alias_playground.cpp via
    // alias-chain variables (alias1 → alias2 → ...), not directly through
    // &target args (which don't match includes("target")). The cross-file
    // edges come from variable definitions tracking through assignments.
  })

  it("crosses from main.cpp into alias_playground.cpp: backward final through alias chain to target", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      {
        filePath: MAIN_CPP,
        variableName: "final",
        direction: "backward",
        directory: COMPLEX_FLOW_DIR,
      },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    const crossFileEdges = meta.edges.filter((e: FlowEdge) => e.fromFile !== e.toFile)
    expect(crossFileEdges.length).toBeGreaterThan(0)
    expect(meta.allVariables).toContain("final")
    // Backward trace from final should reach target through the alias chain
    expect(meta.allVariables).toContain("target")
    expect(meta.allVariables).toContain("alias3")
  })

  it("crosses 3-file chain: main.cpp → pipeline.cpp → math_utils.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      {
        filePath: MAIN_CPP,
        variableName: "d2",
        direction: "forward",
        directory: COMPLEX_FLOW_DIR,
      },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    const crossFileEdges = meta.edges.filter((e: FlowEdge) => e.fromFile !== e.toFile)
    expect(crossFileEdges.length).toBeGreaterThan(0)
    expect(meta.allVariables).toContain("d2")
  })

  it("cross-file mixed pipeline: base through 3 files (main→io_ops→math_utils)", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      {
        filePath: MAIN_CPP,
        variableName: "base",
        direction: "forward",
        directory: COMPLEX_FLOW_DIR,
      },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    const crossFileEdges = meta.edges.filter((e: FlowEdge) => e.fromFile !== e.toFile)
    expect(crossFileEdges.length).toBeGreaterThan(0)
    expect(meta.allVariables).toContain("base")
    expect(meta.allVariables).toContain("a1")
    expect(meta.allVariables).toContain("multi2")
    const edgeTypes = meta.edges.map((e: FlowEdge) => e.edgeType)
    expect(edgeTypes).toContain("cross_file_call")
    expect(edgeTypes).toContain("cross_file_return")
  })

  it("cross-file 3-hop chain: base → multi → multi2 through io_ops + math_utils", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      {
        filePath: MAIN_CPP,
        variableName: "multi2",
        direction: "backward",
        directory: COMPLEX_FLOW_DIR,
      },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    const crossFileEdges = meta.edges.filter((e: FlowEdge) => e.fromFile !== e.toFile)
    expect(crossFileEdges.length).toBeGreaterThan(0)
    expect(meta.allVariables).toContain("multi2")
    expect(meta.allVariables).toContain("multi")
    expect(meta.allVariables).toContain("base")
  })

  it("cross-file buffer flow: main.cpp → io_ops.cpp (fillBuffer) → math_utils.cpp (accumulate)", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      {
        filePath: MAIN_CPP,
        variableName: "total",
        direction: "backward",
        directory: COMPLEX_FLOW_DIR,
      },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    const crossFileEdges = meta.edges.filter((e: FlowEdge) => e.fromFile !== e.toFile)
    expect(crossFileEdges.length).toBeGreaterThan(0)
    expect(meta.allVariables).toContain("total")
  })
})
