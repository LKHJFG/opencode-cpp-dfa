# Complex-Flow DFA Test Audit Report
Generated: 2026-05-12T12:09:08.318Z

## Summary
28 tests total. This report reveals what each test ACTUALLY verifies vs what it claims.

## Per-Case Trace Results

### v3: input forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"input","direction":"forward"}`
- allVariables (6): ["input","step1","chained","step2","step3","clamped"]
- edges: 5
- edgeTypes: ["parameter"]
- firstEdge: {"fromVar":"input","fromLine":28,"fromStatement":"int step1 = add(input, 10);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"step1","toLine":28,"toStatement":"int step1 = add(input, 10);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}
- lastEdge: {"fromVar":"step3","fromLine":36,"fromStatement":"int clamped = clamp(step3, 0, 100);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"clamped","toLine":36,"toStatement":"int clamped = clamp(step3, 0, 100);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}

### v3: clamped backward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"clamped","direction":"backward"}`
- allVariables (9): ["clamped","clamp","step3","computeValue","step2","multiply","step1","add","input"]
- edges: 8
- edgeTypes: ["assignment"]
- firstEdge: {"fromVar":"clamp","fromLine":0,"fromStatement":"","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"clamped","toLine":36,"toStatement":"int clamped = clamp(step3, 0, 100);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}
- lastEdge: {"fromVar":"input","fromLine":25,"fromStatement":"int input = 42;","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"step1","toLine":28,"toStatement":"int step1 = add(input, 10);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}

### v3: val forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"val","direction":"forward"}`
- allVariables (1): ["val"]
- edges: 0

### v3: val2 backward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"val2","direction":"backward"}`
- allVariables (1): ["val2"]
- edges: 0

### v3: a forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"a","direction":"forward"}`
- allVariables (1): ["a"]
- edges: 0

### v3: d1 forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"d1","direction":"forward"}`
- allVariables (3): ["d1","res1","val"]
- edges: 2
- edgeTypes: ["parameter"]
- firstEdge: {"fromVar":"d1","fromLine":74,"fromStatement":"Result res1 = processData(d1);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"res1","toLine":74,"toStatement":"Result res1 = processData(d1);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}
- lastEdge: {"fromVar":"d1","fromLine":80,"fromStatement":"int val = extractValue(d1);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"val","toLine":80,"toStatement":"int val = extractValue(d1);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}

### v3: res1 backward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"res1","direction":"backward"}`
- allVariables (4): ["res1","processData","d1","createData"]
- edges: 3
- edgeTypes: ["assignment"]
- firstEdge: {"fromVar":"processData","fromLine":0,"fromStatement":"","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"res1","toLine":74,"toStatement":"Result res1 = processData(d1);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}
- lastEdge: {"fromVar":"createData","fromLine":0,"fromStatement":"","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"d1","toLine":71,"toStatement":"Data d1 = createData(7, 3);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}

### v3: target forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"target","direction":"forward"}`
- allVariables (3): ["target","alias1","alias2"]
- edges: 2
- edgeTypes: ["pointer"]
- firstEdge: {"fromVar":"target","fromLine":94,"fromStatement":"int* alias1 = &target;","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"alias1","toLine":94,"toStatement":"int* alias1 = &target;","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"pointer"}
- lastEdge: {"fromVar":"alias1","fromLine":98,"fromStatement":"int* alias2 = alias1;","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"alias2","toLine":98,"toStatement":"int* alias2 = alias1;","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"pointer"}

### v3: final backward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"final","direction":"backward"}`
- allVariables (3): ["final","readViaAlias","alias3"]
- edges: 2
- edgeTypes: ["assignment"]
- firstEdge: {"fromVar":"readViaAlias","fromLine":0,"fromStatement":"","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"final","toLine":113,"toStatement":"int final = readViaAlias(alias3);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}
- lastEdge: {"fromVar":"alias3","fromLine":102,"fromStatement":"int* alias3 = nullptr;","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"final","toLine":113,"toStatement":"int final = readViaAlias(alias3);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}

### v3: raw forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"raw","direction":"forward"}`
- allVariables (5): ["raw","result","v1","v2","combined"]
- edges: 4
- edgeTypes: ["parameter"]
- firstEdge: {"fromVar":"raw","fromLine":123,"fromStatement":"int result = cube(square(raw));","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"result","toLine":123,"toStatement":"int result = cube(square(raw));","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}
- lastEdge: {"fromVar":"v1","fromLine":128,"fromStatement":"int combined = add(v1, v2);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"combined","toLine":128,"toStatement":"int combined = add(v1, v2);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}

### v3: combined backward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"combined","direction":"backward"}`
- allVariables (6): ["combined","add","v1","v2","computeValue","raw"]
- edges: 5
- edgeTypes: ["assignment"]
- firstEdge: {"fromVar":"add","fromLine":0,"fromStatement":"","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"combined","toLine":128,"toStatement":"int combined = add(v1, v2);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}
- lastEdge: {"fromVar":"raw","fromLine":120,"fromStatement":"int raw = 5;","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"v1","toLine":126,"toStatement":"int v1 = computeValue(raw, 3);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}

### v3: buffer forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"buffer","direction":"forward"}`
- allVariables (6): ["buffer","total","ptr","container","third","scaled"]
- edges: 5
- edgeTypes: ["parameter","pointer","extraction"]
- firstEdge: {"fromVar":"buffer","fromLine":144,"fromStatement":"int total = accumulate(buffer, 5);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"total","toLine":144,"toStatement":"int total = accumulate(buffer, 5);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}
- lastEdge: {"fromVar":"third","fromLine":160,"fromStatement":"int scaled = readAndScale(&third, 2.5);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"scaled","toLine":160,"toStatement":"int scaled = readAndScale(&third, 2.5);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"extraction"}

### v3: total backward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"total","direction":"backward"}`
- allVariables (3): ["total","accumulate","buffer"]
- edges: 2
- edgeTypes: ["assignment"]
- firstEdge: {"fromVar":"accumulate","fromLine":0,"fromStatement":"","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"total","toLine":144,"toStatement":"int total = accumulate(buffer, 5);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}
- lastEdge: {"fromVar":"buffer","fromLine":138,"fromStatement":"int buffer[5];","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"total","toLine":144,"toStatement":"int total = accumulate(buffer, 5);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}

### v3: value forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"value","direction":"forward"}`
- allVariables (1): ["value"]
- edges: 0

### v3: result backward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"result","direction":"backward"}`
- allVariables (4): ["result","cube","square","raw"]
- edges: 3
- edgeTypes: ["assignment"]
- firstEdge: {"fromVar":"cube","fromLine":0,"fromStatement":"","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"result","toLine":123,"toStatement":"int result = cube(square(raw));","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}
- lastEdge: {"fromVar":"raw","fromLine":120,"fromStatement":"int raw = 5;","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"result","toLine":123,"toStatement":"int result = cube(square(raw));","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}

### v3: base forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"base","direction":"forward"}`
- allVariables (8): ["base","a1","multi","a2","multi2","d3","finalRes","final_val"]
- edges: 7
- edgeTypes: ["parameter","assignment"]
- firstEdge: {"fromVar":"base","fromLine":183,"fromStatement":"int a1 = add(base, 1);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"a1","toLine":183,"toStatement":"int a1 = add(base, 1);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}
- lastEdge: {"fromVar":"d3","fromLine":197,"fromStatement":"int final_val = extractValue(d3);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"final_val","toLine":197,"toStatement":"int final_val = extractValue(d3);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}

### v3: final_val backward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"final_val","direction":"backward"}`
- allVariables (9): ["final_val","extractValue","d3","createData","a2","multiply","a1","add","base"]
- edges: 8
- edgeTypes: ["assignment"]
- firstEdge: {"fromVar":"extractValue","fromLine":0,"fromStatement":"","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"final_val","toLine":197,"toStatement":"int final_val = extractValue(d3);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}
- lastEdge: {"fromVar":"base","fromLine":180,"fromStatement":"int base = 3;","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"a1","toLine":183,"toStatement":"int a1 = add(base, 1);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}

### v3: multi2 backward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"multi2","direction":"backward"}`
- allVariables (4): ["multi2","computeValue","multi","base"]
- edges: 3
- edgeTypes: ["assignment"]
- firstEdge: {"fromVar":"computeValue","fromLine":0,"fromStatement":"","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"multi2","toLine":202,"toStatement":"int multi2 = computeValue(multi, 10);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}
- lastEdge: {"fromVar":"base","fromLine":180,"fromStatement":"int base = 3;","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"multi","toLine":200,"toStatement":"int multi = base;","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}

### v4: input forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"input","direction":"forward","directory":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow"}`
- allVariables (6): ["input","step1","chained","step2","step3","clamped"]
- edges: 10
- edgeTypes: ["parameter"]
- firstEdge: {"fromVar":"input","fromLine":28,"fromStatement":"int step1 = add(input, 10);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"step1","toLine":28,"toStatement":"int step1 = add(input, 10);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}
- lastEdge: {"fromVar":"step3","fromLine":36,"fromStatement":"int clamped = clamp(step3, 0, 100);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"clamped","toLine":36,"toStatement":"int clamped = clamp(step3, 0, 100);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}

### v4: val forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"val","direction":"forward","directory":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow"}`
- allVariables (1): ["val"]
- edges: 0

### v4: d1 forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"d1","direction":"forward","directory":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow"}`
- allVariables (3): ["d1","res1","val"]
- edges: 4
- edgeTypes: ["parameter"]
- firstEdge: {"fromVar":"d1","fromLine":74,"fromStatement":"Result res1 = processData(d1);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"res1","toLine":74,"toStatement":"Result res1 = processData(d1);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}
- lastEdge: {"fromVar":"d1","fromLine":80,"fromStatement":"int val = extractValue(d1);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"val","toLine":80,"toStatement":"int val = extractValue(d1);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}

### v4: res1 backward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"res1","direction":"backward","directory":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow"}`
- allVariables (4): ["res1","processData","d1","createData"]
- edges: 6
- edgeTypes: ["assignment"]
- firstEdge: {"fromVar":"processData","fromLine":0,"fromStatement":"","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"res1","toLine":74,"toStatement":"Result res1 = processData(d1);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}
- lastEdge: {"fromVar":"createData","fromLine":0,"fromStatement":"","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"d1","toLine":71,"toStatement":"Data d1 = createData(7, 3);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}

### v4: target forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"target","direction":"forward","directory":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow"}`
- allVariables (3): ["target","alias1","alias2"]
- edges: 4
- edgeTypes: ["pointer"]
- firstEdge: {"fromVar":"target","fromLine":94,"fromStatement":"int* alias1 = &target;","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"alias1","toLine":94,"toStatement":"int* alias1 = &target;","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"pointer"}
- lastEdge: {"fromVar":"alias1","fromLine":98,"fromStatement":"int* alias2 = alias1;","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"alias2","toLine":98,"toStatement":"int* alias2 = alias1;","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"pointer"}

### v4: final backward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"final","direction":"backward","directory":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow"}`
- allVariables (3): ["final","readViaAlias","alias3"]
- edges: 4
- edgeTypes: ["assignment"]
- firstEdge: {"fromVar":"readViaAlias","fromLine":0,"fromStatement":"","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"final","toLine":113,"toStatement":"int final = readViaAlias(alias3);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}
- lastEdge: {"fromVar":"alias3","fromLine":102,"fromStatement":"int* alias3 = nullptr;","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"final","toLine":113,"toStatement":"int final = readViaAlias(alias3);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}

### v4: d2 forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"d2","direction":"forward","directory":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow"}`
- allVariables (2): ["d2","res2"]
- edges: 2
- edgeTypes: ["parameter"]
- firstEdge: {"fromVar":"d2","fromLine":84,"fromStatement":"Result res2 = computeResult(d2);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"res2","toLine":84,"toStatement":"Result res2 = computeResult(d2);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}
- lastEdge: {"fromVar":"d2","fromLine":84,"fromStatement":"Result res2 = computeResult(d2);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"res2","toLine":84,"toStatement":"Result res2 = computeResult(d2);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}

### v4: base forward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"base","direction":"forward","directory":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow"}`
- allVariables (8): ["base","a1","multi","a2","multi2","d3","finalRes","final_val"]
- edges: 14
- edgeTypes: ["parameter","assignment"]
- firstEdge: {"fromVar":"base","fromLine":183,"fromStatement":"int a1 = add(base, 1);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"a1","toLine":183,"toStatement":"int a1 = add(base, 1);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}
- lastEdge: {"fromVar":"d3","fromLine":197,"fromStatement":"int final_val = extractValue(d3);","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"final_val","toLine":197,"toStatement":"int final_val = extractValue(d3);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"parameter"}

### v4: multi2 backward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"multi2","direction":"backward","directory":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow"}`
- allVariables (4): ["multi2","computeValue","multi","base"]
- edges: 6
- edgeTypes: ["assignment"]
- firstEdge: {"fromVar":"computeValue","fromLine":0,"fromStatement":"","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"multi2","toLine":202,"toStatement":"int multi2 = computeValue(multi, 10);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}
- lastEdge: {"fromVar":"base","fromLine":180,"fromStatement":"int base = 3;","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"multi","toLine":200,"toStatement":"int multi = base;","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}

### v4: total backward
- Args: `{"filePath":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","variableName":"total","direction":"backward","directory":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow"}`
- allVariables (3): ["total","accumulate","buffer"]
- edges: 4
- edgeTypes: ["assignment"]
- firstEdge: {"fromVar":"accumulate","fromLine":0,"fromStatement":"","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"total","toLine":144,"toStatement":"int total = accumulate(buffer, 5);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}
- lastEdge: {"fromVar":"buffer","fromLine":138,"fromStatement":"int buffer[5];","fromFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","toVar":"total","toLine":144,"toStatement":"int total = accumulate(buffer, 5);","toFile":"C:\\work\\plugin4opencode\\static-analysis-plugin\\.test-projects\\complex-flow\\main.cpp","edgeType":"assignment"}
