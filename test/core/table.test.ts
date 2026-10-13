import { describe, expect, it, vi } from 'vitest';
import { createAttributeTable, type TableEvent, type TableOptions } from '../../src/core/index.js';
import { createFakeWfs, settle } from '../fake-wfs.js';

const setup = (options: Partial<TableOptions> = {}, fake = createFakeWfs()) => {
    const events: TableEvent[] = [];
    const table = createAttributeTable({
        source: { url: 'https://x/wfs', typeName: 'ws:municipios', fetch: fake.fetch },
        pageSize: 100,
        onEvent: event => events.push(event),
        ...options,
    });
    return { table, fake, events };
};

describe('createAttributeTable', () => {
    it('does nothing until started', async () => {
        const { table, fake } = setup();
        await settle();
        expect(fake.requests).toHaveLength(0);
        expect(table.getSnapshot().status).toBe('idle');
    });

    it('loads schema, first page and total', async () => {
        const { table, fake } = setup();
        table.start();
        await settle();
        const snapshot = table.getSnapshot();
        expect(snapshot.status).toBe('ready');
        expect(snapshot.columns.map(column => column.name)).toEqual(['clave', 'nombre', 'poblacion', 'fecha']);
        expect(snapshot.rows).toHaveLength(100);
        expect(snapshot.total).toBe(250);
        expect(snapshot.pageCount).toBe(3);
        expect(fake.last()?.params.propertyName).toBe('clave,nombre,poblacion,fecha');
    });

    it('uses numberMatched when the server sends it', async () => {
        const { table, fake } = setup({}, createFakeWfs({ numberMatched: true }));
        table.start();
        await settle();
        expect(table.getSnapshot().total).toBe(250);
        expect(fake.requests.some(request => request.params.resultType === 'hits')).toBe(false);
    });

    it('pages and sorts without counting again', async () => {
        const { table, fake } = setup();
        table.start();
        await settle();
        const before = fake.requests.length;
        table.setPage(2);
        await settle();
        expect(table.getSnapshot().rows).toHaveLength(50);
        expect(fake.last()?.params.startIndex).toBe('200');
        table.toggleSort('poblacion');
        await settle();
        expect(fake.last()?.params.sortBy).toBe('poblacion ASC');
        expect(table.getSnapshot().page).toBe(0);
        expect(fake.requests.slice(before).some(request => request.params.resultType === 'hits')).toBe(false);
    });

    it('keeps a stable order on every page when asked and nothing is sorted', async () => {
        const { table, fake } = setup({ stableSort: true });
        table.start();
        await settle();
        expect(fake.last()?.params.sortBy).toBe('clave ASC');
        table.setPage(1);
        await settle();
        expect(fake.last()?.params.sortBy).toBe('clave ASC');
        expect(table.getSnapshot().sort).toBeNull();
        table.toggleSort('poblacion');
        await settle();
        expect(fake.last()?.params.sortBy).toBe('poblacion ASC');
        const named = setup({ stableSort: 'nombre' });
        named.table.start();
        await settle();
        expect(named.fake.last()?.params.sortBy).toBe('nombre ASC');
    });

    it('batches several changes into one request and resets the page', async () => {
        const { table, fake, events } = setup();
        table.start();
        await settle();
        table.setPage(1);
        await settle();
        const before = fake.requests.length;
        table.setFilter('poblacion', { kind: 'number', op: 'gte', value: 100 });
        table.setFilter('nombre', { kind: 'text', op: 'contains', value: 'M1' });
        await settle();
        const pages = fake.requests.slice(before).filter(request => request.params.request === 'GetFeature' && !request.params.resultType);
        expect(pages).toHaveLength(1);
        expect(pages[0]?.params.CQL_FILTER).toBe("(poblacion >= 100) AND (nombre ILIKE '%M1%')");
        expect(table.getSnapshot().page).toBe(0);
        expect(events.some(event => event.type === 'query')).toBe(true);
    });

    it('combines base, custom and filter cql and exposes chips', () => {
        const { table } = setup({ baseCql: 'anio = 2026' });
        table.setFilter('clave', { kind: 'list', values: ['001'] });
        let snapshot = table.getSnapshot();
        expect(snapshot.cql).toBe("(anio = 2026) AND (clave = '001')");
        expect(snapshot.filtersCql).toBe("clave = '001'");
        expect(snapshot.chips.map(chip => chip.key)).toEqual(['base', 'column:clave']);
        table.setCql('poblacion > 5');
        snapshot = table.getSnapshot();
        expect(snapshot.cql).toBe('(anio = 2026) AND (poblacion > 5)');
        expect(snapshot.chips.map(chip => chip.key)).toEqual(['base', 'custom']);
        table.removeChip('custom');
        expect(table.getSnapshot().cql).toBe("(anio = 2026) AND (clave = '001')");
        table.removeChip('column:clave');
        expect(table.getSnapshot().cql).toBe('anio = 2026');
        table.removeChip('base');
        expect(table.getSnapshot().cql).toBe('anio = 2026');
    });

    it('selects with replace, toggle and range over the current rows', async () => {
        const { table, events } = setup();
        table.start();
        await settle();
        table.select('municipios.3');
        table.select('municipios.6', 'range');
        expect([...table.getSnapshot().selection]).toEqual(['municipios.3', 'municipios.4', 'municipios.5', 'municipios.6']);
        table.select('municipios.4', 'toggle');
        expect(table.getSnapshot().selection.has('municipios.4')).toBe(false);
        table.clearSelection();
        expect(table.getSnapshot().selection.size).toBe(0);
        expect(events.filter(event => event.type === 'selection')).toHaveLength(4);
    });

    it('filters to the selection, and to nothing when it is empty', async () => {
        const { table, fake } = setup();
        table.setOnlySelected(true);
        expect(table.getSnapshot().cql).toBe('EXCLUDE');
        table.select(['municipios.1', 'municipios.2']);
        expect(table.getSnapshot().cql).toBe("IN ('municipios.1', 'municipios.2')");
        expect(table.getSnapshot().chips.at(-1)?.label).toBe('Selected (2)');
        table.start();
        await settle();
        expect(fake.last()?.params.CQL_FILTER).toBe("IN ('municipios.1', 'municipios.2')");
    });

    it('hides and reorders columns', () => {
        const { table } = setup({ schema: { fields: [
            { name: 'a', type: 'string', family: 'text' },
            { name: 'b', type: 'int', family: 'number' },
            { name: 'c', type: 'date', family: 'date' },
        ], geometryField: 'geom', geometryType: 'Point' }, columns: { labels: { a: 'A' } } });
        table.setColumnVisible('b', false);
        table.moveColumn('c', 0);
        const snapshot = table.getSnapshot();
        expect(snapshot.columns.map(column => column.name)).toEqual(['c', 'a', 'b']);
        expect(snapshot.visibleColumns.map(column => column.label)).toEqual(['c', 'A']);
    });

    it('builds download urls with the query and visible columns', async () => {
        const { table, events } = setup();
        table.start();
        await settle();
        table.setFilter('clave', { kind: 'list', values: ['001'] });
        table.setColumnVisible('fecha', false);
        const params = new URLSearchParams(table.downloadUrl({ format: 'csv' }).split('?')[1]);
        expect(params.get('outputFormat')).toBe('csv');
        expect(params.get('CQL_FILTER')).toBe("clave = '001'");
        expect(params.get('propertyName')).toBe('clave,nombre,poblacion');
        expect(params.get('format_options')).toBe('filename:municipios.csv');
        const shape = new URLSearchParams(table.downloadUrl({ format: 'shape-zip', filename: 'jalisco' }).split('?')[1]);
        expect(shape.get('propertyName')).toBe('clave,nombre,poblacion,geom');
        expect(shape.get('format_options')).toBe('filename:jalisco.zip');
        table.select('municipios.9');
        const selected = new URLSearchParams(table.downloadUrl({ format: 'json', onlySelected: true, allColumns: true }).split('?')[1]);
        expect(selected.get('CQL_FILTER')).toBe("(clave = '001') AND (IN ('municipios.9'))");
        expect(selected.get('propertyName')).toBeNull();
        expect(events.filter(event => event.type === 'download')).toHaveLength(3);
    });

    it('downloads a blob', async () => {
        const { table } = setup();
        table.start();
        await settle();
        const result = await table.download({ format: 'json' });
        expect(result.filename).toBe('municipios.geojson');
        expect(JSON.parse(await result.blob.text()).type).toBe('FeatureCollection');
    });

    it('reports server errors and recovers', async () => {
        const fake = createFakeWfs({ fail: params => (params.CQL_FILTER === 'bad' ? 'Could not parse CQL' : null) });
        const { table, events } = setup({}, fake);
        table.start();
        await settle();
        table.setCql('bad');
        await settle();
        expect(table.getSnapshot().status).toBe('error');
        expect(table.getSnapshot().error?.message).toBe('Could not parse CQL');
        expect(events.some(event => event.type === 'error')).toBe(true);
        table.setCql(null);
        await settle();
        expect(table.getSnapshot().status).toBe('ready');
    });

    it('notifies subscribers and stops after destroy', async () => {
        const { table, fake } = setup();
        const listener = vi.fn();
        table.subscribe(listener);
        table.start();
        await settle();
        expect(listener).toHaveBeenCalled();
        table.destroy();
        const before = fake.requests.length;
        table.setPage(1);
        await settle();
        expect(fake.requests.length).toBe(before);
    });
});
