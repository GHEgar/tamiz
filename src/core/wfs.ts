import type { ColumnFamily, Field, Row, Schema, Sort, WfsSource } from './types.js';

export class WfsError extends Error {
    readonly status: number | null;

    constructor(message: string, status: number | null = null) {
        super(message);
        this.name = 'WfsError';
        this.status = status;
    }
}

export interface GetFeatureQuery {
    cql?: string | null;
    propertyNames?: readonly string[] | null;
    sort?: Sort | null;
    startIndex?: number;
    count?: number | null;
    outputFormat?: string;
    srsName?: string | null;
    resultType?: 'results' | 'hits';
    formatOptions?: string | null;
}

export interface GeoJsonFeature {
    type: 'Feature';
    id?: string | number;
    geometry: unknown;
    properties: Record<string, unknown> | null;
}

export interface GeoJsonCollection {
    type: 'FeatureCollection';
    features: GeoJsonFeature[];
    numberMatched?: number;
    totalFeatures?: number | 'unknown';
}

const DEFAULT_MAX_URL = 4000;

const NUMBER_TYPES = new Set(['int', 'integer', 'long', 'short', 'byte', 'double', 'float', 'decimal', 'number', 'biginteger', 'bigdecimal']);
const DATE_TYPES = new Set(['date', 'datetime', 'time', 'timestamp']);
const GEOMETRY_TYPES = new Set([
    'geometry', 'point', 'multipoint', 'linestring', 'multilinestring', 'curve', 'multicurve',
    'polygon', 'multipolygon', 'surface', 'multisurface', 'geometrycollection',
]);

const localName = (type: string): string => (type.split(':').pop() ?? type).replace(/PropertyType$/, '').toLowerCase();

export const isGeometryType = (type: string): boolean => GEOMETRY_TYPES.has(localName(type));

export const familyOf = (type: string): ColumnFamily => {
    const name = localName(type);
    if (NUMBER_TYPES.has(name)) return 'number';
    if (DATE_TYPES.has(name)) return 'date';
    if (name === 'boolean') return 'boolean';
    return 'text';
};

interface DescribeProperty {
    name: string;
    type?: string;
    localType?: string;
}

export const parseSchema = (json: unknown): Schema => {
    const featureTypes = (json as { featureTypes?: { properties?: DescribeProperty[] }[] })?.featureTypes;
    const properties = featureTypes?.[0]?.properties;
    if (!Array.isArray(properties)) throw new WfsError('DescribeFeatureType returned no properties');
    const fields: Field[] = [];
    let geometryField: string | null = null;
    let geometryType: string | null = null;
    for (const property of properties) {
        const type = property.localType ?? property.type ?? 'string';
        if (isGeometryType(property.type ?? type) || isGeometryType(type)) {
            if (geometryField === null) {
                geometryField = property.name;
                geometryType = type;
            }
            continue;
        }
        fields.push({ name: property.name, type, family: familyOf(type) });
    }
    return { fields, geometryField, geometryType };
};

const baseParams = (source: WfsSource, request: string): Record<string, string> => ({
    service: 'WFS',
    version: source.version ?? '2.0.0',
    request,
    ...source.params,
});

const typeKey = (source: WfsSource): string => (source.version === '1.1.0' ? 'typeName' : 'typeNames');

export const sortParam = (sort: Sort, version: string): string => {
    const modern = version !== '1.1.0';
    const direction = sort.direction === 'desc' ? (modern ? 'DESC' : 'D') : (modern ? 'ASC' : 'A');
    return `${sort.field} ${direction}`;
};

export const describeParams = (source: WfsSource): Record<string, string> => ({
    ...baseParams(source, 'DescribeFeatureType'),
    [typeKey(source)]: source.typeName,
    outputFormat: 'application/json',
});

export const getFeatureParams = (source: WfsSource, query: GetFeatureQuery): Record<string, string> => {
    const version = source.version ?? '2.0.0';
    const params: Record<string, string> = {
        ...baseParams(source, 'GetFeature'),
        [typeKey(source)]: source.typeName,
    };
    if (query.resultType === 'hits') params.resultType = 'hits';
    else params.outputFormat = query.outputFormat ?? 'application/json';
    if (query.cql) params.CQL_FILTER = query.cql;
    if (query.propertyNames && query.propertyNames.length > 0) params.propertyName = query.propertyNames.join(',');
    if (query.sort) params.sortBy = sortParam(query.sort, version);
    if (query.startIndex && query.startIndex > 0) params.startIndex = String(query.startIndex);
    if (query.count !== null && query.count !== undefined) params[version === '1.1.0' ? 'maxFeatures' : 'count'] = String(query.count);
    if (query.srsName) params.srsName = query.srsName;
    if (query.formatOptions) params.format_options = query.formatOptions;
    return params;
};

export const buildUrl = (source: WfsSource, params: Record<string, string>): string => {
    const separator = source.url.includes('?') ? (source.url.endsWith('?') || source.url.endsWith('&') ? '' : '&') : '?';
    return `${source.url}${separator}${new URLSearchParams(params).toString()}`;
};

export const exceptionText = (body: string): string | null => {
    const match = body.match(/<(?:ows:)?ExceptionText>([\s\S]*?)<\/(?:ows:)?ExceptionText>/)
        ?? body.match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/);
    return match?.[1]?.trim() ?? null;
};

export const send = async (source: WfsSource, params: Record<string, string>, signal?: AbortSignal): Promise<Response> => {
    const fetcher = source.fetch ?? globalThis.fetch.bind(globalThis);
    const url = buildUrl(source, params);
    const init: RequestInit = { headers: { ...source.headers } };
    if (signal) init.signal = signal;
    let target = url;
    if (url.length > (source.maxUrlLength ?? DEFAULT_MAX_URL)) {
        target = source.url;
        init.method = 'POST';
        init.body = new URLSearchParams(params).toString();
        init.headers = { ...source.headers, 'Content-Type': 'application/x-www-form-urlencoded' };
    }
    const response = await fetcher(target, init);
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new WfsError(exceptionText(body) ?? `WFS request failed with HTTP ${response.status}`, response.status);
    }
    return response;
};

const readJson = async (response: Response): Promise<unknown> => {
    const body = await response.text();
    try {
        return JSON.parse(body);
    } catch {
        throw new WfsError(exceptionText(body) ?? 'WFS response is not JSON', response.status);
    }
};

export const describe = async (source: WfsSource, signal?: AbortSignal): Promise<Schema> =>
    parseSchema(await readJson(await send(source, describeParams(source), signal)));

export const getCollection = async (source: WfsSource, query: GetFeatureQuery, signal?: AbortSignal): Promise<GeoJsonCollection> => {
    const json = await readJson(await send(source, getFeatureParams(source, query), signal)) as GeoJsonCollection;
    if (!json || !Array.isArray(json.features)) throw new WfsError('WFS response is not a FeatureCollection');
    return json;
};

export const toRows = (collection: GeoJsonCollection, idField: string | null): Row[] =>
    collection.features.map((feature, index) => {
        const properties = feature.properties ?? {};
        const raw = idField ? properties[idField] : feature.id;
        return { id: String(raw ?? index), properties };
    });

export const matchedOf = (collection: GeoJsonCollection): number | null => {
    if (typeof collection.numberMatched === 'number') return collection.numberMatched;
    if (typeof collection.totalFeatures === 'number') return collection.totalFeatures;
    return null;
};

export const parseHits = (body: string): number => {
    const match = body.match(/\bnumberMatched="(\d+)"/) ?? body.match(/\bnumberOfFeatures="(\d+)"/);
    if (!match) throw new WfsError(exceptionText(body) ?? 'WFS hits response has no count');
    return Number(match[1]);
};

export const hits = async (source: WfsSource, cql: string | null, signal?: AbortSignal): Promise<number> => {
    const response = await send(source, getFeatureParams(source, { cql, resultType: 'hits' }), signal);
    return parseHits(await response.text());
};
