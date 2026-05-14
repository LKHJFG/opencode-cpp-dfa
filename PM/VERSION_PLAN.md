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
| **v0.6.0** | Phase 4 (Polish) | ⬜ **下一个** | 性能优化、多语言、报表生成、CI/CD 集成 |

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

---

## 下个版本规划

### v0.6.0 — 工程化 & 扩展
**Phase 4** | 目标: 200+ tests / 0 fail

| 工作包 | 说明 | 优先级 |
|--------|------|--------|
| **表达式解析遗留** | `&arr[i]`, `*ptr++`, `**ptr` 等残差表达式 | P3 |
| **性能优化** | 大项目（100+ 文件）分析加速 | P2 |
| **增量分析** | 仅重分析变更文件 | P2 |
| **多语言支持** | TypeScript/Go/Rust 的 DFA 管线 | P3 |
| **报表生成** | HTML/JSON/SARIF 格式 | P3 |
| **用户文档** | API 文档 + 使用指南 | P3 |

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
Phase 4: 工程化 & 扩展    → v0.6.0   ⬜
```
