#ifndef FUNCTION_FLOW_H
#define FUNCTION_FLOW_H

#include <string>

struct Data {
    int id;
    double score;
    std::string label;
};

struct Result {
    int value;
    int multiplier;
};

int step1(int x);
int step2(int x);
int step3(int x);
int step4(int x);
int step5(int x);

void split(int input, int* out1, int* out2);
Result compute(int a, int* b, int& c, const int& d);

Data createData();
void process(Data& d);
int extractId(const Data& d);

#endif