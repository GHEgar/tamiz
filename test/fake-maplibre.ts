import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { Corners, FeatureTarget, MapLibreMapLike, RenderedFeatureLike } from '../src/maplibre/index.js';

export interface FakeMapLibre extends MapLibreMapLike {
    sources: Map<string, { spec: SourceSpecification; data: unknown }>;
    layers: { layer: LayerSpecification; beforeId: string | undefined }[];
    fits: { bounds: Corners; options: unknown }[];
    states: Map<string | number, Record<string, unknown>>;
    queries: { geometry: Corners; layers: string[] }[];
    rendered: RenderedFeatureLike[];
    clicks: number;
    click(x: number, y: number, originalEvent?: unknown): void;
}

export const fakeMapLibre = (): FakeMapLibre => {
    const listeners = new Set<(event: unknown) => void>();
    const sources: FakeMapLibre['sources'] = new Map();
    const layers: FakeMapLibre['layers'] = [];
    const states: FakeMapLibre['states'] = new Map();
    const map: FakeMapLibre = {
        sources,
        layers,
        fits: [],
        states,
        queries: [],
        rendered: [],
        get clicks() { return listeners.size; },
        addSource(id, spec) {
            const entry = { spec, data: (spec as { data?: unknown }).data };
            sources.set(id, entry);
        },
        getSource(id) {
            const entry = sources.get(id);
            if (!entry) return undefined;
            return { setData: (data: unknown) => { entry.data = data; return Promise.resolve(); } };
        },
        removeSource(id) { sources.delete(id); },
        addLayer(layer, beforeId) { layers.push({ layer, beforeId }); },
        getLayer: id => layers.find(entry => entry.layer.id === id),
        removeLayer(id) { layers.splice(layers.findIndex(entry => entry.layer.id === id), 1); },
        on(_type, listener) { listeners.add(listener); },
        off(_type, listener) { listeners.delete(listener); },
        unproject: ([x, y]) => ({ lng: (x - 500) / 100, lat: (500 - y) / 100 }),
        queryRenderedFeatures(geometry, options) {
            map.queries.push({ geometry, layers: options.layers });
            return map.rendered;
        },
        fitBounds(bounds, options) { map.fits.push({ bounds, options }); },
        setFeatureState(target: FeatureTarget, state) { states.set(target.id, { ...states.get(target.id), ...state }); },
        removeFeatureState(target: FeatureTarget) { states.delete(target.id); },
        click(x, y, originalEvent = new MouseEvent('click')) {
            const event = { point: { x, y }, lngLat: map.unproject([x, y]), originalEvent };
            listeners.forEach(listener => listener(event));
        },
    };
    return map;
};

export const featuresOf = (map: FakeMapLibre, id = 'tamiz-selection'): { id?: unknown; geometry: unknown }[] =>
    (map.sources.get(id)?.data as { features: { id?: unknown; geometry: unknown }[] } | undefined)?.features ?? [];
