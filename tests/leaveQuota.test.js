const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../Config/dbConfig');
const Leave = require('../models/leaveModel');

describe('Leave Quota & Balance Calculation', () => {
    after(async () => {
        try { await pool.end(); } catch {}
    });

    test('Leave model exports getLeaveBalance function', () => {
        assert.equal(typeof Leave.getLeaveBalance, 'function');
    });

    test('getLeaveBalance returns well-formed summary structure for employee', async () => {
        // Query for user 1 (superadmin/admin or standard existing user)
        const summary = await Leave.getLeaveBalance(1, 2026);
        assert.ok(summary, 'Summary should be returned');
        assert.equal(summary.employee_id, 1);
        assert.equal(summary.year, 2026);

        // Check limits object
        assert.ok(summary.limits, 'Summary must include limits');
        assert.equal(typeof summary.limits.monthly_casual_leave, 'number');
        assert.equal(typeof summary.limits.annual_casual_leave, 'number');

        // Check remaining object
        assert.ok(summary.remaining, 'Summary must include remaining balances');
        assert.equal(typeof summary.remaining.annual_casual_leave, 'number');
        assert.equal(typeof summary.remaining.monthly_casual_leave, 'number');
        assert.ok(summary.remaining.annual_casual_leave >= 0, 'Remaining annual CL should never be negative');
        assert.ok(summary.remaining.monthly_casual_leave >= 0, 'Remaining monthly CL should never be negative');
    });
});
