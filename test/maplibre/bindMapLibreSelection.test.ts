import type { Map as MapLibreMap } from 'maplibre-gl';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createAttributeTable } from '../../src/core/index.js';
import {
    bindMapLibreSelection, boundsOf, clickBox, DEFAULT_LAYERS, toLngLat, toMercator, type MapLibreMapLike,
} from '../../src/maplibre/index.js';
import { featuresOf, fakeMapLibre } from '../fake-maplibre.js';
import { createFakeWfs, settle } from '../fake-wfs.js';

const point = (x: number, y: number) => ({ type: 'Point', coordinates: [x, y] });

const setup = (features = [
    { id: 'm.1', properties: { clave: 'a' }, geometry: point(0, 0) },
    { id: 'm.2', properties: { clave: 'b' }, geometry: point(toMercator([10, 0])[0], toMercator([0, 10])[1]) },
]) => {
    const fake = createFakeWfs({ features });
    const table = createAttributeTable({ source: { url: 'https://x/wfs', typeName: 'ws:m', fetch: fake.fetch } });
    return { fake, table, map: fakeMapLibre() };
};

describe('maplibre geometry helpers', () => {
    it('goes to web mercator and back', () => {
        const [lng, lat] = toLngLat(toMercator([-103.35, 20.67]));
        expect(lng).toBeCloseTo(-103.35, 9);
        expect(lat).toBeCloseTo(20.67, 9);
        expect(toMercator([180, 0])[0]).toBeCloseTo(20037508.34, 2);
    });

    it('builds a pixel box and its mercator extent around a click', () => {
        const box = clickBox({ unproject: ([x, y]) => ({ lng: x, lat: -y }) }, [10, 20], 4);
        expect(box.pixels).toEqual([[6, 16], [14, 24]]);
        expect(box.extent).toEqual([...toMercator([6, -24]), ...toMercator([14, -16])]);
    });

    it('bounds nested geometries and collections', () => {
        expect(boundsOf([
            { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 3], [0, 0]]] },
            { type: 'GeometryCollection', geometries: [point(-1, 5)] },
        ])).toEqual([[-1, 0], [2, 5]]);
        expect(boundsOf([null])).toBeNull();
    });
});

describe('bindMapLibreSelection', () => {
    it('fits the maplibre map type', () => {
        expectTypeOf<MapLibreMap>().toExtend<MapLibreMapLike>();
    });

    it('draws the selected geometries in its own geojson source in lng/lat', async () => {
        const { fake, table, map } = setup();
        const binding = bindMapLibreSelection(table, map, { beforeId: 'labels' });
        expect(map.sources.size).toBe(0);
        table.select(['m.1', 'm.2']);
        await binding.sync();
        const request = fake.last()?.params;
        expect(request?.CQL_FILTER).toBe("IN ('m.1', 'm.2')");
        expect(request?.srsName).toBe('EPSG:3857');
        expect(binding.sourceId).toBe('tamiz-selection');
        expect(map.layers.map(entry => entry.layer.id)).toEqual(binding.layerIds);
        expect(map.layers.map(entry => entry.layer.type)).toEqual(DEFAULT_LAYERS.map(layer => layer.type));
        expect(map.layers.every(entry => entry.beforeId === undefined)).toBe(true);
        const [first, second] = featuresOf(map);
        expect(first?.id).toBe('m.1');
        const [lng, lat] = (second?.geometry as { coordinates: number[] }).coordinates;
        expect(lng).toBeCloseTo(10, 9);
        expect(lat).toBeCloseTo(10, 9);
        const fetched = fake.requests.length;
        table.select('m.2', 'toggle');
        await binding.sync();
        expect(featuresOf(map).map(feature => feature.id)).toEqual(['m.1']);
        expect(fake.requests).toHaveLength(fetched);
        binding.destroy();
        expect(map.sources.size).toBe(0);
        expect(map.layers).toHaveLength(0);
    });

    it('uses custom layers, source id and an existing beforeId', async () => {
        const { table, map } = setup();
        map.addLayer({ id: 'labels', type: 'background' });
        const binding = bindMapLibreSelection(table, map, {
            sourceId: 'rows', beforeId: 'labels', layers: [{ id: 'rows-line', type: 'line', paint: { 'line-color': '#000' } }],
        });
        table.select('m.1');
        await binding.sync();
        expect(map.sources.has('rows')).toBe(true);
        expect(map.layers.at(-1)).toEqual({ layer: { id: 'rows-line', type: 'line', source: 'rows', paint: { 'line-color': '#000' } }, beforeId: 'labels' });
    });

    it('marks feature-state without asking for geometries', async () => {
        const { fake, table, map } = setup();
        const binding = bindMapLibreSelection(table, map, {
            highlight: { source: 'states', key: 'picked', featureId: id => Number(id.split('.')[1]) },
        });
        const before = fake.requests.length;
        table.select(['m.1', 'm.2']);
        await binding.sync();
        expect(fake.requests).toHaveLength(before);
        expect([...map.states.entries()]).toEqual([[1, { picked: true }], [2, { picked: true }]]);
        table.select('m.1', 'toggle');
        expect([...map.states.keys()]).toEqual([2]);
        expect(binding.sourceId).toBeNull();
        binding.destroy();
        expect(map.states.size).toBe(0);
        expect(map.sources.size).toBe(0);
    });

    it('refuses feature-state on a map without it', () => {
        const { table, map } = setup();
        const bare: MapLibreMapLike = { ...map, setFeatureState: undefined as never, removeFeatureState: undefined as never };
        expect(() => bindMapLibreSelection(table, bare, { highlight: { source: 's' } })).toThrow('feature-state');
    });

    it('flies to a single row picked in the table', async () => {
        const { table, map } = setup();
        const binding = bindMapLibreSelection(table, map, { zoomOnSelect: 'single', fit: { maxZoom: 12 } });
        table.select('m.2');
        await binding.sync();
        expect(map.fits).toHaveLength(1);
        const [[west, south], [east, north]] = map.fits[0]?.bounds ?? [[0, 0], [0, 0]];
        expect([west, south, east, north].map(value => Math.round(value))).toEqual([10, 10, 10, 10]);
        expect(map.fits[0]?.options).toEqual({ padding: 48, maxZoom: 12, duration: 250 });
        table.select(['m.1', 'm.2']);
        await binding.sync();
        expect(map.fits).toHaveLength(1);
    });

    it('zooms on demand, fetching geometries feature-state did not need', async () => {
        const { fake, table, map } = setup();
        const binding = bindMapLibreSelection(table, map, { highlight: { source: 's' } });
        expect(await binding.zoomToSelection()).toBe(false);
        table.select('m.1');
        expect(await binding.zoomToSelection({ duration: 0 })).toBe(true);
        expect(fake.last()?.params.CQL_FILTER).toBe("IN ('m.1')");
        expect(map.fits[0]?.options).toEqual({ padding: 48, maxZoom: 17, duration: 0 });
    });

    it('reports failures and ignores aborts', async () => {
        const fake = createFakeWfs({ fail: () => 'boom' });
        const table = createAttributeTable({ source: { url: 'https://x/wfs', typeName: 'ws:m', fetch: fake.fetch } });
        const errors: string[] = [];
        const binding = bindMapLibreSelection(table, fakeMapLibre(), { onError: error => errors.push(error.message) });
        table.select('m.1');
        table.select('m.2');
        await settle();
        await binding.sync();
        expect(errors).toEqual(['boom']);
    });
});
