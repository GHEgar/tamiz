import { describe, expect, it } from 'vitest';
import { createAttributeTable, pagedUniqueXml, wpsUrl, type DistinctQuery, type FetchLike } from '../../src/core/index.js';
import { createFakeWfs, settle } from '../fake-wfs.js';

const REGIONS = ['Pacific', 'Mtn', 'Pacific', '', 'E N Cen', 'Mtn'];

const regionFeatures = () => REGIONS.map((region, index) => ({
    id: `municipios.${index + 1}`,
    properties: { clave: String(index), nombre: region, poblacion: index % 3, fecha: '2026-01-01' },
}));

const setup = (distinct?: Parameters<typeof createAttributeTable>[0]['distinct']) => {
    const fake = createFakeWfs({ features: regionFeatures() });
    const table = createAttributeTable({
        source: { url: 'https://x/geoserver/wfs', typeName: 'ws:municipios', fetch: fake.fetch },
        ...(distinct ? { distinct } : {}),
    });
    return { fake, table };
};

describe('fetchDistinct', () => {
    it('scans one sorted column and removes repeated and blank values', async () => {
        const { fake, table } = setup();
        const result = await table.fetchDistinct('nombre');
        expect(result).toEqual({ values: ['E N Cen', 'Mtn', 'Pacific'], complete: true });
        const params = fake.last()?.params;
        expect(params?.propertyName).toBe('nombre');
        expect(params?.sortBy).toBe('nombre ASC');
        expect(params?.count).toBe('1000');
    });

    it('reports an incomplete scan when the page is full or the limit cuts it', async () => {
        const { table } = setup();
        expect((await table.fetchDistinct('nombre', { scanSize: 6 })).complete).toBe(false);
        expect(await table.fetchDistinct('nombre', { limit: 2 })).toEqual({ values: ['E N Cen', 'Mtn'], complete: false });
    });

    it('applies the table query without the column own filter and searches text on the server', async () => {
        const { fake, table } = setup();
        table.start();
        await settle();
        table.setBaseCql('activo = true');
        table.setFilter('nombre', { kind: 'list', values: ['Mtn'] });
        table.setFilter('poblacion', { kind: 'number', op: 'gt', value: 0 });
        const scans = () => fake.requests.filter(request => request.params.propertyName === 'nombre');
        await table.fetchDistinct('nombre', { search: '50%' });
        expect(scans().at(-1)?.params.CQL_FILTER).toBe("((activo = true) AND (poblacion > 0)) AND (nombre ILIKE '%50\\%%')");
        await table.fetchDistinct('nombre', { applyQuery: false });
        expect(scans().at(-1)?.params.CQL_FILTER).toBeUndefined();
    });

    it('filters non text columns on the client and sorts numbers', async () => {
        const { fake, table } = setup();
        table.start();
        await settle();
        expect(await table.fetchDistinct('poblacion')).toEqual({ values: [0, 1, 2], complete: true });
        expect((await table.fetchDistinct('poblacion', { search: '2' })).values).toEqual([2]);
        expect(fake.last()?.params.CQL_FILTER).toBeUndefined();
    });

    it('accepts a provider of its own', async () => {
        const seen: DistinctQuery[] = [];
        const { table } = setup(async query => {
            seen.push(query);
            return { values: ['b', 'a'], complete: true };
        });
        expect(await table.fetchDistinct('nombre', { limit: 5, search: ' a ' })).toEqual({ values: ['a'], complete: true });
        expect(seen[0]).toMatchObject({ column: 'nombre', search: 'a', limit: 5, scanSize: 1000 });
    });

    it('asks gs:PagedUnique through WPS', async () => {
        const calls: { url: string; init: RequestInit | undefined }[] = [];
        const fetch: FetchLike = async (url, init) => {
            calls.push({ url, init });
            return new Response(JSON.stringify({ featureTypeName: 'municipios', fieldName: 'nombre', size: 3, values: ['Mtn', 'E N Cen'] }));
        };
        const table = createAttributeTable({
            source: { url: 'https://x/geoserver/wfs', typeName: 'ws:municipios', fetch, params: { authkey: 'k' } },
            baseCql: "tipo = 'a&b'",
            distinct: 'wps',
        });
        expect(await table.fetchDistinct('nombre', { limit: 2 })).toEqual({ values: ['E N Cen', 'Mtn'], complete: false });
        expect(calls[0]?.url).toBe('https://x/geoserver/wps?authkey=k');
        expect(calls[0]?.init?.method).toBe('POST');
        const body = String(calls[0]?.init?.body);
        expect(body).toContain('<ows:Identifier>gs:PagedUnique</ows:Identifier>');
        expect(body).toContain('typeName=ws%3Amunicipios&amp;CQL_FILTER=tipo%20%3D%20&apos;a%26b&apos;');
        expect(body).toContain('<wps:LiteralData>2</wps:LiteralData>');
    });

    it('turns a WPS exception into an error', async () => {
        const fetch: FetchLike = async () => new Response('<ows:ExceptionReport><ows:ExceptionText>No WPS</ows:ExceptionText></ows:ExceptionReport>');
        const table = createAttributeTable({ source: { url: 'https://x/wfs', typeName: 't', fetch }, distinct: 'wps' });
        await expect(table.fetchDistinct('a')).rejects.toThrow('No WPS');
    });

    it('derives the WPS endpoint from the WFS one', () => {
        expect(wpsUrl({ url: 'https://x/geoserver/wfs', typeName: 't' })).toBe('https://x/geoserver/wps');
        expect(wpsUrl({ url: 'https://x/geoserver/ows', typeName: 't' })).toBe('https://x/geoserver/ows');
        expect(wpsUrl({ url: 'https://x/wfs', typeName: 't', wpsUrl: 'https://y/wps' })).toBe('https://y/wps');
        expect(pagedUniqueXml('t', { column: 'a<b', cql: null, limit: 1 })).toContain('a&lt;b');
    });
});
