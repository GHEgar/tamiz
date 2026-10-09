import type { FetchLike } from '../src/core/index.js';

export interface FakeRequest {
    method: string;
    params: Record<string, string>;
}

export interface FakeWfsOptions {
    features?: { id: string; properties: Record<string, unknown>; geometry?: unknown }[];
    numberMatched?: boolean;
    fail?: (params: Record<string, string>) => string | null;
}

export const DESCRIBE = {
    featureTypes: [{
        typeName: 'municipios',
        properties: [
            { name: 'clave', type: 'xsd:string', localType: 'string' },
            { name: 'nombre', type: 'xsd:string', localType: 'string' },
            { name: 'poblacion', type: 'xsd:int', localType: 'int' },
            { name: 'fecha', type: 'xsd:date', localType: 'date' },
            { name: 'geom', type: 'gml:MultiPolygon', localType: 'MultiPolygon' },
        ],
    }],
};

export const sampleFeatures = (count: number) => Array.from({ length: count }, (_, index) => ({
    id: `municipios.${index + 1}`,
    properties: { clave: String(index + 1).padStart(3, '0'), nombre: `M${index + 1}`, poblacion: index * 10, fecha: '2026-01-01' },
    geometry: { type: 'Point', coordinates: [index * 10, index * 10] },
}));

export const createFakeWfs = (options: FakeWfsOptions = {}) => {
    const requests: FakeRequest[] = [];
    const features = options.features ?? sampleFeatures(250);
    const fetch: FetchLike = async (input, init) => {
        const method = init?.method ?? 'GET';
        const query = method === 'POST' ? String(init?.body ?? '') : input.split('?')[1] ?? '';
        const params = Object.fromEntries(new URLSearchParams(query));
        requests.push({ method, params });
        await Promise.resolve();
        if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const failure = options.fail?.(params);
        if (failure) {
            return new Response(`<ows:ExceptionReport><ows:Exception><ows:ExceptionText>${failure}</ows:ExceptionText></ows:Exception></ows:ExceptionReport>`, { status: 400 });
        }
        if (params.request === 'DescribeFeatureType') return new Response(JSON.stringify(DESCRIBE));
        if (params.resultType === 'hits') return new Response(`<wfs:FeatureCollection numberMatched="${features.length}" numberReturned="0"/>`);
        const start = Number(params.startIndex ?? 0);
        const count = Number(params.count ?? params.maxFeatures ?? features.length);
        const page = features.slice(start, start + count).map(feature => ({ type: 'Feature', ...feature }));
        const body: Record<string, unknown> = { type: 'FeatureCollection', features: page };
        if (options.numberMatched) body.numberMatched = features.length;
        return new Response(JSON.stringify(body));
    };
    const last = (request = 'GetFeature'): FakeRequest | undefined =>
        [...requests].reverse().find(item => item.params.request === request && item.params.resultType !== 'hits');
    return { fetch, requests, last };
};

export const settle = async (): Promise<void> => {
    for (let index = 0; index < 10; index += 1) await new Promise(resolve => setTimeout(resolve, 0));
};
