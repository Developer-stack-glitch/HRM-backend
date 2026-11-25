const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, getTenantPool, formatTimestampField } = require('../Config/dbConfig');

describe('Database Multi-Tenancy & Pool Caching', () => {
    after(async () => {
        try { await pool.end(); } catch {}
    });

    test('Default pool is a valid mysql2 pool', () => {
        assert.ok(pool, 'Default pool should exist');
        assert.equal(typeof pool.execute, 'function', 'pool.execute should be a function');
        assert.equal(typeof pool.query, 'function', 'pool.query should be a function');
    });

    test('getTenantPool returns cached pool for identical tenant database', () => {
        const pool1 = getTenantPool('test_tenant_alpha');
        const pool2 = getTenantPool('test_tenant_alpha');
        assert.equal(pool1, pool2, 'Consecutive calls for same dbName must return the identical pool reference');
    });

    test('getTenantPool falls back to root pool if dbName is null or matches DB_NAME', () => {
        const fallback1 = getTenantPool(null);
        const fallback2 = getTenantPool(process.env.DB_NAME);
        assert.equal(fallback1, pool, 'Null dbName must return root pool');
        assert.equal(fallback2, pool, 'Matching DB_NAME must return root pool');
    });

    test('formatTimestampField appends +05:30 ISO offset only to non-empty TIMESTAMP fields', () => {
        const nextSentinel = Symbol('next');
        const tsResult = formatTimestampField(
            { type: 'TIMESTAMP', string: () => '2026-11-25 10:12:00' },
            () => nextSentinel
        );
        assert.equal(tsResult, '2026-11-25T10:12:00+05:30');

        const nullTsResult = formatTimestampField(
            { type: 'TIMESTAMP', string: () => null },
            () => nextSentinel
        );
        assert.equal(nullTsResult, null);

        const dateResult = formatTimestampField(
            { type: 'DATE', string: () => '2026-11-25' },
            () => nextSentinel
        );
        assert.equal(dateResult, nextSentinel);
    });
});
