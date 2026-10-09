import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { AttributeTable, Column, Row, SelectMode, TableSnapshot } from '../core/index.js';

export interface TableProps {
    role: 'grid';
    'aria-rowcount': number;
    'aria-colcount': number;
    'aria-busy': boolean;
    'aria-multiselectable': true;
    'data-status': TableSnapshot['status'];
}

export interface HeaderProps {
    role: 'columnheader';
    'aria-sort': 'ascending' | 'descending' | 'none';
    'aria-colindex': number;
    'data-column': string;
    'data-family': Column['family'];
    'data-sorted'?: 'asc' | 'desc';
    'data-filtered'?: true;
    onClick?: () => void;
}

export interface RowProps {
    role: 'row';
    'aria-rowindex': number;
    'aria-selected': boolean;
    'data-row-id': string;
    'data-selected'?: true;
    tabIndex: number;
    onClick: (event: MouseEvent) => void;
    onKeyDown: (event: KeyboardEvent) => void;
}

export interface CellProps {
    role: 'gridcell';
    'aria-colindex': number;
    'data-column': string;
    'data-family': Column['family'];
}

export interface ColumnToggleProps {
    type: 'checkbox';
    checked: boolean;
    'aria-label': string;
    onChange: () => void;
}

export interface UseAttributeTable extends TableSnapshot {
    table: AttributeTable;
    getTableProps(): TableProps;
    getHeaderProps(column: Column, options?: { sortable?: boolean }): HeaderProps;
    getRowProps(row: Row, index: number): RowProps;
    getCellProps(row: Row, column: Column): CellProps;
    getColumnToggleProps(column: Column): ColumnToggleProps;
}

type Modifiers = { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean };

export const modeFromEvent = (event: Modifiers): SelectMode => {
    if (event.shiftKey) return 'range';
    if (event.ctrlKey || event.metaKey) return 'toggle';
    return 'replace';
};

export const useAttributeTable = (table: AttributeTable, options: { autoStart?: boolean } = {}): UseAttributeTable => {
    const snapshot = useSyncExternalStore(table.subscribe, table.getSnapshot, table.getSnapshot);
    const autoStart = options.autoStart ?? true;

    useEffect(() => {
        if (autoStart) table.start();
    }, [autoStart, table]);

    const columnIndex = useCallback(
        (column: Column): number => snapshot.visibleColumns.findIndex(item => item.name === column.name) + 1,
        [snapshot.visibleColumns],
    );

    const getTableProps = useCallback((): TableProps => ({
        role: 'grid',
        'aria-rowcount': snapshot.total ?? -1,
        'aria-colcount': snapshot.visibleColumns.length,
        'aria-busy': snapshot.status === 'loading',
        'aria-multiselectable': true,
        'data-status': snapshot.status,
    }), [snapshot.status, snapshot.total, snapshot.visibleColumns.length]);

    const getHeaderProps = useCallback((column: Column, headerOptions: { sortable?: boolean } = {}): HeaderProps => {
        const props: HeaderProps = {
            role: 'columnheader',
            'aria-sort': column.sort === 'asc' ? 'ascending' : column.sort === 'desc' ? 'descending' : 'none',
            'aria-colindex': columnIndex(column),
            'data-column': column.name,
            'data-family': column.family,
        };
        if (column.sort) props['data-sorted'] = column.sort;
        if (column.filter) props['data-filtered'] = true;
        if (headerOptions.sortable ?? true) props.onClick = () => table.toggleSort(column.name);
        return props;
    }, [columnIndex, table]);

    const getRowProps = useCallback((row: Row, index: number): RowProps => {
        const selected = snapshot.selection.has(row.id);
        const props: RowProps = {
            role: 'row',
            'aria-rowindex': snapshot.page * snapshot.pageSize + index + 2,
            'aria-selected': selected,
            'data-row-id': row.id,
            tabIndex: -1,
            onClick: event => table.select(row.id, modeFromEvent(event)),
            onKeyDown: event => {
                if (event.key !== ' ' && event.key !== 'Enter') return;
                event.preventDefault();
                table.select(row.id, event.shiftKey ? 'range' : 'toggle');
            },
        };
        if (selected) props['data-selected'] = true;
        return props;
    }, [snapshot.page, snapshot.pageSize, snapshot.selection, table]);

    const getCellProps = useCallback((_row: Row, column: Column): CellProps => ({
        role: 'gridcell',
        'aria-colindex': columnIndex(column),
        'data-column': column.name,
        'data-family': column.family,
    }), [columnIndex]);

    const getColumnToggleProps = useCallback((column: Column): ColumnToggleProps => ({
        type: 'checkbox',
        checked: column.visible,
        'aria-label': column.label,
        onChange: () => table.setColumnVisible(column.name, !column.visible),
    }), [table]);

    return useMemo(() => ({
        ...snapshot,
        table,
        getTableProps,
        getHeaderProps,
        getRowProps,
        getCellProps,
        getColumnToggleProps,
    }), [snapshot, table, getTableProps, getHeaderProps, getRowProps, getCellProps, getColumnToggleProps]);
};
