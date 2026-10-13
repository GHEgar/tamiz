import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AttributeTable, DistinctRequest, Scalar } from '../core/index.js';

export interface DistinctOptions extends Omit<DistinctRequest, 'signal'> {
    enabled?: boolean;
}

export interface UseDistinctValues {
    values: Scalar[];
    complete: boolean;
    status: 'idle' | 'loading' | 'ready' | 'error';
    error: Error | null;
}

interface Loaded {
    key: string;
    values: Scalar[];
    complete: boolean;
    error: Error | null;
}

const EMPTY: Loaded = { key: '', values: [], complete: false, error: null };

const asError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)));

export const useDistinctValues = (
    table: AttributeTable,
    column: string | null,
    options: DistinctOptions = {},
): UseDistinctValues => {
    const snapshot = useSyncExternalStore(table.subscribe, table.getSnapshot, table.getSnapshot);
    const [loaded, setLoaded] = useState<Loaded>(EMPTY);
    const { limit, search, applyQuery, scanSize } = options;
    const ready = (options.enabled ?? true) && column !== null && snapshot.schema !== null && snapshot.status !== 'idle';
    const cql = applyQuery === false ? null : snapshot.cql;
    const key = ready ? JSON.stringify([column, limit, search, applyQuery, scanSize, cql]) : '';

    useEffect(() => {
        if (!key || column === null) return undefined;
        const controller = new AbortController();
        const request: DistinctRequest = { signal: controller.signal };
        if (limit !== undefined) request.limit = limit;
        if (search !== undefined) request.search = search;
        if (applyQuery !== undefined) request.applyQuery = applyQuery;
        if (scanSize !== undefined) request.scanSize = scanSize;
        table.fetchDistinct(column, request)
            .then(result => {
                if (!controller.signal.aborted) setLoaded({ key, ...result, error: null });
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) setLoaded({ key, values: [], complete: false, error: asError(error) });
            });
        return () => controller.abort();
    }, [table, key, column, limit, search, applyQuery, scanSize]);

    if (!key) return { values: [], complete: false, status: 'idle', error: null };
    if (loaded.key !== key) return { values: loaded.values, complete: false, status: 'loading', error: null };
    if (loaded.error) return { values: [], complete: false, status: 'error', error: loaded.error };
    return { values: loaded.values, complete: loaded.complete, status: 'ready', error: null };
};
