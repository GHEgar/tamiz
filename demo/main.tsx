import 'rotulo';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createAttributeTable, useAttributeTable, type DistinctStrategy, type WfsVersion } from '@ghegar/tamiz/react';
import { Controls } from './Controls';
import { FilterForm } from './FilterForm';
import { Grid } from './Grid';
import { MapView } from './MapView';
import { LABELS } from './labels';

const query = new URLSearchParams(window.location.search);
const SOURCE = {
    url: query.get('wfs') ?? 'https://gs-stable.geosolutionsgroup.com/geoserver/wfs',
    typeName: query.get('type') ?? 'topp:states',
    version: (query.get('version') ?? '2.0.0') as WfsVersion,
};
const DISTINCT: Extract<DistinctStrategy, string> = query.get('distinct') === 'wps' ? 'wps' : 'scan';
const WMS = query.get('wms') ?? SOURCE.url.replace(/\/wfs$/, '/wms');

function App() {
    const [log, setLog] = useState<string[]>([]);
    const table = useMemo(() => createAttributeTable({
        source: SOURCE,
        pageSize: 25,
        distinct: DISTINCT,
        labels: LABELS,
        onEvent: event => setLog(previous => [`${event.type}${'cql' in event ? ` · ${event.cql ?? '—'}` : ''}`, ...previous].slice(0, 6)),
    }), []);
    useEffect(() => () => table.destroy(), [table]);
    const t = useAttributeTable(table);

    return (
        <div className="layout">
            <header className="head">
                <strong>tamiz</strong>
                <span>{SOURCE.typeName}</span>
                <span className="muted">{SOURCE.url}</span>
                <span className="muted">values: {DISTINCT}</span>
            </header>
            <MapView table={table} wms={WMS} typeName={SOURCE.typeName} cql={t.cql} />
            <section className="table">
                <FilterForm table={t} />
                <Controls table={t} />
                <Grid table={t} />
                <ul className="log" data-testid="log">
                    {log.map((line, index) => <li key={index}>{line}</li>)}
                </ul>
            </section>
        </div>
    );
}

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}
