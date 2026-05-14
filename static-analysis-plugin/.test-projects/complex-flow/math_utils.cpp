#include "math_utils.h"

int add(int a, int b) {
    return a + b;
}

int multiply(int a, int b) {
    int result = a * b;
    return result;
}

int computeValue(int x, int y) {
    int sum = add(x, y);
    int product = multiply(x, y);
    int final = add(sum, product);
    return final;
}

int accumulate(int* arr, int len) {
    int total = 0;
    for (int i = 0; i < len; i++) {
        total = add(total, arr[i]);
    }
    return total;
}

int square(int x) {
    return multiply(x, x);
}

int cube(int x) {
    int sq = square(x);
    return multiply(sq, x);
}

int clamp(int value, int min, int max) {
    int result = value;
    if (result < min) {
        result = min;
    }
    if (result > max) {
        result = max;
    }
    return result;
}
