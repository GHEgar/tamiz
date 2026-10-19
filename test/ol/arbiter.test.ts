import Map from 'ol/Map.js';
import View from 'ol/View.js';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Arbiter } from '../../../urdimbre/src/arbiter/index.js';
import { createAttributeTable } from '../../src/core/index.js';
import { bindOlSelection, DEFAULT_Z_INDEX, type ArbiterLike } from '../../src/ol/index.js';
import { fakeArbiter } from '../doubles.js';
import { createFakeWfs, settle } from '../fake-wfs.js';

const square = (min: number, max: number) => ({
    type: 'Polygon', coordinates: [[[min, min], [max, min], [max, max], [min, max], [min, min]]],
});

const setup = async () => {
    const fake = createFakeWfs({ features: [{ id: 'm.1', properties: { clave: '1' }, geometry: square(-5, 5) }] });
    const table = createAttributeTable({ source: { url: 'https://x/wfs', typeName: 'ws:m', fetch: fake.fetch } });
    table.start();
    await settle();
    const map = new Map({ view: new View({ center: [0, 0], resolution: 1 }) });
    return { table, map };
};

const click = { coordinate: [0, 0] as const, pixel: [0, 0] as const, originalEvent: new MouseEvent('click') };

const mapClick = (map: Map): void => {
    map.dispatchEvent({ type: 'singleclick', coordinate: [0, 0], originalEvent: new MouseEvent('click') } as never);
};

describe('bindOlSelection with an arbiter', () => {
    it('selects only through the clicks the arbiter hands over', async () => {
        const { table, map } = await setup();
        const arbiter = fakeArbiter();
        const binding = bindOlSelection(table, map, { arbiter, hitTolerance: 1 });
        expect(arbiter.active()).toBe('table');
        expect(binding.active).toBe(true);
        mapClick(map);
        await settle();
        expect(table.getSnapshot().selection.size).toBe(0);
        arbiter.click(click);
        await settle();
        expect([...table.getSnapshot().selection]).toEqual(['m.1']);
    });

    it('steps aside when another tool claims and claims again on activate', async () => {
        const { table, map } = await setup();
        const arbiter = fakeArbiter();
        const binding = bindOlSelection(table, map, { arbiter, tool: 'rows' });
        arbiter.claim('measure', {});
        expect(binding.active).toBe(false);
        arbiter.click(click);
        await settle();
        expect(table.getSnapshot().selection.size).toBe(0);
        binding.activate();
        expect(arbiter.claims).toEqual(['rows', 'measure', 'rows']);
        binding.destroy();
        expect(arbiter.active()).toBeNull();
    });

    it('waits for activate when selectOnClick is off', async () => {
        const { table, map } = await setup();
        const arbiter = fakeArbiter();
        const binding = bindOlSelection(table, map, { arbiter, selectOnClick: false });
        expect(arbiter.claims).toEqual([]);
        binding.activate();
        binding.activate();
        expect(arbiter.claims).toEqual(['table']);
        binding.deactivate();
        expect(arbiter.active()).toBeNull();
    });

    it('accepts the urdimbre arbiter', () => {
        expectTypeOf<Arbiter>().toExtend<ArbiterLike>();
    });
});

describe('bindOlSelection without an arbiter', () => {
    it('can stop and resume listening to map clicks', async () => {
        const { table, map } = await setup();
        const binding = bindOlSelection(table, map, { hitTolerance: 1 });
        binding.deactivate();
        mapClick(map);
        await settle();
        expect(table.getSnapshot().selection.size).toBe(0);
        binding.activate();
        mapClick(map);
        await settle();
        expect([...table.getSnapshot().selection]).toEqual(['m.1']);
    });

    it('keeps the default zIndex above the tool band and takes another', async () => {
        const { table, map } = await setup();
        expect(bindOlSelection(table, map).layer.getZIndex()).toBe(DEFAULT_Z_INDEX);
        expect(bindOlSelection(table, map, { zIndex: 950 }).layer.getZIndex()).toBe(950);
    });
});
