#ifndef COMPLEX_FLOW_PIPELINE_H
#define COMPLEX_FLOW_PIPELINE_H

#include "types.h"

/**
 * pipeline.h — Data processing pipeline with cross-file chaining.
 *
 * Functions that process Data structs and chain transformations.
 */

Result processData(Data d);
void modifyData(Data* pd);
int extractValue(const Data& rd);
Data createData(int val, int mul);
Result computeResult(const Data& input);
void updateBuffer(Data& d, int index, int newVal);

#endif // COMPLEX_FLOW_PIPELINE_H
