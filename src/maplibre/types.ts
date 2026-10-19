import type { DistributiveOmit, FitBoundsOptions, LayerSpecification, SourceSpecification } from 'maplibre-gl';

export type LngLatTuple = [number, number];

export type Corners = [[number, number], [number, number]];

export interface PointerLike {
    coordinate: readonly [number, number];
    pixel: readonly [number, number];
    originalEvent: unknown;
}

export interface ArbiterLike {
    claim(tool: string, handlers: { click?(e: PointerLike): void; escape?(): void }): () => void;
}

export interface RenderedFeatureLike {
    id?: string | number | undefined;
    properties: Record<string, unknown> | null;
}

export interface FeatureTarget {
    source: string;
    sourceLayer?: string;
    id: string | number;
}

export interface MapLibreMapLike {
    addSource(id: string, source: SourceSpecification): unknown;
    getSource(id: string): unknown;
    removeSource(id: string): unknown;
    addLayer(layer: LayerSpecification, beforeId?: string): unknown;
    getLayer(id: string): unknown;
    removeLayer(id: string): unknown;
    on(type: 'click', listener: (event: unknown) => void): unknown;
    off(type: 'click', listener: (event: unknown) => void): unknown;
    unproject(point: [number, number]): { lng: number; lat: number };
    queryRenderedFeatures(geometry: Corners, options: { layers: string[] }): RenderedFeatureLike[];
    fitBounds(bounds: Corners, options?: FitBoundsOptions): unknown;
    setFeatureState?(target: FeatureTarget, state: Record<string, unknown>): unknown;
    removeFeatureState?(target: FeatureTarget, key?: string): unknown;
}

export type LayerTemplate = DistributiveOmit<LayerSpecification, 'id' | 'source'> & { id?: string };

export interface FeatureStateHighlight {
    source: string;
    sourceLayer?: string;
    key?: string;
    featureId?: (id: string) => string | number;
}

export interface PickCandidate {
    id: string;
    properties: Record<string, unknown>;
}

export type PickFunction = (candidates: PickCandidate[], lngLat: LngLatTuple) => PickCandidate[];

export interface MapLibreSelectionOptions {
    highlight?: 'source' | FeatureStateHighlight;
    sourceId?: string;
    layers?: readonly LayerTemplate[];
    beforeId?: string;
    queryLayers?: readonly string[];
    selectOnClick?: boolean;
    hitTolerance?: number;
    pick?: 'first' | 'all' | PickFunction;
    applyQuery?: boolean;
    maxFeatures?: number;
    zoomOnSelect?: boolean | 'single';
    fit?: FitBoundsOptions;
    onError?: (error: Error) => void;
    arbiter?: ArbiterLike;
    tool?: string;
}

export interface MapLibreSelection {
    readonly sourceId: string | null;
    readonly layerIds: readonly string[];
    readonly active: boolean;
    activate(): void;
    deactivate(): void;
    zoomToSelection(fit?: FitBoundsOptions): Promise<boolean>;
    sync(): Promise<void>;
    destroy(): void;
}
