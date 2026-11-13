const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, getTenantPool } = require('../Config/dbConfig');

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
});
