const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseAndCalibrateAttlog } = require('../controllers/iclockController');

describe('ADMS Biometric Clock Offset Calibration', () => {
    test('calibrates delayed morning batch punches by device offset (+30m)', () => {
        // Device BDC 2 uploads 08:56:25 and 09:29:47 in a batch at 10:11:54 IST
        const nowMs = new Date('2026-11-26T10:11:54+05:30').getTime();
        const payload = [
            '3003\t2026-11-26 08:56:25\t0\t1\t0\t0',
            '6003\t2026-11-26 09:29:47\t0\t1\t0\t0',
        ].join('\n');

        const { punches, shouldResetOffset } = parseAndCalibrateAttlog(payload, 'CGKK231063361', 30, nowMs);
        assert.equal(shouldResetOffset, false);
        assert.equal(punches.length, 2);
        assert.equal(punches[0].punch_time, '2026-11-26 09:26:25');
        assert.equal(punches[0].time, '09:26:25');
        assert.equal(punches[1].punch_time, '2026-11-26 09:59:47');
        assert.equal(punches[1].time, '09:59:47');
    });

    test('calibrates previous-day evening punches uploaded the next morning (+30m)', () => {
        const nowMs = new Date('2026-11-26T10:11:54+05:30').getTime();
        const payload = [
            '2412\t2026-11-25 18:24:25\t0\t1\t0\t0',
            '2459\t2026-11-25 23:45:00\t0\t1\t0\t0',
        ].join('\n');

        const { punches, shouldResetOffset } = parseAndCalibrateAttlog(payload, 'CGKK231063361', 30, nowMs);
        assert.equal(shouldResetOffset, false);
        assert.equal(punches[0].punch_time, '2026-11-25 18:54:25');
        assert.equal(punches[1].date, '2026-11-26');
        assert.equal(punches[1].time, '00:15:00');
    });

    test('does not double-shift into future and requests offset reset once hardware clock is fixed', () => {
        const nowMs = new Date('2026-11-26T10:12:00+05:30').getTime();
        const payload = '3003\t2026-11-26 10:11:50\t0\t1\t0\t0';

        const { punches, shouldResetOffset } = parseAndCalibrateAttlog(payload, 'CGKK231063361', 30, nowMs);
        assert.equal(shouldResetOffset, true);
        assert.equal(punches[0].punch_time, '2026-11-26 10:11:50');
    });

    test('leaves accurate devices (offset 0) unchanged even on delayed batches', () => {
        const nowMs = new Date('2026-11-26T10:11:54+05:30').getTime();
        const payload = '9013\t2026-11-26 09:41:54\t0\t1\t0\t0';

        // Large batch (>3 punches) on offset 0 device is never treated as real-time 30m lag
        const batchPayload = [
            '9013\t2026-11-26 09:41:54\t0\t1\t0\t0',
            '9014\t2026-11-26 09:41:50\t0\t1\t0\t0',
            '9015\t2026-11-26 09:41:40\t0\t1\t0\t0',
            '9016\t2026-11-26 09:41:30\t0\t1\t0\t0',
        ].join('\n');

        const batchRes = parseAndCalibrateAttlog(batchPayload, 'CGKK210461704', 0, nowMs);
        assert.equal(batchRes.punches[0].punch_time, '2026-11-26 09:41:54');

        // Real-time fallback (<=3 punches, ~30m behind on offset 0) still calibrates
        const singleRes = parseAndCalibrateAttlog(payload, 'CGKK210461704', 0, nowMs);
        assert.equal(singleRes.punches[0].punch_time, '2026-11-26 10:11:54');
    });
});
