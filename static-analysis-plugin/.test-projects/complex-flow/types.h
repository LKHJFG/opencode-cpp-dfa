#ifndef COMPLEX_FLOW_TYPES_H
#define COMPLEX_FLOW_TYPES_H

// ============================================================
// Shared type definitions for cross-file data flow tests
// ============================================================

struct Data {
    int value;
    int multiplier;
    int* buffer;
    int bufferLen;
};

struct Result {
    int sum;
    int product;
    int flag;
    double average;
};

struct Node {
    int id;
    Node* next;
    Data payload;
};

struct Container {
    Data items[3];
    int count;
    char label[32];
};

struct Config {
    int threshold;
    double scaleFactor;
    bool enabled;
};

#endif // COMPLEX_FLOW_TYPES_H
