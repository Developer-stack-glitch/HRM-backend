const bcrypt = require('bcryptjs');
const { pool, getTenantPool, config } = require('../Config/dbConfig');

const setupTenantDatabase = async (dbName, dbUser, dbPass, companyData) => {
    // 1. Create the database
    await pool.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);

    // 2. Create the database user if provided
    if (dbUser && dbPass) {
        try {
            // Create user for both localhost and '%' to allow remote connections if needed
            await pool.execute(`CREATE USER IF NOT EXISTS ?@'localhost' IDENTIFIED BY ?`, [dbUser, dbPass]);
            await pool.execute(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO ?@'localhost'`, [dbUser]);

            await pool.execute(`CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?`, [dbUser, dbPass]);
            await pool.execute(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO ?@'%'`, [dbUser]);

            await pool.execute(`FLUSH PRIVILEGES`);
            console.log(`Created database user: ${dbUser} with access to ${dbName}`);
        } catch (userError) {
            console.error(`Error creating database user ${dbUser}:`, userError.message);
        }
    }

    // 3. Get a connection to the new database
    const tenantPool = getTenantPool(dbName);

    try {
        console.log(`Setting up tables for database: ${dbName}`);

        // 1. Core Tables (No Dependencies)
        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin','employee','superadmin') DEFAULT 'employee',
                employee_name VARCHAR(255),
                emp_id VARCHAR(50),
                biometric_id VARCHAR(50),
                company VARCHAR(255),
                department VARCHAR(255),
                designation VARCHAR(255),
                branch VARCHAR(255),
                shift VARCHAR(255),
                employment_type VARCHAR(255),
                work_location VARCHAR(255),
                is_experienced TINYINT(1) DEFAULT 0,
                gender VARCHAR(20),
                doj DATE,
                dor DATE,
                duration VARCHAR(100),
                variable DECIMAL(15,2),
                travel_allowance DECIMAL(15,2) DEFAULT 0.00,
                employer_epfo DECIMAL(15,2),
                epf DECIMAL(15,2),
                pt DECIMAL(15,2),
                last_increment DECIMAL(15,2),
                increment_type VARCHAR(100),
                upcoming_increment DATE,
                off_contact_no VARCHAR(20),
                off_mail_id VARCHAR(255),
                esi VARCHAR(50),
                pf VARCHAR(50),
                aadhar VARCHAR(20),
                pan VARCHAR(20),
                bank_ac_no VARCHAR(50),
                ifsc VARCHAR(20),
                uan VARCHAR(50),
                per_contact_no VARCHAR(20),
                per_mail_id VARCHAR(255),
                dob DATE,
                blood_group VARCHAR(10),
                mother_tongue VARCHAR(100),
                father_spouse_name VARCHAR(255),
                father_spouse_contact VARCHAR(20),
                mother_name VARCHAR(255),
                mother_contact VARCHAR(20),
                temp_address TEXT,
                perm_address TEXT,
                document_resume VARCHAR(255),
                document_test_paper VARCHAR(255),
                document_10th VARCHAR(255),
                document_12th VARCHAR(255),
                document_ug VARCHAR(255),
                document_pg VARCHAR(255),
                document_aadhar VARCHAR(255),
                document_pan VARCHAR(255),
                document_passbook VARCHAR(255),
                document_photo VARCHAR(255),
                document_relieving_letter VARCHAR(255),
                document_exp_letter VARCHAR(255),
                document_payslips TEXT,
                document_emp_details_form VARCHAR(255),
                team_lead VARCHAR(10) DEFAULT 'no',
                year_gross_salary DECIMAL(15,2) DEFAULT 0.00,
                salary_structure_id INT DEFAULT NULL,
                web_clock_in_allowed TINYINT(1) DEFAULT 1,
                reset_token VARCHAR(255) DEFAULT NULL,
                reset_token_expiry DATETIME DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS branches (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                branch_code VARCHAR(50),
                address TEXT,
                phone VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS departments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS designations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                department_id INT,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS shifts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS employment_types (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS work_locations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS holidays (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                date DATE NOT NULL,
                type VARCHAR(50) DEFAULT 'National',
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS devices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                serial_number VARCHAR(255) NOT NULL UNIQUE,
                location VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 2. Attendance & Policies
        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS attendance (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                biometric_id VARCHAR(50),
                date DATE NOT NULL,
                punch_in TIME,
                punch_out TIME,
                late_punch_in VARCHAR(10),
                late_punch_out VARCHAR(10),
                early_punch_out VARCHAR(10),
                total_hours VARCHAR(10),
                status VARCHAR(50) DEFAULT 'Present',
                latitude_in DECIMAL(10,8),
                longitude_in DECIMAL(11,8),
                latitude_out DECIMAL(10,8),
                longitude_out DECIMAL(11,8),
                punch_in_location TEXT,
                punch_out_location TEXT,
                is_web_punch TINYINT(1) DEFAULT 0,
                total_break_time VARCHAR(10) DEFAULT '00:00',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS attendance_breaks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                attendance_id INT,
                user_id INT,
                break_start DATETIME,
                break_end DATETIME,
                break_duration VARCHAR(10),
                latitude DECIMAL(10,8),
                longitude DECIMAL(11,8),
                location TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS attendance_policy_rules (
                id INT AUTO_INCREMENT PRIMARY KEY,
                rule_name VARCHAR(255) NOT NULL,
                priority INT DEFAULT 1,
                description TEXT,
                trigger_condition VARCHAR(100),
                no_of_times INT,
                within_period VARCHAR(50),
                how_many_period INT,
                action_type VARCHAR(100),
                apply_to VARCHAR(100),
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS attendance_policy_rule_assignments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                rule_id INT NOT NULL,
                user_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (rule_id) REFERENCES attendance_policy_rules(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS leaves (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT NOT NULL,
                leave_type VARCHAR(100) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                reason TEXT NOT NULL,
                status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
                is_half_day TINYINT(1) DEFAULT 0,
                half_day_period VARCHAR(20),
                contact_number VARCHAR(20),
                applied_by INT,
                team_lead_id INT,
                rejection_reason TEXT,
                start_time TIME,
                end_time TIME,
                approved_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (team_lead_id) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS leave_policies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                quota INT NOT NULL DEFAULT 0,
                description TEXT,
                carry_forward_limit INT DEFAULT 0,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS weekoff (
                id INT AUTO_INCREMENT PRIMARY KEY,
                userid INT NOT NULL,
                weekoffdate VARCHAR(50) NOT NULL,
                alternative_date VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (userid) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS weekoffaspercompany (
                id INT AUTO_INCREMENT PRIMARY KEY,
                day_name VARCHAR(50) NOT NULL,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 3. Asset Management
        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS asset_categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS assets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                asset_ref VARCHAR(100) NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                category_id INT,
                serial VARCHAR(255),
                purchase_date DATE,
                cost VARCHAR(100),
                vendor VARCHAR(255),
                branch VARCHAR(255),
                asset_image VARCHAR(255),
                specification TEXT,
                rental_type VARCHAR(100),
                warranty_in_month INT,
                invoice VARCHAR(255),
                remarks TEXT,
                status VARCHAR(50) DEFAULT 'Available',
                assigned_to INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES asset_categories(id) ON DELETE SET NULL,
                FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS asset_histories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                asset_id INT NOT NULL,
                user_id INT NULL,
                history_type ENUM('Assignment', 'Repair', 'Lost', 'Damaged') NOT NULL,
                assigned_from DATETIME DEFAULT CURRENT_TIMESTAMP,
                assigned_to DATETIME NULL,
                remarks TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS asset_query (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                asset_category_id INT NULL,
                asset_name VARCHAR(255),
                reason TEXT,
                status ENUM('Requested', 'Approved', 'Rejected') DEFAULT 'Requested',
                rejection_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // 4. Recruitment
        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS jobs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                requirements TEXT,
                department VARCHAR(255),
                location VARCHAR(255),
                job_type ENUM('Full-time', 'Part-time', 'Contract', 'Internship', 'Remote') DEFAULT 'Full-time',
                salary_range VARCHAR(255),
                status ENUM('Open', 'Closed', 'Draft') DEFAULT 'Open',
                contact_email VARCHAR(100),
                contact_phone VARCHAR(20),
                experience_years INT,
                min_salary DECIMAL(10,2),
                max_salary DECIMAL(10,2),
                skills TEXT,
                branch VARCHAR(100),
                num_positions INT DEFAULT 1,
                preferred_gender VARCHAR(50) DEFAULT 'Any',
                close_date DATE,
                hiring_manager VARCHAR(100),
                recruiters TEXT,
                city VARCHAR(100),
                state VARCHAR(100),
                zip_code VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS applicants (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_id INT,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                resume_url VARCHAR(255),
                status ENUM('Applied', 'Interviewing', 'Offered', 'Hired', 'Rejected', 'Completed') DEFAULT 'Applied',
                experience_years VARCHAR(50),
                gender VARCHAR(20),
                location VARCHAR(255),
                is_doc_sent TINYINT(1) DEFAULT 0,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS interviews (
                id INT AUTO_INCREMENT PRIMARY KEY,
                applicant_id INT NOT NULL,
                round_name VARCHAR(255) NOT NULL,
                interview_date DATE NOT NULL,
                interview_time TIME NOT NULL,
                mode VARCHAR(50) NOT NULL,
                meeting_link VARCHAR(255),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE CASCADE
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS offer_letters (
                id INT AUTO_INCREMENT PRIMARY KEY,
                applicant_id INT NOT NULL,
                offered_ctc DECIMAL(10,2) NOT NULL,
                joining_date DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE CASCADE
            )
        `);

        // 5. Payroll & Salary
        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS batch_allocations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                allocation_date DATE,
                allocation_day INT,
                batch VARCHAR(255),
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS batch_allocation_assignments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                batch_allocation_id INT NOT NULL,
                user_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_assignment (batch_allocation_id, user_id),
                FOREIGN KEY (batch_allocation_id) REFERENCES batch_allocations(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS payroll_runs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                batch_allocation_id INT,
                batch_name VARCHAR(255),
                pay_type VARCHAR(50) DEFAULT 'MONTHLY',
                period_start DATE,
                period_end DATE,
                total_employees INT DEFAULT 0,
                processed_employees INT DEFAULT 0,
                total_amount DECIMAL(15,2) DEFAULT 0.00,
                status ENUM('Pending', 'Active', 'Processing', 'Completed', 'Cancelled') DEFAULT 'Active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (batch_allocation_id) REFERENCES batch_allocations(id) ON DELETE SET NULL
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS payroll_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                payroll_run_id INT,
                user_id INT,
                employee_name VARCHAR(255),
                emp_id VARCHAR(50),
                department VARCHAR(100),
                designation VARCHAR(100),
                base_salary DECIMAL(15,2),
                paid_days DECIMAL(5,2),
                absent_days DECIMAL(5,2),
                gross_salary DECIMAL(15,2),
                lop_amount DECIMAL(15,2),
                epf_deduction DECIMAL(15,2),
                esi_deduction DECIMAL(15,2),
                pt_deduction DECIMAL(15,2),
                other_deductions DECIMAL(15,2) DEFAULT 0.00,
                deductions_breakdown JSON,
                bonus_incentives DECIMAL(15,2) DEFAULT 0.00,
                net_salary DECIMAL(15,2),
                hra DECIMAL(15,2) DEFAULT 0.00,
                conveyance DECIMAL(15,2) DEFAULT 0.00,
                medical DECIMAL(15,2) DEFAULT 0.00,
                special DECIMAL(15,2) DEFAULT 0.00,
                other DECIMAL(15,2) DEFAULT 0.00,
                earnings_breakdown JSON,
                cl_used DECIMAL(5,2) DEFAULT 0.00,
                permission_used DECIMAL(5,2) DEFAULT 0.00,
                employer_epfo_deduction DECIMAL(15,2) DEFAULT 0.00,
                variable_pay DECIMAL(15,2) DEFAULT 0.00,
                travel_allowance_pay DECIMAL(15,2) DEFAULT 0.00,
                per_diem DECIMAL(15,2) DEFAULT 0.00,
                ewf DECIMAL(15,2) DEFAULT 0.00,
                bank_ac_no VARCHAR(255),
                pf_no VARCHAR(255),
                dynamic_allowance_pay DECIMAL(15,2) DEFAULT 0.00,
                is_hold TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS payroll_holds (
                id INT AUTO_INCREMENT PRIMARY KEY,
                payroll_run_id INT NOT NULL,
                user_id INT NOT NULL,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_hold (payroll_run_id, user_id),
                FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS advance_salary (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                amount DECIMAL(15,2) NOT NULL,
                repayment_months INT NOT NULL DEFAULT 1,
                reason TEXT NOT NULL,
                status ENUM('Pending', 'Approved', 'Rejected', 'Paid') DEFAULT 'Pending',
                admin_comments TEXT,
                request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                approved_at DATETIME,
                approved_by INT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS allowance_policies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                type VARCHAR(100) NOT NULL,
                amount DECIMAL(15,2) DEFAULT 0.00,
                description TEXT,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS allowance_policy_assignments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                policy_id INT NOT NULL,
                user_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (policy_id) REFERENCES allowance_policies(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS salary_components (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                type ENUM('Earning', 'Deduction') NOT NULL,
                calculation_type ENUM('Formula', 'Variable', 'Fixed') DEFAULT 'Variable',
                calculation_value TEXT,
                sort_order INT DEFAULT 0,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS salary_formulas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                formula TEXT NOT NULL,
                status ENUM('VALIDATED', 'PENDING') DEFAULT 'PENDING',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS salary_structure_components (
                id INT AUTO_INCREMENT PRIMARY KEY,
                batch_allocation_id INT,
                component_id INT,
                FOREIGN KEY (batch_allocation_id) REFERENCES batch_allocations(id) ON DELETE CASCADE,
                FOREIGN KEY (component_id) REFERENCES salary_components(id) ON DELETE CASCADE
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS reimbursements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                category VARCHAR(100) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                amount DECIMAL(10,2) NOT NULL,
                date DATE NOT NULL,
                status ENUM('Pending', 'Approved', 'Rejected', 'Paid') DEFAULT 'Pending',
                receipt_url VARCHAR(555),
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // 6. Security & Compliance
        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                role VARCHAR(50) NOT NULL UNIQUE,
                permissions JSON NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS policies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                category VARCHAR(100) NOT NULL,
                version VARCHAR(50),
                file_url VARCHAR(500),
                file_type VARCHAR(50),
                file_size VARCHAR(100),
                status VARCHAR(50) DEFAULT 'Active',
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS company_policies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cl_limit DECIMAL(10,2) DEFAULT 0.00,
                permission_limit DECIMAL(10,2) DEFAULT 0.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS biometric_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                biometric_id VARCHAR(50),
                date DATE NOT NULL,
                deduction VARCHAR(50),
                emp_id VARCHAR(50),
                employee_name VARCHAR(255),
                device_name VARCHAR(255),
                punch_in TIME,
                punch_out TIME,
                shift VARCHAR(100),
                status VARCHAR(50),
                total_hours VARCHAR(20),
                user_id INT,
                weekoff_date VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_log (biometric_id, date)
            )
        `);

        // 7. Statutory Compliance Settings
        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS compliance_pf_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_pf_number VARCHAR(100),
                employee_rate DECIMAL(5,2) DEFAULT 12.00,
                deduct_employer_pf TINYINT(1) DEFAULT 0,
                eps_enabled TINYINT(1) DEFAULT 1,
                include_edli_in_ctc TINYINT(1) DEFAULT 1,
                include_admin_charges_in_ctc TINYINT(1) DEFAULT 1,
                prorate_restricted_pf_wage TINYINT(1) DEFAULT 1,
                consider_components_based_on_lop TINYINT(1) DEFAULT 1,
                allow_employee_level_override TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS compliance_esi_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_esi_number VARCHAR(100),
                company_ip_number VARCHAR(100),
                employee_rate DECIMAL(5,2) DEFAULT 0.75,
                employer_rate DECIMAL(5,2) DEFAULT 3.25,
                normal_employees_ceiling DECIMAL(15,2) DEFAULT 21000.00,
                disabled_employees_ceiling DECIMAL(15,2) DEFAULT 25000.00,
                esi_wage_definition VARCHAR(255) DEFAULT 'Basic + DA + HRA',
                esi_enabled TINYINT(1) DEFAULT 1,
                auto_calculate_esi TINYINT(1) DEFAULT 1,
                consider_components_based_on_lop TINYINT(1) DEFAULT 1,
                include_allowances_in_calculation TINYINT(1) DEFAULT 1,
                allow_employee_level_override TINYINT(1) DEFAULT 0,
                prorate_esi_wage TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS compliance_pt_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                pt_registration_number VARCHAR(100),
                notes TEXT,
                pt_enabled TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS compliance_pt_states (
                id INT AUTO_INCREMENT PRIMARY KEY,
                state_name VARCHAR(100) NOT NULL UNIQUE,
                is_applicable TINYINT(1) DEFAULT 0,
                no_of_slabs INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS compliance_lwf_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                lwf_registration_number VARCHAR(100),
                notes TEXT,
                lwf_enabled TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS compliance_lwf_states (
                id INT AUTO_INCREMENT PRIMARY KEY,
                state_name VARCHAR(100) NOT NULL UNIQUE,
                is_applicable TINYINT(1) DEFAULT 0,
                frequency VARCHAR(50) DEFAULT 'Yearly',
                ee_share DECIMAL(15,2) DEFAULT 0.00,
                er_share DECIMAL(15,2) DEFAULT 0.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS compliance_tds_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tds_enabled TINYINT(1) DEFAULT 0,
                tan_number VARCHAR(50),
                pan_number VARCHAR(50),
                deductor_name VARCHAR(255),
                address TEXT,
                city VARCHAR(100),
                state VARCHAR(100),
                pincode VARCHAR(20),
                email VARCHAR(255),
                phone VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 8. Statutory Records
        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS statutory_pf (
                id INT AUTO_INCREMENT PRIMARY KEY,
                month VARCHAR(50),
                employees_count INT DEFAULT 0,
                wages DECIMAL(15,2) DEFAULT 0.00,
                er_share DECIMAL(15,2) DEFAULT 0.00,
                ee_share DECIMAL(15,2) DEFAULT 0.00,
                total_epf DECIMAL(15,2) DEFAULT 0.00,
                status ENUM('Pending', 'Paid') DEFAULT 'Pending',
                trrn_no VARCHAR(100),
                challan_file VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS statutory_esi (
                id INT AUTO_INCREMENT PRIMARY KEY,
                month VARCHAR(50),
                insured_persons INT DEFAULT 0,
                wages DECIMAL(15,2) DEFAULT 0.00,
                er_share DECIMAL(15,2) DEFAULT 0.00,
                ee_share DECIMAL(15,2) DEFAULT 0.00,
                total_esi DECIMAL(15,2) DEFAULT 0.00,
                status ENUM('Pending', 'Paid') DEFAULT 'Pending',
                challan_id VARCHAR(100),
                challan_file VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS statutory_pt (
                id INT AUTO_INCREMENT PRIMARY KEY,
                month VARCHAR(50),
                state VARCHAR(100),
                taxable_employees INT DEFAULT 0,
                amount DECIMAL(15,2) DEFAULT 0.00,
                filing_date DATE,
                status ENUM('Pending', 'Filed') DEFAULT 'Pending',
                challan_file VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS statutory_tds (
                id INT AUTO_INCREMENT PRIMARY KEY,
                period VARCHAR(50),
                section VARCHAR(50),
                payout DECIMAL(15,2) DEFAULT 0.00,
                tds_deducted DECIMAL(15,2) DEFAULT 0.00,
                fine DECIMAL(15,2) DEFAULT 0.00,
                bsr_code VARCHAR(100),
                challan_no VARCHAR(100),
                status ENUM('Pending', 'Paid') DEFAULT 'Pending',
                challan_file VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 9. Notifications
        await tenantPool.execute(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NULL,
                role ENUM('superadmin', 'admin', 'employee') NULL,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                data JSON NULL,
                is_read TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id),
                INDEX (role),
                INDEX (is_read),
                INDEX (created_at),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // 10. Initial Setup Data
        if (companyData) {
            const hashedPassword = await bcrypt.hash('admin@123', 10);
            const adminEmail = companyData.email || `admin@${companyData.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

            const [result] = await tenantPool.execute(
                `INSERT INTO users (name, email, password, role, company) VALUES (?, ?, ?, ?, ?)`,
                [companyData.name, adminEmail, hashedPassword, 'admin', companyData.name]
            );
            console.log(`Initial admin user created: ${adminEmail} for company ${companyData.name}`);

            // 11. Initial Welcome Notification
            const adminId = result.insertId;
            await tenantPool.execute(
                `INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)`,
                [adminId, 'info', 'Welcome to HRM!', 'Your company account has been successfully set up.']
            );
            console.log(`Initial welcome notification created for admin ${adminId}`);
        }

        // 12. Seed Dynamic Filters
        await tenantPool.execute(`
            INSERT INTO employment_types (name) VALUES 
            ('Permanent'), ('Contract'), ('Intern'), ('Probation'), ('Notice Period')
        `);
        await tenantPool.execute(`
            INSERT INTO work_locations (name) VALUES 
            ('On-site'), ('Remote'), ('Hybrid')
        `);
        console.log(`Dynamic filters (Employment Type & Work Location) seeded for ${dbName}`);

        console.log(`Database ${dbName} setup completed successfully.`);
    } catch (error) {
        console.error(`Error setting up database ${dbName}:`, error.message);
        throw error;
    } finally {
        await tenantPool.end();
    }
};

module.exports = { setupTenantDatabase };
