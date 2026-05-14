# DFA Edge Cases Map

## Purpose
This document catalogs 8 C++ edge case files designed to test boundaries of the current line-scan DFA engine (`cpp-cfg.ts` + `cpp-dataflow.ts`). Each file targets a specific known limitation or challenging pattern.

## Classification Tags
| Tag | Meaning |
|-----|---------|
| ✅ SHOULD_PASS | Current line-scan DFA should handle this pattern |
| ⚠️ LIKELY_FAIL | Known line-scan limitation — regex cannot parse this structure |
| 🔶 AMBIGUOUS | Behavior depends on specific syntax variation |

---

| # | File | Pattern | Lines | DFA Expected Behavior | Current Limitation | Tag |
|---|------|---------|-------|----------------------|---------------------|-----|
| 1 | `macros-and-pp.cpp` | Preprocessor macros (#define function-like, #ifdef branches, #undef) | 37 | Trace variable through macro expansion: `x → r = MULTIPLIER * x`, detect hidden temp var in SWAP macro | Line-scan regex cannot expand macros; sees literal `FACTOR` as unknown token. `SWAP` macro's internal `_tmp` invisible to scanner | ⚠️ LIKELY_FAIL |
| 2 | `exceptions.cpp` | try/catch variable scoping, nested try, throw in lambda, multiple catch | 50 | Identify variable definitions inside try/catch blocks, track through exception flow | Line-scan does not model exception edges in CFG; try/catch/throw unrecognized | ⚠️ LIKELY_FAIL |
| 3 | `templates-generics.cpp` | Template function identity, template class, specialization, auto deduction | 48 | Trace `x → y = passThrough(x)`, `x → holder.get()` through template instantiation | Line-scan sees template syntax but doesn't resolve template parameter substitution | ⚠️ LIKELY_FAIL |
| 4 | `lambda-closure.cpp` | Lambda capture by value/by reference, mutable, nested lambda, move capture | 62 | Detect capture-list variables as uses of outer scope variables; trace through nested closures | Line-scan doesn't parse `[=]` capture syntax; sees `=` as assignment | ⚠️ LIKELY_FAIL |
| 5 | `move-semantics.cpp` | std::move chain, rvalue reference &&, std::forward, move constructor | 63 | Trace `a → b` through move, trace argument through `sink(std::move(data))` | Line-scan doesn't understand move semantics; std::move seen as function call, && as unknown | ⚠️ LIKELY_FAIL |
| 6 | `goto-setjmp.cpp` | goto across blocks, setjmp/longjmp non-local jump | 54 | Handle goto skip — variable declared at target label should be traceable; setjmp returns twice | goto breaks block structure; line-scan's sequential per-block analysis cannot merge control flow across goto | ⚠️ LIKELY_FAIL |
| 7 | `concurrency.cpp` | std::thread lambda, std::async future, atomic, mutex, promise/future | 62 | Detect `shared` definition inside thread lambda, trace through join; atomic load/store as variable use | Thread interleaving non-deterministic; atomic operations not differentiated from regular variables | 🔶 AMBIGUOUS |
| 8 | `move-semantics.cpp` | Additional: forward template, move-assign chain | 63 | `forwarder` should trace `arg → target(arg)`, move-assign should show `a → b` | Rvalue references `&&` not parsed by line-scan; `forward<T>(arg)` instantiation doesn't resolve | ⚠️ LIKELY_FAIL |

## Summary

| Total Files | Lines of Code | SHOULD_PASS | LIKELY_FAIL | AMBIGUOUS |
|-------------|---------------|-------------|-------------|-----------|
| 7 + 1 doc | ~376 | 0 | 7 | 1 |

## Strategic Note
100% of edge case files target patterns the current line-scan DFA struggles with. This is intentional:
- These files define the **AST-DFA v2 integration test suite** (Round 2 work)
- Once web-tree-sitter AST parser is connected to the DFA engine, all 8 patterns become tracable
- The EDGE_CASES_MAP serves as the **v2 acceptance criteria checklist**
