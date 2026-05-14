#include "io_ops.h"
#include "math_utils.h"

void transformRef(int& r) {
    r = r + 1;
}

void incrementRef(int& r) {
    int old = r;
    r = old + 1;
}

void doubleRef(int& r) {
    r = r * 2;
}

void resetRef(int& r) {
    r = 0;
}

void modifyViaPointer(int* p) {
    *p = (*p) * 2;
}

void swap(int* a, int* b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

void fillBuffer(int* buf, int len, int value) {
    for (int i = 0; i < len; i++) {
        buf[i] = value;
    }
}

int readAndScale(const int* p, double factor) {
    int raw = *p;
    int scaled = static_cast<int>(raw * factor);
    return scaled;
}
