import type { SelectMode } from './types.js';

export interface SelectionState {
    selection: ReadonlySet<string>;
    anchor: string | null;
}

const rangeBetween = (order: readonly string[], from: string, to: string): string[] | null => {
    const start = order.indexOf(from);
    const end = order.indexOf(to);
    if (start === -1 || end === -1) return null;
    return order.slice(Math.min(start, end), Math.max(start, end) + 1);
};

export const applySelection = (
    current: SelectionState,
    ids: readonly string[],
    mode: SelectMode,
    order: readonly string[],
): SelectionState => {
    const last = ids.length > 0 ? ids[ids.length - 1] as string : current.anchor;
    switch (mode) {
        case 'replace':
            return { selection: new Set(ids), anchor: last };
        case 'add':
            return { selection: new Set([...current.selection, ...ids]), anchor: last };
        case 'toggle': {
            const next = new Set(current.selection);
            for (const id of ids) {
                if (next.has(id)) next.delete(id);
                else next.add(id);
            }
            return { selection: next, anchor: last };
        }
        case 'range': {
            const target = ids[0];
            if (target === undefined) return current;
            const span = current.anchor === null ? null : rangeBetween(order, current.anchor, target);
            if (!span) return { selection: new Set([target]), anchor: target };
            return { selection: new Set(span), anchor: current.anchor };
        }
    }
};

export const sameSelection = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => {
    if (a.size !== b.size) return false;
    for (const id of a) if (!b.has(id)) return false;
    return true;
};

export const clickMode = (event: unknown): SelectMode => {
    if (typeof event !== 'object' || event === null || !('shiftKey' in event)) return 'replace';
    const keys = event as { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };
    return keys.shiftKey || keys.ctrlKey || keys.metaKey ? 'toggle' : 'replace';
};
