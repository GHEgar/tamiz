import Map from 'ol/Map.js';
import View from 'ol/View.js';
import { describe, expect, it } from 'vitest';
import { createAttributeTable } from '../../src/core/index.js';
import { bindOlSelection, clickExtent, type OlSelectionOptions } from '../../src/ol/index.js';
import { createFakeWfs, settle } from '../fake-wfs.js';

const setup = () => {
    const fake = createFakeWfs();
    const table = createAttributeTable({ source: { url: 'https://x/wfs', typeName: 'ws:municipios', fetch: fake.fetch } });
    const map = new Map({ view: new View({ center: [0, 0], zoom: 2 }) });
    return { fake, table, map };
};

describe('bindOlSelection', () => {
    it('computes a click extent from resolution and tolerance', () => {
        expect(clickExtent([100, 200], 2, 4)).toEqual([92, 192, 108, 208]);
    });

    it('adds its layer and fetches geometries of the selection in the map projection', async () => {
        const { fake, table, map } = setup();
        const binding = bindOlSelection(table, map);
        expect(map.getLayers().getArray()).toContain(binding.layer);
        table.select(['municipios.1', 'municipios.2']);
        await settle();
        await binding.sync();
        const request = fake.last()?.params;
        expect(request?.CQL_FILTER).toBe("IN ('municipios.1', 'municipios.2')");
        expect(request?.srsName).toBe('EPSG:3857');
        expect(binding.source.getFeatures()).toHaveLength(2);
        table.select('municipios.2', 'toggle');
        await settle();
        expect(binding.source.getFeatures().map(feature => feature.getId())).toEqual(['municipios.1']);
    });

    it('selects through map clicks with the table query applied', async () => {
        const { fake, table, map } = setup();
        table.start();
        await settle();
        table.setFilter('poblacion', { kind: 'number', op: 'gt', value: 5 });
        bindOlSelection(table, map, { hitTolerance: 1 });
        map.dispatchEvent({ type: 'singleclick', coordinate: [0, 0], originalEvent: new MouseEvent('click') } as never);
        await settle();
        const request = fake.requests.find(item => item.params.CQL_FILTER?.includes('BBOX'))?.params;
        expect(request?.CQL_FILTER).toMatch(/^\(poblacion > 5\) AND \(BBOX\(geom, .+'EPSG:3857'\)\)$/);
        expect(request?.count).toBe('50');
    });

    const square = (min: number, max: number) => ({
        type: 'Polygon', coordinates: [[[min, min], [max, min], [max, max], [min, max], [min, min]]],
    });

    const clickOn = async (pick: OlSelectionOptions['pick']) => {
        const fake = createFakeWfs({
            features: [
                { id: 'm.1', properties: { clave: '1' }, geometry: square(-10, 10) },
                { id: 'm.2', properties: { clave: '2' }, geometry: square(-5, 5) },
                { id: 'm.3', properties: { clave: '3' }, geometry: square(100, 110) },
            ],
        });
        const table = createAttributeTable({ source: { url: 'https://x/wfs', typeName: 'ws:m', fetch: fake.fetch } });
        table.start();
        await settle();
        const map = new Map({ view: new View({ center: [0, 0], resolution: 1 }) });
        const binding = bindOlSelection(table, map, { hitTolerance: 1, ...(pick ? { pick } : {}) });
        map.dispatchEvent({ type: 'singleclick', coordinate: [0, 0], originalEvent: new MouseEvent('click') } as never);
        await settle();
        return { table, binding };
    };

    it('picks the feature drawn on top, the last one that touches the click', async () => {
        const { table, binding } = await clickOn(undefined);
        expect([...table.getSnapshot().selection]).toEqual(['m.2']);
        expect(binding.source.getFeatures().map(feature => feature.getId())).toEqual(['m.2']);
    });

    it('picks every touched feature or lets a function choose', async () => {
        expect([...(await clickOn('all')).table.getSnapshot().selection]).toEqual(['m.1', 'm.2']);
        const { table } = await clickOn(features => features.slice(0, 1));
        expect([...table.getSnapshot().selection]).toEqual(['m.1']);
    });

    it('zooms to the selection and cleans up on destroy', async () => {
        const { table, map } = setup();
        map.setSize([400, 300]);
        const binding = bindOlSelection(table, map, { fit: { duration: 0 } });
        expect(binding.zoomToSelection()).toBe(false);
        table.select(['municipios.2', 'municipios.5']);
        await settle();
        expect(binding.zoomToSelection()).toBe(true);
        expect(map.getView().getCenter()).toEqual([25, 25]);
        binding.destroy();
        expect(map.getLayers().getArray()).not.toContain(binding.layer);
    });
});
