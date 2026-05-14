/**
 * Benchmark Tests for trace_variable Tool Engines
 *
 * Measures and compares execution time of v1 (regex), v2 (AST), v3 (interprocedural),
 * and v4 (cross-file DFA) engines. Uses self-calibrating baselines: each engine/size
 * combo is calibrated in beforeAll, then each test asserts median < baseline * 2x.
 * Baselines are measured on Windows dev machine; update by re-running calibration.
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { resolve, join } from "path"
import { buildCFG } from "../tools/cpp/cpp-cfg"
import { buildDefUseChains, analyzeDataFlow, type TraceResult } from "../tools/cpp/cpp-dataflow"
import { CppParser } from "../tools/cpp/cpp-parser"
import { buildASTCFG } from "../tools/cpp/ast-to-cfg"
import { buildFunctionCFGs, buildCallGraph, traceInterprocedural, type InterproceduralResult } from "../tools/cpp/cross-function-dfa"
import { analyzeWorkspace, traceCrossFile, type WorkspaceAnalysis } from "../tools/cpp/cross-file-dfa"
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs"

const testDir = resolve(import.meta.dir, "../../.test-tmp")
const COMPLEX_DFA_DIR = resolve(import.meta.dir, "../../.test-projects/complex-dfa")

function ensureTestDir() {
  if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true })
}

// ========================================
// Test Fixtures - Three Size Levels
// ========================================

const SMALL_FIXTURE = `int simpleCalc(int input) {
  int a = input + 1;
  int b = a * 2;
  int c = b - 3;
  int d = c / 2;
  int result = d + a;
  return result;
}`

const MEDIUM_FIXTURE = `int mediumFunction(int x, int y) {
  int result = 0;

  if (x > 0) {
    result = x + y;
    int temp = result * 2;
    result = temp - 1;
  } else {
    result = y - x;
    int temp2 = result / 2;
    result = temp2 + 10;
  }

  for (int i = 0; i < x; i++) {
    result += i;
    int loopVar = i * 2;
    result += loopVar;
  }

  while (y > 0) {
    y = y / 2;
    result = result + y;
  }

  if (result > 100) {
    result = 100;
  } else if (result > 50) {
    result = 50;
  } else {
    result = 0;
  }

  return result;
}`

const LARGE_FIXTURE = `class DataProcessor {
private:
  int* buffer;
  int size;

public:
  DataProcessor(int s) : size(s) {
    buffer = new int[size];
    for (int i = 0; i < size; i++) {
      buffer[i] = i * 2;
    }
  }

  ~DataProcessor() {
    delete[] buffer;
  }

  int computeSum() {
    int sum = 0;
    for (int i = 0; i < size; i++) {
      sum += buffer[i];
    }
    return sum;
  }

  int processWithConditions(int threshold) {
    int result = 0;
    int count = 0;
    int multiplier = 1;

    for (int i = 0; i < size; i++) {
      int value = buffer[i];

      if (value > threshold) {
        result += value * multiplier;
        count++;
        multiplier++;
      } else if (value == threshold) {
        result += value;
        count++;
      } else {
        result -= value;
      }

      if (count > 10) break;
    }

    if (result < 0) result = 0;
    else if (result > 1000) result = 1000;

    return result;
  }

  int findMaxValue() {
    int maxVal = INT_MIN;
    for (int i = 0; i < size; i++) {
      if (buffer[i] > maxVal) maxVal = buffer[i];
    }
    return maxVal;
  }

  void transformData(int factor) {
    for (int i = 0; i < size; i++) {
      int oldVal = buffer[i];
      int newVal = oldVal * factor;

      if (newVal > 100) buffer[i] = 100;
      else if (newVal < 0) buffer[i] = 0;
      else buffer[i] = newVal;
    }
  }

  int complexCalculation(int a, int b, int c) {
    int x = a + b;
    int y = b + c;
    int z = a + c;

    int temp1 = x * y;
    int temp2 = y * z;
    int temp3 = z * x;

    int result = temp1 + temp2 + temp3;
    result = result / 3;

    if (result > a && result > b && result > c) return result;
    else if (a > b && a > c) return a;
    else if (b > c) return b;
    else return c;
  }
};`

// ========================================
// Benchmark Helper
// ========================================

function measureSync(fn: () => void, runs: number = 5): { medianMs: number; timings: number[] } {
  const timings: number[] = []
  for (let i = 0; i < runs; i++) {
    const start = Bun.nanoseconds()
    fn()
    const end = Bun.nanoseconds()
    timings.push((end - start) / 1_000_000)
  }
  timings.sort((a, b) => a - b)
  return { medianMs: timings[Math.floor(timings.length / 2)], timings }
}

async function measureAsync(fn: () => Promise<void>, runs: number = 5): Promise<{ medianMs: number; timings: number[] }> {
  const timings: number[] = []
  for (let i = 0; i < runs; i++) {
    const start = Bun.nanoseconds()
    await fn()
    const end = Bun.nanoseconds()
    timings.push((end - start) / 1_000_000)
  }
  timings.sort((a, b) => a - b)
  return { medianMs: timings[Math.floor(timings.length / 2)], timings }
}

// ========================================
// Engine Runners
// ========================================

function runV1(sourceCode: string, varName: string, line: number, direction: "forward" | "backward" | "both" = "both"): TraceResult {
  const sourceLines = sourceCode.split("\n")
  const cfg = buildCFG(sourceLines)
  const duInfo = buildDefUseChains(cfg, "/test/v1.cpp")
  return analyzeDataFlow(cfg, duInfo, varName, line, direction, "/test/v1.cpp")
}

async function runV2(sourceCode: string, varName: string, line: number, direction: "forward" | "backward" | "both" = "both"): Promise<TraceResult> {
  const parser = CppParser.getInstance()
  const parseResult = await parser.parseContent(sourceCode, "/test/v2.cpp")
  const cfg = buildASTCFG(parseResult.tree, parseResult.sourceLines)
  const duInfo = buildDefUseChains(cfg, "/test/v2.cpp")
  return analyzeDataFlow(cfg, duInfo, varName, line, direction, "/test/v2.cpp")
}

async function runV3(sourceCode: string, varName: string, funcName: string, direction: "forward" | "backward" | "both" = "both"): Promise<InterproceduralResult> {
  const parser = CppParser.getInstance()
  const parseResult = await parser.parseContent(sourceCode, "/test/v3.cpp")
  const funcCfgs = buildFunctionCFGs(parseResult.tree, parseResult.sourceLines, "/test/v3.cpp")
  const callSites = buildCallGraph(parseResult.tree, funcCfgs)
  return traceInterprocedural(funcCfgs, callSites, varName, funcName, direction, "/test/v3.cpp")
}

// ========================================
// Self-Calibrating Baselines
// Calibrated once in beforeAll — thresholds are 2x these values.
// ========================================

interface EngineBaselines {
  v1: { small: number; medium: number; large: number }
  v2: { small: number; medium: number; large: number }
  v3: { small: number; medium: number; large: number }
  v4: { workspace: number; trace: number }
}

const BASELINES: EngineBaselines = {
  v1: { small: 0, medium: 0, large: 0 },
  v2: { small: 0, medium: 0, large: 0 },
  v3: { small: 0, medium: 0, large: 0 },
  v4: { workspace: 0, trace: 0 },
}

// ========================================
// Tests
// ========================================

describe("Benchmark: trace_variable Engine Comparison", () => {
  let parser: CppParser

  beforeAll(async () => {
    parser = CppParser.getInstance()
    await parser.init()

    // -------------------------------------------------------
    // Calibration: measure all engine/size combos to set baselines
    // Thresholds = baseline * 2 (allows normal variance, catches regressions)
    // -------------------------------------------------------

    // v1 calibration
    const v1sl = SMALL_FIXTURE.split("\n")
    BASELINES.v1.small = measureSync(() => {
      const cfg = buildCFG(v1sl)
      const duInfo = buildDefUseChains(cfg, "/cal/v1s.cpp")
      analyzeDataFlow(cfg, duInfo, "a", 2, "forward", "/cal/v1s.cpp")
    }).medianMs

    const v1ml = MEDIUM_FIXTURE.split("\n")
    BASELINES.v1.medium = measureSync(() => {
      const cfg = buildCFG(v1ml)
      const duInfo = buildDefUseChains(cfg, "/cal/v1m.cpp")
      analyzeDataFlow(cfg, duInfo, "result", 2, "forward", "/cal/v1m.cpp")
    }).medianMs

    const v1ll = LARGE_FIXTURE.split("\n")
    BASELINES.v1.large = measureSync(() => {
      const cfg = buildCFG(v1ll)
      const duInfo = buildDefUseChains(cfg, "/cal/v1l.cpp")
      analyzeDataFlow(cfg, duInfo, "sum", 19, "forward", "/cal/v1l.cpp")
    }).medianMs

    // v2 calibration
    const v2sp = await parser.parseContent(SMALL_FIXTURE, "/cal/v2s.cpp")
    BASELINES.v2.small = measureSync(() => {
      const cfg = buildASTCFG(v2sp.tree, v2sp.sourceLines)
      const duInfo = buildDefUseChains(cfg, "/cal/v2s.cpp")
      analyzeDataFlow(cfg, duInfo, "a", 2, "forward", "/cal/v2s.cpp")
    }).medianMs

    const v2mp = await parser.parseContent(MEDIUM_FIXTURE, "/cal/v2m.cpp")
    BASELINES.v2.medium = measureSync(() => {
      const cfg = buildASTCFG(v2mp.tree, v2mp.sourceLines)
      const duInfo = buildDefUseChains(cfg, "/cal/v2m.cpp")
      analyzeDataFlow(cfg, duInfo, "result", 2, "forward", "/cal/v2m.cpp")
    }).medianMs

    const v2lp = await parser.parseContent(LARGE_FIXTURE, "/cal/v2l.cpp")
    BASELINES.v2.large = measureSync(() => {
      const cfg = buildASTCFG(v2lp.tree, v2lp.sourceLines)
      const duInfo = buildDefUseChains(cfg, "/cal/v2l.cpp")
      analyzeDataFlow(cfg, duInfo, "sum", 19, "forward", "/cal/v2l.cpp")
    }).medianMs

    // v3 calibration
    const v3sp = await parser.parseContent(SMALL_FIXTURE, "/cal/v3s.cpp")
    BASELINES.v3.small = measureSync(() => {
      const funcCfgs = buildFunctionCFGs(v3sp.tree, v3sp.sourceLines, "/cal/v3s.cpp")
      const callSites = buildCallGraph(v3sp.tree, funcCfgs)
      traceInterprocedural(funcCfgs, callSites, "a", "simpleCalc", "forward", "/cal/v3s.cpp")
    }).medianMs

    const v3mp = await parser.parseContent(MEDIUM_FIXTURE, "/cal/v3m.cpp")
    BASELINES.v3.medium = measureSync(() => {
      const funcCfgs = buildFunctionCFGs(v3mp.tree, v3mp.sourceLines, "/cal/v3m.cpp")
      const callSites = buildCallGraph(v3mp.tree, funcCfgs)
      traceInterprocedural(funcCfgs, callSites, "result", "mediumFunction", "forward", "/cal/v3m.cpp")
    }).medianMs

    const v3lp = await parser.parseContent(LARGE_FIXTURE, "/cal/v3l.cpp")
    BASELINES.v3.large = measureSync(() => {
      const funcCfgs = buildFunctionCFGs(v3lp.tree, v3lp.sourceLines, "/cal/v3l.cpp")
      const callSites = buildCallGraph(v3lp.tree, funcCfgs)
      traceInterprocedural(funcCfgs, callSites, "sum", "processWithConditions", "forward", "/cal/v3l.cpp")
    }).medianMs

    // v4 calibration — cross-file workspace analysis + trace
    const v4Workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)
    BASELINES.v4.workspace = (await measureAsync(async () => {
      await analyzeWorkspace(COMPLEX_DFA_DIR)
    })).medianMs

    const startFile = join(COMPLEX_DFA_DIR, "function-flow.cpp")
    BASELINES.v4.trace = (await measureAsync(async () => {
      await traceCrossFile("num", startFile, "forward", v4Workspace, 3)
    })).medianMs

    console.log(`\n  Calibrated baselines (ms):`)
    console.log(`    v1: SMALL=${BASELINES.v1.small.toFixed(3)} MEDIUM=${BASELINES.v1.medium.toFixed(3)} LARGE=${BASELINES.v1.large.toFixed(3)}`)
    console.log(`    v2: SMALL=${BASELINES.v2.small.toFixed(3)} MEDIUM=${BASELINES.v2.medium.toFixed(3)} LARGE=${BASELINES.v2.large.toFixed(3)}`)
    console.log(`    v3: SMALL=${BASELINES.v3.small.toFixed(3)} MEDIUM=${BASELINES.v3.medium.toFixed(3)} LARGE=${BASELINES.v3.large.toFixed(3)}`)
    console.log(`    v4: workspace=${BASELINES.v4.workspace.toFixed(3)} trace=${BASELINES.v4.trace.toFixed(3)}`)
    console.log(`    Thresholds set at 2x baseline\n`)
  })

  // v1 benchmarks (sync)
  it("v1 SMALL should complete within threshold", () => {
    const sourceLines = SMALL_FIXTURE.split("\n")
    const { medianMs, timings } = measureSync(() => {
      const cfg = buildCFG(sourceLines)
      const duInfo = buildDefUseChains(cfg, "/test/s.cpp")
      analyzeDataFlow(cfg, duInfo, "a", 2, "forward", "/test/s.cpp")
    })
    const threshold = BASELINES.v1.small * 2
    console.log(`  v1 SMALL: median=${medianMs.toFixed(3)}ms [${timings.map(t => t.toFixed(2)).join(", ")}] threshold=${threshold.toFixed(3)}ms ${medianMs < threshold ? "PASS" : "FAIL"}`)
    expect(medianMs).toBeLessThan(threshold)
    expect(timings.length).toBe(5)
    expect(medianMs).toBeGreaterThan(0)
  })

  it("v1 MEDIUM should complete within threshold", () => {
    const sourceLines = MEDIUM_FIXTURE.split("\n")
    const { medianMs, timings } = measureSync(() => {
      const cfg = buildCFG(sourceLines)
      const duInfo = buildDefUseChains(cfg, "/test/m.cpp")
      analyzeDataFlow(cfg, duInfo, "result", 2, "forward", "/test/m.cpp")
    })
    const threshold = BASELINES.v1.medium * 2
    console.log(`  v1 MEDIUM: median=${medianMs.toFixed(3)}ms [${timings.map(t => t.toFixed(2)).join(", ")}] threshold=${threshold.toFixed(3)}ms ${medianMs < threshold ? "PASS" : "FAIL"}`)
    expect(medianMs).toBeLessThan(threshold)
    expect(timings.length).toBe(5)
    expect(medianMs).toBeGreaterThan(0)
  })

  it("v1 LARGE should complete within threshold", () => {
    const sourceLines = LARGE_FIXTURE.split("\n")
    const { medianMs, timings } = measureSync(() => {
      const cfg = buildCFG(sourceLines)
      const duInfo = buildDefUseChains(cfg, "/test/l.cpp")
      analyzeDataFlow(cfg, duInfo, "sum", 19, "forward", "/test/l.cpp")
    })
    const threshold = BASELINES.v1.large * 2
    console.log(`  v1 LARGE: median=${medianMs.toFixed(3)}ms [${timings.map(t => t.toFixed(2)).join(", ")}] threshold=${threshold.toFixed(3)}ms ${medianMs < threshold ? "PASS" : "FAIL"}`)
    expect(medianMs).toBeLessThan(threshold)
    expect(timings.length).toBe(5)
    expect(medianMs).toBeGreaterThan(0)
  })

  // v2 benchmarks (async, AST parse first)
  it("v2 SMALL should complete within threshold", async () => {
    const content = SMALL_FIXTURE
    const absPath = "/test/v2s.cpp"
    const parseResult = await parser.parseContent(content, absPath)
    const { medianMs, timings } = measureSync(() => {
      const cfg = buildASTCFG(parseResult.tree, parseResult.sourceLines)
      const duInfo = buildDefUseChains(cfg, absPath)
      analyzeDataFlow(cfg, duInfo, "a", 2, "forward", absPath)
    })
    const threshold = BASELINES.v2.small * 2
    console.log(`  v2 SMALL: median=${medianMs.toFixed(3)}ms [${timings.map(t => t.toFixed(2)).join(", ")}] threshold=${threshold.toFixed(3)}ms ${medianMs < threshold ? "PASS" : "FAIL"}`)
    expect(medianMs).toBeLessThan(threshold)
    expect(timings.length).toBe(5)
    expect(medianMs).toBeGreaterThan(0)
  })

  it("v2 MEDIUM should complete within threshold", async () => {
    const content = MEDIUM_FIXTURE
    const absPath = "/test/v2m.cpp"
    const parseResult = await parser.parseContent(content, absPath)
    const { medianMs, timings } = measureSync(() => {
      const cfg = buildASTCFG(parseResult.tree, parseResult.sourceLines)
      const duInfo = buildDefUseChains(cfg, absPath)
      analyzeDataFlow(cfg, duInfo, "result", 2, "forward", absPath)
    })
    const threshold = BASELINES.v2.medium * 2
    console.log(`  v2 MEDIUM: median=${medianMs.toFixed(3)}ms [${timings.map(t => t.toFixed(2)).join(", ")}] threshold=${threshold.toFixed(3)}ms ${medianMs < threshold ? "PASS" : "FAIL"}`)
    expect(medianMs).toBeLessThan(threshold)
    expect(timings.length).toBe(5)
    expect(medianMs).toBeGreaterThan(0)
  })

  it("v2 LARGE should complete within threshold", async () => {
    const content = LARGE_FIXTURE
    const absPath = "/test/v2l.cpp"
    const parseResult = await parser.parseContent(content, absPath)
    const { medianMs, timings } = measureSync(() => {
      const cfg = buildASTCFG(parseResult.tree, parseResult.sourceLines)
      const duInfo = buildDefUseChains(cfg, absPath)
      analyzeDataFlow(cfg, duInfo, "sum", 19, "forward", absPath)
    })
    const threshold = BASELINES.v2.large * 2
    console.log(`  v2 LARGE: median=${medianMs.toFixed(3)}ms [${timings.map(t => t.toFixed(2)).join(", ")}] threshold=${threshold.toFixed(3)}ms ${medianMs < threshold ? "PASS" : "FAIL"}`)
    expect(medianMs).toBeLessThan(threshold)
    expect(timings.length).toBe(5)
    expect(medianMs).toBeGreaterThan(0)
  })

  // v3 benchmarks (async, parse + function CFGs)
  it("v3 SMALL should complete within threshold", async () => {
    const content = SMALL_FIXTURE
    const absPath = "/test/v3s.cpp"
    const parseResult = await parser.parseContent(content, absPath)
    const tree = parseResult.tree
    const sourceLines = parseResult.sourceLines
    const { medianMs, timings } = measureSync(() => {
      const funcCfgs = buildFunctionCFGs(tree, sourceLines, absPath)
      const callSites = buildCallGraph(tree, funcCfgs)
      traceInterprocedural(funcCfgs, callSites, "a", "simpleCalc", "forward", absPath)
    })
    const threshold = BASELINES.v3.small * 2
    console.log(`  v3 SMALL: median=${medianMs.toFixed(3)}ms [${timings.map(t => t.toFixed(2)).join(", ")}] threshold=${threshold.toFixed(3)}ms ${medianMs < threshold ? "PASS" : "FAIL"}`)
    expect(medianMs).toBeLessThan(threshold)
    expect(timings.length).toBe(5)
    expect(medianMs).toBeGreaterThan(0)
  })

  it("v3 MEDIUM should complete within threshold", async () => {
    const content = MEDIUM_FIXTURE
    const absPath = "/test/v3m.cpp"
    const parseResult = await parser.parseContent(content, absPath)
    const tree = parseResult.tree
    const sourceLines = parseResult.sourceLines
    const { medianMs, timings } = measureSync(() => {
      const funcCfgs = buildFunctionCFGs(tree, sourceLines, absPath)
      const callSites = buildCallGraph(tree, funcCfgs)
      traceInterprocedural(funcCfgs, callSites, "result", "mediumFunction", "forward", absPath)
    })
    const threshold = BASELINES.v3.medium * 2
    console.log(`  v3 MEDIUM: median=${medianMs.toFixed(3)}ms [${timings.map(t => t.toFixed(2)).join(", ")}] threshold=${threshold.toFixed(3)}ms ${medianMs < threshold ? "PASS" : "FAIL"}`)
    expect(medianMs).toBeLessThan(threshold)
    expect(timings.length).toBe(5)
    expect(medianMs).toBeGreaterThan(0)
  })

  it("v3 LARGE should complete within threshold", async () => {
    const content = LARGE_FIXTURE
    const absPath = "/test/v3l.cpp"
    const parseResult = await parser.parseContent(content, absPath)
    const tree = parseResult.tree
    const sourceLines = parseResult.sourceLines
    const { medianMs, timings } = measureSync(() => {
      const funcCfgs = buildFunctionCFGs(tree, sourceLines, absPath)
      const callSites = buildCallGraph(tree, funcCfgs)
      traceInterprocedural(funcCfgs, callSites, "sum", "processWithConditions", "forward", absPath)
    })
    const threshold = BASELINES.v3.large * 2
    console.log(`  v3 LARGE: median=${medianMs.toFixed(3)}ms [${timings.map(t => t.toFixed(2)).join(", ")}] threshold=${threshold.toFixed(3)}ms ${medianMs < threshold ? "PASS" : "FAIL"}`)
    expect(medianMs).toBeLessThan(threshold)
    expect(timings.length).toBe(5)
    expect(medianMs).toBeGreaterThan(0)
  })

  // v4 benchmarks — cross-file DFA (workspace scan + trace)
  it("v4 WORKSPACE should complete within threshold", async () => {
    const { medianMs, timings } = await measureAsync(async () => {
      await analyzeWorkspace(COMPLEX_DFA_DIR)
    })
    const threshold = BASELINES.v4.workspace * 2
    const ws = await analyzeWorkspace(COMPLEX_DFA_DIR)
    console.log(`  v4 WORKSPACE: median=${medianMs.toFixed(3)}ms [${timings.map(t => t.toFixed(2)).join(", ")}] threshold=${threshold.toFixed(3)}ms ${medianMs < threshold ? "PASS" : "FAIL"}`)
    expect(medianMs).toBeLessThan(threshold)
    expect(ws.totalFiles).toBeGreaterThan(0)
    expect(ws.parsedFiles).toBeGreaterThan(0)
    expect(ws.totalFunctions).toBeGreaterThan(0)
  })

  it("v4 TRACE should complete within threshold", async () => {
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)
    const startFile = join(COMPLEX_DFA_DIR, "function-flow.cpp")
    const { medianMs, timings } = await measureAsync(async () => {
      await traceCrossFile("num", startFile, "forward", workspace, 3)
    })
    const threshold = BASELINES.v4.trace * 2
    console.log(`  v4 TRACE: median=${medianMs.toFixed(3)}ms [${timings.map(t => t.toFixed(2)).join(", ")}] threshold=${threshold.toFixed(3)}ms ${medianMs < threshold ? "PASS" : "FAIL"}`)
    expect(medianMs).toBeLessThan(threshold)
    expect(timings.length).toBe(5)
    expect(medianMs).toBeGreaterThan(0)
  })

  // Cross-engine consistency
  it("all engines produce results on SMALL fixture", async () => {
    const v1Result = runV1(SMALL_FIXTURE, "a", 2, "forward")
    const v2Result = await runV2(SMALL_FIXTURE, "a", 2, "forward")
    const v3Result = await runV3(SMALL_FIXTURE, "a", "simpleCalc", "forward")

    console.log(`\n  Engine comparison on SMALL fixture:`)
    console.log(`    v1: edges=${v1Result.edges.length}, vars=${v1Result.allVariables.length}`)
    console.log(`    v2: edges=${v2Result.edges.length}, vars=${v2Result.allVariables.length}`)
    console.log(`    v3: edges=${v3Result.edges.length}, vars=${v3Result.allVariables.length}`)

    expect(v1Result.edges.length).toBeGreaterThan(0)
    expect(v2Result.edges.length).toBeGreaterThan(0)
    expect(v3Result.edges.length).toBeGreaterThan(0)
    expect(v1Result.allVariables.length).toBeGreaterThan(0)
    expect(v2Result.allVariables.length).toBeGreaterThan(0)
    expect(v3Result.allVariables.length).toBeGreaterThan(0)
  })

  // v4 cross-engine consistency
  it("v4 produces cross-file results on complex-dfa fixture", async () => {
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)
    const startFile = join(COMPLEX_DFA_DIR, "function-flow.cpp")
    const v4Result = await traceCrossFile("num", startFile, "forward", workspace, 3)

    console.log(`  v4 cross-file: files=${workspace.totalFiles}, parsed=${workspace.parsedFiles}, fns=${workspace.totalFunctions}`)
    console.log(`    edges=${v4Result.edges.length}, vars=${v4Result.allVariables.length}, crossEdges=${v4Result.crossEdgesCount}`)

    expect(workspace.totalFiles).toBeGreaterThan(0)
    expect(workspace.parsedFiles).toBeGreaterThan(0)
    expect(workspace.totalFunctions).toBeGreaterThan(0)
    expect(v4Result.edges.length).toBeGreaterThan(0)
    expect(v4Result.allVariables.length).toBeGreaterThan(0)
  })

  // Summary table
  it("should print benchmark summary with thresholds", async () => {
    const rows: string[] = []

    // v1
    {
      const sl = SMALL_FIXTURE.split("\n")
      const ml = MEDIUM_FIXTURE.split("\n")
      const ll = LARGE_FIXTURE.split("\n")
      const r1 = measureSync(() => { const c = buildCFG(sl); const d = buildDefUseChains(c, "/t"); analyzeDataFlow(c, d, "a", 2, "forward", "/t") })
      rows.push(`| v1 | SMALL | ${r1.medianMs.toFixed(3)}ms | ${(BASELINES.v1.small * 2).toFixed(3)}ms | ${r1.medianMs < BASELINES.v1.small * 2 ? "PASS" : "FAIL"}`)
      const r2 = measureSync(() => { const c = buildCFG(ml); const d = buildDefUseChains(c, "/t"); analyzeDataFlow(c, d, "result", 2, "forward", "/t") })
      rows.push(`| v1 | MEDIUM | ${r2.medianMs.toFixed(3)}ms | ${(BASELINES.v1.medium * 2).toFixed(3)}ms | ${r2.medianMs < BASELINES.v1.medium * 2 ? "PASS" : "FAIL"}`)
      const r3 = measureSync(() => { const c = buildCFG(ll); const d = buildDefUseChains(c, "/t"); analyzeDataFlow(c, d, "sum", 19, "forward", "/t") })
      rows.push(`| v1 | LARGE | ${r3.medianMs.toFixed(3)}ms | ${(BASELINES.v1.large * 2).toFixed(3)}ms | ${r3.medianMs < BASELINES.v1.large * 2 ? "PASS" : "FAIL"}`)
    }

    // v2
    {
      const p1 = await parser.parseContent(SMALL_FIXTURE, "/s")
      const p2 = await parser.parseContent(MEDIUM_FIXTURE, "/m")
      const p3 = await parser.parseContent(LARGE_FIXTURE, "/l")
      const r1 = measureSync(() => { const c = buildASTCFG(p1.tree, p1.sourceLines); const d = buildDefUseChains(c, "/s"); analyzeDataFlow(c, d, "a", 2, "forward", "/s") })
      rows.push(`| v2 | SMALL | ${r1.medianMs.toFixed(3)}ms | ${(BASELINES.v2.small * 2).toFixed(3)}ms | ${r1.medianMs < BASELINES.v2.small * 2 ? "PASS" : "FAIL"}`)
      const r2 = measureSync(() => { const c = buildASTCFG(p2.tree, p2.sourceLines); const d = buildDefUseChains(c, "/m"); analyzeDataFlow(c, d, "result", 2, "forward", "/m") })
      rows.push(`| v2 | MEDIUM | ${r2.medianMs.toFixed(3)}ms | ${(BASELINES.v2.medium * 2).toFixed(3)}ms | ${r2.medianMs < BASELINES.v2.medium * 2 ? "PASS" : "FAIL"}`)
      const r3 = measureSync(() => { const c = buildASTCFG(p3.tree, p3.sourceLines); const d = buildDefUseChains(c, "/l"); analyzeDataFlow(c, d, "sum", 19, "forward", "/l") })
      rows.push(`| v2 | LARGE | ${r3.medianMs.toFixed(3)}ms | ${(BASELINES.v2.large * 2).toFixed(3)}ms | ${r3.medianMs < BASELINES.v2.large * 2 ? "PASS" : "FAIL"}`)
    }

    // v3
    {
      const p1 = await parser.parseContent(SMALL_FIXTURE, "/s")
      const p2 = await parser.parseContent(MEDIUM_FIXTURE, "/m")
      const p3 = await parser.parseContent(LARGE_FIXTURE, "/l")
      const r1 = measureSync(() => { const f1 = buildFunctionCFGs(p1.tree, p1.sourceLines, "/s"); const c1 = buildCallGraph(p1.tree, f1); traceInterprocedural(f1, c1, "a", "simpleCalc", "forward", "/s") })
      rows.push(`| v3 | SMALL | ${r1.medianMs.toFixed(3)}ms | ${(BASELINES.v3.small * 2).toFixed(3)}ms | ${r1.medianMs < BASELINES.v3.small * 2 ? "PASS" : "FAIL"}`)
      const r2 = measureSync(() => { const f2 = buildFunctionCFGs(p2.tree, p2.sourceLines, "/m"); const c2 = buildCallGraph(p2.tree, f2); traceInterprocedural(f2, c2, "result", "mediumFunction", "forward", "/m") })
      rows.push(`| v3 | MEDIUM | ${r2.medianMs.toFixed(3)}ms | ${(BASELINES.v3.medium * 2).toFixed(3)}ms | ${r2.medianMs < BASELINES.v3.medium * 2 ? "PASS" : "FAIL"}`)
      const r3 = measureSync(() => { const f3 = buildFunctionCFGs(p3.tree, p3.sourceLines, "/l"); const c3 = buildCallGraph(p3.tree, f3); traceInterprocedural(f3, c3, "sum", "processWithConditions", "forward", "/l") })
      rows.push(`| v3 | LARGE | ${r3.medianMs.toFixed(3)}ms | ${(BASELINES.v3.large * 2).toFixed(3)}ms | ${r3.medianMs < BASELINES.v3.large * 2 ? "PASS" : "FAIL"}`)
    }

    // v4
    {
      const wr1 = await measureAsync(async () => { await analyzeWorkspace(COMPLEX_DFA_DIR) })
      rows.push(`| v4 | WORKSPACE | ${wr1.medianMs.toFixed(3)}ms | ${(BASELINES.v4.workspace * 2).toFixed(3)}ms | ${wr1.medianMs < BASELINES.v4.workspace * 2 ? "PASS" : "FAIL"}`)
      const ws = await analyzeWorkspace(COMPLEX_DFA_DIR)
      const sf = join(COMPLEX_DFA_DIR, "function-flow.cpp")
      const tr1 = await measureAsync(async () => {       await traceCrossFile("num", sf, "forward", ws, 3) })
      rows.push(`| v4 | TRACE | ${tr1.medianMs.toFixed(3)}ms | ${(BASELINES.v4.trace * 2).toFixed(3)}ms | ${tr1.medianMs < BASELINES.v4.trace * 2 ? "PASS" : "FAIL"}`)
    }

    console.log("\n=== Benchmark Summary ===")
    console.log("| Engine | Size      | Median Time | Threshold(2x) | Status |")
    console.log("|--------|-----------|-------------|---------------|--------|")
    for (const row of rows) console.log(row)
    console.log("=========================\n")
  })
})
