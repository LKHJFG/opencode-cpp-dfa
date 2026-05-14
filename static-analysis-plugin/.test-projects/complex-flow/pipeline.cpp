#include "pipeline.h"
#include "math_utils.h"

Result processData(Data d) {
    Result r;
    r.sum = add(d.value, d.multiplier);
    r.product = multiply(d.value, d.multiplier);
    r.flag = r.sum > 0 ? 1 : 0;
    r.average = static_cast<double>(r.sum) / 2.0;
    return r;
}

void modifyData(Data* pd) {
    pd->value = pd->value + 100;
    pd->multiplier = pd->multiplier * 2;
    if (pd->buffer != nullptr && pd->bufferLen > 0) {
        pd->buffer[0] = pd->value;
    }
}

int extractValue(const Data& rd) {
    return rd.value;
}

Data createData(int val, int mul) {
    Data d;
    d.value = val;
    d.multiplier = mul;
    d.buffer = nullptr;
    d.bufferLen = 0;
    return d;
}

Result computeResult(const Data& input) {
    Result res;
    int v = extractValue(input);
    int m = input.multiplier;
    res.sum = add(v, m);
    res.product = multiply(v, m);
    res.flag = res.sum;
    res.average = static_cast<double>(v) / 2.0;
    return res;
}

void updateBuffer(Data& d, int index, int newVal) {
    if (d.buffer != nullptr && index < d.bufferLen) {
        d.buffer[index] = newVal;
    }
}
