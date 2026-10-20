import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createAttributeTable, useDistinctValues, type AttributeTable } from '../../src/react/index.js';
import { createFakeWfs, settle } from '../fake-wfs.js';

const Values = ({ table, column }: { table: AttributeTable; column: string | null }) => {
    const distinct = useDistinctValues(table, column, { limit: 3 });
    return <p data-testid="values" data-status={distinct.status}>{distinct.values.join('|')}</p>;
};

const Counted = ({ table }: { table: AttributeTable }) => {
    const distinct = useDistinctValues(table, 'nombre', { counts: true, order: 'count' });
    return <p data-testid="counted">{distinct.values.map((value, index) => `${value}:${distinct.counts?.[index]}`).join('|')}</p>;
};

const make = () => {
    const fake = createFakeWfs();
    const table = createAttributeTable({ source: { url: 'https://x/wfs', typeName: 'ws:municipios', fetch: fake.fetch } });
    return { fake, table };
};

const flush = () => act(async () => { await settle(); });

afterEach(cleanup);

describe('useDistinctValues', () => {
    it('waits for the table to start before asking', async () => {
        const { fake, table } = make();
        render(<Values table={table} column="nombre" />);
        await flush();
        expect(screen.getByTestId('values').dataset.status).toBe('idle');
        expect(fake.requests).toHaveLength(0);
        act(() => table.start());
        await flush();
        expect(screen.getByTestId('values').dataset.status).toBe('ready');
        expect(screen.getByTestId('values').textContent).toBe('M1|M2|M3');
    });

    it('asks again when the table query changes and stays idle without a column', async () => {
        const { fake, table } = make();
        table.start();
        await settle();
        const { rerender } = render(<Values table={table} column="nombre" />);
        await flush();
        const before = fake.requests.filter(request => request.params.propertyName === 'nombre').length;
        act(() => table.setFilter('poblacion', { kind: 'number', op: 'gt', value: 5 }));
        await flush();
        const scans = fake.requests.filter(request => request.params.propertyName === 'nombre');
        expect(scans).toHaveLength(before + 1);
        expect(scans.at(-1)?.params.CQL_FILTER).toBe('poblacion > 5');
        rerender(<Values table={table} column={null} />);
        expect(screen.getByTestId('values').dataset.status).toBe('idle');
    });

    it('returns the count of each value when asked', async () => {
        const fake = createFakeWfs({ features: ['a', 'b', 'b'].map((nombre, index) => ({ id: `m.${index}`, properties: { nombre } })) });
        const table = createAttributeTable({ source: { url: 'https://x/wfs', typeName: 'ws:m', fetch: fake.fetch } });
        table.start();
        render(<Counted table={table} />);
        await flush();
        expect(screen.getByTestId('counted').textContent).toBe('b:2|a:1');
    });
});
