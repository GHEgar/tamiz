import { describe, expect, it } from 'vitest';
import { aggregateCountXml, createAttributeTable, type DistinctQuery, type FetchLike } from '../../src/core/index.js';
import { createFakeWfs, settle } from '../fake-wfs.js';

const NAMES = ['b', 'a', 'b', '', 'c', 'b', 'a'];

const setup = (distinct?: Parameters<typeof createAttributeTable>[0]['distinct']) => {
    const fake = createFakeWfs({ features: NAMES.map((nombre, index) => ({ id: `m.${index}`, properties: { nombre, poblacion: index } })) });
    const table = createAttributeTable({
        source: { url: 'https://x/geoserver/wfs', typeName: 'ws:m', fetch: fake.fetch },
        ...(distinct ? { distinct } : {}),
    });
    return { fake, table };
};

describe('distinct values with counts', () => {
    it('counts each value while scanning', async () => {
        const { table } = setup();
        expect(await table.fetchDistinct('nombre', { counts: true }))
            .toEqual({ values: ['a', 'b', 'c'], counts: [2, 3, 1], complete: true });
        expect(await table.fetchDistinct('nombre')).toEqual({ values: ['a', 'b', 'c'], complete: true });
    });

    it('orders by count and keeps each count with its value after a search', async () => {
        const { table } = setup();
        table.start();
        await settle();
        expect(await table.fetchDistinct('nombre', { counts: true, order: 'count' }))
            .toEqual({ values: ['b', 'a', 'c'], counts: [3, 2, 1], complete: true });
        const numbers = await table.fetchDistinct('poblacion', { counts: true, search: '1' });
        expect(numbers).toEqual({ values: [1], counts: [1], complete: true });
    });

    it('asks gs:Aggregate grouped by the column through WPS', async () => {
        const calls: string[] = [];
        const fetch: FetchLike = async (_url, init) => {
            calls.push(String(init?.body));
            return new Response(JSON.stringify({
                AggregationAttribute: 'nombre',
                AggregationFunctions: ['Count'],
                GroupByAttributes: ['nombre'],
                AggregationResults: [['Tala', 4], [null, 2], ['Ameca', 7], ['Zapopan', 1]],
            }));
        };
        const table = createAttributeTable({
            source: { url: 'https://x/geoserver/wfs', typeName: 'ws:m', fetch },
            baseCql: 'activo = true',
            distinct: 'wps',
        });
        expect(await table.fetchDistinct('nombre', { counts: true, limit: 2 }))
            .toEqual({ values: ['Ameca', 'Tala'], counts: [7, 4], complete: false });
        expect(calls[0]).toContain('<ows:Identifier>gs:Aggregate</ows:Identifier>');
        expect(calls[0]).toContain('<ows:Identifier>groupByAttributes</ows:Identifier><wps:Data><wps:LiteralData>nombre</wps:LiteralData>');
        expect(calls[0]).toContain('CQL_FILTER=activo%20%3D%20true');
    });

    it('rejects an aggregate answer without results', async () => {
        const fetch: FetchLike = async () => new Response(JSON.stringify({ values: [] }));
        const table = createAttributeTable({ source: { url: 'https://x/wfs', typeName: 't', fetch }, distinct: 'wps' });
        await expect(table.fetchDistinct('a', { counts: true })).rejects.toThrow('WPS request failed');
        expect(aggregateCountXml('t', { column: 'a&b', cql: null })).toContain('a&amp;b');
    });

    it('passes counts to a provider of its own and drops counts that do not line up', async () => {
        const seen: DistinctQuery[] = [];
        const { table } = setup(async query => {
            seen.push(query);
            return seen.length === 1
                ? { values: ['y', 'x'], counts: [1, 5], complete: true }
                : { values: ['y', 'x'], counts: [1], complete: true };
        });
        expect(await table.fetchDistinct('nombre', { counts: true })).toEqual({ values: ['x', 'y'], counts: [5, 1], complete: true });
        expect(seen[0]?.counts).toBe(true);
        expect(await table.fetchDistinct('nombre', { counts: true })).toEqual({ values: ['x', 'y'], complete: true });
    });
});
