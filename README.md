# <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/icon-dark.svg"><img src=".github/assets/icon-light.svg" width="36" height="36" alt=""></picture> tamiz

[![npm](https://img.shields.io/npm/v/@npmegar/tamiz)](https://www.npmjs.com/package/@npmegar/tamiz)
[![size](https://img.shields.io/bundlejs/size/@npmegar/tamiz)](https://bundlejs.com/?q=@npmegar/tamiz)
[![license](https://img.shields.io/github/license/GHEgar/tamiz)](LICENSE)

Headless attribute table for WFS/GeoServer layers: CQL filters, paging, download and selection synced with OpenLayers or MapLibre.

![A table of US states sorted, filtered by name and selected from the table and from the map](.github/assets/demo.gif)

**[Live demo](https://ghegar.github.io/tamiz/)**

tamiz owns the state — schema, paging, sorting, column filters turned into CQL, hand-written CQL,
column visibility and order, selection, downloads — and you own every pixel: it ships no styles, only
state, events and ARIA/`data-*` attributes. Optional bridges keep the selection in sync with an
OpenLayers or MapLibre map.

## Install

```bash
npm install @npmegar/tamiz
```

| Entry | What it is | Needs |
|---|---|---|
| `@npmegar/tamiz` | Framework-free core: WFS client, CQL builder, table store | nothing |
| `@npmegar/tamiz/react` | `useAttributeTable` with prop getters, `useDistinctValues` | `react >= 19` |
| `@npmegar/tamiz/ol` | `bindOlSelection`: highlight, click to select, zoom to selection | `ol >= 10` |
| `@npmegar/tamiz/maplibre` | `bindMapLibreSelection`: the same for MapLibre GL JS | `maplibre-gl >= 6` |

## Quick start

```ts
import { createAttributeTable } from '@npmegar/tamiz';
import { bindOlSelection } from '@npmegar/tamiz/ol';

const table = createAttributeTable({
    source: { url: 'https://example.org/geoserver/wfs', typeName: 'ws:municipalities', version: '2.0.0' },
    pageSize: 50,
});

table.subscribe(() => render(table.getSnapshot()));
table.start();

table.setFilter('population', { kind: 'number', op: 'gt', value: 10000 });
bindOlSelection(table, map, { style: { 'stroke-color': '#e4572e', 'stroke-width': 3 } });
```

## Core

```ts
import { createAttributeTable } from '@npmegar/tamiz';

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

### Requests and paging

Nothing is fetched until `start()`. Several changes in the same tick become one request; a new query
aborts the request in flight. Changing the query resets the page to 0. The total comes from
`numberMatched` when the server sends it, or from a `resultType=hits` request.

GeoServer needs a `sortBy` to page tables without a primary key. `stableSort: true` sorts every page
by the first field when the user has not picked a sort (or pass a field name); the snapshot's `sort`
stays `null`.

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
| `date` | `{ from?, to?, before? }` (ISO strings; `before` is exclusive) | `>=` / `<=` / `<` |
| `boolean` | `{ value }` | `col = true` |
| `null` | `{ isNull }` | `IS NULL` / `IS NOT NULL` |
| `combined` | `{ condition, list }`: any of the above but `list`, plus a `list` | `(condition) AND (col IN (…))` |

A column holds one filter, but a condition and a list of values can live together on it:

```ts
table.setColumnCondition('name', { kind: 'text', op: 'contains', value: 'san' });
table.setColumnValues('name', ['San Juan', 'San Pedro']);
// (name ILIKE '%san%') AND (name IN ('San Juan', 'San Pedro'))

const { condition, list } = splitFilter(table.getSnapshot().filters.name);
```

`setColumnCondition` and `setColumnValues` replace one part and keep the other; `null` or an empty
list removes that part, and the filter collapses to a plain one when a single part is left.
`combineFilters(condition, list)`, `withCondition(filter, condition)` and `withValues(filter, values)`
do the same on plain objects, and `splitFilter(filter)` gives `{ condition, list }` back.

Text filters escape `%`, `_` and `\`, so they match those characters literally. Use a hand-written
CQL when you need wildcards.

### Composing the CQL

A hand-written CQL (`setCql`) replaces the column filters until it is removed; they are kept and come
back. `baseCql` is the condition the table inherits (for example, the map's filters) and it is never
removable from the table. Chip labels are English by default; pass `labels` to translate them.

### Distinct values

WFS has no way to ask for the distinct values of a column, so `fetchDistinct` picks a strategy from
the `distinct` option:

```ts
const table = createAttributeTable({ source, distinct: 'scan' });

const { values, complete } = await table.fetchDistinct('region', { limit: 200, search: 'atl' });
```

| Strategy | How | Trade-off |
|---|---|---|
| `'scan'` (default) | One `GetFeature` page of that column alone, sorted, deduplicated | Any WFS; a page full of repeated values can cut the list short |
| `'wps'` | GeoServer's `gs:PagedUnique` process | Exact, but needs the WPS extension; with `limit` it returns an arbitrary subset |
| `(query) => Promise<{ values, complete }>` | Your own source | Values you already know or keep in a catalog |

The values honor the table's query except the column's own list of values, so picking values for
`region` is not narrowed by the regions already picked; a condition on that same column does apply. `applyQuery: false` ignores the query. `search`
narrows text columns on the server and the rest on the client. Values come sorted; `complete` is
`false` when there may be more. The WPS endpoint is the WFS URL with `/wfs` replaced by `/wps`, or
`source.wpsUrl`. `scanDistinct` and `wpsDistinct` are exported to build your own fallback.

```ts
const { values, counts } = await table.fetchDistinct('region', { counts: true, order: 'count' });
// values: ['Pacific', 'Mtn', …], counts: [412, 167, …]
```

With `counts: true` the result also has `counts`, one per value. `'scan'` counts the rows it read, so
they are exact only when `complete` is `true`; `'wps'` switches to GeoServer's `gs:Aggregate` with
`Count` grouped by the column, which is exact and returns every group. Both sort by `order` and apply
`search` before cutting to `limit`, so `order: 'count'` with a `limit` gives the most frequent values.
The null group is left out, and timestamps come back as the same ISO text WFS returns. Your own
provider receives `counts` and `order` in the query and may return `counts`; without them, or when they
do not line up with `values`, the result has none. `order: 'count'` sorts by count, highest first.
`aggregateCounts(source, { column, cql })` and `parseAggregateCounts(json)` are exported too.

### Ids

With `idField: null` rows use the WFS feature id (`layer.123`) and selections filter with
`IN ('layer.123')`. With an attribute name they use that attribute.

## React

```tsx
import { useAttributeTable } from '@npmegar/tamiz/react';

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

```tsx
const { values, counts, complete, status } = useDistinctValues(table, 'region', { search, limit: 100, counts: true });
```

`useDistinctValues` waits until the table has started and knows its schema, asks again when the
query, column or options change, and aborts the request it no longer needs. `counts` is `null` unless
it was asked for and the strategy gave them.

## OpenLayers

```ts
import { bindOlSelection } from '@npmegar/tamiz/ol';

const selection = bindOlSelection(table, map, {
    style: { 'stroke-color': '#e4572e', 'stroke-width': 3 },
    hitTolerance: 4,
    applyQuery: true,
    pick: 'first',
});
selection.zoomToSelection();
selection.destroy();
```

The bridge adds a vector layer, fetches the geometries of the selected ids in the view projection,
and turns map clicks into a `BBOX` query combined with the table's CQL. A plain click replaces the
selection; Ctrl, ⌘ or Shift toggle. It asks for up to `maxFeatures` (50) features and keeps those
whose geometry touches the click. `pick: 'first'` (default) takes the one drawn on top: the WMS paints
in the layer's natural order, so that is the last one returned. `pick: 'all'` takes every touched
feature, and a function `(features, coordinate) => features` decides for styles that reorder with
`sortBy` or z-order. It does not touch your WMS layer: pass `snapshot.cql` to its `CQL_FILTER` if the
map should follow the table.

## MapLibre

```ts
import { bindMapLibreSelection } from '@npmegar/tamiz/maplibre';

const selection = bindMapLibreSelection(table, map, {
    beforeId: 'labels',
    zoomOnSelect: 'single',
});
await selection.zoomToSelection();
selection.destroy();
```

The map is typed structurally (`MapLibreMapLike`) and `maplibre-gl` is only a type import. By default
the bridge adds a GeoJSON source (`tamiz-selection`) and three layers (`DEFAULT_LAYERS`: fill, line and
circle; `layers` replaces them, `beforeId` places them), and fills it with the selected geometries,
fetched in `EPSG:3857` and turned into lng/lat on the client. With
`highlight: { source, sourceLayer?, key?, featureId? }` it sets `feature-state` (`selected` by default)
on your own layer instead and fetches no geometry; that source needs feature ids (`promoteId`) that
match the table ids, or `featureId` to map them.

A plain click replaces the selection; Ctrl, ⌘ or Shift toggle. With `queryLayers` the click reads
what those layers draw (`queryRenderedFeatures` in a `hitTolerance` pixel box) and takes the id from
`idField` or the feature id; without it, it asks the WFS for a `BBOX` around the click in `EPSG:3857`,
combined with the table's CQL, which suits WMS layers. Candidates come top first, so `pick: 'first'`
(default) is the one on top. `zoomOnSelect: true` fits any selection made in the table, `'single'` only
a single row; selections made on the map never move it.

## Working with urdimbre

These options are optional and structural, so tamiz does not depend on urdimbre:

- `composer` (any object with `set(name, fragment)`, such as urdimbre's `CqlComposer`) receives
  `snapshot.cql` as the `table` fragment (`fragment` renames it) every time it changes, and `null` on
  `destroy()`, instead of you copying it to the WMS. If the map's filters are already fragments, leave
  them out of `baseCql` so they are not sent twice.
- `bindOlSelection(table, map, { arbiter })` does not listen to `singleclick`: it claims the arbiter as
  `tool` (`table` by default) and selects only with the clicks the arbiter hands over. When another tool
  claims, the bridge steps aside; `activate()` claims again, `deactivate()` lets go and `active` tells
  which. Without an arbiter they attach and detach the map listener.
- `composerScope: 'user'` publishes only what the user filters in the table (column filters or
  custom CQL, plus "only selected"), without `baseCql`. Use it when `baseCql` is a condition for the
  table alone, such as "only what is visible", that must not filter the map. The default, `'all'`,
  publishes `snapshot.cql`.
- `bindMapLibreSelection` takes the same `arbiter` and `tool` options; its pointer also carries the
  `pixel`, as urdimbre's `MapPointer` does.
- The selection layer uses `zIndex` 1000 by default, above urdimbre's tool band (900–999); pass a value
  in that band to sit among the other tools.
- `source.url` is used as given and `source.wpsUrl` skips guessing the WPS endpoint, so a catalog that
  already resolved both can pass them straight through.

## Known limitations

- Built for GeoServer WFS 2.0.0 and 1.1.0: `CQL_FILTER` is a GeoServer vendor parameter.
- Without a primary key GeoServer cannot page unless every request has a `sortBy`: use `stableSort`.
- `'scan'` distinct values can come out short when one page is full of repeated values; `'wps'` needs
  the WPS extension and, with `limit`, returns an arbitrary subset.
- GeoServer's `gs:Aggregate` cannot encode a group of a `date` or `time` column: with `'wps'` and
  `counts`, those columns reject with GeoServer's error. `dateTime` columns work.
- With more than `maxFeatures` features under a map click, the one on top may not be among them.
- In WFS 2.0 with `EPSG:4326` GeoServer answers in lat/lon order. The bridge always asks for the view
  projection, so it is not affected; a request in `EPSG:4326` made by hand is.
- Virtualizing long pages is up to you.
- After `map.setStyle()` the MapLibre bridge redraws its own source on the next selection change, but
  `feature-state` marks are lost until the selection changes; rebind it to restore them.

## Development

```bash
npm test
npm run lint
npm run typecheck
npm run demo
npm run e2e
```

The demo opens a table and a map against a public GeoServer (`topp:states`). Point it at another
server with `?wfs=…&type=ws:layer&version=1.1.0&wms=…`, and ask distinct values through WPS with
`?distinct=wps`. `npm run e2e` runs Playwright against the demo and that live server.

## Contributing

Issues are welcome. Open one before sending a pull request.

## License

AGPL-3.0-only © GHEgar
