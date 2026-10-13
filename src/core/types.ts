export type WfsVersion = '2.0.0' | '1.1.0';

export type ColumnFamily = 'text' | 'number' | 'date' | 'boolean';

export type Scalar = string | number | boolean;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface WfsSource {
    url: string;
    typeName: string;
    version?: WfsVersion;
    fetch?: FetchLike;
    headers?: Record<string, string>;
    params?: Record<string, string>;
    maxUrlLength?: number;
    wpsUrl?: string;
}

export interface Field {
    name: string;
    type: string;
    family: ColumnFamily;
}

export interface Schema {
    fields: Field[];
    geometryField: string | null;
    geometryType: string | null;
}

export interface Row {
    id: string;
    properties: Record<string, unknown>;
}

export type SortDirection = 'asc' | 'desc';

export interface Sort {
    field: string;
    direction: SortDirection;
}

export type ListFilter = { kind: 'list'; values: Scalar[] };
export type TextFilter = { kind: 'text'; op: 'contains' | 'startsWith' | 'endsWith' | 'equals'; value: string; caseSensitive?: boolean };
export type NumberFilter =
    | { kind: 'number'; op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte'; value: number }
    | { kind: 'number'; op: 'between'; min: number; max: number };
export type DateFilter = { kind: 'date'; from?: string; to?: string };
export type BooleanFilter = { kind: 'boolean'; value: boolean };
export type NullFilter = { kind: 'null'; isNull: boolean };

export type ColumnFilter = ListFilter | TextFilter | NumberFilter | DateFilter | BooleanFilter | NullFilter;

export type ChipSource = 'base' | 'column' | 'custom' | 'selection';

export interface Chip {
    key: string;
    label: string;
    source: ChipSource;
    removable: boolean;
}

export interface Column {
    name: string;
    label: string;
    type: string;
    family: ColumnFamily;
    visible: boolean;
    sort: SortDirection | null;
    filter: ColumnFilter | null;
}

export type Status = 'idle' | 'loading' | 'ready' | 'error';

export interface TableSnapshot {
    status: Status;
    error: Error | null;
    schema: Schema | null;
    columns: readonly Column[];
    visibleColumns: readonly Column[];
    rows: readonly Row[];
    page: number;
    pageSize: number;
    pageCount: number | null;
    total: number | null;
    sort: Sort | null;
    filters: Readonly<Record<string, ColumnFilter>>;
    baseCql: string | null;
    customCql: string | null;
    filtersCql: string | null;
    cql: string | null;
    chips: readonly Chip[];
    selection: ReadonlySet<string>;
    onlySelected: boolean;
}

export type SelectMode = 'replace' | 'toggle' | 'add' | 'range';

export type DownloadFormat = 'csv' | 'json' | 'shape-zip' | 'kml' | 'gml';

export interface DownloadOptions {
    format: DownloadFormat | { outputFormat: string };
    onlySelected?: boolean;
    allColumns?: boolean;
    geometry?: boolean;
    srsName?: string;
    filename?: string;
}

export type TableEvent =
    | { type: 'schema'; schema: Schema }
    | { type: 'page'; page: number; rows: number }
    | { type: 'total'; total: number }
    | { type: 'query'; cql: string | null }
    | { type: 'selection'; ids: string[] }
    | { type: 'download'; format: string; url: string }
    | { type: 'error'; error: Error };

export type FilterLabel = (column: string, filter: ColumnFilter) => string;
