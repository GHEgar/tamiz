import { buildColumns, moveName, orderedNames, type ColumnState } from './columns.js';
import { and, bboxToCql, filtersToCql, idsToCql } from './cql.js';
import { createDownloads, type Downloads } from './table-download.js';
import { buildChips, effectiveCql, type Labels, type QueryState } from './query.js';
import { applySelection, sameSelection } from './selection.js';
import type { ColumnFilter, Row, Schema, SelectMode, Sort, Status, TableEvent, TableSnapshot, WfsSource } from './types.js';
import { describe, getCollection, hits, matchedOf, toRows, type GeoJsonCollection } from './wfs.js';

export interface TableOptions {
    source: WfsSource;
    pageSize?: number;
    idField?: string | null;
    baseCql?: string | null;
    sort?: Sort | null;
    schema?: Schema;
    columns?: { order?: string[]; hidden?: string[]; labels?: Record<string, string> };
    labels?: Labels;
    onEvent?: (event: TableEvent) => void;
}

export interface FeatureRequest {
    ids?: readonly string[];
    bbox?: { extent: readonly number[]; srsName: string };
    applyQuery?: boolean;
    srsName?: string;
    count?: number;
    signal?: AbortSignal;
}

export interface AttributeTable extends Downloads {
    readonly source: WfsSource;
    readonly idField: string | null;
    subscribe(listener: () => void): () => void;
    getSnapshot(): TableSnapshot;
    start(): void;
    refresh(): void;
    destroy(): void;
    setPage(page: number): void;
    setPageSize(size: number): void;
    setSort(sort: Sort | null): void;
    toggleSort(field: string): void;
    setFilter(column: string, filter: ColumnFilter | null): void;
    clearFilters(): void;
    setCql(cql: string | null): void;
    setBaseCql(cql: string | null): void;
    removeChip(key: string): void;
    setColumnVisible(column: string, visible: boolean): void;
    setColumnOrder(names: readonly string[]): void;
    moveColumn(column: string, toIndex: number): void;
    select(ids: string | readonly string[], mode?: SelectMode): void;
    clearSelection(): void;
    setOnlySelected(value: boolean): void;
    fetchFeatures(request: FeatureRequest): Promise<GeoJsonCollection>;
}

interface State extends QueryState, ColumnState {
    status: Status;
    error: Error | null;
    schema: Schema | null;
    rows: readonly Row[];
    page: number;
    pageSize: number;
    total: number | null;
    sort: Sort | null;
    anchor: string | null;
}

const toError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)));

export const createAttributeTable = (options: TableOptions): AttributeTable => {
    const source = options.source;
    const idField = options.idField ?? null;
    const labels = options.labels ?? {};
    const emit = (event: TableEvent): void => options.onEvent?.(event);
    const listeners = new Set<() => void>();

    let state: State = {
        status: 'idle', error: null, schema: options.schema ?? null, rows: [], page: 0,
        pageSize: Math.max(1, options.pageSize ?? 100), total: null, sort: options.sort ?? null,
        baseCql: options.baseCql ?? null, customCql: null, filters: {}, onlySelected: false,
        selection: new Set(), anchor: null, order: options.columns?.order ?? null,
        hidden: new Set(options.columns?.hidden ?? []), labels: options.columns?.labels ?? {},
    };
    let snapshot = toSnapshot(state);
    let started = false;
    let scheduled = false;
    let controller: AbortController | null = null;
    let fetchedKey: string | null = null;
    let countedCql: string | null | undefined;

    function toSnapshot(current: State): TableSnapshot {
        const columns = buildColumns(current.schema, current, current.sort, current.filters);
        return {
            status: current.status, error: current.error, schema: current.schema, columns,
            visibleColumns: columns.filter(column => column.visible), rows: current.rows,
            page: current.page, pageSize: current.pageSize,
            pageCount: current.total === null ? null : Math.max(1, Math.ceil(current.total / current.pageSize)),
            total: current.total, sort: current.sort, filters: current.filters, baseCql: current.baseCql,
            customCql: current.customCql, filtersCql: filtersToCql(current.filters),
            cql: effectiveCql(current, idField), chips: buildChips(current, labels),
            selection: current.selection, onlySelected: current.onlySelected,
        };
    }

    const fetchKey = (): string => JSON.stringify([snapshot.cql, state.sort, state.page, state.pageSize]);

    const set = (patch: Partial<State>): void => {
        const previousCql = snapshot.cql;
        state = { ...state, ...patch };
        snapshot = toSnapshot(state);
        if (snapshot.cql !== previousCql) emit({ type: 'query', cql: snapshot.cql });
        if (started && fetchKey() !== fetchedKey) schedule();
        listeners.forEach(listener => listener());
    };

    const load = async (): Promise<void> => {
        controller?.abort();
        const current = new AbortController();
        controller = current;
        const { signal } = current;
        fetchedKey = fetchKey();
        set({ status: 'loading', error: null });
        try {
            let schema = state.schema;
            if (!schema) {
                schema = await describe(source, signal);
                if (signal.aborted) return;
                set({ schema });
                emit({ type: 'schema', schema });
            }
            const cql = snapshot.cql;
            const collection = await getCollection(source, {
                cql, propertyNames: schema.fields.map(field => field.name), sort: state.sort,
                startIndex: state.page * state.pageSize, count: state.pageSize,
            }, signal);
            const rows = toRows(collection, idField);
            let total = state.total;
            if (countedCql !== cql || total === null) {
                total = matchedOf(collection);
                if (total === null) {
                    total = state.page === 0 && rows.length < state.pageSize ? rows.length : await hits(source, cql, signal);
                }
                countedCql = cql;
                emit({ type: 'total', total });
            }
            if (signal.aborted) return;
            fetchedKey = fetchKey();
            const lastPage = Math.max(0, Math.ceil(total / state.pageSize) - 1);
            set({ status: 'ready', rows, total, page: Math.min(state.page, lastPage) });
            emit({ type: 'page', page: state.page, rows: rows.length });
        } catch (error) {
            if (signal.aborted) return;
            const failure = toError(error);
            set({ status: 'error', error: failure });
            emit({ type: 'error', error: failure });
        }
    };

    function schedule(): void {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
            scheduled = false;
            if (started) void load();
        });
    }

    const setQuery = (patch: Partial<State>): void => set({ ...patch, page: 0 });

    const select = (ids: string | readonly string[], mode: SelectMode = 'replace'): void => {
        const list = typeof ids === 'string' ? [ids] : [...ids];
        const next = applySelection(state, list, mode, state.rows.map(row => row.id));
        if (sameSelection(next.selection, state.selection)) {
            if (next.anchor !== state.anchor) state = { ...state, anchor: next.anchor };
            return;
        }
        const patch = { selection: next.selection, anchor: next.anchor };
        if (state.onlySelected) setQuery(patch);
        else set(patch);
        emit({ type: 'selection', ids: [...next.selection] });
    };

    const fetchFeatures = (request: FeatureRequest): Promise<GeoJsonCollection> => {
        const geometryField = state.schema?.geometryField ?? null;
        const parts: (string | null)[] = [request.applyQuery ? effectiveCql(state, idField, false) : null];
        if (request.ids) parts.push(idsToCql(request.ids, idField) ?? 'EXCLUDE');
        if (request.bbox && geometryField) parts.push(bboxToCql(geometryField, request.bbox.extent, request.bbox.srsName));
        return getCollection(source, {
            cql: and(parts), srsName: request.srsName ?? null, count: request.count ?? null,
        }, request.signal);
    };

    const setFilter = (column: string, filter: ColumnFilter | null): void => {
        const filters = Object.fromEntries(Object.entries(state.filters).filter(([name]) => name !== column));
        if (filter) filters[column] = filter;
        setQuery({ filters });
    };

    const names = (): string[] => (state.schema ? orderedNames(state.schema, state.order) : [...(state.order ?? [])]);

    return {
        source,
        idField,
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        getSnapshot: () => snapshot,
        start() {
            if (started) return;
            started = true;
            schedule();
        },
        refresh() {
            countedCql = undefined;
            fetchedKey = null;
            if (started) schedule();
        },
        destroy() {
            started = false;
            controller?.abort();
            listeners.clear();
        },
        setPage: page => set({ page: Math.max(0, Math.trunc(page)) }),
        setPageSize: size => set({ pageSize: Math.max(1, Math.trunc(size)), page: 0 }),
        setSort: sort => set({ sort, page: 0 }),
        toggleSort(field) {
            const current = state.sort?.field === field ? state.sort.direction : null;
            if (current === null) set({ sort: { field, direction: 'asc' }, page: 0 });
            else if (current === 'asc') set({ sort: { field, direction: 'desc' }, page: 0 });
            else set({ sort: options.sort ?? null, page: 0 });
        },
        setFilter,
        clearFilters: () => setQuery({ filters: {}, customCql: null }),
        setCql: cql => setQuery({ customCql: cql?.trim() || null }),
        setBaseCql: cql => setQuery({ baseCql: cql?.trim() || null }),
        removeChip(key) {
            if (key === 'custom') setQuery({ customCql: null });
            else if (key === 'selection') setQuery({ onlySelected: false });
            else if (key.startsWith('column:')) setFilter(key.slice(7), null);
        },
        setColumnVisible(column, visible) {
            const hidden = new Set(state.hidden);
            if (visible) hidden.delete(column);
            else hidden.add(column);
            set({ hidden });
        },
        setColumnOrder: order => set({ order: [...order] }),
        moveColumn: (column, toIndex) => set({ order: moveName(names(), column, toIndex) }),
        select,
        clearSelection: () => select([], 'replace'),
        setOnlySelected: value => { if (value !== state.onlySelected) setQuery({ onlySelected: value }); },
        fetchFeatures,
        ...createDownloads({ source, idField, getState: () => state, getSnapshot: () => snapshot, emit }),
    };
};
