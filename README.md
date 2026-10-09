# tamiz

Headless attribute table for WFS layers served by GeoServer. tamiz owns the state — schema, paging,
sorting, column filters turned into CQL, hand-written CQL, column visibility and order, selection,
downloads — and you own every pixel: it ships no styles, only state, events and ARIA/`data-*`
attributes. An optional bridge keeps the selection in sync with an OpenLayers map.

```bash
npm install @ghegar/tamiz
```

| Entry | What it is | Needs |
|---|---|---|
| `@ghegar/tamiz` | Framework-free core: WFS client, CQL builder, table store | nothing |
| `@ghegar/tamiz/react` | `useAttributeTable` with prop getters | `react >= 19` |
| `@ghegar/tamiz/ol` | `bindOlSelection`: highlight, click to select, zoom to selection | `ol >= 10` |

## Core

```ts
import { createAttributeTable } from '@ghegar/tamiz';

const table = createAttributeTable({
    source: { url: 'https://example.org/geoserver/wfs', typeName: 'ws:municipalities', version: '2.0.0' },
    pageSize: 100,
    idField: null,
    baseCql: "year = 2026",
});

table.subscribe(() => render(table.getSnapshot()));
table.start();

table.setFilter('population', { kind: 'number', op: 'between', min: 1000, max: 5000 });
table.setFilter('name', { kind: 'text', op: 'contains', value: 'san' });
table.toggleSort('population');
table.setPage(1);
table.setCql("name ILIKE 'z%'");
table.setColumnVisible('geom_area', false);
table.moveColumn('name', 0);
table.select('municipalities.12', 'range');
table.setOnlySelected(true);

const url = table.downloadUrl({ format: 'shape-zip', filename: 'selection' });
const { blob, filename } = await table.download({ format: 'csv' });
```

Nothing is fetched until `start()`. Several changes in the same tick become one request; a new query
aborts the request in flight. Changing the query resets the page to 0. The total comes from
`numberMatched` when the server sends it, or from a `resultType=hits` request.

### Snapshot

| Field | Meaning |
|---|---|
| `status`, `error` | `idle`, `loading`, `ready` or `error`; the WFS exception text when it fails |
| `schema` | Fields with their family (`text`, `number`, `date`, `boolean`) and the geometry field |
| `columns`, `visibleColumns` | Ordered columns with `label`, `visible`, `sort` and `filter` |
| `rows` | The current page: `{ id, properties }` |
| `page`, `pageSize`, `pageCount`, `total` | Paging |
| `cql` | The effective expression sent to the server |
| `baseCql`, `customCql`, `filtersCql` | Its parts: inherited, hand-written, built from column filters |
| `chips` | One per active condition, with `label`, `source` and `removable`; remove with `removeChip(key)` |
| `selection`, `onlySelected` | Selected ids and whether the table shows only them |

### Filters

| Kind | Shape | CQL |
|---|---|---|
| `list` | `{ values }` | `col IN (…)` |
| `text` | `{ op: 'contains' \| 'startsWith' \| 'endsWith' \| 'equals', value, caseSensitive? }` | `ILIKE` / `LIKE` |
| `number` | `{ op: 'eq' \| 'ne' \| 'lt' \| 'lte' \| 'gt' \| 'gte', value }` or `{ op: 'between', min, max }` | comparison / `BETWEEN` |
| `date` | `{ from?, to? }` (ISO strings) | `>=` / `<=` |
| `boolean` | `{ value }` | `col = true` |
| `null` | `{ isNull }` | `IS NULL` / `IS NOT NULL` |

A hand-written CQL (`setCql`) replaces the column filters until it is removed; they are kept and come
back. `baseCql` is the condition the table inherits (for example, the map's filters) and it is never
removable from the table. Chip labels are English by default; pass `labels` to translate them.

### Ids

With `idField: null` rows use the WFS feature id (`layer.123`) and selections filter with
`IN ('layer.123')`. With an attribute name they use that attribute.

## React

```tsx
import { useAttributeTable } from '@ghegar/tamiz/react';

function Grid({ table }) {
    const t = useAttributeTable(table);
    return (
        <table {...t.getTableProps()}>
            <thead>
                <tr>{t.visibleColumns.map(c => <th key={c.name} {...t.getHeaderProps(c)}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
                {t.rows.map((row, i) => (
                    <tr key={row.id} {...t.getRowProps(row, i)}>
                        {t.visibleColumns.map(c => <td key={c.name} {...t.getCellProps(row, c)}>{String(row.properties[c.name])}</td>)}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
```

Headers toggle sorting (ascending, descending, default). Rows select on click, toggle with Ctrl/⌘,
select a range with Shift, and toggle with Space or Enter. `getColumnToggleProps` fits a checkbox.

## OpenLayers

```ts
import { bindOlSelection } from '@ghegar/tamiz/ol';

const selection = bindOlSelection(table, map, {
    style: { 'stroke-color': '#e4572e', 'stroke-width': 3 },
    hitTolerance: 4,
    applyQuery: true,
});
selection.zoomToSelection();
selection.destroy();
```

The bridge adds a vector layer, fetches the geometries of the selected ids in the view projection,
and turns map clicks into a `BBOX` query combined with the table's CQL. A plain click replaces the
selection; Ctrl, ⌘ or Shift toggle. It does not touch your WMS layer: pass `snapshot.cql` to its
`CQL_FILTER` if the map should follow the table.

## Demo

`npm run demo` opens a table and a map against a public GeoServer (`topp:states`). Point it at another
server with `?wfs=…&type=ws:layer&version=1.1.0&wms=…`.

## License

AGPL-3.0-only.
