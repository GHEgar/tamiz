import type { ColumnFilter, FilterLabel, Scalar } from './types.js';

const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const quoteIdentifier = (name: string): string =>
    SIMPLE_IDENTIFIER.test(name) ? name : `"${name.replace(/"/g, '""')}"`;

export const quoteString = (value: string): string => `'${value.replace(/'/g, "''")}'`;

export const literal = (value: Scalar): string => {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
        return String(value);
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return quoteString(value);
};

const isBlank = (value: unknown): boolean => value === null || value === undefined || value === '';

const NUMBER_OPERATORS = { eq: '=', ne: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' } as const;

export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, match => `\\${match}`);

const textPattern = (op: 'contains' | 'startsWith' | 'endsWith' | 'equals', value: string): string => {
    const escaped = escapeLike(value);
    if (op === 'contains') return `%${escaped}%`;
    if (op === 'startsWith') return `${escaped}%`;
    if (op === 'endsWith') return `%${escaped}`;
    return escaped;
};

export const filterToCql = (column: string, filter: ColumnFilter): string | null => {
    const field = quoteIdentifier(column);
    switch (filter.kind) {
        case 'list': {
            const values = filter.values.filter(value => !isBlank(value));
            if (values.length === 0) return null;
            if (values.length === 1) return `${field} = ${literal(values[0] as Scalar)}`;
            return `${field} IN (${values.map(literal).join(', ')})`;
        }
        case 'text': {
            if (isBlank(filter.value)) return null;
            if (filter.op === 'equals' && filter.caseSensitive) return `${field} = ${quoteString(filter.value)}`;
            const operator = filter.caseSensitive ? 'LIKE' : 'ILIKE';
            return `${field} ${operator} ${quoteString(textPattern(filter.op, filter.value))}`;
        }
        case 'number': {
            if (filter.op === 'between') {
                if (!Number.isFinite(filter.min) || !Number.isFinite(filter.max)) return null;
                const [low, high] = filter.min <= filter.max ? [filter.min, filter.max] : [filter.max, filter.min];
                return `${field} BETWEEN ${low} AND ${high}`;
            }
            if (!Number.isFinite(filter.value)) return null;
            return `${field} ${NUMBER_OPERATORS[filter.op]} ${filter.value}`;
        }
        case 'date': {
            const parts: string[] = [];
            if (!isBlank(filter.from)) parts.push(`${field} >= ${quoteString(filter.from as string)}`);
            if (!isBlank(filter.to)) parts.push(`${field} <= ${quoteString(filter.to as string)}`);
            if (!isBlank(filter.before)) parts.push(`${field} < ${quoteString(filter.before as string)}`);
            return parts.length === 0 ? null : parts.join(' AND ');
        }
        case 'boolean':
            return `${field} = ${literal(filter.value)}`;
        case 'null':
            return `${field} ${filter.isNull ? 'IS NULL' : 'IS NOT NULL'}`;
        case 'combined':
            return and([filterToCql(column, filter.condition), filterToCql(column, filter.list)]);
    }
};

export const and = (expressions: readonly (string | null | undefined)[]): string | null => {
    const valid = expressions.map(expression => expression?.trim()).filter((expression): expression is string => Boolean(expression));
    if (valid.length === 0) return null;
    if (valid.length === 1) return valid[0] as string;
    return valid.map(expression => `(${expression})`).join(' AND ');
};

export const filtersToCql = (filters: Readonly<Record<string, ColumnFilter>>): string | null =>
    and(Object.entries(filters).map(([column, filter]) => filterToCql(column, filter)));

export const idsToCql = (ids: readonly string[], idField: string | null): string | null => {
    if (ids.length === 0) return null;
    const list = ids.map(quoteString).join(', ');
    return idField ? `${quoteIdentifier(idField)} IN (${list})` : `IN (${list})`;
};

export const bboxToCql = (geometryField: string, extent: readonly number[], srsName: string): string =>
    `BBOX(${quoteIdentifier(geometryField)}, ${extent.join(', ')}, ${quoteString(srsName)})`;

export const isEmptyFilter = (filter: ColumnFilter): boolean => filterToCql('x', filter) === null;

const shortList = (values: readonly Scalar[]): string => {
    const shown = values.slice(0, 3).map(String).join(', ');
    return values.length > 3 ? `${shown} +${values.length - 3}` : shown;
};

export const defaultFilterLabel: FilterLabel = (column, filter) => {
    switch (filter.kind) {
        case 'list':
            return `${column}: ${shortList(filter.values)}`;
        case 'text':
            return `${column} ${filter.op} "${filter.value}"`;
        case 'number':
            return filter.op === 'between'
                ? `${column}: ${filter.min}–${filter.max}`
                : `${column} ${NUMBER_OPERATORS[filter.op]} ${filter.value}`;
        case 'date':
            if (filter.from && filter.to) return `${column}: ${filter.from}–${filter.to}`;
            if (filter.from && filter.before) return `${column}: ${filter.from}–<${filter.before}`;
            if (filter.before) return `${column} < ${filter.before}`;
            return filter.from ? `${column} ≥ ${filter.from}` : `${column} ≤ ${filter.to ?? ''}`;
        case 'boolean':
            return `${column}: ${filter.value ? 'yes' : 'no'}`;
        case 'null':
            return `${column} ${filter.isNull ? 'is empty' : 'is not empty'}`;
        case 'combined':
            return [filter.condition, filter.list]
                .filter(part => !isEmptyFilter(part))
                .map(part => defaultFilterLabel(column, part))
                .join(' · ');
    }
};
