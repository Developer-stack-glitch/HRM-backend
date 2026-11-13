const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { isUserAdmin } = require('../middleware/authMiddleware');

describe('Security & RBAC Authorization Logic', () => {
    test('Identifies Superadmin and Admin as admin', () => {
        assert.equal(isUserAdmin({ role: 'superadmin' }), true);
        assert.equal(isUserAdmin({ role: 'Superadmin' }), true);
        assert.equal(isUserAdmin({ role: 'admin' }), true);
        assert.equal(isUserAdmin({ role: 'ADMIN' }), true);
    });

    test('Identifies HR roles as admin', () => {
        assert.equal(isUserAdmin({ role: 'hr executive' }), true);
        assert.equal(isUserAdmin({ role: 'HR Manager' }), true);
        assert.equal(isUserAdmin({ role: 'HR' }), true);
    });

    test('Rejects standard employee roles from administrative privilege', () => {
        assert.equal(isUserAdmin({ role: 'employee' }), false);
        assert.equal(isUserAdmin({ role: 'Employee' }), false);
        assert.equal(isUserAdmin({ role: 'intern' }), false);
        assert.equal(isUserAdmin({ role: 'developer' }), false);
    });

    test('Safely handles missing, null, or empty user objects', () => {
        assert.equal(isUserAdmin(null), false);
        assert.equal(isUserAdmin(undefined), false);
        assert.equal(isUserAdmin({}), false);
        assert.equal(isUserAdmin({ role: null }), false);
        assert.equal(isUserAdmin({ role: '' }), false);
    });
});

