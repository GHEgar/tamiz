import { isEmptyFilter } from './cql.js';
import type { ColumnFilter, ConditionFilter, ListFilter, Scalar } from './types.js';

export interface FilterParts {
    condition: ConditionFilter | null;
    list: ListFilter | null;
}

export const splitFilter = (filter: ColumnFilter | null | undefined): FilterParts => {
    if (!filter) return { condition: null, list: null };
    if (filter.kind === 'combined') return { condition: filter.condition, list: filter.list };
    if (filter.kind === 'list') return { condition: null, list: filter };
    return { condition: filter, list: null };
};

export const combineFilters = (
    condition: ConditionFilter | null | undefined,
    list: ListFilter | null | undefined,
): ColumnFilter | null => {
    const kept = condition && !isEmptyFilter(condition) ? condition : null;
    const values = list && !isEmptyFilter(list) ? list : null;
    if (kept && values) return { kind: 'combined', condition: kept, list: values };
    return kept ?? values;
};

export const withCondition = (filter: ColumnFilter | null | undefined, condition: ConditionFilter | null): ColumnFilter | null =>
    combineFilters(condition, splitFilter(filter).list);

export const withValues = (filter: ColumnFilter | null | undefined, values: readonly Scalar[] | null): ColumnFilter | null =>
    combineFilters(splitFilter(filter).condition, values ? { kind: 'list', values: [...values] } : null);
