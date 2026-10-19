import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CqlComposer } from '../../../urdimbre/src/cql/index.js';
import { createAttributeTable, type CqlComposerLike } from '../../src/core/index.js';
import { fakeComposer } from '../doubles.js';
import { createFakeWfs } from '../fake-wfs.js';

const source = { url: 'https://x/wfs', typeName: 'ws:municipios', fetch: createFakeWfs().fetch };

describe('table with a composer', () => {
    it('writes the effective cql as the table fragment and removes it on destroy', () => {
        const composer = fakeComposer();
        const table = createAttributeTable({ source, baseCql: 'activo = 1', composer });
        expect(composer.calls).toEqual([['table', 'activo = 1']]);
        table.setFilter('poblacion', { kind: 'number', op: 'gt', value: 5 });
        expect(composer.calls.at(-1)).toEqual(['table', '(activo = 1) AND (poblacion > 5)']);
        table.setPage(3);
        expect(composer.calls).toHaveLength(2);
        table.destroy();
        expect(composer.calls.at(-1)).toEqual(['table', null]);
    });

    it('uses the fragment name it is given and stays quiet with no filters', () => {
        const composer = fakeComposer();
        const table = createAttributeTable({ source, composer, fragment: 'rows' });
        expect(composer.calls).toEqual([]);
        table.setCql("nombre = 'M1'");
        table.clearFilters();
        expect(composer.calls).toEqual([['rows', "nombre = 'M1'"], ['rows', null]]);
        table.destroy();
        expect(composer.calls).toHaveLength(2);
    });

    it('accepts the urdimbre composer', () => {
        expectTypeOf<CqlComposer>().toExtend<CqlComposerLike>();
    });
});
