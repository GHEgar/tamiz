import { useEffect, useRef, useState } from 'react';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import TileWMS from 'ol/source/TileWMS.js';
import { fromLonLat } from 'ol/proj.js';
import 'ol/ol.css';
import type { AttributeTable } from '@ghegar/tamiz';
import { bindOlSelection, type OlSelection } from '@ghegar/tamiz/ol';

interface MapViewProps {
    table: AttributeTable;
    wms: string;
    typeName: string;
    cql: string | null;
}

export function MapView({ table, wms, typeName, cql }: MapViewProps) {
    const target = useRef<HTMLDivElement>(null);
    const wmsSource = useRef<TileWMS | null>(null);
    const [binding, setBinding] = useState<OlSelection | null>(null);

    useEffect(() => {
        if (!target.current) return undefined;
        const source = new TileWMS({ url: wms, params: { LAYERS: typeName, TILED: true }, crossOrigin: 'anonymous' });
        wmsSource.current = source;
        const map = new Map({
            target: target.current,
            layers: [new TileLayer({ source: new OSM() }), new TileLayer({ source, opacity: 0.7 })],
            view: new View({ center: fromLonLat([-98, 39]), zoom: 4 }),
        });
        const selection = bindOlSelection(table, map, {
            style: { 'stroke-color': '#e4572e', 'stroke-width': 3, 'fill-color': 'rgba(228, 87, 46, 0.25)' },
            onError: error => console.warn(error),
        });
        setBinding(selection);
        return () => {
            selection.destroy();
            map.setTarget(undefined);
            setBinding(null);
        };
    }, [table, wms, typeName]);

    useEffect(() => {
        const params = { CQL_FILTER: cql ?? undefined };
        wmsSource.current?.updateParams(params);
    }, [cql]);

    return (
        <section className="map">
            <div ref={target} className="map-target" data-testid="map" />
            <button type="button" className="zoom" onClick={() => binding?.zoomToSelection()}>Zoom to selection</button>
        </section>
    );
}
