import type { Scalar, WfsSource } from './types.js';
import { WfsError, buildUrl, exceptionText } from './wfs.js';

export interface UniqueRequest {
    column: string;
    cql: string | null;
    limit: number;
    signal?: AbortSignal | undefined;
}

export interface UniqueResult {
    values: Scalar[];
    size: number;
}

const XML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

const escapeXml = (value: string): string => value.replace(/[&<>"']/g, char => XML_ENTITIES[char] ?? char);

export const wpsUrl = (source: WfsSource): string =>
    source.wpsUrl ?? source.url.replace(/\/wfs(?=\?|$)/i, '/wps');

export const featuresReference = (typeName: string, cql: string | null): string => {
    const params: [string, string][] = [['service', 'WFS'], ['version', '1.0.0'], ['request', 'GetFeature'], ['typeName', typeName]];
    if (cql) params.push(['CQL_FILTER', cql]);
    return `http://geoserver/wfs?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
};

const literalInput = (name: string, value: string): string =>
    `<wps:Input><ows:Identifier>${name}</ows:Identifier><wps:Data><wps:LiteralData>${escapeXml(value)}</wps:LiteralData></wps:Data></wps:Input>`;

export const pagedUniqueXml = (typeName: string, request: UniqueRequest): string => [
    '<wps:Execute version="1.0.0" service="WPS" xmlns:wps="http://www.opengis.net/wps/1.0.0"',
    ' xmlns:ows="http://www.opengis.net/ows/1.1" xmlns:xlink="http://www.w3.org/1999/xlink">',
    '<ows:Identifier>gs:PagedUnique</ows:Identifier><wps:DataInputs>',
    '<wps:Input><ows:Identifier>features</ows:Identifier>',
    `<wps:Reference mimeType="text/xml" xlink:href="${escapeXml(featuresReference(typeName, request.cql))}" method="GET"/>`,
    '</wps:Input>',
    literalInput('fieldName', request.column),
    literalInput('maxFeatures', String(request.limit)),
    '</wps:DataInputs><wps:ResponseForm><wps:RawDataOutput mimeType="application/json">',
    '<ows:Identifier>result</ows:Identifier></wps:RawDataOutput></wps:ResponseForm></wps:Execute>',
].join('');

const parseJson = (body: string): { values?: unknown; size?: unknown } | null => {
    try {
        return JSON.parse(body) as { values?: unknown; size?: unknown };
    } catch {
        return null;
    }
};

export const pagedUnique = async (source: WfsSource, request: UniqueRequest): Promise<UniqueResult> => {
    const fetcher = source.fetch ?? globalThis.fetch.bind(globalThis);
    const params = source.params ?? {};
    const base = wpsUrl(source);
    const url = Object.keys(params).length > 0 ? buildUrl({ ...source, url: base }, params) : base;
    const init: RequestInit = {
        method: 'POST',
        headers: { ...source.headers, 'Content-Type': 'text/xml' },
        body: pagedUniqueXml(source.typeName, request),
    };
    if (request.signal) init.signal = request.signal;
    const response = await fetcher(url, init);
    const body = await response.text();
    const json = parseJson(body);
    if (!response.ok || !json || !Array.isArray(json.values)) {
        throw new WfsError(exceptionText(body) ?? `WPS request failed with HTTP ${response.status}`, response.status);
    }
    const values = json.values as Scalar[];
    return { values, size: typeof json.size === 'number' ? json.size : values.length };
};
