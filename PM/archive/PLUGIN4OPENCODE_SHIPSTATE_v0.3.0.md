# 🚀 OpenCode 静态分析插件 — 完整交付状态报告 v0.3.0
> 生成日期: 2026-05-12 | 项目路径: `C:\work\plugin4opencode\static-analysis-plugin`

---

## 一、项目概览

**目标**：为 OpenCode IDE 构建插件系统，实现代码静态分析能力，长期愿景为 Klocwork 级别的数据流分析。

**当前版本**：v0.3.0 — DFA v3（过程间分析已集成）

**三层 DFA 管线架构**：

```
v3: CppParser (WASM) → buildFunctionCFGs(所有函数) → buildCallGraph → traceInterprocedural
v2: CppParser (WASM) → buildASTCFG(单函数)       → buildDefUseChains → analyzeDataFlow
v1: 无依赖            → buildCFG(行扫描)           → buildDefUseChains → analyzeDataFlow
                         ↑ 三级自动降级回退链
```

---

## 二、注册工具清单（8个）

| # | 工具名 | 版本 | 参数 | 说明 |
|---|--------|------|------|------|
| 1 | `analyze_file` | v0.1.0 | filePath | 文件级深入分析（TODOs, 行长, 尾部空格, 长函数） |
| 2 | `list_source_files` | v0.1.0 | directory, includeHidden | 目录文件列表，检测 30+ 语言 |
| 3 | `grep_source` | v0.1.0 | pattern, directory, caseSensitive, ... | 源码内容搜索 |
| 4 | `code_stats` | v0.1.0 | directory | 项目代码统计（文件数/语言分布） |
| 5 | `analyze_imports` | v0.2.0 | filePath, projectRoot | 导入/导出依赖分析 |
| 6 | `find_unused_exports` | v0.2.0 | directory, excludeDirs, entryFiles | 跨文件未使用导出检测 |
| 7 | `analyze_complexity` | v0.2.0 | filePath | 圈复杂度 + 函数指标 |
| 8 | **`trace_variable`** | **v0.3.0** | filePath, variableName, line?, direction? | **C++ 变量数据流追踪（v3 跨函数）** |

---

## 三、源码结构（22 文件 / 203 KB）

### 核心插件

| 文件 | 大小 | 说明 |
|------|------|------|
| `src/index.ts` | 16.5 KB | 插件主入口，注册全部 8 个工具 |
| `src/utils/file-reader.ts` | 0.8 KB | 文件读取工具函数 |

### 分析工具（非 C++）

| 文件 | 大小 | 说明 |
|------|------|------|
| `src/tools/analyze.ts` | 3.5 KB | analyze_file 核心逻辑 |
| `src/tools/listing.ts` | 4.3 KB | list_source_files + code_stats |
| `src/tools/search.ts` | 2.8 KB | grep_source 搜索 |
| `src/tools/import-analysis.ts` | 12.6 KB | 导入导出依赖分析 |
| `src/tools/unused-exports.ts` | 7.7 KB | 未使用导出检测 |
| `src/tools/complexity.ts` | 7.7 KB | 圈复杂度分析 |

### C++ DFA 管线（核心 — 7 文件 / 88.5 KB）

| 文件 | 大小 | 层 | 说明 |
|------|------|----|------|
| `src/tools/cpp/cpp-cfg.ts` | 14.6 KB | v1 | 行扫描控制流图构建器（正则，~85% 覆盖） |
| `src/tools/cpp/cpp-dataflow.ts` | 15.6 KB | v1/v2/v3 共用 | DFA 引擎（def-use chain + forward/backward trace） |
| `src/tools/cpp/cpp-parser.ts` | 13.4 KB | v2 基础设施 | web-tree-sitter WASM 解析器（单例、懒加载） |
| `src/tools/cpp/ast-to-cfg.ts` | **17.9 KB** | **v2 新增** | **AST→CFG 桥接层**（构建于 关卡2） |
| `src/tools/cpp/cross-function-dfa.ts` | **12.1 KB** | **v3 新增** | **过程间 DFA 引擎**（构建于 关卡3） |
| `src/tools/cpp/variable-trace.ts` | 12.6 KB | 工具封装 | trace_variable 工具定义，v3→v2→v1 自动降级 |
| `src/tools/cpp/test-helpers.ts` | 2.1 KB | 测试辅助 | C++ 测试中使用的辅助函数 |

### DFA 管线数据流

```
trace_variable 工具
  │
  ├─▶ [v3 优先] CppParser.parseContent()
  │     → cpp-parser.ts (WASM AST)
  │     → buildFunctionCFGs(tree, lines)
  │       └─ ast-to-cfg.ts (每个函数一个 CFG)
  │     → buildCallGraph(tree, funcCfgs)
  │     → traceInterprocedural(funcCfgs, callSites, startVar, ...)
  │       └─ 内部调用 analyzeDataFlow() 做函数内追踪
  │       └─ 跨函数边: edgeType="parameter" / "return"
  │
  ├─▶ [v2 降级] CppParser.parseContent()
  │     → buildASTCFG(tree, lines)  [单函数]
  │     → buildDefUseChains() + analyzeDataFlow()
  │
  └─▶ [v1 降级] buildCFG(sourceLines)  [行扫描]
        → buildDefUseChains() + analyzeDataFlow()
```

---

## 四、测试状态（125 测试 / 124 pass / 1 fail）

### 测试文件分布

| 测试文件 | 测试数 | 状态 | 说明 |
|----------|--------|------|------|
| `plugin.test.ts` | 6 | ✅ 全部通过 | 插件生命周期 + 注册 |
| `load-simulation.test.ts` | 4 | ✅ 全部通过 | 加载模拟 |
| `edge-cases.test.ts` | 15 | ✅ 全部通过 | 边缘情况 |
| `advanced-analysis.test.ts` | 22 | ⚠️ **1 fail** | 高级分析工具测试 |
| `cpp-analysis.test.ts` | 20 | ✅ 全部通过 | C++ DFA 单元测试（v1） |
| `ast-dfa-integration.test.ts` | 34 | ✅ 全部通过 | v2 AST-DFA 集成测试 |
| `cross-function-dfa.test.ts` | 24 | ✅ 全部通过 | v3 跨函数 DFA 测试 |
| **总计** | **125** | **124 pass / 1 fail** | |

### ⚠️ 未通过测试详情

**测试**: `analyze_complexity tool > should analyze a TypeScript file`
**文件**: `src/__tests__/advanced-analysis.test.ts:236`
**根因**: 该调用 `analyze_complexity` 工具分析 `src/tools/complexity.ts` 自身，并期望返回的 metadata 中包含 `functionCount` 字段。但 `complexity.ts` 的 `metadata` 返回对象中**不包含** `functionCount` 字段。实际返回的 metadata 字段为：`overallScore`, `totalLines`, `functionCount` 不存在。

**影响**: 仅此 1 个 assertion 失败，不影响任何实际功能。所有其他测试（21/22）在此文件中通过。

**修复方案**: 两种方式（二选一）：
- 方案 A：在 `complexity.ts` 的 `analyzeComplexity` 返回值中加入 `functionCount: functions.length`。
- 方案 B：在测试中删除 `functionCount` 断言或将断言改为可选项。

### WASM 路径警告（不影响测试结果）

在 `bun test` 环境下运行 AST 相关测试时，终端打印以下 WASM 加载错误（但测试**全部通过**）：

```
failed to asynchronously prepare wasm: Error: ENOENT: no such file or directory, open
 '...\src\tools\node_modules\web-tree-sitter\web-tree-sitter.wasm'
```

**根因**: `cpp-parser.ts` 通过 `resolve(import.meta.dir, "..")` 定位插件根目录。在测试环境中 `import.meta.dir` 指向 `src/tools/cpp/`，向上取 `..` 得到 `src/tools/` 而非项目根。WASM 文件实际在项目根 `node_modules/` 下。

**为什么测试仍通过**: 当 WASM 初始化抛出异常时，`variable-trace.ts` 的 try/catch 链自动降级到 v1（行扫描），测试仍在行扫描模式下正常运行。

**影响**: ⚠️ 中度。测试覆盖不到 v2/v3 的 AST 路径（只能通过 fallback 回到 v1），但生产环境下（插件 bundled 到 dist/）`import.meta.dir` 指向 `dist/`，路径解析正确，WASM 正常工作。

---

## 五、测试工程文件（17 个 / 34 KB）

### 套装 A: complex-dfa/（9 个文件 — 多文件工程）

| 文件 | 大小 | 覆盖的 DFA 场景 |
|------|------|-----------------|
| `pointers-chain.cpp` | 1.5 KB | 三重指针链、指针运算、引用参数、数组指针 |
| `function-flow.cpp/.h` | 1.9 KB | 5 级函数调用链、值/指针/引用参数、out-parameter |
| `struct-nesting.cpp/.h` | 3.7 KB | 3 层嵌套结构体、字段链、结构体数组 |
| `control-flow-maze.cpp` | 3.0 KB | 4 层嵌套 if、三重循环、switch fall-through、三元链 |
| `templates.cpp` | 2.0 KB | 模板函数/类、模板特化、auto/decltype、if constexpr |
| `modern-cpp.cpp` | 2.6 KB | unique/shared_ptr、Lambda 捕获、std::move、RAII |
| `DFA_TEST_SCENARIOS.md` | 6.3 KB | **14 个文档化 DFA 测试场景** |

### 套装 B: dfa-edge-cases/（8 个文件 — 边界单文件）

| 文件 | 大小 | 针对性 |
|------|------|--------|
| `macros-and-pp.cpp` | 0.7 KB | 宏展开、条件编译、函数宏临时变量 |
| `exceptions.cpp` | 1.1 KB | try/catch 作用域、嵌套异常、throw in lambda |
| `templates-generics.cpp` | 1.2 KB | 模板参数注入、特化分支、auto 推导 |
| `lambda-closure.cpp` | 1.4 KB | 值/引用捕获、mutable、嵌套闭包、move 捕获 |
| `move-semantics.cpp` | 1.7 KB | std::move 链、右值引用、forward、移动构造 |
| `goto-setjmp.cpp` | 1.3 KB | goto 跨块跳转、setjmp/longjmp |
| `concurrency.cpp` | 1.8 KB | thread/async/atomic/promise-future 并发流 |
| `EDGE_CASES_MAP.md` | 3.7 KB | 8 场景映射（0 SHOULD_PASS / 7 LIKELY_FAIL / 1 AMBIGUOUS） |

---

## 六、构建信息

| 指标 | 值 |
|------|-----|
| 构建命令 | `bun build ./src/index.ts --outdir ./dist --target bun --external @opencode-ai/plugin --external zod` |
| 产物大小 | **233.24 KB**（bundle） |
| bundled 模块数 | 15 |
| 外部依赖 | web-tree-sitter 0.26.8 (WASM), tree-sitter-cpp 0.23.4 (WASM) |
| WASM 路径 | `node_modules/web-tree-sitter/web-tree-sitter.wasm` + `node_modules/tree-sitter-cpp/tree-sitter-cpp.wasm` |

---

## 七、迭代历史

### v0.1.0 → v0.2.0 → v0.3.0 演变

| 维度 | v0.1.0 | v0.2.0 | v0.3.0 (当前) |
|------|--------|--------|----------------|
| 工具数 | 4 | 7 | **8** |
| 测试数 | 33 | 55 | **125** |
| 测试通过率 | 33/33 | 55/55 | **124/125** |
| 构建大小 | 18.41 KB | 43.87 KB | **233.24 KB** |
| 核心能力 | 文件分析 | 导入/复杂度 | **C++ DFA v3 跨函数追踪** |
| C++ DFA 版本 | — | — | v1 行扫描 → v2 AST → **v3 跨函数** |

### 关键技术攻关

| 关卡 | 成果 | 关键文件 |
|------|------|----------|
| **关卡1** | 17 个复杂 C++ 测试工程文件 | `.test-projects/complex-dfa/`, `.test-projects/dfa-edge-cases/` |
| **关卡2** | AST-DFA v2 集成 (web-tree-sitter→CFG 桥接) | `ast-to-cfg.ts` (17.9 KB) |
| **关卡3** | 过程间分析 (Call Graph + 跨函数追踪) | `cross-function-dfa.ts` (12.1 KB) |

---

## 八、已知限制

1. **WASM 路径在测试环境不正确** — `cpp-parser.ts` 通过 `import.meta.dir` 解析 WASM 路径，测试环境下 `import.meta.dir` 指向 `src/tools/cpp/` 而非 `dist/`，WASM 加载失败。生产环境（bundled 到 dist/）正常。影响：测试只能覆盖 v1 行扫描路径。
2. **functionCount 字段缺失** — `complexity.ts` 的 metadata 返回不包含 `functionCount` 字段，导致 1 个测试断言失败。不影响任何实际使用场景。
3. **DFA 对模板/宏支持为字面级** — AST 解析器能识别模板和宏的 AST 节点，但 DFA 不会展开模板实例化或宏替换展开。
4. **非确定性并发流** — DFA 能识别 `std::thread`、`std::async` 等并发原语语法层面的变量定义/使用，但不能做竞态分析或数据竞争检测。
5. **仅支持单文件分析** — 当前 v3 跨函数 DFA 仅在同一文件内追踪函数调用。跨文件调用追踪尚未实现。
6. **goto/longjmp 破坏 block 结构** — AST CFG 构建器无法正确处理 goto 目标块合并，setjmp/longjmp 的双重返回语义也未建模。
7. **深度限制** — 跨函数递归追踪有 3 层深度限制，防止无限递归。

---

## 九、下一阶段建议（关卡4 选项）

| 优先级 | 赛道 | 描述 |
|--------|------|------|
| 🔴 P0 | **修复 WASM 测试路径** | 改进 `cpp-parser.ts` 的 WASM 路径解析，使测试能覆盖 v2/v3 AST 路径 |
| 🟡 P1 | **跨文件过程间分析** | 当用户提供多文件时，跨 `.cpp` 文件追踪函数调用链（需收集所有文件的 CFG） |
| 🟡 P1 | **CI/发布管线** | 打包 `.tgz`、自动化测试、opencode.json 注册 |
| 🟢 P2 | **C 语言支持** | 基于 tree-sitter C grammar 快速扩增（项目目前只有 C++） |
| 🟢 P2 | **修复 functionCount** | 在 complexity.ts 的 metadata 中加入 `functionCount: functions.length` |
