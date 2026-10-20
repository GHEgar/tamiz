# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado con
[SemVer](https://semver.org/lang/es/).

## [0.4.1] - 2026-10-20

### Agregado

- `parseAggregateCounts(json)`: lee la respuesta JSON de `gs:Aggregate` (`AggregationResults`).
- `DistinctQuery.order` (opcional): el proveedor recibe el orden pedido.
- Respuestas reales de `gs:Aggregate` de gs-stable grabadas como fixtures en `test/fixtures/gs-stable`.

### Corregido

- `fetchDistinct` con `counts` y `'wps'`: los grupos de columnas `dateTime`, que GeoServer serializa
  como objeto con `time`, se descartaban; ahora salen como el texto ISO que devuelve WFS.
- `order: 'count'` con `limit` cortaba por valor antes de ordenar por conteo; `'scan'` y `'wps'` ahora
  ordenan y aplican `search` antes del límite.

## [0.4.0] - 2026-10-19

### Agregado

- Filtro `combined` (`{ condition, list }`): una condición y una lista de valores en la misma columna,
  unidas con `AND`. Tipos `ConditionFilter` y `CombinedFilter`.
- `setColumnCondition(column, condition)` y `setColumnValues(column, values)` en la tabla: cambian una
  parte del filtro de la columna y conservan la otra; `null` o una lista vacía la quitan.
- `combineFilters`, `splitFilter`, `withCondition` y `withValues`, y el tipo `FilterParts`.
- Conteo por valor en `fetchDistinct` con `counts: true` y orden `order: 'count'` (tipo
  `DistinctOrder`): `'scan'` cuenta las filas leídas y `'wps'` usa `gs:Aggregate` con `Count`
  agrupado por la columna. `DistinctValues.counts` y `DistinctQuery.counts`; `aggregateCounts`,
  `aggregateCountXml` y los tipos `CountRequest` y `ValueCount`.
- `useDistinctValues` acepta `counts` y `order` y devuelve `counts` (`null` si no se pidió).
- Demo: la lista de valores muestra el conteo y se combina con la condición de la columna.
- Opción `composer` (con `fragment`, `'table'` por omisión) en `createAttributeTable`: `snapshot.cql`
  se escribe como fragmento con nombre en un compositor compartido cada vez que cambia y `null` al
  destruir la tabla. Tipo estructural `CqlComposerLike`; el `CqlComposer` de urdimbre encaja.
- Opción `arbiter` (con `tool`, `'table'` por omisión) en `bindOlSelection`: en lugar de escuchar
  `singleclick`, reclama el árbitro y solo selecciona con los clics que este le entrega. Tipos
  `ArbiterLike` y `MapPointerLike`; el `Arbiter` de urdimbre encaja.
- `activate()`, `deactivate()` y `active` en el puente de OpenLayers, con o sin árbitro.
- `DEFAULT_Z_INDEX` (1000) exportado; el README documenta la banda de herramientas 900–999 de urdimbre.
- Entrada `@npmegar/tamiz/maplibre` con `bindMapLibreSelection`: resalta la selección en una fuente
  GeoJSON propia (capas `DEFAULT_LAYERS` o `layers`, con `beforeId`) o con `feature-state` sobre una
  capa del consumidor; selecciona con clic consultando lo dibujado (`queryLayers`) o pidiendo al WFS un
  `BBOX` en `EPSG:3857`; `pick`, `zoomOnSelect` (`true` o `'single'`), `zoomToSelection`, `arbiter` y
  `tool`, `activate()` y `deactivate()`. Tipo estructural `MapLibreMapLike`; `maplibre-gl >= 6` es peer
  opcional.
- Opción `composerScope` en `createAttributeTable`: `'user'` publica al compositor solo el CQL del
  usuario, sin `baseCql`; `'all'` (por omisión) publica `snapshot.cql` como hasta ahora.

### Cambiado

- `ColumnFilter` suma `combined`: un `switch` exhaustivo sobre `kind` deja de compilar.
- Los valores distintos de una columna ya no ignoran su condición: solo se omite su propia lista.
- El paquete pasa a llamarse `@npmegar/tamiz`.
- El demo está en inglés.
- El demo usa los íconos de tesela.

## [0.3.0] - 2026-10-13

### Agregado

- Filtro `date` con `before`: límite superior exclusivo (`<`), para rangos semiabiertos como «antes
  del 1 de febrero».
- Opción `stableSort` (`true` o un nombre de campo): ordena todas las páginas por ese campo cuando no
  hay orden elegido, porque GeoServer pide `sortBy` para paginar tablas sin llave primaria.

### Cambiado

- El build del demo separa OpenLayers y React en chunks propios; ninguno pasa de 500 kB.

## [0.2.0] - 2026-10-13

### Agregado

- `fetchDistinct(column, { limit, search, applyQuery, scanSize })`: valores distintos de una columna
  para el filtro de lista, con la estrategia de la opción `distinct`: `scan` (una página de esa sola
  columna, por defecto), `wps` (`gs:PagedUnique` de GeoServer) o una función propia. Respeta el CQL
  de la tabla salvo el filtro de la propia columna. Se exportan `scanDistinct` y `wpsDistinct`.
- `WfsSource.wpsUrl` para cuando el endpoint WPS no se deduce del WFS.
- `@ghegar/tamiz/react`: `useDistinctValues`.
- `@ghegar/tamiz/ol`: `pick` acepta una función `(features, coordinate) => features`.
- e2e con Playwright contra el demo y un GeoServer público (`npm run e2e`).
- Workflow que publica el demo en GitHub Pages.

### Cambiado

- El lint usa `@ghegar/eslint-config` (presets `base`, `react` y `ts`) en lugar de una config propia.
- El clic en el mapa pide hasta `maxFeatures` en todos los modos y descarta los features cuya
  geometría no toca el clic.

### Corregido

- Los filtros de texto escapan `%`, `_` y `\`: antes `%` y `_` funcionaban como comodines.
- `pick: 'first'` toma el feature dibujado encima (el último del orden natural), no el primero que
  devuelve GeoServer.

## [0.1.0] - 2026-10-09

### Agregado

- Cliente WFS 2.0.0 y 1.1.0: `DescribeFeatureType` en JSON, `GetFeature` paginado con `startIndex`,
  `count`/`maxFeatures`, `sortBy`, `propertyName` y `CQL_FILTER`; conteo por `numberMatched` o
  `resultType=hits`; POST automático cuando la URL es demasiado larga; texto de la excepción del
  servidor en el error.
- Filtros por columna (`list`, `text`, `number`, `date`, `boolean`, `null`) traducidos a CQL con escape
  de literales e identificadores.
- `createAttributeTable`: store con `subscribe`/`getSnapshot`, CQL heredado, CQL propio, chips,
  orden, paginación, columnas visibles y ordenables, selección (`replace`, `toggle`, `add`, `range`),
  solo seleccionados y eventos por `onEvent`.
- Descargas (`csv`, `json`, `shape-zip`, `kml`, `gml` o un `outputFormat` propio) de lo filtrado con
  las columnas visibles, como URL o como `Blob`.
- `@ghegar/tamiz/react`: `useAttributeTable` con prop getters y ARIA de grid.
- `@ghegar/tamiz/ol`: `bindOlSelection` para resaltar la selección, seleccionar con clic en el mapa y
  hacer zoom a la selección.
- Demo en Vite contra un GeoServer público.
