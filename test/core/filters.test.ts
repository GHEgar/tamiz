import { describe, expect, it } from 'vitest';
import {
    combineFilters, createAttributeTable, defaultFilterLabel, filterToCql, isEmptyFilter, splitFilter, withCondition, withValues,
    type ColumnFilter,
} from '../../src/core/index.js';
import { createFakeWfs, settle } from '../fake-wfs.js';

const contains: ColumnFilter = { kind: 'text', op: 'contains', value: 'san' };

describe('combined filters', () => {
    it('joins a condition and a list on the same column', () => {
        const filter = combineFilters({ kind: 'text', op: 'contains', value: 'san' }, { kind: 'list', values: ['San Juan', 'San Pedro'] });
        expect(filter).toEqual({
            kind: 'combined',
            condition: contains,
            list: { kind: 'list', values: ['San Juan', 'San Pedro'] },
        });
        expect(filterToCql('nombre', filter as ColumnFilter)).toBe("(nombre ILIKE '%san%') AND (nombre IN ('San Juan', 'San Pedro'))");
        expect(defaultFilterLabel('nombre', filter as ColumnFilter)).toBe('nombre contains "san" · nombre: San Juan, San Pedro');
    });

    it('collapses to the part that is not empty', () => {
        expect(combineFilters({ kind: 'number', op: 'gt', value: 3 }, { kind: 'list', values: [] }))
            .toEqual({ kind: 'number', op: 'gt', value: 3 });
        expect(combineFilters(null, { kind: 'list', values: [1] })).toEqual({ kind: 'list', values: [1] });
        expect(combineFilters({ kind: 'text', op: 'contains', value: '' }, null)).toBeNull();
        const halfEmpty: ColumnFilter = { kind: 'combined', condition: { kind: 'text', op: 'contains', value: '' }, list: { kind: 'list', values: ['a'] } };
        expect(filterToCql('c', halfEmpty)).toBe("c = 'a'");
        expect(defaultFilterLabel('c', halfEmpty)).toBe('c: a');
        expect(isEmptyFilter({ kind: 'combined', condition: { kind: 'text', op: 'contains', value: '' }, list: { kind: 'list', values: [] } })).toBe(true);
    });

    it('splits any filter into its condition and its list', () => {
        expect(splitFilter(null)).toEqual({ condition: null, list: null });
        expect(splitFilter({ kind: 'list', values: ['a'] })).toEqual({ condition: null, list: { kind: 'list', values: ['a'] } });
        expect(splitFilter(contains)).toEqual({ condition: contains, list: null });
        const combined = combineFilters({ kind: 'null', isNull: false }, { kind: 'list', values: ['a'] });
        expect(splitFilter(combined)).toEqual({ condition: { kind: 'null', isNull: false }, list: { kind: 'list', values: ['a'] } });
    });

    it('replaces one part and keeps the other', () => {
        const values = withValues(contains, ['San Juan']);
        expect(values).toEqual({ kind: 'combined', condition: contains, list: { kind: 'list', values: ['San Juan'] } });
        expect(withCondition(values, null)).toEqual({ kind: 'list', values: ['San Juan'] });
        expect(withValues(values, null)).toEqual(contains);
        expect(withCondition({ kind: 'list', values: [1] }, { kind: 'number', op: 'lt', value: 9 }))
            .toEqual({ kind: 'combined', condition: { kind: 'number', op: 'lt', value: 9 }, list: { kind: 'list', values: [1] } });
    });
});

describe('table column parts', () => {
    const setup = () => {
        const fake = createFakeWfs({ features: [
            { id: 'm.1', properties: { nombre: 'San Juan' } },
            { id: 'm.2', properties: { nombre: 'Santa Ana' } },
            { id: 'm.3', properties: { nombre: 'Tala' } },
        ] });
        const table = createAttributeTable({ source: { url: 'https://x/wfs', typeName: 'ws:m', fetch: fake.fetch } });
        return { fake, table };
    };

    it('sets the condition and the values of a column independently', () => {
        const { table } = setup();
        table.setColumnCondition('nombre', contains);
        table.setColumnValues('nombre', ['San Juan']);
        expect(table.getSnapshot().cql).toBe("(nombre ILIKE '%san%') AND (nombre = 'San Juan')");
        expect(table.getSnapshot().chips.map(chip => chip.label)).toEqual(['nombre contains "san" · nombre: San Juan']);
        table.setColumnCondition('nombre', null);
        expect(table.getSnapshot().filters).toEqual({ nombre: { kind: 'list', values: ['San Juan'] } });
        table.setColumnValues('nombre', []);
        expect(table.getSnapshot().filters).toEqual({});
    });

    it('offers the values that pass the column condition, ignoring its own list', async () => {
        const { fake, table } = setup();
        table.start();
        await settle();
        table.setColumnCondition('nombre', contains);
        table.setColumnValues('nombre', ['San Juan']);
        await table.fetchDistinct('nombre');
        const scan = fake.requests.filter(request => request.params.propertyName === 'nombre').at(-1);
        expect(scan?.params.CQL_FILTER).toBe("nombre ILIKE '%san%'");
    });
});
