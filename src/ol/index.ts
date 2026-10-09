import type Feature from 'ol/Feature.js';
import type Map from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import type { FitOptions } from 'ol/View.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import VectorLayer from 'ol/layer/Vector.js';
import { unByKey } from 'ol/Observable.js';
import VectorSource from 'ol/source/Vector.js';
import { isEmpty } from 'ol/extent.js';
import type { StyleLike } from 'ol/style/Style.js';
import type { FlatStyleLike } from 'ol/style/flat.js';
import type { AttributeTable, GeoJsonCollection, SelectMode } from '../core/index.js';

export interface OlSelectionOptions {
    style?: StyleLike | FlatStyleLike;
    zIndex?: number;
    selectOnClick?: boolean;
    hitTolerance?: number;
    pick?: 'first' | 'all';
    applyQuery?: boolean;
    zoomOnSelect?: boolean;
    fit?: FitOptions;
    maxFeatures?: number;
    onError?: (error: Error) => void;
}

export interface OlSelection {
    layer: VectorLayer<VectorSource>;
    source: VectorSource;
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

const clickMode = (event: MouseEvent | PointerEvent | KeyboardEvent | WheelEvent | TouchEvent): SelectMode => {
    if (!('shiftKey' in event)) return 'replace';
    if (event.shiftKey || event.ctrlKey || event.metaKey) return 'toggle';
    return 'replace';
};

const asError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)));

export const bindOlSelection = (table: AttributeTable, map: Map, options: OlSelectionOptions = {}): OlSelection => {
    const format = new GeoJSON();
    const source = new VectorSource();
    const layer = new VectorLayer({ source, zIndex: options.zIndex ?? 1000 });
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

    const onClick = (event: MapBrowserEvent): void => {
        const resolution = map.getView().getResolution();
        if (resolution === undefined) return;
        const code = projection();
        const mode = clickMode(event.originalEvent);
        table.fetchFeatures({
            bbox: { extent: clickExtent(event.coordinate, resolution, options.hitTolerance ?? 4), srsName: code },
            applyQuery: options.applyQuery ?? true,
            srsName: code,
            count: options.pick === 'all' ? options.maxFeatures ?? 50 : 1,
        }).then(collection => {
            const features = readFeatures(collection);
            source.addFeatures(features.filter(feature => source.getFeatureById(feature.getId() ?? '') === null));
            const ids = features.map(feature => String(feature.getId()));
            if (ids.length === 0 && mode === 'toggle') return;
            table.select(ids, mode);
        }).catch(report);
    };

    const clickKey = (options.selectOnClick ?? true) ? map.on('singleclick', onClick) : null;
    if (lastSelection.size > 0) void sync();

    return {
        layer,
        source,
        zoomToSelection,
        sync: () => pending,
        destroy() {
            unsubscribe();
            controller?.abort();
            if (clickKey) unByKey(clickKey);
            map.removeLayer(layer);
            source.clear();
        },
    };
};
