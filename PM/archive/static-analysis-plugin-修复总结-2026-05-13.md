# C++ 静态分析插件 — 数据流追踪修复总结

**日期**: 2026-05-13  
**项目**: `static-analysis-plugin` in `plugin4opencode`  
**测试状态**: 177 tests pass, 0 fail ✅

---

## 1. 修复: `findVariableLine` 正则错误匹配 (variable-trace.ts)

### 问题
`findVariableLine("value")` 错误返回 line 113 注释行而非 line 167 的变量定义行：
- Line 113 注释 `(target's value)` 被 `refPattern` 误匹配（`=\s*[^;]*\bvalue\b` 匹配到注释中的 `= ... value`）
- Line 152 `container.value = 10;` 被 `assignPattern` 误匹配（`.` 后 `\b` 锚点失效）

### 修复
在 `variable-trace.ts:225-244`：
1. **内联注释剥离**: `code.includes("//")` 时截断 `//` 之前的内容
2. `assignPattern` 添加 `(?<!\.)` 负向后顾: `(?<!\.)\b${varName}\s*[+\-*/]?=`
3. `refPattern` 添加 `(?<!\.)` 负向后顾: `=\s*[^;]*(?<!\.)\b${varName}\b`

### 影响
✅ SectionG forward test 通过

---

## 2. 修复: 跨文件向后追踪 Caller 搜索 (cross-file-dfa.ts)

### 问题
`traceInFile` 中 param→caller 的向后处理仅搜索当前文件的 `callSites`，跨文件被调用函数找不到其调用者。

### 修复
在 `cross-file-dfa.ts:557-566`：当本地文件无 callers 时，遍历 workspace 所有文件搜索 callSites。

### 影响
✅ 向后追踪能穿越文件边界追踪函数参数

---

## 3. 修复: 向后副作用追踪 — alias 链 final→target (cross-file-dfa.ts)

### 问题
`traceInFile("alias3", "main.cpp", "sectionD", "backward")` 无法从 `alias3` 追踪到 `target`。

**测试代码 (main.cpp sectionD)**：
```cpp
void sectionD() {
    int target = 999;
    int* alias3 = nullptr;
    createAlias(alias3, &target);   // alias3 = &target (引用参数副作用)
    writeViaAlias(alias3, 300);
    int final = readViaAlias(alias3);  // final = target's value
}
```

**`alias_playground.cpp`**：
```cpp
void createAlias(int*& alias, int* target) {
    alias = target;  // 直接赋值给引用参数，修改调用者的变量
}
```

**根因**: `alias3 = nullptr` 没有 def-use 边（右值为字面量）。实际值连接通过 `createAlias` 的引用参数副作用：`alias3` 作为 arg0 传入 → 函数内 `alias = target` → `alias` (int*&) 被直接赋值 → 来源是 arg1 `target` → arg1 值为 `&target` → 变量 `target`。

### 修复方案

**新增 `checkParamDirectlyAssigned()` 辅助函数**：
- 检查函数参数是否在函数体内被**直接赋值**（出现在 defVars 中）
- 区别对待 `alias = target`（直接赋值 → 修改调用者变量）vs `*alias = value`（解引用写 → 不修改指针变量本身）

**在 `traceInFile` 向后分支新增逻辑**：
- 对当前非参数变量，查找当前函数中所有以该变量为实参的跨文件调用
- 若被调用函数对应形参被直接赋值（ref param modification），则从该调用的**其他实参**继续向后追踪
- 自动去除 `&target` 中的前导 `&` 提取真实变量名 `target`

### 影响
✅ **最后一个失败测试通过**：backward final through alias chain to target

---

## 4. 清理

- 删除 `debug-cfg.test.ts`（调试用临时文件）
- 移除 `cross-file-dfa.ts` 中所有 `console.error("[DEBUG traceInFile]")` 调试语句

---

## 变更文件清单

| 文件 | 变更类型 |
|------|----------|
| `src/tools/cpp/variable-trace.ts` | 修复正则匹配 (line 225-244) |
| `src/tools/cpp/cross-file-dfa.ts` | 新增 `checkParamDirectlyAssigned`；新增向后副作用追踪逻辑；修复跨文件 caller 搜索；清理调试日志 |
| `src/__tests__/debug-cfg.test.ts` | **删除** |
| `src/__tests__/complex-flow-dfa.test.ts` | 未修改（测试代码本身无需变更） |

---

## 当前架构

```
用户请求 (trace_variable tool)
  │
  ▼
cross-file-dfa.ts::traceCrossFile()
  │
  ├─ traceInterprocedural()     ← 单文件 DFA (def-use + CFG)
  │
  └─ traceInFile()              ← 跨文件扩展
       ├─ forward: 参数→被调用函数追踪 + returnCapture 返回边 + 引用参数副作用
       └─ backward: 参数→调用者搜索 + returnCapture 反向追踪 + 引用参数副作用追踪 ← 新增
```

## 已知限制

- 向后副作用追踪目前依赖 `defVars` 检测；表达式层级 (`target` vs `&target` 等) 通过简单字符串前缀处理
- 深层嵌套的引用参数链（A→B→C 三层以上）可能受 `maxDepth=3` 限制
