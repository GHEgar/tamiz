import type { LayerSpecification } from 'maplibre-gl';
import type { GeoJsonFeature } from '../core/index.js';
import type { FeatureStateHighlight, FeatureTarget, LayerTemplate, MapLibreMapLike } from './types.js';

export const DEFAULT_SOURCE_ID = 'tamiz-selection';

const COLOR = '#3399cc';

export const DEFAULT_LAYERS: readonly LayerTemplate[] = [
    {
        type: 'fill',
        filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
        paint: { 'fill-color': COLOR, 'fill-opacity': 0.25 },
    },
    { type: 'line', paint: { 'line-color': COLOR, 'line-width': 2 } },
    {
        type: 'circle',
        filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false],
        paint: { 'circle-radius': 6, 'circle-color': 'rgba(0, 0, 0, 0)', 'circle-stroke-color': COLOR, 'circle-stroke-width': 2 },
    },
];

export interface Painter {
    readonly sourceId: string | null;
    readonly layerIds: readonly string[];
    readonly needsGeometry: boolean;
    render(selection: ReadonlySet<string>, features: readonly GeoJsonFeature[]): void;
    clear(): void;
}

interface Settable {
    setData?(data: unknown): unknown;
}

export const sourcePainter = (
    map: MapLibreMapLike,
    options: { sourceId?: string; layers?: readonly LayerTemplate[]; beforeId?: string },
    report: (error: unknown) => void,
): Painter => {
    const sourceId = options.sourceId ?? DEFAULT_SOURCE_ID;
    const templates = options.layers ?? DEFAULT_LAYERS;
    const layerIds = templates.map((template, index) => template.id ?? `${sourceId}-${index}`);
    const data = (features: readonly GeoJsonFeature[]) => ({ type: 'FeatureCollection', features: [...features] });

    const add = (features: readonly GeoJsonFeature[]): void => {
        map.addSource(sourceId, { type: 'geojson', data: data(features) as never });
        const before = options.beforeId !== undefined && map.getLayer(options.beforeId) ? options.beforeId : undefined;
        templates.forEach((template, index) => {
            const layer = { ...template, id: layerIds[index], source: sourceId } as LayerSpecification;
            if (before === undefined) map.addLayer(layer);
            else map.addLayer(layer, before);
        });
    };

    return {
        sourceId,
        layerIds,
        needsGeometry: true,
        render(_selection, features) {
            const source = map.getSource(sourceId) as Settable | undefined;
            if (!source) {
                if (features.length > 0) add(features);
                return;
            }
            Promise.resolve(source.setData?.(data(features))).catch(report);
        },
        clear() {
            for (const id of layerIds) if (map.getLayer(id)) map.removeLayer(id);
            if (map.getSource(sourceId)) map.removeSource(sourceId);
        },
    };
};

export const statePainter = (map: MapLibreMapLike, highlight: FeatureStateHighlight): Painter => {
    if (!map.setFeatureState || !map.removeFeatureState) throw new Error('The map does not support feature-state');
    const key = highlight.key ?? 'selected';
    const marked = new Set<string>();
    const target = (id: string): FeatureTarget => ({
        source: highlight.source,
        ...(highlight.sourceLayer === undefined ? {} : { sourceLayer: highlight.sourceLayer }),
        id: highlight.featureId ? highlight.featureId(id) : id,
    });
    const unmark = (id: string): void => {
        marked.delete(id);
        map.removeFeatureState?.(target(id), key);
    };

    return {
        sourceId: null,
        layerIds: [],
        needsGeometry: false,
        render(selection) {
            for (const id of [...marked]) if (!selection.has(id)) unmark(id);
            for (const id of selection) {
                if (marked.has(id)) continue;
                marked.add(id);
                map.setFeatureState?.(target(id), { [key]: true });
            }
        },
        clear() {
            for (const id of [...marked]) unmark(id);
        },
    };
};
