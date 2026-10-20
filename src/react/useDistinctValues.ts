import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AttributeTable, DistinctRequest, Scalar } from '../core/index.js';

export interface DistinctOptions extends Omit<DistinctRequest, 'signal'> {
    enabled?: boolean;
}

export interface UseDistinctValues {
    values: Scalar[];
    counts: number[] | null;
    complete: boolean;
    status: 'idle' | 'loading' | 'ready' | 'error';
    error: Error | null;
}

interface Loaded {
    key: string;
    values: Scalar[];
    counts: number[] | null;
    complete: boolean;
    error: Error | null;
}

const EMPTY: Loaded = { key: '', values: [], counts: null, complete: false, error: null };

const asError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)));

export const useDistinctValues = (
    table: AttributeTable,
    column: string | null,
    options: DistinctOptions = {},
): UseDistinctValues => {
    const snapshot = useSyncExternalStore(table.subscribe, table.getSnapshot, table.getSnapshot);
    const [loaded, setLoaded] = useState<Loaded>(EMPTY);
    const { limit, search, applyQuery, scanSize, counts, order } = options;
    const ready = (options.enabled ?? true) && column !== null && snapshot.schema !== null && snapshot.status !== 'idle';
    const cql = applyQuery === false ? null : snapshot.cql;
    const key = ready ? JSON.stringify([column, limit, search, applyQuery, scanSize, counts, order, cql]) : '';

    useEffect(() => {
        if (!key || column === null) return undefined;
        const controller = new AbortController();
        const request: DistinctRequest = { signal: controller.signal };
        if (limit !== undefined) request.limit = limit;
        if (search !== undefined) request.search = search;
        if (applyQuery !== undefined) request.applyQuery = applyQuery;
        if (scanSize !== undefined) request.scanSize = scanSize;
        if (counts !== undefined) request.counts = counts;
        if (order !== undefined) request.order = order;
        table.fetchDistinct(column, request)
            .then(result => {
                if (!controller.signal.aborted) setLoaded({ key, values: result.values, counts: result.counts ?? null, complete: result.complete, error: null });
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) setLoaded({ key, values: [], counts: null, complete: false, error: asError(error) });
            });
        return () => controller.abort();
    }, [table, key, column, limit, search, applyQuery, scanSize, counts, order]);

    if (!key) return { values: [], counts: null, complete: false, status: 'idle', error: null };
    if (loaded.key !== key) return { values: loaded.values, counts: loaded.counts, complete: false, status: 'loading', error: null };
    if (loaded.error) return { values: [], counts: null, complete: false, status: 'error', error: loaded.error };
    return { values: loaded.values, counts: loaded.counts, complete: loaded.complete, status: 'ready', error: null };
};
