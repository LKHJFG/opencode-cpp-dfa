#include <iostream>
#include <cstring>

int classify(int value, int threshold, int multiplier) {
    int result = 0;
    if (value > threshold) {
        if (value > threshold * 2) {
            if (value > threshold * 4) {
                if (value > threshold * 8) {
                    result = multiplier * 8;
                } else {
                    result = multiplier * 4;
                }
            } else {
                result = multiplier * 2;
            }
        } else {
            result = multiplier;
        }
    } else {
        if (value < threshold / 2) {
            if (value < threshold / 4) {
                result = -multiplier * 4;
            } else {
                result = -multiplier * 2;
            }
        } else {
            result = 0;
        }
    }
    return result;
}

int process_conditions(int a, int b, int c, int d) {
    int result = 0;
    for (int i = 0; i < a; i++) {
        int inner = b;
        while (inner > 0) {
            for (int j = 0; j < c; j++) {
                if (i + j == inner) {
                    result += inner * j;
                } else {
                    result -= i;
                }
            }
            inner--;
        }
    }
    return result + d;
}

int evaluate_switch(int code, int base) {
    int result = base;
    switch (code) {
        case 1:
            result += 10;
        case 2:
            result += 20;
            break;
        case 3:
            result += 30;
            break;
        case 4:
            result += 40;
        case 5:
            result += 50;
        case 6:
            result += 60;
            break;
        case 7:
            result += 70;
        default:
            result += 100;
            break;
        case 8:
            result += 80;
            break;
        case 9:
            result += 90;
            break;
    }
    return result;
}

int ternary_chain(int a, int b, int c, int d, int e, int f, int g) {
    int r1 = a ? (b ? c : d) : (e ? f : g);
    int r2 = (a > 0) ? ((b > 0) ? (c > 0 ? 1 : 2) : 3) : 4;
    int r3 = (r1 > 10) ? ((r2 > 5) ? 100 : 200) : 300;
    return r1 + r2 + r3;
}

int do_while_loop(int start, int limit) {
    int counter = start;
    int accumulator = 0;
    do {
        if (counter % 2 == 0) {
            accumulator += counter;
        } else {
            accumulator -= counter;
        }
        counter++;
        if (counter > limit) {
            break;
        }
        if (counter % 3 == 0) {
            continue;
        }
        accumulator *= 2;
    } while (counter < limit);
    return accumulator;
}

int main() {
    int a = 64, b = 128, c = 8, d = 256;
    int class_result = classify(a, b, c);
    int loop_result = process_conditions(3, 4, 2, d);
    int switch_result = evaluate_switch(4, 1000);
    int ternary_result = ternary_chain(1, 1, 50, 60, 70, 80, 90);
    int do_while_result = do_while_loop(1, 10);
    return class_result + loop_result + switch_result + ternary_result + do_while_result;
}