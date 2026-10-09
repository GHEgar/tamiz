import { describe as group, expect, it } from 'vitest';
import { WfsError, buildUrl, familyOf, getFeatureParams, hits, parseHits, parseSchema, toRows } from '../../src/core/index.js';
import { createFakeWfs, DESCRIBE } from '../fake-wfs.js';

const source = { url: 'https://example.org/geoserver/wfs', typeName: 'ws:municipios' };

group('wfs', () => {
    it('infers families from xsd types', () => {
        expect(familyOf('xsd:int')).toBe('number');
        expect(familyOf('double')).toBe('number');
        expect(familyOf('xsd:dateTime')).toBe('date');
        expect(familyOf('boolean')).toBe('boolean');
        expect(familyOf('xsd:string')).toBe('text');
    });

    it('parses DescribeFeatureType JSON and keeps the geometry apart', () => {
        const schema = parseSchema(DESCRIBE);
        expect(schema.fields.map(field => field.name)).toEqual(['clave', 'nombre', 'poblacion', 'fecha']);
        expect(schema.geometryField).toBe('geom');
        expect(schema.geometryType).toBe('MultiPolygon');
        expect(() => parseSchema({})).toThrow(WfsError);
    });

    it('builds 2.0.0 GetFeature params', () => {
        const params = getFeatureParams(source, {
            cql: "a = 'x'", propertyNames: ['a', 'b'], sort: { field: 'a', direction: 'desc' }, startIndex: 200, count: 100,
        });
        expect(params).toMatchObject({
            service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: 'ws:municipios',
            outputFormat: 'application/json', CQL_FILTER: "a = 'x'", propertyName: 'a,b', sortBy: 'a DESC',
            startIndex: '200', count: '100',
        });
    });

    it('builds 1.1.0 GetFeature params', () => {
        const params = getFeatureParams({ ...source, version: '1.1.0' }, { sort: { field: 'a', direction: 'asc' }, count: 5 });
        expect(params).toMatchObject({ typeName: 'ws:municipios', sortBy: 'a A', maxFeatures: '5' });
        expect(params.startIndex).toBeUndefined();
    });

    it('appends to urls that already carry a query', () => {
        expect(buildUrl({ ...source, url: 'https://x/wfs?token=1' }, { a: 'b' })).toBe('https://x/wfs?token=1&a=b');
        expect(buildUrl(source, { a: 'b c' })).toBe('https://example.org/geoserver/wfs?a=b+c');
    });

    it('reads hits for both versions', () => {
        expect(parseHits('<wfs:FeatureCollection numberMatched="42" numberReturned="0"/>')).toBe(42);
        expect(parseHits('<wfs:FeatureCollection numberOfFeatures="7"/>')).toBe(7);
        expect(() => parseHits('<x/>')).toThrow(WfsError);
    });

    it('takes row ids from the feature id or an attribute', () => {
        const collection = { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, id: 'm.1', geometry: null, properties: { clave: '001' } }] };
        expect(toRows(collection, null)[0]?.id).toBe('m.1');
        expect(toRows(collection, 'clave')[0]?.id).toBe('001');
    });

    it('switches to POST when the url is too long and surfaces exception text', async () => {
        const fake = createFakeWfs({ fail: params => (params.CQL_FILTER?.startsWith('bad') ? 'Could not parse CQL' : null) });
        await hits({ ...source, fetch: fake.fetch, maxUrlLength: 50 }, 'a = 1');
        expect(fake.requests.at(-1)?.method).toBe('POST');
        await expect(hits({ ...source, fetch: fake.fetch }, 'bad cql')).rejects.toThrow('Could not parse CQL');
    });
});
