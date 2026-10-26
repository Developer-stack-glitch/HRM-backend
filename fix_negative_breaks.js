const { pool } = require('./Config/dbConfig');

async function fixNegativeBreaks() {
    console.log('--- Starting Database Break Times Cleanup ---');

    // 1. Check existing corrupt records
    const [badBreaksBefore] = await pool.execute('SELECT COUNT(*) as cnt FROM attendance_breaks WHERE break_duration LIKE ?', ['-%']);
    const [badAttnBefore] = await pool.execute('SELECT COUNT(*) as cnt FROM attendance WHERE total_break_time LIKE ?', ['-%']);
    console.log(`Corrupt records before fix -> Breaks: ${badBreaksBefore[0].cnt}, Attendance: ${badAttnBefore[0].cnt}`);

    // 2. Fix attendance_breaks duration using real timestamps (break_start and break_end)
    const [breakUpdateResult] = await pool.execute(`
        UPDATE attendance_breaks 
        SET break_duration = SEC_TO_TIME(GREATEST(0, TIMESTAMPDIFF(SECOND, break_start, break_end)))
        WHERE break_end IS NOT NULL AND (break_duration LIKE '-%' OR break_duration IS NULL)
    `);
    console.log(`Updated ${breakUpdateResult.affectedRows} corrupted break records in attendance_breaks.`);

    // 3. Recalculate total_break_time in attendance table for all attendance records that had negative or corrupted breaks
    const [attnUpdateResult] = await pool.execute(`
        UPDATE attendance a
        SET a.total_break_time = COALESCE(
            (
                SELECT SEC_TO_TIME(SUM(TIME_TO_SEC(b.break_duration)))
                FROM attendance_breaks b
                WHERE b.attendance_id = a.id 
                  AND b.break_end IS NOT NULL 
                  AND b.break_duration NOT LIKE '-%'
            ),
            '00:00:00'
        )
        WHERE a.total_break_time LIKE '-%'
    `);
    console.log(`Updated ${attnUpdateResult.affectedRows} corrupted attendance records in attendance.`);

    // 4. Verify no negative break records remain
    const [badBreaksAfter] = await pool.execute('SELECT COUNT(*) as cnt FROM attendance_breaks WHERE break_duration LIKE ?', ['-%']);
    const [badAttnAfter] = await pool.execute('SELECT COUNT(*) as cnt FROM attendance WHERE total_break_time LIKE ?', ['-%']);
    console.log(`Corrupt records after fix  -> Breaks: ${badBreaksAfter[0].cnt}, Attendance: ${badAttnAfter[0].cnt}`);

    console.log('--- Cleanup Finished Successfully ---');
    process.exit(0);
}

fixNegativeBreaks().catch(err => {
    console.error('Error during cleanup:', err);
    process.exit(1);
});
