/* DFA EDGE CASE: goto-setjmp
 * Tests goto and non-local jump data flow.
 * goto breaks block structure — DFA line-scan cannot reliably track across goto jumps.
 * setjmp/longjmp create non-local control flow that DFA cannot model.
 */

#include <iostream>
#include <csetjmp>

int compute(bool cond) {
    int x = 10;
    if (cond) goto skip;
    x = 20;
skip:
    int y = x + 1;
    return y;
}

int jumpOverVar(bool skip) {
    if (skip) goto after;
    int declared = 5;
    return declared;
after:
    return 0;
}

int main() {
    int r1 = compute(true);
    int r2 = compute(false);

    int r3 = jumpOverVar(true);
    int r4 = jumpOverVar(false);

    std::jmp_buf env;
    int result;

    if (setjmp(env) == 0) {
        std::cout << "setjmp called first time" << std::endl;
        result = 1;
        longjmp(env, 2);
    } else {
        std::cout << "longjmp returned: " << result << std::endl;
        result = 99;
    }

    int multiple = 0;
    for (int i = 0; i < 3; i++) {
        if (i == 1) continue;
        multiple += i;
    }
    if (multiple != 3) goto error;
    goto done;
error:
    multiple = -1;
done:

    std::cout << "r1=" << r1 << " r2=" << r2 << " r3=" << r3
              << " r4=" << r4 << " result=" << result << " multiple=" << multiple << std::endl;
    return 0;
}