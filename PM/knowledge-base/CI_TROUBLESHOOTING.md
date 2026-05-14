# CI 排故全记录 — GitHub Actions 持续集成调试实录

> 日期: 2026-05-14 | 涉及: 17 次失败 → 第 18 次 🟢 | 仓库: `LKHJFG/opencode-cpp-dfa`

---

## 1. 事件概述

在 GitHub 仓库初始化并推送 CI/CD 配置后，GitHub Actions 连续 **17 次运行全部失败**。问题跨越 type-check、build 和 test 三个阶段，根因各不相同。最终在第 18 次运行全部通过。

| 运行 | commit | 结果 | 失败步骤 | 根因 |
|------|--------|------|---------|------|
| #1–#8 | `e8cd857` 等 | ❌ | type-check | CI 命令错误 + 日志捕获方式不对 |
| #9–#11 | `a077c52`–`3db7dd9` | ❌ | type-check | `@types/node` 缺失（`Cannot find module 'fs'`） |
| #12–#13 | `8fedb2e`–`88cec0e` | ❌ | type-check | `@types/bun` 缺失（`import.meta.dir` 是 Bun 专有 API） |
| #14 | `3bf489a` | ❌ | test | build 在 test 之后执行，`dist/index.js` 不存在 |
| #15–#16 | `2292dd9`–`c6292ef` | ❌ | test | 平台依赖顺序（仅 Linux 触发） |
| #17 | `c6292ef` | ❌ | test | `cross-file-dfa.test.ts:259` 文件遍历顺序差异 |
| **#18** | **`924dedf`** | **🟢** | **全部通过** | filter 而非取第一个 key |

---

## 2. 根因分析（按发现顺序）

### 2.1 如何获取 CI 日志

GitHub Actions API 对未认证请求返回 403。解决方案：

1. **Artifact 上传**：在 CI 步骤中重定向命令输出到文件，再用 `actions/upload-artifact` 上传
2. **PAT token 下载**：用 Personal Access Token (`gho_...`) 通过 API 下载 artifacts
3. 关键 artifact 配置模式（`ci.yml` 片段）：

   ```yaml
   - name: Run type-check with debug
     run: bun run tsc --noEmit > tsc-all.txt 2>&1 || true

   - name: Upload tsc errors
     uses: actions/upload-artifact@v4
     with:
       name: tsc-all
       path: static-analysis-plugin/tsc-all.txt
   ```

### 2.2 首批错误：`@types/node` 缺失（Runs #9–#11）

**症状**：
```
src/tools/cpp/cpp-parser.ts:139:42 - error TS2584: Cannot find module 'fs'
src/tools/cpp/cpp-parser.ts:140:42 - error TS2584: Cannot find module 'path'
src/tools/cpp/cpp-parser.ts:143:23 - error TS2304: Cannot find name 'process'
src/tools/cpp/cpp-parser.ts:1:1 - error TS1479: Property 'dir' does not exist on type 'ImportMeta'
```

**根因**：Bun 自带 Node.js API 类型声明，但 `tsc --noEmit` 需要显式安装 `@types/node` 才能解析 `fs`、`path`、`process`。

**修复**：`bun add -d @types/node`

**教训**：Bun 运行时自动提供 Node 类型，但 `tsc` CLI 不依赖 Bun runtime——它需要 `@types/node` 包中的类型声明文件（`.d.ts`）。

### 2.3 次批错误：`@types/bun` 缺失（Runs #12–#13）

**症状**（安装 `@types/node` 后仅剩）：
```
src/tools/cpp/cpp-parser.ts:1:1 - error TS1479: Property 'dir' does not exist on type 'ImportMeta'
```

**根因**：`import.meta.dir` 是 **Bun 专有 API**（非 Node.js 标准）。`@types/node` 中的 `ImportMeta` 类型没有 `dir` 属性。需要 `@types/bun` 来扩展 `ImportMeta`。

```
// bun-types 扩展了 ImportMeta：
interface ImportMeta {
  dir: string       // Bun only
  file: string      // Bun only
  path: string      // Bun only
  // ...
}
```

**修复**：`bun add -d @types/bun`（替换掉 `@types/node`，因为 `@types/bun` 已包含 Node 类型）

**教训**：使用 Bun 专有 API 时必须显式安装 `@types/bun`。Bun 的 `tsconfig.json` 中 `types: ["bun-types"]` 在 Bun 运行时自动工作，但 `tsc --noEmit` 独立于 Bun，需要 `@types/bun` 包。

### 2.4 CI 步骤顺序错误（Runs #14–#15）

**症状**：
```
error: Could not resolve: dist/index.js
```

**根因**：`bun test` 中某些测试 import `dist/index.js`（构建产物），但 CI 中 `bun build` 在 `bun test` **之后**执行，导致 `dist/` 目录不存在。

**修复**：调换 CI 步骤顺序：
```yaml
# 错误
- run: bun test          # 先测试 → dist/ 不存在
- run: bun run build     # 后构建

# 正确
- run: bun run build     # 先构建 → dist/ 生成
- run: bun test          # 后测试 → dist/ 可用
```

**教训**：测试依赖构建产物的项目，必须在测试前确保构建完成。

### 2.5 平台依赖顺序 Bug（Runs #15–#17）

**症状**（仅 Linux 上触发）：
```typescript
// cross-file-dfa.test.ts:256-259
const firstFunc = Array.from(workspace.globalFunctionRegistry.keys())[0]
const entry = callGraph.get(firstFunc)
expect(entry).toBeDefined()    // ❌ Linux 上 entry 为 undefined
```

**根因**：`globalFunctionRegistry` 是一个 `Map`，其 key 来自文件遍历的结果。**Windows (NTFS) 和 Linux (ext4) 的目录遍历顺序不同**，导致 `Array.from(map.keys())[0]` 取到不同的 key。Windows 上碰巧取到的 key 在 `callGraph` 中，Linux 上则不是。

**修复**：不假设 Map 遍历顺序，而是先过滤出确定在 `callGraph` 中的 key：
```typescript
const functionsInGraph = Array.from(workspace.globalFunctionRegistry.keys())
  .filter(f => callGraph.has(f))
expect(functionsInGraph.length).toBeGreaterThan(0)
const entry = callGraph.get(functionsInGraph[0])
expect(entry).toBeDefined()
```

**教训**：`Map.keys()` 的迭代顺序在 JavaScript 规范中是**插入顺序**。当 Map 来自外部数据源（如文件遍历结果），其顺序在不同平台、不同文件系统下不一致。**永远不要依赖 Map key 的遍历顺序做断言**。

---

## 3. 工具链与技巧

### 3.1 GitHub Actions API

```bash
# 获取 runs
curl -H "Authorization: token $GH_TOKEN" \
  https://api.github.com/repos/LKHJFG/opencode-cpp-dfa/actions/runs

# 下载 artifact
curl -H "Authorization: token $GH_TOKEN" \
  https://api.github.com/repos/LKHJFG/opencode-cpp-dfa/actions/artifacts/{id}/zip \
  -o artifact.zip
```

### 3.2 Artifact 模式（捕获 CI 输出）

CI 运行在远程，看不到终端。需要用 artifact 将军队拉到本地：

```yaml
- run: some-command > output.txt 2>&1 || true   # || true 防止 step 失败中断后续
- uses: actions/upload-artifact@v4
  with:
    name: debug-output
    path: output.txt
```

### 3.3 本地复现 Linux 环境

Windows 开发机上无法直接复现。替代方案：
- **WSL**：安装 Ubuntu WSL 环境
- **Docker**：`docker run --rm -v .:/app -w /app node:20 bash -c "..."`

---

## 4. 预防措施

| 问题类型 | 预防方法 |
|---------|---------|
| 缺少类型包 | 初始化项目后立即在 CI 上跑一次 `tsc --noEmit` |
| CI 步骤顺序 | 声明依赖关系：`build → test`；用 `needs` 显式声明 |
| 平台依赖 | CI 和开发环境尽量一致；Map 遍历操作加注释警告；测试不假设顺序 |

---

## 5. 时间线

| 时间 | 事件 |
|------|------|
| 2026-05-14 上午 | CI 配置首次推送 (#1) |
| 2026-05-14 下午 | 连续 17 次修复-推送循环 |
| 2026-05-14 14:44 | Run #18 (`924dedf`) — **全部通过 🟢** |
| 共历约 2 小时 | 17 次失败 → 1 次成功 |

---

## 6. 经验总结

1. **CI 调试的本质是"把远程变成本地"** — artifact 是最可靠的日志通道
2. **一个错误掩盖另一个** — `@types/node` 的 4 个错误中包含 `import.meta.dir`（属于 `@types/bun`），修复前者才暴露后者
3. **Windows ≠ Linux** — 文件系统、环境变量、shell 语法、路径分隔符全部不同。从来不要在 Windows 上假设 Linux 行为
4. **Map 顺序是插入顺序** — 当插入来自不可控源（文件遍历），顺序不可靠
5. **最小的改动，最大的验证** — 每次只动一处，确认效果后再动下一处
