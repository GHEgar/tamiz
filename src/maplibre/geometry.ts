import type { GeoJsonCollection } from '../core/index.js';
import type { LngLatTuple, MapLibreMapLike, Corners } from './types.js';

const RADIUS = 6378137;
const MAX_LAT = 85.0511287798066;
const DEG = Math.PI / 180;

export const toMercator = ([lng, lat]: readonly number[]): LngLatTuple => {
    const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat ?? 0));
    return [(lng ?? 0) * DEG * RADIUS, RADIUS * Math.log(Math.tan(Math.PI / 4 + clamped * DEG / 2))];
};

export const toLngLat = ([x, y]: readonly number[]): LngLatTuple => [
    (x ?? 0) / RADIUS / DEG,
    (2 * Math.atan(Math.exp((y ?? 0) / RADIUS)) - Math.PI / 2) / DEG,
];

export const clickBox = (
    map: Pick<MapLibreMapLike, 'unproject'>,
    [x, y]: readonly [number, number],
    tolerance: number,
): { pixels: Corners; extent: number[] } => {
    const southWest = map.unproject([x - tolerance, y + tolerance]);
    const northEast = map.unproject([x + tolerance, y - tolerance]);
    return {
        pixels: [[x - tolerance, y - tolerance], [x + tolerance, y + tolerance]],
        extent: [...toMercator([southWest.lng, southWest.lat]), ...toMercator([northEast.lng, northEast.lat])],
    };
};

const mapPositions = (value: unknown, convert: (position: readonly number[]) => LngLatTuple): unknown => {
    if (!Array.isArray(value)) return value;
    if (typeof value[0] === 'number') return [...convert(value as number[]), ...value.slice(2)];
    return value.map(item => mapPositions(item, convert));
};

const mapGeometry = (geometry: unknown, convert: (position: readonly number[]) => LngLatTuple): unknown => {
    if (typeof geometry !== 'object' || geometry === null) return geometry;
    const shape = geometry as { coordinates?: unknown; geometries?: unknown[] };
    if (Array.isArray(shape.geometries)) return { ...shape, geometries: shape.geometries.map(item => mapGeometry(item, convert)) };
    return { ...shape, coordinates: mapPositions(shape.coordinates, convert) };
};

export const collectionToLngLat = (collection: GeoJsonCollection): GeoJsonCollection => ({
    type: 'FeatureCollection',
    features: collection.features.map(feature => ({ ...feature, geometry: mapGeometry(feature.geometry, toLngLat) })),
});

const walkPositions = (value: unknown, visit: (lng: number, lat: number) => void): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
        visit(value[0], value[1]);
        return;
    }
    for (const item of value) walkPositions(item, visit);
};

const walkGeometry = (geometry: unknown, visit: (lng: number, lat: number) => void): void => {
    if (typeof geometry !== 'object' || geometry === null) return;
    const shape = geometry as { coordinates?: unknown; geometries?: unknown[] };
    if (Array.isArray(shape.geometries)) shape.geometries.forEach(item => walkGeometry(item, visit));
    else walkPositions(shape.coordinates, visit);
};

export const boundsOf = (geometries: readonly unknown[]): Corners | null => {
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const geometry of geometries) {
        walkGeometry(geometry, (lng, lat) => {
            west = Math.min(west, lng);
            south = Math.min(south, lat);
            east = Math.max(east, lng);
            north = Math.max(north, lat);
        });
    }
    return west === Infinity ? null : [[west, south], [east, north]];
};
