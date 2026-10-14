import { useState, type FormEvent } from 'react';
import type { Column, ColumnFilter } from '@ghegar/tamiz';
import type { UseAttributeTable } from '@ghegar/tamiz/react';
import { ListPicker } from './ListPicker';

const buildFilter = (column: Column, op: string, value: string, extra: string): ColumnFilter | null => {
    switch (column.family) {
        case 'number': {
            if (op === 'between') return { kind: 'number', op: 'between', min: Number(value), max: Number(extra) };
            return { kind: 'number', op: op as 'eq', value: Number(value) };
        }
        case 'date':
            return { kind: 'date', ...(value ? { from: value } : {}), ...(extra ? { to: extra } : {}) };
        case 'boolean':
            return { kind: 'boolean', value: value === 'true' };
        case 'text':
            return { kind: 'text', op: op as 'contains', value };
    }
};

const OPS: Record<Column['family'], [string, string][]> = {
    text: [['contains', 'contains'], ['startsWith', 'starts with'], ['equals', 'is'], ['list', 'in list']],
    number: [['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'], ['eq', '='], ['between', 'between'], ['list', 'in list']],
    date: [['range', 'between dates']],
    boolean: [['eq', 'is']],
};

export function FilterForm({ table: t }: { table: UseAttributeTable }) {
    const [name, setName] = useState('');
    const [op, setOp] = useState('');
    const [value, setValue] = useState('');
    const [extra, setExtra] = useState('');
    const column = t.columns.find(item => item.name === name) ?? t.columns[0];
    if (!column) return null;
    const ops = OPS[column.family];
    const currentOp = ops.some(([key]) => key === op) ? op : (ops[0]?.[0] ?? '');
    const range = currentOp === 'between' || column.family === 'date';
    const type = column.family === 'number' ? 'number' : column.family === 'date' ? 'date' : 'text';

    const submit = (event: FormEvent): void => {
        event.preventDefault();
        if (currentOp === 'list') return;
        const filter = buildFilter(column, currentOp, value, extra);
        if (filter) t.table.setFilter(column.name, filter);
    };

    return (
        <form className="row filter" onSubmit={submit} data-testid="filter">
            <select value={column.name} onChange={event => setName(event.target.value)} aria-label="Column">
                {t.columns.map(item => <option key={item.name} value={item.name}>{item.label}</option>)}
            </select>
            <select value={currentOp} onChange={event => setOp(event.target.value)} aria-label="Operator">
                {ops.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            {currentOp === 'list' ? (
                <ListPicker key={column.name} table={t} column={column} />
            ) : column.family === 'boolean' ? (
                <select value={value} onChange={event => setValue(event.target.value)} aria-label="Value">
                    <option value="true">yes</option>
                    <option value="false">no</option>
                </select>
            ) : (
                <input type={type} value={value} onChange={event => setValue(event.target.value)} aria-label="Value" />
            )}
            {range && <input type={type} value={extra} onChange={event => setExtra(event.target.value)} aria-label="To" />}
            {currentOp !== 'list' && <button type="submit">Filter</button>}
            {column.filter && <button type="button" onClick={() => t.table.setFilter(column.name, null)}>Remove</button>}
        </form>
    );
}
