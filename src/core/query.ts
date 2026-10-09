import { and, defaultFilterLabel, filterToCql, filtersToCql, idsToCql } from './cql.js';
import type { Chip, ColumnFilter, FilterLabel } from './types.js';

export interface Labels {
    base?: string;
    custom?: string;
    selection?: (count: number) => string;
    filter?: FilterLabel;
}

export interface QueryState {
    baseCql: string | null;
    customCql: string | null;
    filters: Readonly<Record<string, ColumnFilter>>;
    onlySelected: boolean;
    selection: ReadonlySet<string>;
}

export const NOTHING = 'EXCLUDE';

export const selectionCql = (ids: readonly string[], idField: string | null): string =>
    idsToCql(ids, idField) ?? NOTHING;

export const userCql = (state: QueryState): string | null => state.customCql ?? filtersToCql(state.filters);

export const effectiveCql = (state: QueryState, idField: string | null, withSelection = true): string | null => and([
    state.baseCql,
    userCql(state),
    withSelection && state.onlySelected ? selectionCql([...state.selection], idField) : null,
]);

export const buildChips = (state: QueryState, labels: Labels): Chip[] => {
    const chips: Chip[] = [];
    if (state.baseCql) chips.push({ key: 'base', label: labels.base ?? 'Inherited filter', source: 'base', removable: false });
    if (state.customCql) {
        chips.push({ key: 'custom', label: labels.custom ?? 'Custom CQL', source: 'custom', removable: true });
    } else {
        const label = labels.filter ?? defaultFilterLabel;
        for (const [column, filter] of Object.entries(state.filters)) {
            if (filterToCql(column, filter) === null) continue;
            chips.push({ key: `column:${column}`, label: label(column, filter), source: 'column', removable: true });
        }
    }
    if (state.onlySelected) {
        const label = labels.selection ? labels.selection(state.selection.size) : `Selected (${state.selection.size})`;
        chips.push({ key: 'selection', label, source: 'selection', removable: true });
    }
    return chips;
};
