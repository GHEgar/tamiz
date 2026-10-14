import type { ColumnFilter, Labels } from '@ghegar/tamiz';

const TEXT_OPS = { contains: 'contains', startsWith: 'starts with', endsWith: 'ends with', equals: 'is' } as const;
const NUMBER_OPS = { eq: '=', ne: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥' } as const;

const filterLabel = (column: string, filter: ColumnFilter): string => {
    switch (filter.kind) {
        case 'list':
            return `${column}: ${filter.values.join(', ')}`;
        case 'text':
            return `${column} ${TEXT_OPS[filter.op]} “${filter.value}”`;
        case 'number':
            return filter.op === 'between' ? `${column} between ${filter.min} and ${filter.max}` : `${column} ${NUMBER_OPS[filter.op]} ${filter.value}`;
        case 'date':
            return `${column}: ${filter.from ?? '…'} to ${filter.to ?? filter.before ?? '…'}`;
        case 'boolean':
            return `${column}: ${filter.value ? 'yes' : 'no'}`;
        case 'null':
            return `${column} ${filter.isNull ? 'is empty' : 'has a value'}`;
    }
};

export const LABELS: Labels = {
    base: 'Map filter',
    custom: 'Custom CQL',
    selection: count => `Selected only (${count})`,
    filter: filterLabel,
};
