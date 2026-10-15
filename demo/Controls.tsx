import { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, Close } from 'tesela/react';
import type { DownloadFormat } from '@ghegar/tamiz';
import type { UseAttributeTable } from '@ghegar/tamiz/react';

const FORMATS: DownloadFormat[] = ['csv', 'json', 'shape-zip', 'kml'];

const save = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function CqlEditor({ initial, onApply }: { initial: string; onApply: (cql: string) => void }) {
    const [draft, setDraft] = useState(initial);
    return (
        <div className="row">
            <textarea
                value={draft}
                onChange={event => setDraft(event.target.value)}
                rows={2}
                spellCheck={false}
                aria-label="CQL expression"
                data-testid="cql"
            />
            <button type="button" onClick={() => onApply(draft)}>Apply CQL</button>
        </div>
    );
}

export function Controls({ table: t }: { table: UseAttributeTable }) {
    const [busy, setBusy] = useState<string | null>(null);
    const source = t.customCql ?? t.filtersCql ?? '';

    const download = async (format: DownloadFormat): Promise<void> => {
        setBusy(format);
        try {
            const result = await t.table.download({ format, onlySelected: t.selection.size > 0 && t.onlySelected });
            save(result.blob, result.filename);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="controls">
            <div className="chips" data-testid="chips">
                {t.chips.map(chip => (
                    <span key={chip.key} className="chip" data-source={chip.source}>
                        {chip.label}
                        {chip.removable && (
                            <button type="button" aria-label={`Remove ${chip.label}`} onClick={() => t.table.removeChip(chip.key)}><Close size={12} /></button>
                        )}
                    </span>
                ))}
                {t.chips.length === 0 && <span className="muted">No filters</span>}
            </div>
            <CqlEditor key={source} initial={source} onApply={cql => t.table.setCql(cql)} />
            <div className="row">
                <details>
                    <summary>Columns ({t.visibleColumns.length}/{t.columns.length})</summary>
                    <div className="columns">
                        {t.columns.map((column, index) => (
                            <label key={column.name}>
                                <input {...t.getColumnToggleProps(column)} />
                                {column.label}
                                <button type="button" aria-label={`Move ${column.label} up`} disabled={index === 0} onClick={() => t.table.moveColumn(column.name, index - 1)}><ChevronUp size={14} /></button>
                            </label>
                        ))}
                    </div>
                </details>
                <label>
                    <input type="checkbox" checked={t.onlySelected} onChange={event => t.table.setOnlySelected(event.target.checked)} />
                    Selected only ({t.selection.size})
                </label>
                <button type="button" disabled={t.selection.size === 0} onClick={() => t.table.clearSelection()}>Clear selection</button>
                <span className="spacer" />
                {FORMATS.map(format => (
                    <button key={format} type="button" disabled={busy !== null} onClick={() => void download(format)}>
                        {busy === format ? '…' : format}
                    </button>
                ))}
            </div>
            <div className="row pager" data-testid="pager">
                <button type="button" aria-label="Previous page" disabled={t.page === 0} onClick={() => t.table.setPage(t.page - 1)}><ChevronLeft size={14} /></button>
                <span>
                    Page {t.page + 1} of {t.pageCount ?? '…'} · {t.total ?? '…'} records
                    {t.status === 'loading' ? ' · loading' : ''}
                </span>
                <button type="button" aria-label="Next page" disabled={t.pageCount === null || t.page + 1 >= t.pageCount} onClick={() => t.table.setPage(t.page + 1)}><ChevronRight size={14} /></button>
            </div>
        </div>
    );
}
