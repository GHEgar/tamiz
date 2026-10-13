import { and, filterToCql } from './cql.js';
import { effectiveCql, type QueryState } from './query.js';
import type { Scalar, Schema, WfsSource } from './types.js';
import { getCollection } from './wfs.js';
import { pagedUnique } from './wps.js';

export interface DistinctRequest {
    limit?: number;
    search?: string;
    applyQuery?: boolean;
    scanSize?: number;
    signal?: AbortSignal;
}

export interface DistinctValues {
    values: Scalar[];
    complete: boolean;
}

export interface DistinctQuery {
    source: WfsSource;
    column: string;
    cql: string | null;
    search: string | null;
    limit: number;
    scanSize: number;
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

export const scanDistinct: DistinctProvider = async query => {
    const collection = await getCollection(query.source, {
        cql: query.cql,
        propertyNames: [query.column],
        sort: { field: query.column, direction: 'asc' },
        count: query.scanSize,
    }, query.signal);
    const values = [...new Set(collection.features.map(feature => feature.properties?.[query.column]).filter(isValue))];
    return {
        values: values.slice(0, query.limit),
        complete: collection.features.length < query.scanSize && values.length <= query.limit,
    };
};

export const wpsDistinct: DistinctProvider = async query => {
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

export const createDistinct = (context: DistinctContext): Distinct => ({
    async fetchDistinct(column, request = {}) {
        const state = context.getState();
        const family = state.schema?.fields.find(field => field.name === column)?.family ?? null;
        const search = request.search?.trim() || null;
        const filters = Object.fromEntries(Object.entries(state.filters).filter(([name]) => name !== column));
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
            signal: request.signal,
        });
        const needle = !remote && search ? search.toLowerCase() : null;
        const values = needle ? result.values.filter(value => String(value).toLowerCase().includes(needle)) : [...result.values];
        return { values: values.sort(compare), complete: result.complete };
    },
});
