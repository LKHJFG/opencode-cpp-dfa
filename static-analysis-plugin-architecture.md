# C++ 静态分析插件 — 架构设计迭代史

> 本文件记录 `static-analysis-plugin` 中 C++ DFA 管线的架构演进全过程。
> 从 v0.1.0 基础插件到 v0.4.4 跨文件别名追踪的完整迭代。

---

## 总览：四层 DFA 管线架构

```
v4  跨文件追踪     traceCrossFile()         跨 .cpp/.h 文件
    cross-file-dfa.ts (~676 行)              函数调用链跨边界
                                             引用参数副作用追踪
                                                    ↑
v3  AST 跨函数     traceInterprocedural()    WASM AST → 每函数 CFG → 调用图 → 跨函数
    cross-function-dfa.ts (~320 行)           单文件内跨函数追踪
                                                    ↑
v2  AST 单函数     buildASTCFG()             tree-sitter WASM → 单函数 CFG
    ast-to-cfg.ts (~17,952 行)               v3 失败后的回退
                                                    ↑
v1  行扫描兜底     buildCFG()                零外部依赖，正则匹配
    cpp-cfg.ts (~14,620 行)                  85% 语法覆盖，始终可用
    cpp-dataflow.ts (~527 行)                def-use chain + forward/backward trace
```

---

## 三级自动降级回退机制

```
trace_variable(filePath, variableName, direction)
  │
  ├─▶ [v3 优先] CppParser.parseContent()  → WASM AST
  │     → buildFunctionCFGs(tree, lines)   → 构建所有函数 CFG
  │     → buildCallGraph(tree, funcCfgs)   → 构建调用图
  │     → traceInterprocedural(...)        → 跨函数 DFA
  │       └─ 内部调用 analyzeDataFlow()    → 函数内追踪
  │       └─ 跨函数边: edgeType="parameter" / "return"
  │
  ├─▶ [v2 降级] CppParser.parseContent()  → WASM AST
  │     → buildASTCFG(tree, lines)         → 单函数 CFG
  │     → buildDefUseChains() + analyzeDataFlow()
  │
  └─▶ [v1 降级] buildCFG(sourceLines)     → 行扫描 CFG
        → buildDefUseChains() + analyzeDataFlow()
        ↓ 全部失败
      "No data flow detected"
```

**设计原则**: 上层失败自动降级下层，不会静默失败。v1 是永远可用的保险层。

---

## 版本迭代时间线

### v0.1.0 — 插件骨架 + 基础工具
- 插件框架（plugin.json + hooks）
- 4 个基础工具：analyze_file, list_source_files, grep_source, code_stats
- **33 tests, 0 fail**

### v0.2.0 — 高级分析工具
- 新增 3 工具：analyze_imports, find_unused_exports, analyze_complexity
- 全 TypeScript/JavaScript 分析（正则引擎）
- 引入源码结构分析与圈复杂度
- **55 tests, 0 fail**

### v0.3.0 — C++ DFA v3（跨函数）
- 引入三层 DFA 管线 v3→v2→v1（WASM tree-sitter AST）
- v1 行扫描 CFG（cpp-cfg.ts + cpp-dataflow.ts）
- v2 AST→CFG 桥接（ast-to-cfg.ts）
- v3 跨函数 DFA（cross-function-dfa.ts + traceInterprocedural）
- trace_variable 工具（含三级自动降级）
- WASM 异步加载 + 懒加载单例
- **124 pass / 1 fail**（125 tests）

### v0.4.0 — 测试套件 + 复杂流项目
- complex-dfa 测试工程（7 文件）
- complex-flow 测试工程（10 文件）
- dfa-edge-cases 测试工程（6 文件）
- 修复多处 AST→CFG bug

### v0.4.1 — 跨文件引擎（v4）
- 新增 v4 跨文件 DFA 层：cross-file-dfa.ts
- traceCrossFile：文件全局注册表 + 跨文件边界追踪
- buildCallGraph 新增 filterExternal 参数

### v0.4.2 — 跨文件 return capture + AST init_declarator
- findAssignmentTarget 修复 C++ init_declarator 识别
- traceInFile 新增 return capture 回溯

### v0.4.3 — 跨文件引擎修复 + 全部测试通过
- buildCallGraph(filterExternal=false) 使跨文件调用可见
- 跨文件边验证：input forward → 27 edges, 19 cross-file
- **177 pass, 0 fail, 550 expect, 10 files**

### v0.4.4 — 向后副作用追踪修复 ✅（当前版本）
- 根因: alias3 = nullptr, createAlias(&alias3, &target) 引用参数赋值
- 新增 checkParamDirectlyAssigned() 区分直接赋值 vs 解引用写
- traceInFile 向后分支: 引用参数赋值时从其他实参继续追踪
- findVariableLine 正则误匹配修复（注释剥离 + 负向后顾）
- 跨文件向后 caller 搜索修复（遍历 workspace）
- **177 pass, 0 fail, 560 expect, 10 files**

---

## DFA 管线各层详解

### v4 跨文件（2026-05 引入，持续迭代）
```
文件: cross-file-dfa.ts (~676 行)
方法: 扫描工作区目录 → 逐文件 WASM 解析 → 全局函数注册表 → 跨文件追踪
入口: variable-trace.ts 接收 directory 参数时启用

核心函数:
  analyzeWorkspace(dir)      → 递归扫描 .cpp/.h 文件，构建 WorkspaceAnalysis
  traceCrossFile(var, file, dir, workspace)  → 跨文件追踪入口
  traceInFile(var, file, func, dir, depth)   → 递归执行

跨文件边类型:
  cross_file_call     → 实参 → 形参（前向）
  cross_file_return   → return value → 调用者变量（后向）
  cross_file_side_effect  → 引用参数副作用来源 → 被修改变量（后向，v0.4.4 新增）

限制:
  - maxDepth=3 硬编码
  - 对 &var 提取为简单字符串前缀
  - 不处理 &arr[idx]、*ptr++ 等复杂表达式
```

### v3 AST 跨函数（2026-05）
```
文件: cpp-parser.ts + ast-to-cfg.ts + cross-function-dfa.ts (~320 行)
方法: WASM tree-sitter AST → 每函数 CFG → 调用图 → traceInterprocedural

核心流程:
  1. CppParser.parseContent(code) → AST（web-tree-sitter WASM）
  2. buildFunctionCFGs(tree, lines) → Map<FuncName, FunctionCFG>
     - 遍历所有 function_definition 节点
     - 每个函数 ast-to-cfg 生成 ControlFlowGraph
     - 提取参数名、def-use info
  3. buildCallGraph(tree, funcCfgs, filterExternal?) → CallSite[]
     - 遍历所有 call_expression 节点
     - filterExternal=true（默认）: 只保留被调用方在本文件有 CFG 的调用
     - filterExternal=false（v4 模式）: 保留所有调用，用于跨文件
  4. traceInterprocedural(funcCfgs, callSites, startVar, funcName, direction)
     - 函数内: 调用 analyzeDataFlow()
     - 跨函数: 匹配参数 → 递归追踪
     - 边类型: "parameter" / "return"

限制: 只在单文件内工作，不追踪外部函数
```

### v2 AST 单函数（2026-05 引入）
```
文件: ast-to-cfg.ts (~17,952 行)
方法: tree-sitter AST → 单函数 CFG

触发条件: v3 在目标文件解析失败或函数不在 CFG 中时降级至此层

核心流程:
  1. CppParser.parseContent(code) → AST
  2. buildASTCFG(tree, lines) → ControlFlowGraph
  3. buildDefUseChains(cfg) → 每个节点 defVars/useVars
  4. analyzeDataFlow(cfg, duInfo, startVar, direction) → edges

限制: 
  - 只分析单函数（不跨函数边界）
  - 文件极大（~18K 行），是 v3 的回退层，实际很少被触发
```

### v1 行扫描兜底（2026-05 引入，最稳定）
```
文件: cpp-cfg.ts (~14,620 行) + cpp-dataflow.ts (~527 行)
方法: 逐行正则匹配 → 控制流图 → def-use chain → 数据流分析

特点:
  - 零外部依赖（不需要 WASM）
  - 85% C++ 语法覆盖（正则引擎，已知限制）
  - 生产级稳定性：所有上层引擎最终都调用 analyzeDataFlow()

核心流程:
  1. buildCFG(sourceLines) → ControlFlowGraph（cpp-cfg.ts）
     - 正则识别: if/else/for/while/do-while/switch/break/continue/return
     - 结构化: 基本块划分 + 控制流边
  2. buildDefUseChains(cfg) → DefUseInfo（cpp-dataflow.ts）
  3. analyzeDataFlow(cfg, duInfo, varName, direction) → edges（cpp-dataflow.ts）
     前向: 从 def 到 use
     后向: 从 use 到 def
  4. 边类型: "def_use" / "control_flow"

限制:
  - 不追踪引用/指针副作用
  - 不理解 int* ptr = &value 模式
  - 不理解 struct.field 的字段级追踪
```

---

## 架构设计决策记录

### ADR-1: 三层降级 vs 单引擎
**决策**: 采用 v3→v2→v1 三级降级，而非单一引擎。
**理由**:
  - WASM 加载可能失败（测试环境 ENOENT），必须有兜底
  - AST 解析对复杂模板/宏展开可能失败，行扫描可处理
  - 每一层独立测试，互不影响

### ADR-2: v4 独立于 v3 降级链
**决策**: v4（跨文件）不作为 v3 的降级层，而是独立分支。
**理由**:
  - 跨文件需要工作区扫描（多文件），与 v3 的单文件模式本质不同
  - v4 内部仍然调用 v3/v1 做单文件分析
  - 避免单文件失败时错误地降级到行扫描做跨文件

### ADR-3: buildCallGraph filterExternal 参数
**决策**: filterExternal 默认为 true（v3 模式），v4 调用时传 false。
**理由**:
  - v3（单文件跨函数）过滤外部调用是正确的——外部函数没有 CFG
  - v4（跨文件）需要这些外部调用来决定何时跳到另一文件
  - 一个函数两种行为，用参数区分而不是复制代码

### ADR-4: 引用参数副作用用 defVars 检测
**决策**: 通过检查函数参数是否出现在 defVars 中判断是否被直接赋值。
**理由**:
  - `alias = target` → defVars 包含 `alias` → 直接赋值
  - `*alias = value` → defVars 不包含 `alias`（只包含 `*alias`）→ 仅解引用
  - 无需类型系统（C++ 的 int*& vs int* 区分可通过 AST 节点类型推断，但当前不实现）

---

## 跨文件数据流追踪完整链路示例

### 前向: input→...→clamped（sectionA, 3 层跨文件）
```
main.cpp:input
  → (cross_file_call) math_utils.cpp:a (add/add)
  → (return) main.cpp:step1
  → (cross_file_call) math_utils.cpp:a (multiply/multiply)  
  → (return) main.cpp:step2
  → (cross_file_call) math_utils.cpp:x (computeValue/computeValue)
  → ...(递归追踪 computeValue 内部多元运算)...
  → (return) main.cpp:step3
  → (cross_file_call) math_utils.cpp:value (clamp/clamp)
  → (return) main.cpp:clamped
```
**结果**: 27 条边，19 条跨文件边 ✅

### 后向: final→...→target（sectionD, 跨文件别名链）
```
main.cpp:final
  → (return capture) readViaAlias(alias3) 的返回值
  → alias_playground.cpp:alias 参数 (readViaAlias)
  → (cross_file_call) main.cpp:alias3 (readViaAlias 的调用者实参)
  → (cross_file_side_effect) main.cpp:target 
    (createAlias(&alias3, &target) 中 alias 被直接赋值 alias = target)
```
**结果**: 别名链穿越跨文件边界追踪到源头 ✅

---

## 测试资产索引

### 测试文件（10 files, 177 tests, 560 expect）

| 文件 | 数量 | 覆盖层级 |
|------|------|---------|
| `cross-file-dfa.test.ts` | 27 | v4 跨文件 |
| `complex-flow-dfa.test.ts` | 28 | v3+v4 复杂流（18+10） |
| `cross-function-dfa.test.ts` | 27 | v3 跨函数 |
| `ast-dfa-integration.test.ts` | 34 | v2 AST DFA |
| `cpp-analysis.test.ts` | 30 | v1 行扫描 |
| `plugin.test.ts` | 8 | 插件注册 |
| 其他 4 文件 | 23 | 边缘案例等 |

### 测试工程（3 套）

| 工程 | 文件数 | 场景 |
|------|--------|------|
| `.test-projects/complex-flow/` | 10 | 8 种模式，跨文件别名链 |
| `.test-projects/complex-dfa/` | 7 | v3 跨函数测试 |
| `.test-projects/dfa-edge-cases/` | 6 | 边缘用例 |

---
*最新更新: 2026-05-13 | v0.4.4 | 177 tests / 0 fail / 560 expect*
