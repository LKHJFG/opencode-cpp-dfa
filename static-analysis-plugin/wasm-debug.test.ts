import { describe, it, expect, beforeAll } from "bun:test"

let wasmAvailable = false
let errorMessage = ""

beforeAll(async () => {
  try {
    const { CppParser } = await import("./src/tools/cpp/cpp-parser")
    const parser = CppParser.getInstance()
    await parser.init()
    wasmAvailable = true
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e)
    wasmAvailable = false
  }
})

it("should detect WASM availability", () => {
  console.log("wasmAvailable:", wasmAvailable)
  console.log("errorMessage:", errorMessage)
  expect(wasmAvailable).toBe(true)
})
