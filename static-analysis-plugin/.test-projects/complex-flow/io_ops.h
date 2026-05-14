#ifndef COMPLEX_FLOW_IO_OPS_H
#define COMPLEX_FLOW_IO_OPS_H

#include "types.h"

/**
 * io_ops.h — I/O and transformation operations.
 * Functions that modify data via pointer/reference parameters.
 */

void transformRef(int& r);
void incrementRef(int& r);
void doubleRef(int& r);
void resetRef(int& r);
void modifyViaPointer(int* p);
void swap(int* a, int* b);
void fillBuffer(int* buf, int len, int value);
int  readAndScale(const int* p, double factor);

#endif // COMPLEX_FLOW_IO_OPS_H
