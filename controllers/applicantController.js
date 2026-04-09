const { pool } = require('../Config/dbConfig');
const { sendEmail } = require('../utils/emailService');

// @desc    Get all applicants
// @route   GET /api/applicants
// @access  Private/Admin
const getApplicants = async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT a.*, j.title as job_title 
            FROM applicants a
            LEFT JOIN jobs j ON a.job_id = j.id
            ORDER BY a.applied_at DESC
        `);
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get applicants for a specific job
// @route   GET /api/applicants/job/:jobId
// @access  Private/Admin
const getApplicantsByJob = async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM applicants WHERE job_id = ? ORDER BY applied_at DESC', [req.params.jobId]);
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update applicant status
// @route   PUT /api/applicants/:id/status
// @access  Private/Admin
const updateApplicantStatus = async (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: 'Status is required' });
    
    try {
        await pool.execute('UPDATE applicants SET status = ? WHERE id = ?', [status, req.params.id]);
        res.status(200).json({ message: 'Applicant status updated' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete applicant
// @route   DELETE /api/applicants/:id
// @access  Private/Admin
const deleteApplicant = async (req, res) => {
    try {
        await pool.execute('DELETE FROM applicants WHERE id = ?', [req.params.id]);
        res.status(200).json({ message: 'Applicant deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create new applicant
// @route   POST /api/applicants
// @access  Private/Admin (for manual entry)
const createApplicant = async (req, res) => {
    let { job_id, name, email, phone, experience_years, gender, location, resume_url, status } = req.body;

    // Handle file upload
    if (req.file) {
        resume_url = req.file.path;
    }

    try {
        const [result] = await pool.execute(
            'INSERT INTO applicants (job_id, name, email, phone, experience_years, gender, location, resume_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [job_id, name, email, phone, experience_years, gender, location, resume_url || null, status || 'Applied']
        );
        res.status(201).json({ message: 'Applicant created successfully', id: result.insertId });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Schedule interview
// @route   POST /api/applicants/:id/schedule-interview
// @access  Private/Admin
const scheduleInterview = async (req, res) => {
    const { round_name, date, time, mode, meeting_link, notes } = req.body;
    const applicantId = req.params.id;

    try {
        // 1. Get applicant details to get email and name
        const [[applicant]] = await pool.execute('SELECT * FROM applicants WHERE id = ?', [applicantId]);
        if (!applicant) {
            return res.status(404).json({ message: 'Applicant not found' });
        }

        // 2. Insert into interviews table
        await pool.execute(
            'INSERT INTO interviews (applicant_id, round_name, interview_date, interview_time, mode, meeting_link, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [applicantId, round_name, date, time, mode, meeting_link, notes]
        );

        // Fetch company info for branding
        const [[company]] = await pool.execute('SELECT * FROM companies LIMIT 1');
        const companyName = company?.name || 'HR Team';
        const backendUrl = process.env.VITE_API_URL || 'http://localhost:5003';
        const logoUrl = company?.logo ? `${backendUrl}/${company.logo.replace(/\\/g, '/')}` : '';

        // 3. Send email to applicant with premium template
        const emailSubject = `Interview Invitation - ${round_name} | ${companyName}`;
        const emailHtml = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; color: #1f2937;">
                <!-- Header -->
                <div style="background-color: #ffffff; padding: 32px; text-align: center; border-bottom: 1px solid #f3f4f6;">
                    ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="height: 50px; width: auto; margin-bottom: 20px;">` : `<h1 style="color: #2563eb; margin: 0; font-size: 24px;">${companyName}</h1>`}
                    <h2 style="color: #111827; margin: 0; font-size: 20px; font-weight: 700;">Interview Invitation</h2>
                </div>

                <!-- Content Body -->
                <div style="padding: 30px; background-color: #ffffff;">
                    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px; margin-top: 0px;">
                        Hello <strong>${applicant.name}</strong>,
                    </p>
                    <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin-bottom: 32px;">
                        We are impressed with your profile and would like to invite you for an interview. We're looking forward to learning more about your background and discussing how you could contribute to our team.
                    </p>

                    <!-- Details Box -->
                    <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                        <h3 style="margin-top: 0; margin-bottom: 20px; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Interview Schedule</h3>
                        
                        <div style="margin-bottom: 15px; display: flex; align-items: flex-start;">
                            <div style="min-width: 100px; font-weight: 600; color: #334155;">Round:</div>
                            <div style="color: #1e293b;">${round_name}</div>
                        </div>
                        <div style="margin-bottom: 15px; display: flex; align-items: flex-start;">
                            <div style="min-width: 100px; font-weight: 600; color: #334155;">Date:</div>
                            <div style="color: #1e293b;">${date}</div>
                        </div>
                        <div style="margin-bottom: 15px; display: flex; align-items: flex-start;">
                            <div style="min-width: 100px; font-weight: 600; color: #334155;">Time:</div>
                            <div style="color: #1e293b;">${time}</div>
                        </div>
                        <div style="margin-bottom: 15px; display: flex; align-items: flex-start;">
                            <div style="min-width: 100px; font-weight: 600; color: #334155;">Mode:</div>
                            <div style="color: #1e293b;">${mode}</div>
                        </div>
                        
                        ${meeting_link ? `
                        <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
                            <p style="margin-bottom: 15px; font-size: 14px; color: #64748b;">To join the interview, please use the link below:</p>
                            <a href="${meeting_link}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Join Meeting</a>
                        </div>
                        ` : ''}
                    </div>

                    <p style="font-size: 14px; color: #64748b; font-style: italic; margin-bottom: 8px;">
                        Note: ${notes || 'Please prepare to discuss your portfolio and recent projects.'}
                    </p>
                </div>

                <!-- Footer -->
                <div style="background-color: #f9fafb; padding: 32px; text-align: center; color: #9ca3af; font-size: 13px;">
                    <p style="margin-bottom: 8px;">Best Regards,</p>
                    <p style="margin-bottom: 24px;"><strong style="color: #4b5563;">HR Team @ ${companyName}</strong></p>
                    <div style="border-top: 1px solid #e5e7eb; padding-top: 24px;">
                        ${company?.address ? `<p style="margin: 0;">${company.address}</p>` : ''}
                        <p style="margin: 4px 0;">This is an automated message, please do not reply directly to this email.</p>
                    </div>
                </div>
            </div>
        `;

        try {
            await sendEmail({
                to: applicant.email,
                subject: emailSubject,
                html: emailHtml
            });
        } catch (emailError) {
            console.error('Failed to send interview email:', emailError);
            // We don't fail the whole request if email fails, but maybe log it.
        }

        res.status(200).json({ message: 'Interview scheduled successfully and email sent' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Send offer letter
// @route   POST /api/applicants/:id/send-offer
// @access  Private/Admin
const sendOfferLetter = async (req, res) => {
    const { id } = req.params;
    const { offered_ctc, joining_date, notes } = req.body;

    try {
        // 1. Fetch applicant details with Dynamic Job Position
        const [[applicant]] = await pool.execute(`
            SELECT a.*, j.title as job_title 
            FROM applicants a 
            JOIN jobs j ON a.job_id = j.id 
            WHERE a.id = ?
        `, [id]);
        if (!applicant) return res.status(404).json({ message: 'Applicant not found' });

        // 2. Insert into offer_letters table
        await pool.execute(
            'INSERT INTO offer_letters (applicant_id, offered_ctc, joining_date) VALUES (?, ?, ?)',
            [id, offered_ctc, joining_date]
        );

        // 3. Update applicant status
        await pool.execute('UPDATE applicants SET status = "Offered" WHERE id = ?', [id]);

        // 4. Fetch company info for branding
        const [[company]] = await pool.execute('SELECT * FROM companies LIMIT 1');
        const companyName = company?.name || 'HR Team';
        const backendUrl = process.env.VITE_API_URL || 'http://localhost:5003';

        // Ensure path starts correctly and handle localhost limitation in external mail clients
        const normalizedLogo = company?.logo ? company.logo.replace(/\\/g, '/').replace(/^\/+/, '') : '';
        const logoUrl = normalizedLogo ? `${backendUrl}/${normalizedLogo}` : '';

        // 5. Send email to applicant with EXTREMELY PREMIUM template
        const emailSubject = `Job Offer: ${companyName} | Join Our Mission!`;
        const emailHtml = `
            <div style="font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #1a202c; line-height: 1.5;">
                <!-- Hero Section -->
                <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding: 35px 30px; text-align: center; border-radius: 0 0 40px 40px; margin-bottom: 20px;">
                    ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="height: 48px; width: auto; margin-bottom: 32px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.05));">` : `<div style="font-size: 24px; font-weight: 900; color: #2563eb; letter-spacing: -1px; margin-bottom: 32px;">${companyName}</div>`}
                    <h1 style="font-size: 32px; font-weight: 800; color: #1e3a8a; margin: 0; letter-spacing: -0.025em;">You're In! 🎉</h1>
                    <p style="font-size: 18px; color: #3b82f6; margin-top: 12px; font-weight: 500;">Welcome to the family.</p>
                </div>

                <!-- Main Content -->
                <div style="padding: 20px 40px 40px 40px;">
                    <p style="font-size: 18px; color: #4a5568; margin-bottom: 24px;">
                        Hello <span style="font-weight: 700; color: #1a202c;">${applicant.name}</span>,
                    </p>
                    <p style="font-size: 16px; color: #4a5568; margin-bottom: 32px; line-height: 1.7;">
                        It is with great pleasure that we extend this formal offer to join <strong style="color: #1a202c;">${companyName}</strong>. Our team was deeply impressed by your journey, and we're excited to see the impact you'll make here.
                    </p>

                    <!-- Offer Card -->
                    <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 15px; padding: 26px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.04);">
                        <div style="display: flex; align-items: center; margin-bottom: 8px;">
                            <div style="background-color: #3b82f6; width: 4px; height: 24px; border-radius: 2px; margin-right: 12px;"></div>
                            <h3 style="font-size: 14px; font-weight: 700; color: #1e40af; text-transform: uppercase; letter-spacing: 0.1em; margin: 0;">Formal Offer Details</h3>
                        </div>
                        
                        <div style="padding: 0; list-style: none;">
                            <div style="display: flex; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid #f1f5f9;">
                                <span style="font-size: 14px; font-weight: 600; color: #64748b;">Position </span>
                                <span style="font-size: 15px; font-weight: 700; color: #1e293b; margin-left: 8px;">${applicant.job_title}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid #f1f5f9;">
                                <span style="font-size: 14px; font-weight: 600; color: #64748b;">Annual Compensation</span>
                                <span style="font-size: 16px; font-weight: 800; color: #059669; margin-left: 8px;"> ₹${new Intl.NumberFormat('en-IN').format(offered_ctc)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 16px 0;">
                                <span style="font-size: 14px; font-weight: 600; color: #64748b;">Start Date</span>
                                <span style="font-size: 15px; font-weight: 700; color: #1e293b; margin-left: 8px;"> ${new Date(joining_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                            </div>
                        </div>
                    </div>

                    ${notes ? `
                    <div style="margin-top: 22px; margin-bottom: 22px; padding: 20px; background-color: #fefce8; border-radius: 16px; border: 1px solid #fef08a;">
                        <p style="margin: 0; font-size: 14px; color: #854d0e; line-height: 1.6;">
                            <strong style="color: #713f12;">Personal Message from HR:</strong><br>
                            ${notes}
                        </p>
                    </div>
                    ` : ''}

                <!-- Footer -->
                <div style="background-color: #f8fafc; padding: 30px 30px; border-radius: 20px 20px 0 0; text-align: center;">
                    <p style="font-size: 14px; color: #64748b; margin-bottom: 8px;">Warmly,</p>
                    <p style="font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 20px;">The Talent Team at ${companyName}</p>
                    
                    <div style="border-top: 1px solid #e2e8f0; padding-top: 32px;">
                        ${company?.address ? `<p style="font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.6;">${company.address}</p>` : ''}
                        <p style="font-size: 12px; color: #cbd5e1; margin-top: 12px;">© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
                    </div>
                </div>
            </div>
        `;

        try {
            await sendEmail({
                to: applicant.email,
                subject: emailSubject,
                html: emailHtml
            });
        } catch (emailError) {
            console.error('Failed to send offer email:', emailError);
        }

        res.status(200).json({ message: 'Offer letter sent successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Request documents from applicant
// @route   POST /api/applicants/:id/request-documents
// @access  Private/Admin
const requestDocuments = async (req, res) => {
    const { id } = req.params;
    const { documents, notes } = req.body;

    try {
        // 1. Fetch applicant details
        const [[applicant]] = await pool.execute('SELECT * FROM applicants WHERE id = ?', [id]);
        if (!applicant) return res.status(404).json({ message: 'Applicant not found' });

        // 2. Fetch company info for branding
        const [[company]] = await pool.execute('SELECT * FROM companies LIMIT 1');
        const companyName = company?.name || 'HR Team';
        const backendUrl = process.env.VITE_API_URL || 'http://localhost:5003';
        const logoUrl = company?.logo ? `${backendUrl}/${company.logo.replace(/\\/g, '/')}` : '';

        // 3. Send email to applicant
        const emailSubject = `Document Request - Onboarding | ${companyName}`;
        const emailHtml = `
            <div style="font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #1a202c; border: 1px solid #e2e8f0; border-radius: 40px; overflow: hidden;">
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); padding: 50px 30px; text-align: center;">
                    ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="height: 48px; width: auto; margin-bottom: 24px;">` : `<div style="font-size: 24px; font-weight: 800; color: #16a34a; margin-bottom: 24px;">${companyName}</div>`}
                    <h1 style="font-size: 28px; font-weight: 700; color: #166534; margin: 0;">Onboarding Documents</h1>
                    <p style="font-size: 16px; color: #15803d; margin-top: 8px;">Let's get things ready for your first day!</p>
                </div>

                <!-- Content -->
                <div style="padding: 30px;">
                    <p style="font-size: 17px; margin-bottom: 24px; margin-top: 0px;">Hello <strong>${applicant.name}</strong>,</p>
                    <p style="font-size: 15px; color: #4b5563; margin-bottom: 32px; line-height: 1.6;">
                        Welcome aboard! We are getting everything ready for your journey with us. To complete your onboarding process, we kindly request you to provide the following documents:
                    </p>

                    <!-- Document List Card -->
                    <div style="background-color: #f8fafc; border-radius: 24px; padding: 32px; border: 1px solid #f1f5f9; margin-bottom: 32px;">
                        <h3 style="font-size: 13px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0; margin-bottom: 20px;">Required Documents Checklist</h3>
                        
                        <div style="padding: 0; list-style: none;">
                            ${documents.map(doc => `
                                <div style="display: flex; align-items: flex-start; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9;">
                                    <div style="width: 20px; height: 20px; border: 2px solid #16a34a; border-radius: 4px; margin-right: 12px; margin-top: 1px;"></div>
                                    <span style="font-size: 15px; color: #1e293b; font-weight: 500;">${doc}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    ${notes ? `
                    <div style="margin-bottom: 32px; padding: 20px; background-color: #fffbeb; border-radius: 16px; border-left: 4px solid #f59e0b;">
                        <p style="margin: 0; font-size: 14px; color: #92400e; line-height: 1.6;">
                            <strong>Instructions:</strong><br>
                            ${notes}
                        </p>
                    </div>
                    ` : ''}

                    <div style="text-align: center; margin-top: 40px;">
                        <p style="font-size: 14px; color: #64748b; margin-bottom: 20px;">Please reply to this email with clear scans of the requested files.</p>
                        <div style="background-color: #16a34a; color: #ffffff; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 700; display: inline-block;">Ready to Join!</div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px dashed #e2e8f0;">
                    <p style="font-size: 14px; color: #64748b; margin-bottom: 4px;">Best Regards,</p>
                    <p style="font-size: 16px; font-weight: 700; color: #1e293b;">The HR Operations Team at ${companyName}</p>
                </div>
            </div>
        `;

        try {
            await sendEmail({
                to: applicant.email,
                subject: emailSubject,
                html: emailHtml
            });
        } catch (emailError) {
            console.error('Failed to send documents email:', emailError);
        }

        // 4. Update flag that docs were sent
        await pool.execute('UPDATE applicants SET is_doc_sent = 1 WHERE id = ?', [id]);

        res.status(200).json({ message: 'Document request sent successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getApplicants,
    getApplicantsByJob,
    createApplicant,
    updateApplicantStatus,
    deleteApplicant,
    scheduleInterview,
    sendOfferLetter,
    requestDocuments
};
