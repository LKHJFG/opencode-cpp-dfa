#include "function-flow.h"
#include <iostream>

int step1(int x) {
    return x + 10;
}

int step2(int x) {
    return x * 2;
}

int step3(int x) {
    return x - 5;
}

int step4(int x) {
    return x + x;
}

int step5(int x) {
    return x * x;
}

void split(int input, int* out1, int* out2) {
    if (out1 != nullptr) {
        *out1 = input / 2;
    }
    if (out2 != nullptr) {
        *out2 = input - (input / 2);
    }
}

Result compute(int a, int* b, int& c, const int& d) {
    Result r;
    r.value = a + (*b) + c + d;
    r.multiplier = 3;
    c = r.value * r.multiplier;
    return r;
}

Data createData() {
    Data d;
    d.id = 0;
    d.score = 0.0;
    d.label = "init";
    return d;
}

void process(Data& d) {
    d.id = d.id + 100;
    d.score = d.score + 50.0;
    d.label = "processed";
}

int extractId(const Data& d) {
    return d.id;
}

int main() {
    int x = 5;
    int s1 = step1(x);
    int s2 = step2(s1);
    int s3 = step3(s2);
    int s4 = step4(s3);
    int s5 = step5(s4);

    int chained = step5(step4(step3(step2(step1(x)))));

    int num = 100;
    int half1 = 0;
    int half2 = 0;
    split(num, &half1, &half2);

    int ref_val = 7;
    int* ptr_val = new int(3);
    const int const_val = 5;
    Result res = compute(x, ptr_val, ref_val, const_val);

    Data data = createData();
    process(data);
    int data_id = extractId(data);

    return s5 + chained + half1 + half2 + res.value + ref_val + data_id;
}