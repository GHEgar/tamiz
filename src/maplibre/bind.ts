import type { FitBoundsOptions } from 'maplibre-gl';
import type { AttributeTable, GeoJsonCollection, GeoJsonFeature } from '../core/index.js';
import { clickMode } from '../core/selection.js';
import { toRows } from '../core/wfs.js';
import { boundsOf, clickBox, collectionToLngLat } from './geometry.js';
import { sourcePainter, statePainter } from './highlight.js';
import type {
    LngLatTuple, MapLibreMapLike, MapLibreSelection, MapLibreSelectionOptions, PickCandidate, PointerLike,
} from './types.js';

const DEFAULT_FIT: FitBoundsOptions = { padding: 48, maxZoom: 17, duration: 250 };
const MERCATOR = 'EPSG:3857';

interface MapClick {
    point: { x: number; y: number };
    lngLat: { lng: number; lat: number };
    originalEvent: unknown;
}

interface Candidate extends PickCandidate {
    feature: GeoJsonFeature | null;
}

const asError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)));

export const pickCandidates = (
    candidates: PickCandidate[],
    lngLat: LngLatTuple,
    pick: MapLibreSelectionOptions['pick'],
): PickCandidate[] => {
    if (typeof pick === 'function') return pick(candidates, lngLat);
    if (pick === 'all') return candidates;
    return candidates.slice(0, 1);
};

export const bindMapLibreSelection = (
    table: AttributeTable,
    map: MapLibreMapLike,
    options: MapLibreSelectionOptions = {},
): MapLibreSelection => {
    const report = (error: unknown): void => {
        if ((error as { name?: string })?.name === 'AbortError') return;
        options.onError?.(asError(error));
    };
    const highlight = options.highlight ?? 'source';
    const painter = highlight === 'source' ? sourcePainter(map, options, report) : statePainter(map, highlight);
    const cache = new Map<string, GeoJsonFeature>();
    let controller: AbortController | null = null;
    let pending: Promise<void> = Promise.resolve();
    let lastSelection = table.getSnapshot().selection;
    let fromMap = false;

    const withIds = (collection: GeoJsonCollection): Candidate[] => {
        const lngLat = collectionToLngLat(collection);
        return toRows(lngLat, table.idField).map((row, index) => ({
            id: row.id, properties: row.properties, feature: { ...(lngLat.features[index] as GeoJsonFeature), id: row.id },
        }));
    };

    const store = (candidates: readonly PickCandidate[]): void => {
        for (const candidate of candidates) {
            const { feature } = candidate as Candidate;
            if (feature) cache.set(candidate.id, feature);
        }
    };

    const selected = (): GeoJsonFeature[] => {
        const selection = table.getSnapshot().selection;
        return [...selection].flatMap(id => cache.get(id) ?? []);
    };

    const draw = (): void => painter.render(table.getSnapshot().selection, selected());

    const fill = (ids: string[], signal: AbortSignal): Promise<void> => {
        if (ids.length === 0) return Promise.resolve();
        return table.fetchFeatures({ ids, srsName: MERCATOR, signal }).then(collection => {
            if (signal.aborted) return;
            store(withIds(collection));
        });
    };

    const fit = (extra?: FitBoundsOptions): boolean => {
        const bounds = boundsOf(selected().map(feature => feature.geometry));
        if (!bounds) return false;
        map.fitBounds(bounds, { ...DEFAULT_FIT, ...options.fit, ...extra });
        return true;
    };

    const shouldZoom = (size: number): boolean => {
        if (options.zoomOnSelect === 'single') return size === 1;
        return options.zoomOnSelect === true && size > 0;
    };

    const sync = (): Promise<void> => {
        const wanted = table.getSnapshot().selection;
        for (const id of [...cache.keys()]) if (!wanted.has(id)) cache.delete(id);
        const zoom = !fromMap && shouldZoom(wanted.size);
        draw();
        controller?.abort();
        const missing = painter.needsGeometry || zoom ? [...wanted].filter(id => !cache.has(id)) : [];
        const current = new AbortController();
        controller = current;
        pending = fill(missing, current.signal).then(() => {
            if (current.signal.aborted) return;
            if (missing.length > 0) draw();
            if (zoom) fit();
        }).catch(report);
        return pending;
    };

    const unsubscribe = table.subscribe(() => {
        const selection = table.getSnapshot().selection;
        if (selection === lastSelection) return;
        lastSelection = selection;
        void sync();
    });

    const rendered = (pixels: [[number, number], [number, number]], layers: readonly string[]): Candidate[] => {
        const seen = new Set<string>();
        return map.queryRenderedFeatures(pixels, { layers: [...layers] }).flatMap(feature => {
            const properties = feature.properties ?? {};
            const raw = table.idField ? properties[table.idField] : feature.id;
            if (raw === undefined || raw === null || seen.has(String(raw))) return [];
            seen.add(String(raw));
            return [{ id: String(raw), properties, feature: null }];
        });
    };

    const requested = (extent: number[]): Promise<Candidate[]> => table.fetchFeatures({
        bbox: { extent, srsName: MERCATOR },
        applyQuery: options.applyQuery ?? true,
        srsName: MERCATOR,
        count: options.maxFeatures ?? 50,
    }).then(collection => withIds(collection).reverse());

    const selectAt = (pixel: readonly [number, number], lngLat: LngLatTuple, originalEvent: unknown): void => {
        const mode = clickMode(originalEvent);
        const box = clickBox(map, pixel, options.hitTolerance ?? 4);
        const candidates = options.queryLayers
            ? Promise.resolve(rendered(box.pixels, options.queryLayers))
            : requested(box.extent);
        candidates.then(list => {
            const picked = pickCandidates(list, lngLat, options.pick);
            const ids = picked.map(candidate => candidate.id);
            if (ids.length === 0 && mode === 'toggle') return;
            store(picked);
            fromMap = true;
            try {
                table.select(ids, mode);
            } finally {
                fromMap = false;
            }
        }).catch(report);
    };

    const onClick = (input: unknown): void => {
        const event = input as MapClick;
        selectAt([event.point.x, event.point.y], [event.lngLat.lng, event.lngLat.lat], event.originalEvent);
    };

    const onPointer = (pointer: PointerLike): void => {
        selectAt(pointer.pixel, [pointer.coordinate[0], pointer.coordinate[1]], pointer.originalEvent);
    };

    let release: (() => void) | null = null;

    const deactivate = (): void => {
        const current = release;
        release = null;
        current?.();
    };

    const activate = (): void => {
        if (release) return;
        const { arbiter } = options;
        if (!arbiter) {
            map.on('click', onClick);
            release = () => { map.off('click', onClick); };
            return;
        }
        let own: (() => void) | null = null;
        const escape = (): void => {
            if (release === own) release = null;
        };
        own = arbiter.claim(options.tool ?? 'table', { click: onPointer, escape });
        release = own;
    };

    if (options.selectOnClick ?? true) activate();
    if (lastSelection.size > 0) void sync();

    return {
        sourceId: painter.sourceId,
        layerIds: painter.layerIds,
        get active() { return release !== null; },
        activate,
        deactivate,
        async zoomToSelection(extra) {
            const missing = [...table.getSnapshot().selection].filter(id => !cache.has(id));
            await fill(missing, new AbortController().signal);
            return fit(extra);
        },
        sync: () => pending,
        destroy() {
            unsubscribe();
            controller?.abort();
            deactivate();
            painter.clear();
            cache.clear();
        },
    };
};
