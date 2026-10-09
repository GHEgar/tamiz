import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createAttributeTable, modeFromEvent, useAttributeTable, type AttributeTable } from '../../src/react/index.js';
import { createFakeWfs, settle } from '../fake-wfs.js';

const Grid = ({ table }: { table: AttributeTable }) => {
    const t = useAttributeTable(table);
    return (
        <div>
            {t.columns.map(column => <input key={column.name} {...t.getColumnToggleProps(column)} />)}
            <table {...t.getTableProps()}>
                <thead>
                    <tr>
                        {t.visibleColumns.map(column => (
                            <th key={column.name} {...t.getHeaderProps(column)}>{column.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {t.rows.slice(0, 5).map((row, index) => (
                        <tr key={row.id} {...t.getRowProps(row, index)}>
                            {t.visibleColumns.map(column => (
                                <td key={column.name} {...t.getCellProps(row, column)}>{String(row.properties[column.name])}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const make = () => createAttributeTable({
    source: { url: 'https://x/wfs', typeName: 'ws:municipios', fetch: createFakeWfs().fetch },
});

afterEach(cleanup);

const flush = () => act(async () => { await settle(); });

describe('useAttributeTable', () => {
    it('starts the table and renders grid attributes', async () => {
        const table = make();
        render(<Grid table={table} />);
        await flush();
        const grid = screen.getByRole('grid');
        expect(grid.getAttribute('aria-rowcount')).toBe('250');
        expect(grid.getAttribute('data-status')).toBe('ready');
        expect(screen.getAllByRole('row')).toHaveLength(6);
    });

    it('sorts from the header and selects from rows with modifiers', async () => {
        const table = make();
        render(<Grid table={table} />);
        await flush();
        fireEvent.click(screen.getByRole('columnheader', { name: 'poblacion' }));
        await flush();
        expect(screen.getByRole('columnheader', { name: 'poblacion' }).getAttribute('aria-sort')).toBe('ascending');
        const rows = screen.getAllByRole('row').slice(1);
        fireEvent.click(rows[0] as HTMLElement);
        fireEvent.click(rows[2] as HTMLElement, { shiftKey: true });
        expect(table.getSnapshot().selection.size).toBe(3);
        expect(rows[1]?.getAttribute('aria-selected')).toBe('true');
        fireEvent.keyDown(rows[1] as HTMLElement, { key: ' ' });
        expect(table.getSnapshot().selection.size).toBe(2);
    });

    it('toggles column visibility', async () => {
        const table = make();
        render(<Grid table={table} />);
        await flush();
        fireEvent.click(screen.getByLabelText('fecha'));
        expect(screen.queryByRole('columnheader', { name: 'fecha' })).toBeNull();
    });

    it('maps modifier keys to selection modes', () => {
        expect(modeFromEvent({ shiftKey: false, ctrlKey: false, metaKey: false })).toBe('replace');
        expect(modeFromEvent({ shiftKey: false, ctrlKey: false, metaKey: true })).toBe('toggle');
        expect(modeFromEvent({ shiftKey: true, ctrlKey: true, metaKey: false })).toBe('range');
    });
});
