const { pool } = require('../Config/dbConfig');

// @desc    Get all jobs
// @route   GET /api/jobs
// @access  Private/Admin
const getJobs = async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM jobs ORDER BY created_at DESC');
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get single job
// @route   GET /api/jobs/:id
// @access  Private/Admin
const getJobById = async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Job not found' });
        }
        res.status(200).json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a job
// @route   POST /api/jobs
// @access  Private/Admin
const createJob = async (req, res) => {
    const {
        title, description, requirements, department, location, job_type, salary_range, status,
        contact_email, contact_phone, experience_years, min_salary, max_salary, skills,
        branch, num_positions, preferred_gender, close_date, hiring_manager, recruiters,
        city, state, zip_code
    } = req.body;

    try {
        const [result] = await pool.execute(
            `INSERT INTO jobs (
                title, description, requirements, department, location, job_type, salary_range, status,
                contact_email, contact_phone, experience_years, min_salary, max_salary, skills,
                branch, num_positions, preferred_gender, close_date, hiring_manager, recruiters,
                city, state, zip_code
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                title || null,
                description || null,
                requirements || null,
                department || null,
                location || null,
                job_type || 'Full-time',
                salary_range || null,
                status || 'Open',
                contact_email || null,
                contact_phone || null,
                experience_years || null,
                min_salary || null,
                max_salary || null,
                skills || null,
                branch || null,
                num_positions || 1,
                preferred_gender || 'Any',
                close_date || null,
                hiring_manager || null,
                recruiters || null,
                city || null,
                state || null,
                zip_code || null
            ]
        );
        res.status(201).json({ id: result.insertId, title, status });
    } catch (error) {
        console.error('Create Job Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update a job
// @route   PUT /api/jobs/:id
// @access  Private/Admin
const updateJob = async (req, res) => {
    const {
        title, description, requirements, department, location, job_type, salary_range, status,
        contact_email, contact_phone, experience_years, min_salary, max_salary, skills,
        branch, num_positions, preferred_gender, close_date, hiring_manager, recruiters,
        city, state, zip_code
    } = req.body;

    try {
        await pool.execute(
            `UPDATE jobs SET 
                title = ?, description = ?, requirements = ?, department = ?, location = ?, job_type = ?, salary_range = ?, status = ?,
                contact_email = ?, contact_phone = ?, experience_years = ?, min_salary = ?, max_salary = ?, skills = ?,
                branch = ?, num_positions = ?, preferred_gender = ?, close_date = ?, hiring_manager = ?, recruiters = ?,
                city = ?, state = ?, zip_code = ?
            WHERE id = ?`,
            [
                title || null,
                description || null,
                requirements || null,
                department || null,
                location || null,
                job_type || 'Full-time',
                salary_range || null,
                status || 'Open',
                contact_email || null,
                contact_phone || null,
                experience_years || null,
                min_salary || null,
                max_salary || null,
                skills || null,
                branch || null,
                num_positions || 1,
                preferred_gender || 'Any',
                close_date || null,
                hiring_manager || null,
                recruiters || null,
                city || null,
                state || null,
                zip_code || null,
                req.params.id
            ]
        );
        res.status(200).json({ message: 'Job updated successfully' });
    } catch (error) {
        console.error('Update Job Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a job
// @route   DELETE /api/jobs/:id
// @access  Private/Admin
const deleteJob = async (req, res) => {
    try {
        await pool.execute('DELETE FROM jobs WHERE id = ?', [req.params.id]);
        res.status(200).json({ message: 'Job deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getOpenJobs = async (req, res) => {
    try {
        const [rows] = await pool.execute("SELECT * FROM jobs WHERE status = 'Open' ORDER BY created_at DESC");
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getJobs,
    getJobById,
    createJob,
    updateJob,
    deleteJob,
    getOpenJobs
};
