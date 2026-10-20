import { and, filterToCql } from './cql.js';
import { splitFilter } from './filters.js';
import { effectiveCql, type QueryState } from './query.js';
import type { ColumnFilter, Scalar, Schema, WfsSource } from './types.js';
import { getCollection } from './wfs.js';
import { aggregateCounts, pagedUnique } from './wps.js';

export type DistinctOrder = 'value' | 'count';

export interface DistinctRequest {
    limit?: number;
    search?: string;
    applyQuery?: boolean;
    scanSize?: number;
    counts?: boolean;
    order?: DistinctOrder;
    signal?: AbortSignal;
}

export interface DistinctValues {
    values: Scalar[];
    complete: boolean;
    counts?: number[];
}

export interface DistinctQuery {
    source: WfsSource;
    column: string;
    cql: string | null;
    search: string | null;
    limit: number;
    scanSize: number;
    counts: boolean;
    signal?: AbortSignal | undefined;
}

export type DistinctProvider = (query: DistinctQuery) => Promise<DistinctValues>;

export type DistinctStrategy = 'scan' | 'wps' | DistinctProvider;

export interface Distinct {
    fetchDistinct(column: string, request?: DistinctRequest): Promise<DistinctValues>;
}

const DEFAULT_LIMIT = 200;
const DEFAULT_SCAN = 1000;

const isValue = (value: unknown): value is Scalar =>
    (typeof value === 'string' && value !== '') || typeof value === 'number' || typeof value === 'boolean';

const compare = (a: Scalar, b: Scalar): number =>
    typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));

interface Entry {
    value: Scalar;
    count: number;
}

const toResult = (entries: readonly Entry[], complete: boolean, counts: boolean): DistinctValues => {
    const values = entries.map(entry => entry.value);
    return counts ? { values, complete, counts: entries.map(entry => entry.count) } : { values, complete };
};

export const scanDistinct: DistinctProvider = async query => {
    const collection = await getCollection(query.source, {
        cql: query.cql,
        propertyNames: [query.column],
        sort: { field: query.column, direction: 'asc' },
        count: query.scanSize,
    }, query.signal);
    const tally = new Map<Scalar, number>();
    for (const feature of collection.features) {
        const value = feature.properties?.[query.column];
        if (isValue(value)) tally.set(value, (tally.get(value) ?? 0) + 1);
    }
    const entries = [...tally].map(([value, count]) => ({ value, count }));
    const complete = collection.features.length < query.scanSize && entries.length <= query.limit;
    return toResult(entries.slice(0, query.limit), complete, query.counts);
};

export const wpsDistinct: DistinctProvider = async query => {
    if (query.counts) {
        const groups = await aggregateCounts(query.source, { column: query.column, cql: query.cql, signal: query.signal });
        const entries = groups.filter((group): group is Entry => isValue(group.value))
            .sort((a, b) => compare(a.value, b.value));
        return toResult(entries.slice(0, query.limit), entries.length <= query.limit, true);
    }
    const result = await pagedUnique(query.source, {
        column: query.column, cql: query.cql, limit: query.limit, signal: query.signal,
    });
    return { values: result.values.filter(isValue), complete: result.size <= result.values.length };
};

const PROVIDERS = { scan: scanDistinct, wps: wpsDistinct } as const;

interface DistinctContext {
    source: WfsSource;
    idField: string | null;
    strategy: DistinctStrategy;
    getState: () => QueryState & { schema: Schema | null };
}

const withoutValues = (filters: Readonly<Record<string, ColumnFilter>>, column: string): Record<string, ColumnFilter> => {
    const rest = Object.fromEntries(Object.entries(filters).filter(([name]) => name !== column));
    const condition = splitFilter(filters[column]).condition;
    return condition ? { ...rest, [column]: condition } : rest;
};

const sortEntries = (entries: Entry[], order: DistinctOrder): Entry[] => entries.sort(order === 'count'
    ? (a, b) => b.count - a.count || compare(a.value, b.value)
    : (a, b) => compare(a.value, b.value));

export const createDistinct = (context: DistinctContext): Distinct => ({
    async fetchDistinct(column, request = {}) {
        const state = context.getState();
        const family = state.schema?.fields.find(field => field.name === column)?.family ?? null;
        const search = request.search?.trim() || null;
        const counts = request.counts ?? false;
        const filters = withoutValues(state.filters, column);
        const base = (request.applyQuery ?? true) ? effectiveCql({ ...state, filters }, context.idField) : null;
        const remote = search !== null && family === 'text';
        const cql = and([base, remote ? filterToCql(column, { kind: 'text', op: 'contains', value: search }) : null]);
        const provider = typeof context.strategy === 'function' ? context.strategy : PROVIDERS[context.strategy];
        const result = await provider({
            source: context.source,
            column,
            cql,
            search,
            limit: Math.max(1, Math.trunc(request.limit ?? DEFAULT_LIMIT)),
            scanSize: Math.max(1, Math.trunc(request.scanSize ?? DEFAULT_SCAN)),
            counts,
            signal: request.signal,
        });
        const needle = !remote && search ? search.toLowerCase() : null;
        const tallied = counts && result.counts?.length === result.values.length;
        const entries = result.values.map((value, index) => ({ value, count: tallied ? result.counts?.[index] ?? 0 : 0 }))
            .filter(entry => !needle || String(entry.value).toLowerCase().includes(needle));
        const sorted = sortEntries(entries, tallied ? request.order ?? 'value' : 'value');
        return toResult(sorted, result.complete, tallied);
    },
});
