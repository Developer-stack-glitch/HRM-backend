const ExcelJS = require('exceljs');
const Leave = require('../models/leaveModel');
const Attendance = require('../models/attendanceModel');

const createLeave = async (req, res) => {
    try {
        const { employee_id, start_date, end_date, is_half_day, leave_type } = req.body;

        // Block leave if attendance exists, but only for full-day leaves (not half-days or permissions)
        if (!is_half_day && leave_type !== 'Permission') {
            const hasAttendance = await Attendance.hasAttendanceInRange(employee_id, start_date, end_date);

            if (hasAttendance) {
                return res.status(400).json({
                    message: "Attendance records already exist for the requested dates. You cannot apply for a full-day leave on a day you have already punched in."
                });
            }
        }

        const leaveId = await Leave.create(req.body);

        // Send Notification
        const io = req.app.get('socketio');
        const { sendNotification } = require('../utils/notificationHelper');
        const userName = req.user.name || req.user.employee_name || 'Employee';

        await sendNotification(io, {
            role: 'admin',
            type: 'request',
            title: 'New Leave Request',
            message: `${userName} has requested ${leave_type} from ${start_date} to ${end_date}`,
            extra_data: { leave_id: leaveId, type: 'leave_request' }
        });

        res.status(201).json({ message: 'Leave request created successfully', leaveId });
    } catch (error) {
        console.error('Error creating leave:', error);
        res.status(500).json({ message: 'Error creating leave', error: error.message });
    }
};

const getLeaves = async (req, res) => {
    try {
        const leaves = await Leave.getAll(req.query);
        res.status(200).json(leaves);
    } catch (error) {
        console.error('Error fetching leaves:', error);
        res.status(500).json({ message: 'Error fetching leaves', error: error.message });
    }
};

const updateLeave = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remarks, employee_id } = req.body;
        const success = await Leave.update(id, req.body);
        if (!success) {
            return res.status(404).json({ message: 'Leave request not found or no changes made' });
        }

        // Send notification to employee
        if (status && employee_id) {
            const io = req.app.get('socketio');
            const { sendNotification } = require('../utils/notificationHelper');
            await sendNotification(io, {
                user_id: employee_id,
                type: 'leave',
                title: `Leave ${status}`,
                message: `Your leave request has been ${status.toLowerCase()}${remarks ? ': ' + remarks : ''}`,
                extra_data: { leave_id: id, status, type: 'leave_status_update' }
            });
        }

        res.status(200).json({ message: 'Leave request updated successfully' });
    } catch (error) {
        console.error('Error updating leave:', error);
        res.status(500).json({ message: 'Error updating leave', error: error.message });
    }
};

const generateLeaveReport = async (req, res) => {
    try {
        const { fromDate, toDate, departments, status, reportType } = req.query;

        let targetStatus = status;
        // Map report type to specific status filters if needed
        if (reportType === 'pending-requests') targetStatus = ['Pending'];
        else if (reportType === 'rejected-requests') targetStatus = ['Rejected'];
        else if (reportType === 'approved-summary') targetStatus = ['Approved'];

        const filters = {
            startDate: fromDate,
            endDate: toDate,
            departments: departments,
            status: targetStatus && targetStatus !== 'All' ? targetStatus : null,
            limit: 2000,
            reportType
        };

        const result = await Leave.getAll(filters);
        const data = result.leaves;

        if (!data || data.length === 0) {
            return res.status(404).json({ message: 'No leave records found for the selected criteria.' });
        }

        const reportTitles = {
            'leave-ledger': 'Leave Ledger',
            'balance-report': 'Balance Report',
            'pending-requests': 'Action Required',
            'rejected-requests': 'Rejections',
            'leave-trends': 'Leave Trends',
            'approved-summary': 'Approved Summary'
        };

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Leave Report');

        // Title & Header Styling
        worksheet.mergeCells('A1:J1');
        const titleCell = worksheet.getCell('A1');
        const displayReportType = reportTitles[reportType] || (reportType ? reportType.replace('-', ' ').toUpperCase() : 'Leave Ledger');
        titleCell.value = `LEAVE REPORT - ${displayReportType.toUpperCase()}`;
        titleCell.font = { name: 'Arial Black', size: 16, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF41398B' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        worksheet.getRow(1).height = 40;

        // Info Row (Row 2)
        worksheet.mergeCells('A2:J2');
        const infoCell = worksheet.getCell('A2');
        infoCell.value = `Generated on: ${new Date().toLocaleString()} | Period: ${fromDate} to ${toDate}`;
        infoCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
        infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(2).height = 25;

        // Headers
        const headers = ['Date', 'Employee ID', 'Name', 'Department', 'Leave Type', 'Start Date', 'End Date', 'Days', 'Reason', 'Status'];
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5C52C7' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
        worksheet.getRow(3).height = 25;

        // Data Rows
        data.forEach((item, index) => {
            const startStr = item.start_date instanceof Date ? item.start_date.toISOString() : String(item.start_date);
            const endStr = item.end_date instanceof Date ? item.end_date.toISOString() : String(item.end_date);

            const start = new Date(startStr);
            const end = new Date(endStr);
            const duration = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

            const rowData = [
                new Date(item.created_at || item.start_date).toLocaleDateString(),
                item.emp_id,
                item.employee_name,
                item.department_name || 'N/A',
                item.leave_type + (item.is_half_day ? ' (Half)' : ''),
                startStr.split('T')[0],
                endStr.split('T')[0],
                item.is_half_day ? 0.5 : duration,
                item.reason,
                item.status
            ];

            const row = worksheet.addRow(rowData);

            row.eachCell((cell, colNumber) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };
                cell.alignment = { vertical: 'middle', horizontal: colNumber === 8 ? 'right' : 'center' };
                cell.font = { name: 'Arial', size: 10 };
            });

            // Alternating row colors
            if (index % 2 === 0) {
                row.eachCell((cell) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                });
            }

            // Status color coding
            const statusCell = row.getCell(10);
            if (item.status === 'Approved') {
                statusCell.font = { color: { argb: 'FF059669' }, bold: true, size: 10 };
            } else if (item.status === 'Rejected') {
                statusCell.font = { color: { argb: 'FFDC2626' }, bold: true, size: 10 };
            } else {
                statusCell.font = { color: { argb: 'FFD97706' }, bold: true, size: 10 };
            }
        });

        // Column Widths
        worksheet.columns = [
            { width: 12 }, // Created Date
            { width: 15 }, // ID
            { width: 25 }, // Name
            { width: 20 }, // Dept
            { width: 15 }, // Type
            { width: 15 }, // Start
            { width: 15 }, // End
            { width: 8 },  // Days
            { width: 35 }, // Reason
            { width: 12 }  // Status
        ];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=leave_report_${fromDate}_to_${toDate}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error generating leave report:', error);
        res.status(500).json({ message: 'Error generating leave report', error: error.message });
    }
};

const deleteLeave = async (req, res) => {
    try {
        const { id } = req.params;
        const success = await Leave.delete(id);
        if (!success) {
            return res.status(404).json({ message: 'Leave request not found' });
        }
        res.status(200).json({ message: 'Leave request deleted successfully' });
    } catch (error) {
        console.error('Error deleting leave:', error);
        res.status(500).json({ message: 'Error deleting leave', error: error.message });
    }
};

module.exports = {
    createLeave,
    getLeaves,
    updateLeave,
    deleteLeave,
    generateLeaveReport
};
