import type { UseAttributeTable } from '@ghegar/tamiz/react';

const ARROWS = { asc: ' ▲', desc: ' ▼' } as const;

const format = (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') return value.toLocaleString('es-MX');
    return String(value);
};

export function Grid({ table: t }: { table: UseAttributeTable }) {
    return (
        <div className="scroll">
            <table {...t.getTableProps()} className="grid" data-testid="grid">
                <thead>
                    <tr role="row">
                        {t.visibleColumns.map(column => (
                            <th key={column.name} {...t.getHeaderProps(column)}>
                                {column.label}
                                {column.sort ? ARROWS[column.sort] : ''}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {t.rows.map((row, index) => (
                        <tr key={row.id} {...t.getRowProps(row, index)}>
                            {t.visibleColumns.map(column => (
                                <td key={column.name} {...t.getCellProps(row, column)}>{format(row.properties[column.name])}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {t.status === 'error' && <p className="error" role="alert">{t.error?.message}</p>}
        </div>
    );
}
