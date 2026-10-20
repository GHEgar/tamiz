import { describe, expect, it } from 'vitest';
import { aggregateCountXml, createAttributeTable, parseAggregateCounts, type FetchLike } from '../../src/core/index.js';
import badCql from '../fixtures/gs-stable/aggregate-states-bad-cql.xml?raw';
import empty from '../fixtures/gs-stable/aggregate-states-empty.json?raw';
import landKm from '../fixtures/gs-stable/aggregate-states-land-km.json?raw';
import stateAbbr from '../fixtures/gs-stable/aggregate-states-state-abbr.json?raw';
import subRegionCqlRequest from '../fixtures/gs-stable/aggregate-states-sub-region-cql.request.xml?raw';
import subRegionCql from '../fixtures/gs-stable/aggregate-states-sub-region-cql.json?raw';
import subRegionRequest from '../fixtures/gs-stable/aggregate-states-sub-region.request.xml?raw';
import subRegion from '../fixtures/gs-stable/aggregate-states-sub-region.json?raw';
import booleans from '../fixtures/gs-stable/aggregate-types-boolean.json?raw';
import date from '../fixtures/gs-stable/aggregate-types-date.xml?raw';
import datetimes from '../fixtures/gs-stable/aggregate-types-datetime.json?raw';
import longs from '../fixtures/gs-stable/aggregate-types-long.json?raw';
import strings from '../fixtures/gs-stable/aggregate-types-string.json?raw';

const URL_WFS = 'https://gs-stable.geosolutionsgroup.com/geoserver/wfs';

const parse = (body: string) => parseAggregateCounts(JSON.parse(body) as Record<string, unknown>);

const serve = (body: string, type = 'application/json') => {
    const calls: { url: string; body: string }[] = [];
    const fetch: FetchLike = async (url, init) => {
        calls.push({ url: String(url), body: String(init?.body) });
        return new Response(body, { status: 200, headers: { 'Content-Type': type } });
    };
    return { calls, fetch };
};

const table = (fetch: FetchLike, typeName = 'topp:states', baseCql?: string) => createAttributeTable({
    source: { url: URL_WFS, typeName, fetch },
    distinct: 'wps',
    ...(baseCql ? { baseCql } : {}),
});

describe('gs:Aggregate against recorded gs-stable answers', () => {
    it('builds the exact request that gs-stable answered', () => {
        expect(aggregateCountXml('topp:states', { column: 'SUB_REGION', cql: null })).toBe(subRegionRequest);
        expect(aggregateCountXml('topp:states', { column: 'SUB_REGION', cql: "PERSONS > 3000000 AND STATE_NAME LIKE 'N%'" }))
            .toBe(subRegionCqlRequest);
    });

    it('parses text groups and their counts', () => {
        const groups = parse(subRegion);
        expect(groups).toHaveLength(9);
        expect(groups).toContainEqual({ value: 'S Atl', count: 9 });
        expect(groups.reduce((total, group) => total + group.count, 0)).toBe(49);
        expect(parse(subRegionCql)).toEqual([{ value: 'S Atl', count: 1 }, { value: 'Mid Atl', count: 2 }]);
        expect(parse(empty)).toEqual([]);
    });

    it('keeps the null group and the scalar types as they come', () => {
        expect(parse(stateAbbr)).toContainEqual({ value: null, count: 33 });
        expect(parse(strings)).toContainEqual({ value: null, count: 2 });
        expect(parse(booleans)).toEqual([{ value: false, count: 1 }, { value: true, count: 3 }, { value: null, count: 3 }]);
        expect(parse(landKm)).toContainEqual({ value: 206207.099, count: 1 });
        expect(parse(longs)).toContainEqual({ value: 4354636, count: 1 });
    });

    it('turns serialized timestamps into the ISO text that WFS returns', () => {
        const values = parse(datetimes).map(group => group.value);
        expect(values).toContain('2099-12-08T03:01:01Z');
        expect(values).toContain('2023-08-22T16:28:29.021Z');
        expect(values).toContain(null);
        expect(values.every(value => value === null || typeof value === 'string')).toBe(true);
    });

    it('orders by value or by count before cutting at the limit', async () => {
        const { calls, fetch } = serve(subRegion);
        const attributes = table(fetch, 'topp:states', 'PERSONS > 0');
        expect(await attributes.fetchDistinct('SUB_REGION', { counts: true, limit: 3 }))
            .toEqual({ values: ['E N Cen', 'E S Cen', 'Mid Atl'], counts: [5, 4, 3], complete: false });
        expect(await attributes.fetchDistinct('SUB_REGION', { counts: true, limit: 3, order: 'count' }))
            .toEqual({ values: ['S Atl', 'Mtn', 'W N Cen'], counts: [9, 8, 7], complete: false });
        expect(calls[0]?.url).toBe('https://gs-stable.geosolutionsgroup.com/geoserver/wps');
        expect(calls[0]?.body).toContain('CQL_FILTER=PERSONS%20%3E%200');
    });

    it('drops the null group, sorts numbers as numbers and searches before the limit', async () => {
        const abbr = await table(serve(stateAbbr).fetch).fetchDistinct('STATE_ABBR', { counts: true });
        expect(abbr).toEqual({
            values: ['IL', 'LA', 'ME', 'MO', 'NH', 'NJ', 'NV', 'TN'],
            counts: [2, 2, 3, 5, 1, 1, 1, 1],
            complete: true,
        });
        const km = await table(serve(landKm).fetch).fetchDistinct('LAND_KM', { counts: true, search: '9', limit: 2 });
        expect(km).toEqual({ values: [20300.349, 79939.207], counts: [1, 1], complete: false });
        const flags = await table(serve(booleans).fetch, 'mapstore:Types').fetchDistinct('Boolean', { counts: true, order: 'count' });
        expect(flags).toEqual({ values: [true, false], counts: [3, 1], complete: true });
    });

    it('surfaces the exception text that GeoServer sends with HTTP 200', async () => {
        await expect(table(serve(badCql, 'text/xml').fetch).fetchDistinct('SUB_REGION', { counts: true }))
            .rejects.toThrow('Illegal property name: NOPE for feature type topp:states');
        await expect(table(serve(date, 'text/xml').fetch, 'mapstore:Types').fetchDistinct('Date', { counts: true }))
            .rejects.toThrow('An error occurred while encoding the results of the process');
    });
});
