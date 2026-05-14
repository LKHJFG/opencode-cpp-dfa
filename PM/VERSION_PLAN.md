# 版本规划 — OpenCode 静态分析插件

> 结合 `roadmap.md` (Implementation Phases) + `backlog.md` (Product Opportunity Backlog) 整理的完整版本路线图。

---

## 版本总览

| 版本 | 对应 Phase | 状态 | 核心交付 |
|------|-----------|------|---------|
| **v0.1.0** | Phase 0-1 (MVP) | ✅ 完成 | 插件骨架、4 基础工具、55 tests |
| **v0.2.0** | Phase 2 (Basic Analysis) | ✅ 完成 | 导入分析/复杂度/未使用导出、55 tests |
| **v0.3.0** | Phase 3 起点 (DFA) | ✅ 完成 | C++ DFA v3 跨函数、三层管线、125 tests |
| **v0.4.x** | Phase 3 深入 (Cross-File) | ✅ **已完成** | 跨文件引擎、别名链追踪、void 函数参前向追踪、**177 tests / 0 fail** |
| **v0.5.0** | Phase 3 完成 | ✅ **已完成** | 跨文件前向链去重、指针链增强、循环保护 |
| **v0.6.0** | Phase 4 (Polish) | 🔄 **进行中** | 276+ tests, 测试堡垒(边界/变异/性能门禁/降级E2E), CI/CD 🟢, AI协同增强 |

---

## 已完成版本

### v0.1.0 — 插件骨架 + 基础工具
**Phase 0-1** | 里程碑: 33 tests / 0 fail

| 交付 | 说明 |
|------|------|
| 插件框架 | `plugin.json` + `Hooks` 导出 + 生命周期 (`init`/`activate`) |
| `analyze_file` | 文件级分析（TODOs、行长、长函数检测） |
| `list_source_files` | 目录结构浏览器，30+ 语言识别 |
| `grep_source` | 源码内容搜索 |
| `code_stats` | 项目代码统计（语言分布） |
| 构建/分发 | `bun build` → `.tgz` 可分发包 |

**关键技术决策**：
- TypeScript 严格模式
- plugin.json 清单驱动注册
- 工具级错误处理（每个工具独立 try/catch）

---

### v0.2.0 — 高级分析工具
**Phase 2** | 里程碑: 55 tests / 0 fail

| 交付 | 说明 |
|------|------|
| `analyze_imports` | 导入/导出依赖分析、循环检测 |
| `find_unused_exports` | 跨文件未使用导出检测 |
| `analyze_complexity` | 圈复杂度 + 函数指标 + 可维护性评分 |
| 语言覆盖 | TypeScript/JavaScript（正则引擎，~95% 常见模式） |

---

### v0.3.0 — C++ DFA v3（跨函数）
**Phase 3 起点** | 里程碑: 124 pass / 1 fail (125 tests)

| 交付 | 说明 |
|------|------|
| **v1 行扫描兜底** | `cpp-cfg.ts` + `cpp-dataflow.ts`，零外部依赖，85% 语法覆盖 |
| **v2 AST 单函数** | `ast-to-cfg.ts` (~18K 行)，tree-sitter WASM → 单函数 CFG |
| **v3 AST 跨函数** | `cross-function-dfa.ts` + `traceInterprocedural`，每函数 CFG + 调用图 |
| `trace_variable` | 工具入口，v3→v2→v1 三级自动降级 |
| WASM 包装器 | `cpp-parser.ts`，单例懒加载 |

---

### v0.4.x — 跨文件引擎（多轮迭代）
**Phase 3 深入** | 里程碑: 177 tests / 0 fail / 562 expect / 10 files

| 子版本 | 交付 |
|--------|------|
| v0.4.0 | 测试套件：complex-dfa(7 文件)、complex-flow(10 文件)、dfa-edge-cases(6 文件) |
| v0.4.1 | v4 跨文件引擎 `cross-file-dfa.ts`，`buildCallGraph(filterExternal)` |
| v0.4.2 | return capture 回溯 + `findAssignmentTarget` init_declarator 修复 |
| v0.4.3 | 跨文件边打通：input forward → 27 edges 含 19 跨文件边 |
| v0.4.4 | ⭐ 向后别名链 + void 函数链式追踪修复 → 177 all pass |
| **v0.4.5** | **前向 void 函数引用参数链式追踪**: ref_param_out 边、maxDepth 贯通、FlowEdgeType 补全 |

---

### v0.5.0 — 完整追踪能力 (Phase 3 完成)
**里程碑**: 177 tests / 0 fail / 588 expect / 10 files

| 工作包 | 说明 | 优先级 | 状态 |
|--------|------|--------|------|
| 跨文件前向链去重 + 循环保护 | R8 关闭 + `enteredFuncs` Set | P1 | ✅ |
| 指针链 value→ptr→pptr | `pointer_assign` 边 | P2 | ✅ |
| 强化测试断言 | SectionB/G/H +26 expect | P2 | ✅ |
| CFG 类型抽取 + 重构 | `cfg-types.ts` 共享类型，两文件减负 | P2 | ✅ |
| WASM 鲁棒性 + 引擎可观测性 + AST 复用 | fallback 路径 + `engineUsed` + 一次解析三层复用 | P2 | ✅ |
| 复杂表达式解析增强 (R5) | 模板/自定义类型/指针/数组/方法调用 | P2 | ✅ |
| Git 初始化 + CI/CD 文件就绪 | `git init` + `.github/workflows/` + `.gitattributes` | P2 | ✅ |
| **远程推送 + CI/CD 打通** | `git push` → GitHub Actions 自动 CI | P1 | ✅ |

---

## 下个版本规划

### v0.6.0 — 质量堡垒 + AI 协同
**Phase 4** | 里程碑: 276 tests / 0 fail / 867 expect | ✅ CI/CD 🟢

| 工作包 | 优先级 | 状态 |
|--------|--------|------|
| **WP1-4: 测试堡垒** (边界/变异/性能门禁/降级E2E/v2↔v1) | P1 | ✅ |
| **P8-E: Tool Description 优化 — AI 决策智能** | P2 | ⬜ |
| **P8-F: Tool Chaining — 工具组合编排** | P2 | ⬜ |
| **P8-G: OpenCode Hooks 深度集成** | P2 | ⬜ |
| **P8-H: AI 反馈增强 — 置信度 + 建议** | P2 | ⬜ |
| **版本治理 + 发布管线** | P3 | ⬜ |
| **`as any` 收敛 + 类型安全** | P3 | ⬜ |

#### P8-E: Tool Description 优化 — AI 决策智能
**目标**: 让 AI Agent 更聪明地选择调用哪个工具、传什么参数。

| 子任务 | 说明 |
|--------|------|
| E1 | 审计所有 8 个工具的 description 字段，补充调用场景和示例 |
| E2 | 为 `trace_variable` 的 direction/line/maxDepth 参数添加 AI 友好的描述（何时传什么值） |
| E3 | 为 `analyze_file`/`grep_source` 等基础工具补充组合场景描述（"可搭配 trace_variable 做深入分析"） |
| E4 | 添加工具输出的 AI 消费指南 — structured metadata 字段说明 |

#### P8-F: Tool Chaining — 工具组合编排
**目标**: 设计工具输出格式天然可串联，AI 能轻松将多个工具组合成分析管线。

| 子任务 | 说明 |
|--------|------|
| F1 | 定义统一输出接口规范: `{ output, metadata: { suggestions, chainable, confidence, next_steps } }` |
| F2 | `trace_variable` 输出增加 `suggestions` 字段（如检测到跨文件变量→建议用 directory 参数重试） |
| F3 | `analyze_imports` + `find_unused_exports` 输出互引，AI 可串联分析依赖链 |
| F4 | 设计"分析报告"聚合工具：调用多个基础工具 + 整合结果为一篇报告 |

#### P8-G: OpenCode Hooks 深度集成
**目标**: 利用 SDK 中未使用的 10+ hooks，将分析能力嵌入 AI 工作流。

| 子任务 | 说明 |
|--------|------|
| G1 | `tool.execute.after` — 工具执行后自动注入分析建议到结果 |
| G2 | `tool.execute.before` — 根据上下文自动补充工具参数（如自动检测 directory） |
| G3 | `chat.message` — 拦截消息检测"变量追踪"意图，预热 WASM 解析器 |
| G4 | `chat.params` — 分析任务时调高 temperature 鼓励创造性推理 |
| G5 | `permission.ask` — 分析操作自动放行（白名单文件模式） |
| G6 | `command.execute.before` — 编译命令前自动注入环境分析上下文 |

#### P8-H: AI 反馈增强 — 置信度 + 建议下一步
**目标**: 帮助 AI 判断分析结果的可靠性，决定是否信任/降级/重试。

| 子任务 | 说明 |
|--------|------|
| H1 | 所有分析工具返回 `confidence` 字段（0-1）：v4 跨文件 > v3 跨函数 > v2 AST > v1 正则 |
| H2 | 低置信度时自动附加 `suggestion`：如"v1 正则引擎可能遗漏了复杂表达式，建议尝试 WASM 路径" |
| H3 | `tool.execute.after` hook 自动注入"补充建议"到 AI 上下文 |
| H4 | 错误信息结构化：`{ error, type, recoverable, retry_hint }` — AI 可自动决策重试策略 |

---

## 版本映射关系

```
Phase 0: API 探索         (pre-v0.1)  ⬜
Phase 1: MVP 骨架         → v0.1.0   ✅
Phase 2: 基础分析能力      → v0.2.0   ✅
Phase 3: DFA + 过程间     → v0.3-v0.5 ✅✅
  ├─ v3 跨函数            → v0.3.0   ✅
  ├─ v4 跨文件            → v0.4.x   ✅
  └─ 完整别名/指针追踪    → v0.5.0   ✅
Phase 4: 工程化 & 扩展    → v0.6.0   🔄
```
