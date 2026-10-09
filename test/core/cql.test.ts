import { describe, expect, it } from 'vitest';
import { and, bboxToCql, defaultFilterLabel, filterToCql, idsToCql, isEmptyFilter, literal, quoteIdentifier } from '../../src/core/index.js';

describe('cql', () => {
    it('quotes identifiers only when needed', () => {
        expect(quoteIdentifier('poblacion')).toBe('poblacion');
        expect(quoteIdentifier('Población total')).toBe('"Población total"');
        expect(quoteIdentifier('a"b')).toBe('"a""b"');
    });

    it('escapes string literals and rejects non finite numbers', () => {
        expect(literal("O'Higgins")).toBe("'O''Higgins'");
        expect(literal(3)).toBe('3');
        expect(literal(true)).toBe('true');
        expect(() => literal(Number.NaN)).toThrow(RangeError);
    });

    it('builds list filters', () => {
        expect(filterToCql('clave', { kind: 'list', values: ['001'] })).toBe("clave = '001'");
        expect(filterToCql('clave', { kind: 'list', values: ['001', 2, ''] })).toBe("clave IN ('001', 2)");
        expect(filterToCql('clave', { kind: 'list', values: [] })).toBeNull();
    });

    it('builds text filters', () => {
        expect(filterToCql('nombre', { kind: 'text', op: 'contains', value: 'gua' })).toBe("nombre ILIKE '%gua%'");
        expect(filterToCql('nombre', { kind: 'text', op: 'startsWith', value: 'Za', caseSensitive: true })).toBe("nombre LIKE 'Za%'");
        expect(filterToCql('nombre', { kind: 'text', op: 'equals', value: 'Tala', caseSensitive: true })).toBe("nombre = 'Tala'");
        expect(filterToCql('nombre', { kind: 'text', op: 'contains', value: '' })).toBeNull();
    });

    it('builds number, date, boolean and null filters', () => {
        expect(filterToCql('p', { kind: 'number', op: 'gte', value: 10 })).toBe('p >= 10');
        expect(filterToCql('p', { kind: 'number', op: 'between', min: 9, max: 2 })).toBe('p BETWEEN 2 AND 9');
        expect(filterToCql('p', { kind: 'number', op: 'eq', value: Number.NaN })).toBeNull();
        expect(filterToCql('f', { kind: 'date', from: '2026-01-01' })).toBe("f >= '2026-01-01'");
        expect(filterToCql('f', { kind: 'date', from: '2026-01-01', to: '2026-02-01' })).toBe("f >= '2026-01-01' AND f <= '2026-02-01'");
        expect(filterToCql('b', { kind: 'boolean', value: false })).toBe('b = false');
        expect(filterToCql('b', { kind: 'null', isNull: true })).toBe('b IS NULL');
        expect(isEmptyFilter({ kind: 'date' })).toBe(true);
    });

    it('combines expressions and ids', () => {
        expect(and([null, ' a = 1 ', ''])).toBe('a = 1');
        expect(and(['a = 1', 'b = 2'])).toBe('(a = 1) AND (b = 2)');
        expect(and([])).toBeNull();
        expect(idsToCql(['m.1', 'm.2'], null)).toBe("IN ('m.1', 'm.2')");
        expect(idsToCql(['001'], 'clave')).toBe("clave IN ('001')");
        expect(idsToCql([], null)).toBeNull();
        expect(bboxToCql('geom', [0, 1, 2, 3], 'EPSG:3857')).toBe("BBOX(geom, 0, 1, 2, 3, 'EPSG:3857')");
    });

    it('labels filters', () => {
        expect(defaultFilterLabel('clave', { kind: 'list', values: ['a', 'b', 'c', 'd', 'e'] })).toBe('clave: a, b, c +2');
        expect(defaultFilterLabel('p', { kind: 'number', op: 'between', min: 1, max: 5 })).toBe('p: 1–5');
    });
});
