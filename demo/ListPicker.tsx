import { useState } from 'react';
import { splitFilter, type Column, type Scalar } from '@npmegar/tamiz';
import { useDistinctValues, type UseAttributeTable } from '@npmegar/tamiz/react';

const initial = (column: Column): Scalar[] => splitFilter(column.filter).list?.values ?? [];

export function ListPicker({ table: t, column }: { table: UseAttributeTable; column: Column }) {
    const [search, setSearch] = useState('');
    const [chosen, setChosen] = useState<Scalar[]>(() => initial(column));
    const distinct = useDistinctValues(t.table, column.name, { search, limit: 100, counts: true });

    const toggle = (value: Scalar): void => {
        setChosen(previous => (previous.includes(value) ? previous.filter(item => item !== value) : [...previous, value]));
    };

    return (
        <div className="list-picker" data-testid="list" data-status={distinct.status}>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search" aria-label="Search value" />
            <div className="list-values">
                {distinct.values.map((value, index) => (
                    <label key={String(value)}>
                        <input type="checkbox" checked={chosen.includes(value)} onChange={() => toggle(value)} />
                        {String(value)}
                        {distinct.counts && <span className="muted"> ({distinct.counts[index]})</span>}
                    </label>
                ))}
                {distinct.status === 'loading' && <span className="muted">loading…</span>}
                {distinct.status === 'ready' && !distinct.complete && <span className="muted">partial list</span>}
                {distinct.status === 'error' && <span className="error">{distinct.error?.message}</span>}
            </div>
            <button type="button" disabled={chosen.length === 0} onClick={() => t.table.setColumnValues(column.name, chosen)}>
                Filter ({chosen.length})
            </button>
        </div>
    );
}
