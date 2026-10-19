import type Feature from 'ol/Feature.js';
import type Map from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import type { FitOptions } from 'ol/View.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import VectorLayer from 'ol/layer/Vector.js';
import { unByKey } from 'ol/Observable.js';
import VectorSource from 'ol/source/Vector.js';
import { isEmpty } from 'ol/extent.js';
import { fromLonLat } from 'ol/proj.js';
import type { StyleLike } from 'ol/style/Style.js';
import type { FlatStyleLike } from 'ol/style/flat.js';
import type { AttributeTable, GeoJsonCollection, SelectMode } from '../core/index.js';

export interface MapPointerLike {
    coordinate: readonly [number, number];
    originalEvent: unknown;
}

export interface ArbiterLike {
    claim(tool: string, handlers: { click?(e: MapPointerLike): void; escape?(): void }): () => void;
}

export type PickFunction = (features: Feature[], coordinate: number[]) => Feature[];

export interface OlSelectionOptions {
    style?: StyleLike | FlatStyleLike;
    zIndex?: number;
    selectOnClick?: boolean;
    hitTolerance?: number;
    pick?: 'first' | 'all' | PickFunction;
    applyQuery?: boolean;
    zoomOnSelect?: boolean;
    fit?: FitOptions;
    maxFeatures?: number;
    onError?: (error: Error) => void;
    arbiter?: ArbiterLike;
    tool?: string;
}

export interface OlSelection {
    layer: VectorLayer<VectorSource>;
    source: VectorSource;
    readonly active: boolean;
    activate(): void;
    deactivate(): void;
    zoomToSelection(fit?: FitOptions): boolean;
    sync(): Promise<void>;
    destroy(): void;
}

const DEFAULT_FIT: FitOptions = { padding: [48, 48, 48, 48], maxZoom: 17, duration: 250 };

export const clickExtent = (coordinate: readonly number[], resolution: number, tolerance: number): number[] => {
    const [x = 0, y = 0] = coordinate;
    const delta = resolution * tolerance;
    return [x - delta, y - delta, x + delta, y + delta];
};

export const DEFAULT_Z_INDEX = 1000;

const clickMode = (event: unknown): SelectMode => {
    if (typeof event !== 'object' || event === null || !('shiftKey' in event)) return 'replace';
    const keys = event as { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };
    return keys.shiftKey || keys.ctrlKey || keys.metaKey ? 'toggle' : 'replace';
};

export const pickFeatures = (features: Feature[], extent: number[], coordinate: number[], pick: OlSelectionOptions['pick']): Feature[] => {
    const hits = features.filter(feature => feature.getGeometry()?.intersectsExtent(extent) ?? false);
    if (typeof pick === 'function') return pick(hits, coordinate);
    if (pick === 'all') return hits;
    return hits.slice(-1);
};

const asError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)));

export const bindOlSelection = (table: AttributeTable, map: Map, options: OlSelectionOptions = {}): OlSelection => {
    const format = new GeoJSON();
    const source = new VectorSource();
    const layer = new VectorLayer({ source, zIndex: options.zIndex ?? DEFAULT_Z_INDEX });
    if (options.style) layer.setStyle(options.style);
    map.addLayer(layer);

    const projection = (): string => map.getView().getProjection().getCode();
    const report = (error: unknown): void => {
        if ((error as { name?: string })?.name === 'AbortError') return;
        options.onError?.(asError(error));
    };

    const readFeatures = (collection: GeoJsonCollection): Feature[] => {
        const code = projection();
        const features = format.readFeatures(collection, { dataProjection: code, featureProjection: code });
        if (table.idField) {
            for (const feature of features) feature.setId(String(feature.get(table.idField)));
        }
        return features;
    };

    let controller: AbortController | null = null;
    let pending: Promise<void> = Promise.resolve();
    let lastSelection = table.getSnapshot().selection;

    const zoomToSelection = (fit?: FitOptions): boolean => {
        const extent = source.getExtent();
        if (source.getFeatures().length === 0 || !extent || isEmpty(extent)) return false;
        map.getView().fit(extent, { ...DEFAULT_FIT, ...options.fit, ...fit });
        return true;
    };

    const sync = (): Promise<void> => {
        const wanted = table.getSnapshot().selection;
        for (const feature of [...source.getFeatures()]) {
            if (!wanted.has(String(feature.getId()))) source.removeFeature(feature);
        }
        const missing = [...wanted].filter(id => source.getFeatureById(id) === null);
        controller?.abort();
        if (missing.length === 0) {
            controller = null;
            if (options.zoomOnSelect) zoomToSelection();
            pending = Promise.resolve();
            return pending;
        }
        const current = new AbortController();
        controller = current;
        pending = table.fetchFeatures({ ids: missing, srsName: projection(), signal: current.signal })
            .then(collection => {
                if (current.signal.aborted) return;
                const selection = table.getSnapshot().selection;
                source.addFeatures(readFeatures(collection).filter(feature =>
                    selection.has(String(feature.getId())) && source.getFeatureById(feature.getId() ?? '') === null));
                if (options.zoomOnSelect) zoomToSelection();
            })
            .catch(report);
        return pending;
    };

    const unsubscribe = table.subscribe(() => {
        const selection = table.getSnapshot().selection;
        if (selection === lastSelection) return;
        lastSelection = selection;
        void sync();
    });

    const selectAt = (coordinate: number[], originalEvent: unknown): void => {
        const resolution = map.getView().getResolution();
        if (resolution === undefined) return;
        const code = projection();
        const mode = clickMode(originalEvent);
        const extent = clickExtent(coordinate, resolution, options.hitTolerance ?? 4);
        table.fetchFeatures({
            bbox: { extent, srsName: code },
            applyQuery: options.applyQuery ?? true,
            srsName: code,
            count: options.maxFeatures ?? 50,
        }).then(collection => {
            const features = pickFeatures(readFeatures(collection), extent, coordinate, options.pick);
            source.addFeatures(features.filter(feature => source.getFeatureById(feature.getId() ?? '') === null));
            const ids = features.map(feature => String(feature.getId()));
            if (ids.length === 0 && mode === 'toggle') return;
            table.select(ids, mode);
        }).catch(report);
    };

    const onClick = (event: MapBrowserEvent): void => selectAt(event.coordinate, event.originalEvent);

    const onPointer = (pointer: MapPointerLike): void => {
        selectAt(fromLonLat([...pointer.coordinate], map.getView().getProjection()), pointer.originalEvent);
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
            const key = map.on('singleclick', onClick);
            release = () => unByKey(key);
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
        layer,
        source,
        get active() { return release !== null; },
        activate,
        deactivate,
        zoomToSelection,
        sync: () => pending,
        destroy() {
            unsubscribe();
            controller?.abort();
            deactivate();
            map.removeLayer(layer);
            source.clear();
        },
    };
};
