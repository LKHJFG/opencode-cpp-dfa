# 开发工作日志

> 记录开发过程的关键事件、决策、问题和进展。按日期倒序。

---

## 2026-05-13

### v0.5.0 发布 — Phase 3 收官 ✅

**核心变更（P9 团队 3×P8 并行执行）**:

| 成员 | 工作包 | 文件 | 交付 |
|------|--------|------|------|
| **P8-A** | 跨文件前向链去重 (R8) + 循环保护 | `cross-file-dfa.ts` | 移除递归 re-entry + `enteredFuncs` Set |
| **P8-B** | 指针链 value→ptr→pptr | `cross-function-dfa.ts`, `cpp-dataflow.ts` | 新增 `pointer_assign` 边类型 + 检测 |
| **P8-C** | 强化测试断言 | `complex-flow-dfa.test.ts` | SectionB/G/H 具体变量/边类型断言 |

**验证**：
- 177 tests / 0 fail / 588 expect ✅
- TypeScript `--noEmit` 编译通过 ✅
- 基础设施修复: `deep` 类别 missing model prefix → 修复 `oh-my-openagent.json`

**文档更新**：
- `package.json` → v0.5.0
- `HANDFOFF.md` → v0.5.0（含 Fix #8, #9）
- `PM/` 全部 5 文件同步更新
- R8 关闭、T4 关闭

**剩余工作**：
- v0.6.0: 表达式解析增强、性能优化、增量分析、多语言、CI/CD

---

**核心变更**：
- `traceInterprocedural`（v3）新增 `ref_param_out` 边：void 函数引用参数修改后前向回传调用者
- `traceInFile`（v4）同文件分支新增同名检测（对齐跨文件分支行为）
- `maxDepth` 工具参数贯通到 v3 路径
- `FlowEdgeType` 补全缺失的 `cross_file_ref_modify`、`cross_file_side_effect`、`ref_param_out` 类型

**验证**：
- 177 tests / 0 fail / 562 expect ✅
- SectionB v4 前向追踪：`val→r→val→r→...→p→val` 全部产生真实边
- TypeScript 严格模式编译通过

**文档更新**：
- `package.json` → v0.4.5
- `HANDFOFF.md` → v0.4.5
- `PM/` 全部 5 文件同步更新
- 废弃 `handoff` 文件保留（可安全删除）

**剩余工作**：
- `traceInFile` 跨文件分支（`cross_file_ref_modify`）递归链产生重复边，需 v0.5.0 重构

---

### Sprint: DFA P2 冲刺

**目标** 增强 DFA 引擎追踪能力，向 v0.5.0 推进。

**启动**：
- 采用 P9 tech-lead 模式分解任务
- Team mode 因 EPERM (Windows) 不可用 → 改用 `subagent_type=general` 平行派发
- 两个 background agent 并行工作：
  - **WP1**: void 函数引用参数前向链式追踪 ✅ 已完成（agent 返回，待验收）
  - **WP2**: maxDepth 可配 + 循环保护 + 清理 🏃 执行中

**修复记录**：
- 后向别名链 `final→createAlias(alias3, &target)→target` 全部通过 ✅
- 新增 `checkParamDirectlyAssigned()` 区分直接赋值 vs 解引用写
- 跨文件后向 caller 搜索修复（遍历 workspace）
- `findVariableLine` 正则误匹配修复

**文档维护**：
- `static-analysis-plugin-architecutre.md` — 新增架构设计迭代史文档
- `HANDFOFF.md` 更新到 v0.4.4
- `handoff` 标记为弃用
- `PM/` 管理文件夹初建（VERSION_PLAN, CHANGELOG, STATUS_DASHBOARD, RISK_LOG, TEAM_WORKLOG）

### 关键决策

| 决策 | 结论 |
|------|------|
| handoff vs HANDFOFF.md | 主文档更新 HANDFOFF.md，handoff 弃用 |
| Team mode vs Parallel task | Team mode EPERM → background `general` agent |
| `deep` 类别不可用 | 模型名缺 `vllm/` 前缀 → 用 `general` subagent_type |

---

## 2026-05-12

### v0.4.3 发布 — 跨文件引擎修复

**核心修复**：
- `buildCallGraph(filterExternal=false)` 使跨文件调用可见
- `findAssignmentTarget` 支持 `init_declarator`
- return capture 回溯追踪

**验证**：
- input forward → 27 edges 含 19 跨文件边 ✅
- 177 tests / 0 fail / 550 expect ✅

**文档齐备**：
- `HANDFOFF.md`、`DELIVERY_SUMMARY.md`、`PLUGIN4OPENCODE_SHIPSTATE_v0.3.0.md`
- `backlog.md`、`roadmap.md`、`requirements.md`、`tasks.md`

**已知仍存在**：
- 别名链 `alias3→createAlias()` 仍断裂（v0.4.4 修复）
- void 函数 sectionB 无真实边

---

## 2026-05-11

### v0.3.0 发布 — C++ DFA 三层管线

**架构里程碑**：
- WASM tree-sitter 解析成功集成
- 三层 DFA 管线搭建：v3(跨函数) → v2(AST单函数) → v1(行扫描)
- `trace_variable` 工具 + 三级自动降级

**测试**：125 tests，124 pass / 1 fail

**未解决问题**：
- 1 个 failing test (`functionCount` 字段缺失，不影响功能)
- WASM 测试环境路径问题（生产环境正常）
- `complex-flow-dfa.test.ts` 导入路径错误（v0.4.2 修复）

---

## 2026-05-10

### v0.2.0 发布 — 高级分析工具

- `analyze_imports`、`find_unused_exports`、`analyze_complexity` 三个新工具
- 55 tests / 0 fail ✅

---

## 2026-05-09

### v0.1.0 发布 — 插件骨架

- 插件框架搭建完成
- 4 基础工具：analyze_file, list_source_files, grep_source, code_stats
- 33 tests / 0 fail ✅
- `.tgz` 可分发包构建成功
