const { pool } = require('../Config/dbConfig');
const { sendNotification } = require('../utils/notificationHelper');

// @desc    Get all helpdesk tickets with optional filters
// @route   GET /api/helpdesk
// @access  Private
const getTickets = async (req, res) => {
    try {
        const { status, priority, category, search, startDate, endDate, limit = 1000 } = req.query;

        let whereClauses = [];
        let params = [];

        if (status && status !== 'All') {
            whereClauses.push('t.status = ?');
            params.push(status);
        }

        if (priority && priority !== 'All') {
            whereClauses.push('t.priority = ?');
            params.push(priority);
        }

        if (category && category !== 'All') {
            whereClauses.push('t.category = ?');
            params.push(category);
        }

        if (startDate) {
            whereClauses.push('DATE(t.created_at) >= ?');
            params.push(startDate);
        }

        if (endDate) {
            whereClauses.push('DATE(t.created_at) <= ?');
            params.push(endDate);
        }

        if (search) {
            whereClauses.push('(t.ticket_code LIKE ? OR t.subject LIKE ? OR t.description LIKE ? OR u.name LIKE ? OR u.emp_id LIKE ?)');
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const query = `
            SELECT 
                t.*,
                u.name as user_name,
                u.emp_id as user_emp_id,
                u.email as user_email,
                d.name as user_department,
                a.name as assigned_to_name,
                a.emp_id as assigned_to_emp_id
            FROM helpdesk_tickets t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN departments d ON u.department = d.id
            LEFT JOIN users a ON t.assigned_to = a.id
            ${whereSql}
            ORDER BY t.created_at DESC
            LIMIT ?
        `;

        params.push(parseInt(limit) || 1000);

        const [tickets] = await pool.query(query, params);
        res.status(200).json(tickets);
    } catch (error) {
        console.error('Error in getTickets:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Helpdesk Analytics and Summary Stats
// @route   GET /api/helpdesk/stats
// @access  Private
const getStats = async (req, res) => {
    try {
        const { startDate, endDate, category } = req.query;

        let whereClauses = [];
        let params = [];

        if (startDate) {
            whereClauses.push('DATE(t.created_at) >= ?');
            params.push(startDate);
        }
        if (endDate) {
            whereClauses.push('DATE(t.created_at) <= ?');
            params.push(endDate);
        }
        if (category && category !== 'All') {
            whereClauses.push('t.category = ?');
            params.push(category);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // 1. Core Summary Metrics
        const [counts] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Open' THEN 1 ELSE 0 END) as open_count,
                SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress_count,
                SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved_count,
                SUM(CASE WHEN priority = 'Urgent' AND status IN ('Open', 'In Progress') THEN 1 ELSE 0 END) as urgent_active_count,
                SUM(CASE WHEN priority IN ('High', 'Urgent') THEN 1 ELSE 0 END) as high_urgent_total
            FROM helpdesk_tickets t
            ${whereSql}
        `, params);

        // 2. Category Breakdown
        const [categoryBreakdown] = await pool.query(`
            SELECT 
                category,
                COUNT(*) as total,
                SUM(CASE WHEN status IN ('Open', 'In Progress') THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved
            FROM helpdesk_tickets t
            ${whereSql}
            GROUP BY category
            ORDER BY total DESC
        `, params);

        // 3. Priority Breakdown
        const [priorityBreakdown] = await pool.query(`
            SELECT 
                priority,
                COUNT(*) as count
            FROM helpdesk_tickets t
            ${whereSql}
            GROUP BY priority
            ORDER BY FIELD(priority, 'Urgent', 'High', 'Medium', 'Low')
        `, params);

        // 4. Status Breakdown
        const [statusBreakdown] = await pool.query(`
            SELECT 
                status,
                COUNT(*) as count
            FROM helpdesk_tickets t
            ${whereSql}
            GROUP BY status
            ORDER BY FIELD(status, 'Open', 'In Progress', 'Resolved', 'Closed')
        `, params);

        // 5. Daily Ticket Activity
        const [dailyTrend] = await pool.query(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as created_count,
                SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved_count
            FROM helpdesk_tickets t
            ${whereSql}
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        `, params);

        const summary = counts[0] || {};
        const total = parseInt(summary.total) || 0;
        const resolved = parseInt(summary.resolved_count) || 0;
        const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

        res.status(200).json({
            total,
            open: parseInt(summary.open_count) || 0,
            inProgress: parseInt(summary.in_progress_count) || 0,
            resolved,
            urgentActive: parseInt(summary.urgent_active_count) || 0,
            highUrgentTotal: parseInt(summary.high_urgent_total) || 0,
            resolutionRate,
            categoryBreakdown,
            priorityBreakdown,
            statusBreakdown,
            dailyTrend
        });
    } catch (error) {
        console.error('Error in getStats:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a new helpdesk ticket
// @route   POST /api/helpdesk
// @access  Private
const createTicket = async (req, res) => {
    try {
        const { user_id, category, subject, description, priority = 'Medium', assigned_to } = req.body;
        const effectiveUserId = user_id || req.user?.id;

        if (!effectiveUserId) {
            return res.status(400).json({ message: 'User ID is required' });
        }
        if (!subject || !description) {
            return res.status(400).json({ message: 'Subject and description are required' });
        }

        // Generate unique ticket code: HD-100X
        const [maxRow] = await pool.execute('SELECT MAX(id) as maxId FROM helpdesk_tickets');
        const nextNum = (maxRow[0]?.maxId || 0) + 1001;
        const ticketCode = `HD-${nextNum}`;

        const [result] = await pool.execute(`
            INSERT INTO helpdesk_tickets 
            (ticket_code, user_id, category, subject, description, priority, status, assigned_to)
            VALUES (?, ?, ?, ?, ?, ?, 'Open', ?)
        `, [
            ticketCode,
            effectiveUserId,
            category || 'HR Support',
            subject,
            description,
            priority,
            assigned_to || null
        ]);

        // Notify admins about new ticket
        try {
            const io = req.app.get('io') || req.app.get('socketio');
            if (io) {
                const [userRow] = await pool.execute('SELECT name FROM users WHERE id = ?', [effectiveUserId]);
                const requesterName = userRow[0]?.name || 'An Employee';
                await sendNotification(io, {
                    role: 'admin',
                    type: 'helpdesk_ticket',
                    title: 'New Helpdesk Ticket',
                    message: `${requesterName} raised ticket [${ticketCode}]: ${subject}`,
                    extra_data: { ticket_id: result.insertId, ticket_code: ticketCode }
                });
            }
        } catch (nErr) {
            console.error('Helpdesk notification error:', nErr);
        }

        res.status(201).json({
            id: result.insertId,
            ticket_code: ticketCode,
            message: 'Helpdesk ticket submitted successfully'
        });
    } catch (error) {
        console.error('Error creating ticket:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update ticket status and resolution notes
// @route   PUT /api/helpdesk/:id/status
// @access  Private/Admin
const updateTicketStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, resolution_notes } = req.body;

        if (!status) {
            return res.status(400).json({ message: 'Status is required' });
        }

        const resolvedAt = ['Resolved', 'Closed'].includes(status) ? new Date() : null;

        const [result] = await pool.execute(`
            UPDATE helpdesk_tickets 
            SET status = ?, resolution_notes = COALESCE(?, resolution_notes), resolved_at = COALESCE(?, resolved_at)
            WHERE id = ?
        `, [status, resolution_notes || null, resolvedAt, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        // Notify employee if ticket is resolved/updated
        try {
            const [[ticket]] = await pool.execute('SELECT * FROM helpdesk_tickets WHERE id = ?', [id]);
            const io = req.app.get('io') || req.app.get('socketio');
            if (ticket && io) {
                await sendNotification(io, {
                    user_id: ticket.user_id,
                    type: 'helpdesk_ticket_status',
                    title: `Ticket ${ticket.ticket_code} Updated`,
                    message: `Your ticket has been marked as "${status}".${resolution_notes ? ' Note: ' + resolution_notes : ''}`,
                    extra_data: { ticket_id: id, status }
                });
            }
        } catch (nErr) {
            console.error('Notification error:', nErr);
        }

        res.status(200).json({ message: `Ticket status updated to ${status}` });
    } catch (error) {
        console.error('Error in updateTicketStatus:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Assign ticket to an agent / admin
// @route   PUT /api/helpdesk/:id/assign
// @access  Private/Admin
const assignTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const { assigned_to } = req.body;

        const [result] = await pool.execute(`
            UPDATE helpdesk_tickets 
            SET assigned_to = ?, status = CASE WHEN status = 'Open' THEN 'In Progress' ELSE status END
            WHERE id = ?
        `, [assigned_to || null, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        res.status(200).json({ message: 'Ticket assigned successfully' });
    } catch (error) {
        console.error('Error assigning ticket:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a ticket
// @route   DELETE /api/helpdesk/:id
// @access  Private/Admin
const deleteTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await pool.execute('DELETE FROM helpdesk_tickets WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        res.status(200).json({ message: 'Ticket deleted successfully' });
    } catch (error) {
        console.error('Error deleting ticket:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getTickets,
    getStats,
    createTicket,
    updateTicketStatus,
    assignTicket,
    deleteTicket
};
