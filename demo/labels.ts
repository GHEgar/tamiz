import type { ColumnFilter, Labels } from '@ghegar/tamiz';

const TEXT_OPS = { contains: 'contiene', startsWith: 'empieza con', endsWith: 'termina con', equals: 'es' } as const;
const NUMBER_OPS = { eq: '=', ne: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥' } as const;

const filterLabel = (column: string, filter: ColumnFilter): string => {
    switch (filter.kind) {
        case 'list':
            return `${column}: ${filter.values.join(', ')}`;
        case 'text':
            return `${column} ${TEXT_OPS[filter.op]} «${filter.value}»`;
        case 'number':
            return filter.op === 'between' ? `${column} entre ${filter.min} y ${filter.max}` : `${column} ${NUMBER_OPS[filter.op]} ${filter.value}`;
        case 'date':
            return `${column}: ${filter.from ?? '…'} a ${filter.to ?? '…'}`;
        case 'boolean':
            return `${column}: ${filter.value ? 'sí' : 'no'}`;
        case 'null':
            return `${column} ${filter.isNull ? 'vacío' : 'con valor'}`;
    }
};

export const LABELS: Labels = {
    base: 'Filtro del mapa',
    custom: 'CQL propio',
    selection: count => `Solo seleccionados (${count})`,
    filter: filterLabel,
};
