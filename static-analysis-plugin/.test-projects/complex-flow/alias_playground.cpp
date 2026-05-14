#include "alias_playground.h"

void createAlias(int*& alias, int* target) {
    alias = target;
}

void writeViaAlias(int* alias, int value) {
    *alias = value;
}

int readViaAlias(int* alias) {
    return *alias;
}

void aliasChain(int*& alias2, int*& alias1, int* original) {
    alias1 = original;
    alias2 = alias1;
}

int doubleDeref(int** pp) {
    int* p = *pp;
    int val = *p;
    return val;
}

void structPtrField(Data* pd, int newValue) {
    pd->value = newValue;
    pd->multiplier = newValue * 2;
}

int followNext(Node* n) {
    int count = 0;
    Node* current = n;
    while (current != nullptr) {
        count = count + 1;
        current = current->next;
    }
    return count;
}
