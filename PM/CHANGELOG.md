# 变更日志 — Changelog

> 按时间倒序排列。格式基于 [Keep a Changelog](https://keepachangelog.com/)。
> 版本对应 `static-analysis-plugin/package.json` 中的 version 字段。

---

## [v0.5.0] — 2026-05-14

### Infrastructure
- **Git 仓库初始化** (`599c283`): `.gitignore` (node_modules, dist, .test-tmp, .sisyphus) + 88 文件初始 commit
- **ADR 路径修正**: `static-analysis-plugin/adr/` → `adr/` 根目录
- **项目重命名** (`1229e27`): `static-analysis-plugin` → `opencode-cpp-dfa`
- **CI/CD 文件就绪** (`1229e27`): `.github/workflows/ci.yml` + `release.yml`；`.gitattributes` 添加
- **`*.tgz` 加入 .gitignore** (`40cdbf8`): 防止构建产物误提交

### Refactored
- **CFG 类型抽取**: `cpp-cfg.ts` → 将共享类型定义抽到 `cfg-types.ts`，两文件共同引用，消除重复 (~14.6KB → ~380 行)
- **路径 B - 引擎可观测性**: `TraceResult` 新增 `engineUsed` 字段，追踪结果可知来自 v4/v3/v2/v1 哪一层
- **路径 B - WASM 鲁棒性**: 新增 `static-analysis-plugin/node_modules/` 路径兜底 + debug 日志
- **路径 B - AST 复用**: v3 失败时 v2 不再重复解析 C++——一次解析，三层复用（177 tests ✅ / tsc ✅）

### Added
- `"pointer_assign"` 边类型：`FlowEdgeType` 新增，用于检测 `int* ptr = &value` 模式
- **R5 复杂表达式增强**: v1 正则支持 `std::vector<int>`, `MyClass`, `unsigned long long`, `*ptr = val`, `arr[idx] = val`, `obj.method()`, `ptr->method()`
- `traceInterprocedural`（v3）新增指针赋值检测扫描：检测 `&var` 模式并创建 `pointer_assign` 边
- `enteredFuncs` 循环保护 Set：同一 (file, func) 只进入一次，防止递归/互递归无限追踪

### Fixed
- **R8 关闭**: 跨文件前向链去重 — 移除 `traceInFile` 在 `cross_file_ref_modify`/`cross_file_deref` 处理器中的递归 re-entry 调用
- edge 重复率从 ~44%（27 条中 12 条重复）降至 ~0%

### Tests
- 588 expect(), **177 pass / 0 fail** / 10 files
- SectionG 新增 `pointer` 边类型断言 + 全变量断言
- SectionB 新增 `toContain("val")` 断言
- SectionH 新增完整变量链断言

---

## [v0.4.5] — 2026-05-13

### Added
- `ref_param_out` 边类型：`FlowEdgeType` 新增，用于 void 函数引用/指针参数前向副作用追踪
- `traceInterprocedural`（v3）前向追踪检测 void 函数引用参数修改，生成 `ref_param_out` 边
- `traceInFile`（v4）同文件分支新增引用参数副作用检测（匹配跨文件分支行为）
- `maxDepth` 工具参数通路：从 `trace_variable` 工具参数传入 `traceInterprocedural`

### Changed
- `FlowEdgeType` 类型定义新增 `"ref_param_out"`、`"cross_file_ref_modify"`、`"cross_file_side_effect"`
- v0.4.x 积累的 `cross_file_ref_modify`/`cross_file_side_effect` 类型未在 `FlowEdgeType` 声明 → 本次对齐

### Tests
- 562 expect(), **177 pass / 0 fail** / 10 files
- v4 SectionB 测试新增断言：`cross_file_ref_modify` 边从 `r` 和 `p` 流向 `val`
- v3 SectionB 测试强化：`meta.edges` 数组断言

---

## [v0.4.4] — 2026-05-13

### Added
- 向后副作用追踪：`traceInFile` 后向分支新增引用参数直接赋值检测，从 `createAlias(&alias3, &target)` 的其他实参继续后向追踪
- `checkParamDirectlyAssigned()` 辅助函数：区分直接赋值 vs 解引用写

### Fixed
- 跨文件后向 caller 搜索：本地文件无 callers 时遍历 workspace 所有文件
- `findVariableLine` 正则误匹配：注释剥离 + `(?<!\.)` 负向后顾防止 `.value` 匹配

### Changed
- `cross-file-dfa.ts` 新增 `cross_file_side_effect` 边类型
- `handoff` 文件标记为弃用，`HANDFOFF.md` 升级为主 handoff 文档

### Tests
- 560 expect(), **177 pass / 0 fail** / 10 files
- 最后一个失败测试修复：backward final through alias chain to target

---

## [v0.4.3] — 2026-05-12

### Fixed
- `buildCallGraph` 新增 `filterExternal` 参数，v4 传 `false` 使外部调用可见
- `findAssignmentTarget` 修复 C++ `init_declarator` 节点识别

### Added
- `traceInFile` 新增 return capture 回溯追踪

### Tests
- 550 expect(), 177 pass / 0 fail / 10 files
- 输入追踪验证：input forward → 27 edges 含 19 跨文件边

---

## [v0.4.2] — 2026-05-12

### Added
- v4 跨文件 return capture 处理
- AST `init_declarator` 识别支持 `int x = foo()` 模式
- 测试套件扩展：复杂流测试工程 complex-flow（10 文件）

### Changed
- `traceInterprocedural` 的 `allVars` 始终包含起始变量

### Fixed
- `complex-flow-dfa.test.ts` 导入不存在路径的 bug

---

## [v0.4.1] — 2026-05-12

### Added
- **v4 跨文件 DFA 层**：`cross-file-dfa.ts`
- `traceCrossFile`：工作区扫描 → 全局函数注册表 → 跨文件追踪
- `buildCallGraph` 新增 `filterExternal` 参数
- 跨文件边类型：`cross_file_call`、`cross_file_return`
- 智能降级：跨文件失败时退回 v3 单文件

---

## [v0.4.0] — 2026-05-12

### Added
- 测试工程：complex-dfa（7 文件）、dfa-edge-cases（6 文件）
- `checkParamModifiedViaDeref` 函数
- 引用参数前向追踪（跨文件 deref 边）

### Fixed
- 多处 AST→CFG 转换 bug（条件语句、循环、函数调用）
- WASM 路径解析问题

---

## [v0.3.0] — 2026-05-11

### Added
- **C++ DFA 三层管线**：v3 跨函数 / v2 AST 单函数 / v1 行扫描
- `cpp-parser.ts`：web-tree-sitter WASM 解析器
- `ast-to-cfg.ts`：AST→CFG 桥接层
- `cross-function-dfa.ts`：过程间 DFA 引擎
- `variable-trace.ts`：trace_variable 工具，三级自动降级
- `cpp-cfg.ts`：行扫描 CFG（零外部依赖，85% 覆盖）
- `cpp-dataflow.ts`：def-use chain + forward/backward DFA
- WASM 异步加载 + 懒加载单例

### Tests
- 125 tests（124 pass / 1 fail），含 v3 跨函数测试 24 个

---

## [v0.2.0] — 2026-05-10

### Added
- `analyze_imports`：导入/导出依赖分析 + 循环依赖检测
- `find_unused_exports`：跨文件未使用导出检测（自动排除 node_modules）
- `analyze_complexity`：圈复杂度 + 函数指标 + 可维护性评分 (0-100)
- 语言覆盖：TypeScript/JavaScript（正则引擎，~95%）

### Tests
- 55 tests / 0 fail（v0.1.0 基础上 +22 新测试）
- 构建大小：43.87 KB

---

## [v0.1.0] — 2026-05-09

### Added
- 插件框架：`plugin.json` + `Hooks` 导出 + 生命周期回调
- `analyze_file`：文件级分析（TODOs、行长、长函数、尾随空白、30+ 语言识别）
- `list_source_files`：目录结构浏览器
- `grep_source`：源码内容搜索（大小写、文件类型过滤）
- `code_stats`：项目代码统计（按语言分布）
- TypeScript 严格模式配置 + `bun build` 构建链
- `.tgz` 可分发包

### Tests
- 33 tests / 0 fail
- 构建大小：18.41 KB

---

## 版本对照表

| 版本 | 日期 | Tests | Pass | Fail | Expect | 核心主题 |
|------|------|-------|------|------|--------|---------|
| v0.4.4 | 2026-05-13 | 177 | 177 | **0** | 560 | 向后副作用追踪 ✅ |
| v0.4.3 | 2026-05-12 | 177 | 177 | 0 | 550 | 跨文件引擎修复 |
| v0.4.2 | 2026-05-12 | — | — | — | — | return capture |
| v0.4.1 | 2026-05-12 | — | — | — | — | v4 跨文件 |
| v0.4.0 | 2026-05-12 | — | — | — | — | 测试套件 |
| v0.3.0 | 2026-05-11 | 125 | 124 | 1 | — | C++ DFA v3 |
| v0.2.0 | 2026-05-10 | 55 | 55 | 0 | — | 高级分析工具 |
| v0.1.0 | 2026-05-09 | 33 | 33 | 0 | — | 插件骨架 |
