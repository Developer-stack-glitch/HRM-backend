const { pool } = require('../Config/dbConfig');

const Policy = {
    create: async (data) => {
        const { title, description, file_url, category, created_by } = data;
        const query = `
            INSERT INTO policies (title, description, file_url, category, created_by)
            VALUES (?, ?, ?, ?, ?)
        `;
        const [result] = await pool.execute(query, [title, description || null, file_url || null, category || null, created_by]);
        return result.insertId;
    },

    getAll: async () => {
        const query = `
            SELECT p.*, u.employee_name as creator_name 
            FROM policies p
            LEFT JOIN users u ON p.created_by = u.id
            ORDER BY p.created_at DESC
        `;
        const [rows] = await pool.execute(query);
        return rows;
    },

    getById: async (id) => {
        const query = 'SELECT * FROM policies WHERE id = ?';
        const [rows] = await pool.execute(query, [id]);
        return rows[0];
    },

    update: async (id, data) => {
        const { title, description, category, file_url } = data;
        let query = 'UPDATE policies SET title = ?, description = ?, category = ?';
        const params = [title, description, category];
        
        if (file_url) {
            query += ', file_url = ?';
            params.push(file_url);
        }
        
        query += ' WHERE id = ?';
        params.push(id);
        
        const [result] = await pool.execute(query, params);
        return result.affectedRows;
    },

    delete: async (id) => {
        const query = 'DELETE FROM policies WHERE id = ?';
        const [result] = await pool.execute(query, [id]);
        return result.affectedRows;
    }
};

module.exports = Policy;
