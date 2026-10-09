import type { DownloadFormat, WfsVersion } from './types.js';

interface FormatSpec {
    outputFormat: string;
    extension: string;
    geometry: boolean;
}

const FORMATS: Record<DownloadFormat, FormatSpec> = {
    csv: { outputFormat: 'csv', extension: 'csv', geometry: false },
    json: { outputFormat: 'application/json', extension: 'geojson', geometry: true },
    'shape-zip': { outputFormat: 'SHAPE-ZIP', extension: 'zip', geometry: true },
    kml: { outputFormat: 'application/vnd.google-earth.kml+xml', extension: 'kml', geometry: true },
    gml: { outputFormat: 'application/gml+xml; version=3.2', extension: 'gml', geometry: true },
};

export const resolveFormat = (format: DownloadFormat | { outputFormat: string }, version: WfsVersion): FormatSpec => {
    if (typeof format !== 'string') return { outputFormat: format.outputFormat, extension: 'dat', geometry: true };
    if (format === 'gml' && version === '1.1.0') return { ...FORMATS.gml, outputFormat: 'text/xml; subtype=gml/3.1.1' };
    return FORMATS[format];
};

export const formatName = (format: DownloadFormat | { outputFormat: string }): string =>
    typeof format === 'string' ? format : format.outputFormat;

export const defaultFilename = (typeName: string, extension: string): string => {
    const base = (typeName.split(':').pop() ?? typeName).replace(/[^\w.-]+/g, '_') || 'layer';
    return `${base}.${extension}`;
};

export const withExtension = (filename: string, extension: string): string =>
    filename.toLowerCase().endsWith(`.${extension}`) ? filename : `${filename}.${extension}`;
