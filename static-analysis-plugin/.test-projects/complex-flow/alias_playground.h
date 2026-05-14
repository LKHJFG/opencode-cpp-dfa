#ifndef COMPLEX_FLOW_ALIAS_H
#define COMPLEX_FLOW_ALIAS_H

#include "types.h"

/**
 * alias_playground.h — Pointer alias patterns for data flow testing.
 *
 * Tests various levels of pointer indirection and alias chains.
 */

void createAlias(int*& alias, int* target);
void writeViaAlias(int* alias, int value);
int  readViaAlias(int* alias);
void aliasChain(int*& alias2, int*& alias1, int* original);
int  doubleDeref(int** pp);
void structPtrField(Data* pd, int newValue);
int  followNext(Node* n);

#endif // COMPLEX_FLOW_ALIAS_H
