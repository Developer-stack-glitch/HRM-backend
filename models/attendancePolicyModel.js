const { pool } = require('../Config/dbConfig');

class AttendancePolicy {
    static async createRule(data) {
        const { rule_name, priority, description, trigger_condition, no_of_times, within_period, how_many_period, action_type, apply_to, assigned_users } = data;
        const [result] = await pool.execute(
            `INSERT INTO attendance_policy_rules 
            (rule_name, priority, description, trigger_condition, no_of_times, within_period, how_many_period, action_type, apply_to) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [rule_name, priority || 1, description, trigger_condition, no_of_times, within_period, how_many_period, action_type, apply_to]
        );
        const ruleId = result.insertId;

        if (assigned_users && assigned_users.length > 0) {
            for (const userId of assigned_users) {
                await pool.execute(
                    `INSERT INTO attendance_policy_rule_assignments (rule_id, user_id) VALUES (?, ?)`,
                    [ruleId, userId]
                );
            }
        }
        return ruleId;
    }

    static async getAllRules() {
        const [rules] = await pool.execute(`SELECT * FROM attendance_policy_rules ORDER BY priority ASC, created_at DESC`);

        // Fetch assignments for each rule
        for (let rule of rules) {
            const [assignments] = await pool.execute(
                `SELECT user_id FROM attendance_policy_rule_assignments WHERE rule_id = ?`,
                [rule.id]
            );
            rule.assigned_users = assignments.map(a => a.user_id);
        }

        return rules;
    }

    static async updateRule(id, data) {
        const { rule_name, priority, description, trigger_condition, no_of_times, within_period, how_many_period, action_type, apply_to, assigned_users } = data;
        await pool.execute(
            `UPDATE attendance_policy_rules SET 
            rule_name = ?, priority = ?, description = ?, trigger_condition = ?, no_of_times = ?, 
            within_period = ?, how_many_period = ?, action_type = ?, apply_to = ? 
            WHERE id = ?`,
            [rule_name, priority, description, trigger_condition, no_of_times, within_period, how_many_period, action_type, apply_to, id]
        );

        // Update assignments: delete old and insert new
        await pool.execute(`DELETE FROM attendance_policy_rule_assignments WHERE rule_id = ?`, [id]);
        if (assigned_users && assigned_users.length > 0) {
            for (const userId of assigned_users) {
                await pool.execute(
                    `INSERT INTO attendance_policy_rule_assignments (rule_id, user_id) VALUES (?, ?)`,
                    [id, userId]
                );
            }
        }
    }

    static async deleteRule(id) {
        await pool.execute(`DELETE FROM attendance_policy_rules WHERE id = ?`, [id]);
    }
}

module.exports = AttendancePolicy;
