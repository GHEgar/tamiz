import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Arbiter } from '../../../urdimbre/src/arbiter/index.js';
import { createAttributeTable } from '../../src/core/index.js';
import { bindMapLibreSelection, pickCandidates, type ArbiterLike } from '../../src/maplibre/index.js';
import { fakeArbiter } from '../doubles.js';
import { featuresOf, fakeMapLibre } from '../fake-maplibre.js';
import { createFakeWfs, settle } from '../fake-wfs.js';

const features = [
    { id: 'm.1', properties: { clave: 'a' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    { id: 'm.2', properties: { clave: 'b' }, geometry: { type: 'Point', coordinates: [1, 1] } },
];

const setup = (idField: string | null = null) => {
    const fake = createFakeWfs({ features });
    const table = createAttributeTable({ source: { url: 'https://x/wfs', typeName: 'ws:m', fetch: fake.fetch }, idField });
    return { fake, table, map: fakeMapLibre() };
};

const ctrl = new MouseEvent('click', { ctrlKey: true });

describe('bindMapLibreSelection clicks', () => {
    it('asks the WFS for a mercator BBOX with the table query and takes the one on top', async () => {
        const { fake, table, map } = setup();
        table.start();
        await settle();
        table.setFilter('clave', { kind: 'text', op: 'equals', value: 'b' });
        const binding = bindMapLibreSelection(table, map, { hitTolerance: 2, zoomOnSelect: true });
        map.click(500, 500);
        await settle();
        const request = fake.requests.find(item => item.params.CQL_FILTER?.includes('BBOX'))?.params;
        expect(request?.CQL_FILTER).toMatch(/^\(clave ILIKE 'b'\) AND \(BBOX\(geom, .+'EPSG:3857'\)\)$/);
        expect(request?.srsName).toBe('EPSG:3857');
        expect(request?.count).toBe('50');
        expect([...table.getSnapshot().selection]).toEqual(['m.2']);
        await binding.sync();
        expect(featuresOf(map).map(feature => feature.id)).toEqual(['m.2']);
        expect(fake.requests.filter(item => item.params.CQL_FILTER?.startsWith('IN'))).toHaveLength(0);
        expect(map.fits).toHaveLength(0);
    });

    it('toggles with modifiers and keeps the selection on an empty toggle', async () => {
        const { table, map } = setup();
        bindMapLibreSelection(table, map, { pick: 'all' });
        map.click(500, 500);
        await settle();
        expect([...table.getSnapshot().selection]).toEqual(['m.2', 'm.1']);
        map.click(500, 500, ctrl);
        await settle();
        expect(table.getSnapshot().selection.size).toBe(0);
    });

    it('queries the rendered layers instead of the WFS', async () => {
        const { fake, table, map } = setup('clave');
        map.rendered = [
            { id: 7, properties: { clave: 'b' } },
            { id: 7, properties: { clave: 'b' } },
            { properties: { clave: 'a' } },
            { properties: null },
        ];
        const seen: string[][] = [];
        bindMapLibreSelection(table, map, {
            queryLayers: ['points'],
            pick: (candidates, lngLat) => {
                seen.push(candidates.map(candidate => candidate.id));
                expect(lngLat).toEqual([0.1, -0.1]);
                return candidates;
            },
        });
        map.click(510, 510);
        await settle();
        expect(map.queries).toEqual([{ geometry: [[506, 506], [514, 514]], layers: ['points'] }]);
        expect(seen).toEqual([['b', 'a']]);
        expect([...table.getSnapshot().selection]).toEqual(['b', 'a']);
        expect(fake.requests.some(item => item.params.CQL_FILTER?.includes('BBOX'))).toBe(false);
    });

    it('picks the first candidate by default', () => {
        const candidates = [{ id: 'top', properties: {} }, { id: 'below', properties: {} }];
        expect(pickCandidates(candidates, [0, 0], undefined)).toEqual([candidates[0]]);
        expect(pickCandidates(candidates, [0, 0], 'all')).toEqual(candidates);
    });

    it('attaches and detaches the click listener', () => {
        const { table, map } = setup();
        const binding = bindMapLibreSelection(table, map, { selectOnClick: false });
        expect(binding.active).toBe(false);
        expect(map.clicks).toBe(0);
        binding.activate();
        binding.activate();
        expect(map.clicks).toBe(1);
        binding.deactivate();
        expect(map.clicks).toBe(0);
        binding.activate();
        binding.destroy();
        expect(map.clicks).toBe(0);
    });
});

describe('bindMapLibreSelection with an arbiter', () => {
    const pointer = { coordinate: [0, 0] as const, pixel: [500, 500] as const, originalEvent: new MouseEvent('click') };

    it('accepts the urdimbre arbiter', () => {
        expectTypeOf<Arbiter>().toExtend<ArbiterLike>();
    });

    it('selects only through the clicks the arbiter hands over', async () => {
        const { table, map } = setup();
        const arbiter = fakeArbiter();
        const binding = bindMapLibreSelection(table, map, { arbiter, tool: 'rows' });
        expect(arbiter.active()).toBe('rows');
        expect(map.clicks).toBe(0);
        arbiter.click(pointer);
        await settle();
        expect([...table.getSnapshot().selection]).toEqual(['m.2']);
        arbiter.claim('measure', {});
        expect(binding.active).toBe(false);
        binding.activate();
        expect(arbiter.claims).toEqual(['rows', 'measure', 'rows']);
        binding.destroy();
        expect(arbiter.active()).toBeNull();
    });
});
