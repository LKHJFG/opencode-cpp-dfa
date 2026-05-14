# HANDOFF CONTEXT — v0.5.0 (跨文件去重 + 指针链增强)
> 生成日期: 2026-05-13 | 最后操作: v0.5.0 跨文件去重 + 循环保护 + pointer_assign 边

---

## GOAL

在 OpenCode 的 static-analysis-plugin 中实现 C++ 数据流分析（DFA）能力：
给定 C++ 代码的变量及位置，能够基于数据流分析实现语义级变量追踪
（前向追踪变量的流向、后向追踪变量的来源）。

长期目标：Klocwork 级别的数据流分析，包括跨文件过程间分析、指针分析、别名分析。

---

## ACTUAL STATE（经审计的实际状态）

### 总体指标

| 指标 | 值 |
|------|-----|
| 插件版本 | **v0.5.0** |
| 测试总数 | **177 pass, 0 fail, 588 expect() calls, 10 files** |
| WASM 环境 | wasmAvailable=true，resolveWasmPaths() 正常工作 |
| 构建状态 | bun run tsc --noEmit ✅ / bun build ✅ |
| 注册工具 | 8 个（含 trace_variable） |

### 四层 DFA 管线真实状态

| 层级 | 声称状态 | 实际状态 | 测试覆盖 |
|------|---------|---------|---------|
| **v4 跨文件** | 跨 `.cpp`/`.h` 追踪 | ✅ **工作。** `buildCallGraph` 已修复（新增 `filterExternal` 参数），`traceCrossFile` 可产生跨文件边。新增向后副作用追踪。 | 37 tests（含跨文件边断言 `fromFile !== toFile`） |
| **v3 跨函数** | 跨函数边界追踪 | ✅ **工作。** 通过 WASM AST 解析→CFG→调用图，可在**单文件内**跨函数追踪变量。新增 `ref_param_out` 边类型用于 void 函数引用参数前向链。 | 27 tests + 复杂流 18 tests |
| **v2 AST 单函数** | AST-based CFG | ⚠️ 17,952 行 ast-to-cfg.ts 加载成功但作为 v3 失败后的回退，实际很少被触发 | 通过 v3/v1 间接覆盖 |
| **v1 行扫描兜底** | 生产级兜底 | ✅ **核心稳定。** 零外部依赖，85% 语法覆盖。`analyzeDataFlow` 是所有上层引擎的最终调用者。 | 19 tests |

---

## v0.5.0 改进

### Pointer Assign 边类型

**新增**: `"pointer_assign"` 边类型，用于检测 `int* ptr = &value` 模式。

**实现**:
- `cross-function-dfa.ts`: `traceInterprocedural` 新增指针赋值检测扫描（lines 380-404）——遍历 CFG block 的 statement，检测 `&{tracedVar}` 模式，当 `int* ptr = &value` 或 `ptr = &value` 指令中 RHS 含有地址操作时，生成 `pointer_assign` 边
- `cpp-dataflow.ts`: `FlowEdgeType` 新增 `"pointer_assign"` 类型

**测试**: SectionG 新增 `pointer` 边类型断言验证

---

## v4 跨文件引擎修复记录

### 修复 #1 — buildCallGraph 外部可见性（v0.4.3）

`cross-function-dfa.ts` 中的 `buildCallGraph()` 在第 230 行原为：

```typescript
if (!funcCfgs.has(calleeName)) return  // ← 过滤掉所有外部函数调用
```

此过滤在 v3（单文件跨函数）场景下是正确行为，但 **v4 跨文件引擎依赖 `buildCallGraph` 产生的 `callSites` 来决定何时追踪到另一文件**。

**修复**: `buildCallGraph()` 新增 `filterExternal = true` 参数，v4 调用时传 `false`。

**涉及文件**: `cross-function-dfa.ts:219`, `cross-file-dfa.ts:138`

### 修复 #2 — findAssignmentTarget init_declarator 识别（v0.4.3）

C++ 的 `int x = foo()` 解析为 `declaration → init_declarator → identifier + initializer`，原有逻辑找不到赋值目标。修复: 识别 `init_declarator` 节点并提取 `identifier`。

**涉及文件**: `cross-function-dfa.ts:129-147`

### 修复 #3 — Return capture 回溯（v0.4.3）

`traceInFile` 新增从 return statement 回溯捕获值的能力，允许跨文件层级回溯变量来源。例如 `int step1 = add(input, 10)` → 从 `step1` 回溯到 `add` 函数内的 `return` 值。

**涉及文件**: `cross-file-dfa.ts:448-497`

### 修复 #4 — findVariableLine 正则误匹配（v0.4.4）

`findVariableLine("value")` 错误匹配注释行 `(target's value)` 和结构体字段 `container.value = 10`。

**修复**: 添加 `//` 注释剥离 + `(?<!\.)` 负向后顾防止 `.value` 匹配。

**涉及文件**: `variable-trace.ts:225-244`

### 修复 #5 — 跨文件向后 caller 搜索（v0.4.4）

`traceInFile` param→caller 向后处理仅搜索当前文件的 `callSites`，跨文件被调用函数找不到其调用者。

**修复**: 本地文件无 callers 时搜索 workspace 所有文件。

**涉及文件**: `cross-file-dfa.ts:557-566`

### 修复 #6 — 向后副作用追踪（v0.4.4）⭐ 本次核心修复

**问题**: 向后追踪 `alias3` 时，因 `alias3 = nullptr` 无 def-use 边而断链。实际值通过 `createAlias(alias3, &target)` 引用参数副作用设置，引擎不认识这种模式。

**测试代码 (main.cpp sectionD)**：
```cpp
void sectionD() {
    int target = 999;
    int* alias3 = nullptr;
    createAlias(alias3, &target);   // alias3 = &target（引用参数副作用）
    int final = readViaAlias(alias3);
}
```

**`alias_playground.cpp`**：
```cpp
void createAlias(int*& alias, int* target) {
    alias = target;  // 直接赋值给引用参数 = 修改调用者变量
}
```

**修复方案**:
1. 新增 **`checkParamDirectlyAssigned()`** 函数: 检查函数参数是否在函数体内被直接赋值（出现在 defVars 中），区别对待 `alias = target`（直接赋值）vs `*alias = value`（仅解引用写）
2. 在 `traceInFile` 向后分支中: 当变量作为实参传递给跨文件函数且对应形参被直接赋值时，从该调用的**其他实参**继续向后追踪，自动去除 `&target` 中的前导 `&` 提取变量名

**实现的完整链路**: `final` → `readViaAlias(alias3)` return capture → `alias` 参数 → 调用者 `alias3` → `createAlias(&alias3, &target)` 引用参数副作用 → `target`

**涉及文件**: `cross-file-dfa.ts`（新增 `checkParamDirectlyAssigned` + 向后副作用追踪逻辑）

### 修复 #8 — 跨文件前向链去重 + 循环保护（v0.5.0）

**问题 (R8)**: `traceInFile` 在检测到引用参数修改（line 569）后递归 re-enter `traceInFile(callerArg, ...)` 在同文件同函数中。visited key 包含 depth，相同组合在不同 depth 不 dedup，导致 ~12/27 条边重复。

**修复**:
1. 移除 lines 569-577 / 594-602 的递归 `traceInFile` 调用 — `ref_param_out` 已由 callee 的 `traceInterprocedural` 创建
2. 新增 `enteredFuncs` Set（line 353）, 在进入 callee 前（line 471）检查 `${callee.file}:${callee.func}` 是否已入，防递归

**涉及文件**: `cross-file-dfa.ts`

### 修复 #9 — Pointer Assign 边类型（v0.5.0）

**问题**: `int* ptr = &value` 模式不被引擎理解，指针链仅过函数调用才能产生边。

**修复**: `traceInterprocedural` 新增指针赋值检测：遍历 CFG block statements，检测 `&{tracedVar}` 模式 → 创建 `pointer_assign` 边。

**涉及文件**: `cross-function-dfa.ts`, `cpp-dataflow.ts`

### 修复 #7 — 前向 void 函数引用参数链式追踪（v0.4.5）⭐ 本次核心修复

**问题**: 前向追踪 `val` 经过 `transformRef(val) → incrementRef(val) → doubleRef(val) → modifyViaPointer(&val)` 时，每个 void 函数调用后引擎即停止。因为 void 函数无 `returnCapture`，修改后的引用参数值无法回传调用者，导致链断裂。

**根因**: `traceInterprocedural`（v3）和 `traceInFile` 同文件分支（v4）在 forward 方向只处理 return value capture，没有检测引用参数被修改后的回传。

**修复**:
1. **v3 → `traceInterprocedural`**: `cross-function-dfa.ts:335-355` — 前向追踪 callee 后检测 `cs.returnCapture === null && calleeCfg.duInfo.definitions.has(paramName)`，若真则创建 `ref_param_out` 边从 param 回传 caller 变量。外层循环自动处理后续调用（无需递归）。
2. **v4 → `traceInFile` 同文件分支**: `cross-file-dfa.ts:617-645` — 同上逻辑，对齐跨文件分支的 `cross_file_ref_modify` 行为。

**验证**: v4 路径追踪 `val` forward 产生真实链式边：
```
val → r (cross_file_call, transformRef)
r → val (cross_file_ref_modify)
val → r (cross_file_call, incrementRef)
r → old (assignment)
r → val (cross_file_ref_modify)
val → r (cross_file_call, doubleRef)
r → val (cross_file_ref_modify)
val → p (cross_file_call, modifyViaPointer)
p → val (cross_file_ref_modify)
```

**涉及的边类型**: `cross_file_ref_modify`（已存在）、`ref_param_out`（新增）

**涉及文件**: `cross-function-dfa.ts`, `cross-file-dfa.ts`, `cpp-dataflow.ts`（FlowEdgeType 补全）

---

## 验证结果

| 变量 | 方向 | 边数(v4) | 跨文件边 | 状态 |
|------|------|-----------|---------|------|
| input | forward | 27 | 19 | ✅ v0.4.3 |
| target | forward (alias1→alias2→alias3→...→final) | 跨文件别名链完整 | 含跨文件边 | ✅ **v0.4.4 新增** |
| final | backward (←alias3←target) | 跨文件别名链完整 | 含跨文件边 | ✅ **v0.4.4 新增** |
| val | forward (transformRef→incrementRef→doubleRef→modifyViaPointer) | 27（~12 重复） | 跨文件边含 ref_modify | ✅ **v0.4.5 新增** |
| v4 全套测试 | — | 562 expect() | 177 pass, 0 fail | ✅ |

---

## 复杂流测试项目

`complex-flow` 是 10 文件测试工程，覆盖 8 种数据流模式：

```
.test-projects/complex-flow/
├── types.h              # Data, Result, Node, Container, Config 结构体
├── math_utils.h/.cpp    # 纯函数: add, multiply, computeValue, accumulate, square, cube, clamp
├── io_ops.h/.cpp        # 副作用函数: transformRef, incrementRef, modifyViaPointer, swap, fillBuffer
├── alias_playground.h/.cpp  # 别名: createAlias, writeViaAlias, readViaAlias, aliasChain, doubleDeref
├── pipeline.h/.cpp      # 管线: processData, modifyData, extractValue, createData, computeResult
└── main.cpp             # 8 个 Section (A-H) 覆盖所有模式
```

### 各阶段测试情况

| 测试文件 | tests | 状态 | 说明 |
|---------|-------|------|------|
| cross-file-dfa.test.ts | 27 | ✅ | v4 基础跨文件测试 |
| complex-flow-dfa.test.ts | 28 | ✅ **全通过** | 18 v3 + 10 v4，含链式跨文件别名 + vo_id ref param |
| cross-function-dfa.test.ts | 27 | ✅ | v3 跨函数测试 |
| ast-dfa-integration.test.ts | 34 | ✅ | AST DFA 集成 |
| plugin.test.ts | 8 | ✅ | 工具注册 |
| cpp-analysis.test.ts | 30 | ✅ | v1 行扫描兜底 |
| 其他(3 files) | 23 | ✅ | edge case 等 |
| **合计** | **177** | **0 fail** | **562 expect()** |

---

## CURRENT LIMITATIONS

| 限制 | 根因 | 影响范围 | 优先级 |
|------|------|---------|--------|
| ✅ 跨文件边 — 已修复 | `buildCallGraph` 新增 `filterExternal` 参数 | v4 产生 19+ 跨文件边 | P0 ✅ |
| ✅ 别名追踪 — **已修复** | 向后副作用追踪识别引用参数直接赋值 | main.cpp sectionD alias3→target | P1 ✅ |
| ❌ 跨文件前向链重复边 | `traceInFile` 跨文件递归链：`cross_file_ref_modify` 后重新进入 caller，每轮递归翻倍边数 | 27 条 val 追踪边中 ~12 条重复 | P1 |
| ❌ 指针链 `value→ptr→pptr` | v1 line-scan 不理解 `int* ptr = &value` | sectionG 多层间接引用 | P2 |
| ⚠️ `&var` 提取为字符串前缀 | 向后副作用追踪通过 `startsWith("&")` 剥离地址符 | 复杂表达式 `&arr[idx]` 等 | P3 |
| ✅ void 函数引用参数链 — **v0.4.5 已修复** | `traceInterprocedural` + `traceInFile` 新增 ref_param_out 边 | val → transformRef → ... → modifyViaPointer | P2 ✅ |
| ✅ maxDepth 可配置 — **v0.4.5 已修复** | `trace_variable` 工具参数贯通到 v3 `traceInterprocedural` | 跨文件深度可配置 | P3 ✅ |

---

## REQUIRED NEXT STEPS

### ✅ P0 — 跨文件引擎 — 已完成
- `buildCallGraph` 新增 `filterExternal` 参数，v4 传 `false`
- `findAssignmentTarget` 修复 C++ `init_declarator` 节点
- Return capture 回溯追踪
- 验证通过：177 tests, 0 fail, 560 expect()

### ✅ P1 — 别名追踪 — 已完成
- ✅ 后向追踪: `final→createAlias(alias3, &target)` 引用参数副作用 → `target`
- ✅ 前向追踪: `target→createAlias→alias3` 别名链经过跨文件边界
- ✅ `checkParamDirectlyAssigned()` 区分直接赋值和解引用写
- ⚠️ 仅覆盖 `int*&` 引用参数模式，不覆盖更深层别名

### ✅ P2 — void 函数链 — 已完成 (v0.4.5)
- ✅ `traceInterprocedural` 新增 `ref_param_out` 边
- ✅ `traceInFile` 同文件分支新增引用参数副作用检测
- ✅ v4 路径验证通过: `val→transformRef→incrementRef→doubleRef→modifyViaPointer`
- ⚠️ v3 路径仅同文件有效（跨文件 callee 被 buildCallGraph 过滤）
- ⚠️ 跨文件递归链产生重复边（预知问题，v0.5.0 修复）

### ✅ P3 — maxDepth 可配置 — 已完成 (v0.4.5)
- ✅ `trace_variable` 工具 `maxDepth` 参数贯通到 v3 `traceInterprocedural`
- ✅ v4 路径已支持（`traceCrossFile` 已有 maxDepth 参数）

### ✅ 已修复 — 跨文件前向链去重 + 循环保护 (v0.5.0)
- R8 关闭：`traceInFile` 递归 re-entry 改为非递归（仅创建边，不重新 trace）
- 新增 `enteredFuncs` Set：同一 (file, func) 只进入一次，防止递归/互递归
- 详见 Fix #8 和 Fix #9

### ⬜ P1 — 更精确的表达式解析 (v0.6.0)
- `&arr[i]`, `*ptr++` 等复杂表达式解析增强

### ⬜ P2 — 工程化 (v0.6.0)
- 性能优化（大项目 100+ 文件）
- 增量分析
- 多语言支持（TypeScript/Go/Rust）
- CI/CD 集成
- 用户文档（API 文档 + 使用指南）

---

## KEY FILES

### 核心管线
| 文件 | 行数 | 作用 |
|------|------|------|
| `src/tools/cpp/variable-trace.ts` | ~401 | 主入口，三级 fallback |
| `src/tools/cpp/cross-file-dfa.ts` | ~844 | v4 跨文件引擎（含 return capture + 前/后向副作用追踪） |
| `src/tools/cpp/cross-function-dfa.ts` | ~435 | v3 跨函数引擎 + `ref_param_out` 前向链 + `buildCallGraph` |
| `src/tools/cpp/ast-to-cfg.ts` | ~17,952 | AST→CFG 转换（v2） |
| `src/tools/cpp/cpp-cfg.ts` | ~14,620 | line-scan CFG（v1） |
| `src/tools/cpp/cpp-dataflow.ts` | ~527 | 数据流分析（v1，被所有层级调用） |
| `src/tools/cpp/cpp-parser.ts` | ~150 | WASM tree-sitter 包装器 |

### 测试
| 文件 | tests | 说明 |
|------|-------|------|
| `cross-file-dfa.test.ts` | 27 | v4 测试（含跨文件边 fromFile!==toFile 断言） |
| `cross-function-dfa.test.ts` | 27 | v3 测试 |
| `complex-flow-dfa.test.ts` | 28 | 复杂流测试（18 v3 + 10 v4，全部通过） |
| `cpp-analysis.test.ts` | 30 | v1 测试 |
| `plugin.test.ts` | 8 | 基础工具注册测试 |
| `ast-dfa-integration.test.ts` | 34 | AST DFA 集成 |

### 测试工程
| 路径 | 文件数 | 用途 |
|------|--------|------|
| `.test-projects/complex-dfa/` | 7 | v3 跨函数测试（function-flow, pointers-chain 等） |
| `.test-projects/complex-flow/` | 10 | 复杂流测试（v4 跨文件验证通过，含别名链） |
| `.test-projects/dfa-edge-cases/` | 6 | 边缘用例（lambda, exceptions, macros 等） |

---

## 附录: handoff 文件说明

- **`HANDFOFF.md`** — 主 handoff 文档（当前文件）。结构化 Markdown，包含完整上下文、修复记录、限制和下一步。**请始终更新此文件。**
- **`handoff`** — 过时的纯文本精简副本（v0.4.3 快照）。不再维护，可安全删除。

