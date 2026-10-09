import type { Column, ColumnFilter, Schema, Sort } from './types.js';

export interface ColumnState {
    order: readonly string[] | null;
    hidden: ReadonlySet<string>;
    labels: Readonly<Record<string, string>>;
}

export const orderedNames = (schema: Schema, order: readonly string[] | null): string[] => {
    const names = schema.fields.map(field => field.name);
    if (!order) return names;
    const known = new Set(names);
    const first = order.filter(name => known.has(name));
    const placed = new Set(first);
    return [...first, ...names.filter(name => !placed.has(name))];
};

export const buildColumns = (
    schema: Schema | null,
    state: ColumnState,
    sort: Sort | null,
    filters: Readonly<Record<string, ColumnFilter>>,
): Column[] => {
    if (!schema) return [];
    const byName = new Map(schema.fields.map(field => [field.name, field]));
    return orderedNames(schema, state.order).map(name => {
        const field = byName.get(name);
        if (!field) throw new Error(`Unknown column ${name}`);
        return {
            name,
            label: state.labels[name] ?? name,
            type: field.type,
            family: field.family,
            visible: !state.hidden.has(name),
            sort: sort?.field === name ? sort.direction : null,
            filter: filters[name] ?? null,
        };
    });
};

export const moveName = (names: readonly string[], name: string, toIndex: number): string[] => {
    const from = names.indexOf(name);
    if (from === -1) return [...names];
    const next = names.filter(item => item !== name);
    const target = Math.max(0, Math.min(next.length, Math.trunc(toIndex)));
    next.splice(target, 0, name);
    return next;
};
