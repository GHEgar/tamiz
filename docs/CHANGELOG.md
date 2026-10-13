# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado con
[SemVer](https://semver.org/lang/es/).

## [No publicado]

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
