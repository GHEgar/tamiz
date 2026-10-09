import { and, idsToCql } from './cql.js';
import { defaultFilename, formatName, resolveFormat, withExtension } from './download.js';
import { effectiveCql, type QueryState } from './query.js';
import type { DownloadOptions, Schema, Sort, TableEvent, TableSnapshot, WfsSource } from './types.js';
import { buildUrl, getFeatureParams, send } from './wfs.js';

export interface DownloadResult {
    blob: Blob;
    filename: string;
    url: string;
}

export interface Downloads {
    downloadUrl(options: DownloadOptions): string;
    download(options: DownloadOptions & { signal?: AbortSignal }): Promise<DownloadResult>;
}

interface DownloadContext {
    source: WfsSource;
    idField: string | null;
    getState: () => QueryState & { schema: Schema | null; sort: Sort | null };
    getSnapshot: () => TableSnapshot;
    emit: (event: TableEvent) => void;
}

export const createDownloads = (context: DownloadContext): Downloads => {
    const request = (options: DownloadOptions): { params: Record<string, string>; filename: string } => {
        const state = context.getState();
        const snapshot = context.getSnapshot();
        const spec = resolveFormat(options.format, context.source.version ?? '2.0.0');
        const cql = options.onlySelected
            ? and([effectiveCql(state, context.idField, false), idsToCql([...state.selection], context.idField) ?? 'EXCLUDE'])
            : effectiveCql(state, context.idField);
        const geometryField = state.schema?.geometryField ?? null;
        const withGeometry = (options.geometry ?? spec.geometry) && geometryField !== null;
        const allVisible = snapshot.visibleColumns.length === snapshot.columns.length;
        let propertyNames: string[] | null = null;
        if (!(options.allColumns || allVisible) || !withGeometry) {
            const columns = options.allColumns ? snapshot.columns : snapshot.visibleColumns;
            propertyNames = columns.map(column => column.name);
            if (withGeometry) propertyNames.push(geometryField as string);
        }
        const filename = options.filename
            ? withExtension(options.filename, spec.extension)
            : defaultFilename(context.source.typeName, spec.extension);
        const params = getFeatureParams(context.source, {
            cql,
            propertyNames,
            sort: state.sort,
            outputFormat: spec.outputFormat,
            srsName: options.srsName ?? null,
            formatOptions: `filename:${filename}`,
        });
        return { params, filename };
    };

    return {
        downloadUrl(options) {
            const { params } = request(options);
            const url = buildUrl(context.source, params);
            context.emit({ type: 'download', format: formatName(options.format), url });
            return url;
        },
        async download(options) {
            const { params, filename } = request(options);
            const url = buildUrl(context.source, params);
            const response = await send(context.source, params, options.signal);
            const blob = await response.blob();
            context.emit({ type: 'download', format: formatName(options.format), url });
            return { blob, filename, url };
        },
    };
};
