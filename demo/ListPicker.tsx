import { useState } from 'react';
import type { Column, Scalar } from '@ghegar/tamiz';
import { useDistinctValues, type UseAttributeTable } from '@ghegar/tamiz/react';

const initial = (column: Column): Scalar[] => (column.filter?.kind === 'list' ? column.filter.values : []);

export function ListPicker({ table: t, column }: { table: UseAttributeTable; column: Column }) {
    const [search, setSearch] = useState('');
    const [chosen, setChosen] = useState<Scalar[]>(() => initial(column));
    const distinct = useDistinctValues(t.table, column.name, { search, limit: 100 });

    const toggle = (value: Scalar): void => {
        setChosen(previous => (previous.includes(value) ? previous.filter(item => item !== value) : [...previous, value]));
    };

    return (
        <div className="list-picker" data-testid="list" data-status={distinct.status}>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar" aria-label="Buscar valor" />
            <div className="list-values">
                {distinct.values.map(value => (
                    <label key={String(value)}>
                        <input type="checkbox" checked={chosen.includes(value)} onChange={() => toggle(value)} />
                        {String(value)}
                    </label>
                ))}
                {distinct.status === 'loading' && <span className="muted">cargando…</span>}
                {distinct.status === 'ready' && !distinct.complete && <span className="muted">lista parcial</span>}
                {distinct.status === 'error' && <span className="error">{distinct.error?.message}</span>}
            </div>
            <button type="button" disabled={chosen.length === 0} onClick={() => t.table.setFilter(column.name, { kind: 'list', values: chosen })}>
                Filtrar ({chosen.length})
            </button>
        </div>
    );
}
