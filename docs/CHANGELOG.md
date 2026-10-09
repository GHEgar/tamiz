# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado con
[SemVer](https://semver.org/lang/es/).

## [No publicado]

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
