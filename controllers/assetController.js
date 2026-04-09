const ExcelJS = require('exceljs');
const Asset = require('../models/assetModel');

// Categories
const getCategories = async (req, res) => {
    try {
        const categories = await Asset.getAllCategories();
        res.status(200).json(categories);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addCategory = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ message: 'Category name is required' });
        const id = await Asset.addCategory(name);
        res.status(201).json({ id, name });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Category already exists' });
        }
        res.status(500).json({ message: error.message });
    }
};

const deleteCategory = async (req, res) => {
    try {
        await Asset.deleteCategory(req.params.id);
        res.status(200).json({ message: 'Category deleted successfully' });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ message: 'Category is in use and cannot be deleted' });
        }
        res.status(500).json({ message: error.message });
    }
};

// Assets
const getAssets = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', category = 'All', status = 'All', startDate = '', endDate = '' } = req.query;
        const result = await Asset.getAllAssets({
            page: parseInt(page),
            limit: parseInt(limit),
            search,
            category,
            status,
            startDate,
            endDate
        });

        // map db columns to camelCase expected by frontend
        const mappedAssets = result.data.map(a => ({
            id: a.asset_ref,
            db_id: a.id,
            name: a.name,
            category: a.category_name,
            category_id: a.category_id,
            serial: a.serial,
            purchaseDate: a.purchase_date,
            cost: a.cost,
            status: a.status,
            branch: a.branch,
            assetImage: a.asset_image,
            specification: a.specification,
            rentalType: a.rental_type,
            vendor: a.vendor,
            warrantyInMonth: a.warranty_in_month,
            invoice: a.invoice,
            remarks: a.remarks,
            created_at: a.created_at,
            updated_at: a.updated_at,
            assignedTo: a.assigned_to ? {
                id: a.assigned_to,
                name: a.assigned_user_name,
                emp_id: a.assigned_user_emp_id,
                department: a.assigned_user_department
            } : null
        }));

        res.status(200).json({
            assets: mappedAssets,
            total: result.total,
            stats: result.stats
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createAsset = async (req, res) => {
    try {
        const data = req.body;

        // Handle file uploads
        if (req.files) {
            if (req.files.asset_image) {
                data.asset_image = req.files.asset_image[0].path.replace(/\\/g, '/');
            }
            if (req.files.invoice) {
                data.invoice = req.files.invoice[0].path.replace(/\\/g, '/');
            }
        }

        const sanitize = (val) => (val === '' || val === 'null' || val === undefined) ? null : val;

        const id = await Asset.createAsset({
            asset_ref: data.asset_ref || `AST-${Math.floor(Math.random() * 9000) + 1000}`,
            name: data.name,
            category_id: sanitize(data.category_id),
            serial: data.serial,
            purchase_date: sanitize(data.purchaseDate),
            cost: sanitize(data.cost),
            status: data.status,
            branch: sanitize(data.branch),
            asset_image: sanitize(data.asset_image),
            specification: sanitize(data.specification),
            rental_type: sanitize(data.rentalType),
            vendor: sanitize(data.vendor),
            warranty_in_month: sanitize(data.warrantyInMonth),
            invoice: sanitize(data.invoice),
            remarks: sanitize(data.remarks),
            assigned_to: sanitize(data.assigned_to)
        });

        // Send notification to employee if assigned
        if (data.assigned_to) {
            const io = req.app.get('socketio');
            const { sendNotification } = require('../utils/notificationHelper');
            await sendNotification(io, {
                user_id: data.assigned_to,
                type: 'asset',
                title: 'New Asset Assigned',
                message: `The asset "${data.name}" has been assigned to you.`,
                extra_data: { asset_id: id, type: 'asset_assignment' }
            });
        }

        res.status(201).json({ id, message: 'Asset created successfully' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Asset Reference or Serial Number already exists' });
        }
        res.status(500).json({ message: error.message });
    }
};

const updateAsset = async (req, res) => {
    try {
        const data = req.body;

        // Handle file uploads
        if (req.files) {
            if (req.files.asset_image) {
                data.asset_image = req.files.asset_image[0].path.replace(/\\/g, '/');
            }
            if (req.files.invoice) {
                data.invoice = req.files.invoice[0].path.replace(/\\/g, '/');
            }
        }

        const sanitize = (val) => (val === '' || val === 'null' || val === undefined) ? null : val;

        const updateData = {};

        // List of all possible fields
        const fields = [
            'name', 'category_id', 'serial', 'purchaseDate', 'cost', 'status',
            'branch', 'specification', 'rentalType', 'vendor', 'warrantyInMonth',
            'remarks', 'assigned_to'
        ];

        fields.forEach(f => {
            if (Object.prototype.hasOwnProperty.call(data, f)) {
                if (f === 'purchaseDate') {
                    updateData.purchase_date = sanitize(data[f]);
                } else if (f === 'warrantyInMonth') {
                    updateData.warranty_in_month = sanitize(data[f]);
                } else if (f === 'rentalType') {
                    updateData.rental_type = sanitize(data[f]);
                } else if (f === 'category_id' || f === 'cost' || f === 'branch' || f === 'specification' || f === 'vendor' || f === 'remarks' || f === 'assigned_to') {
                    updateData[f] = sanitize(data[f]);
                } else {
                    updateData[f] = data[f];
                }
            }
        });

        // Special handling for file paths if they were uploaded
        if (data.asset_image) updateData.asset_image = data.asset_image;
        if (data.invoice) updateData.invoice = data.invoice;

        // Automatic status update based on assignment if status not provided
        if (Object.prototype.hasOwnProperty.call(updateData, 'assigned_to') && !updateData.status) {
            if (updateData.assigned_to) {
                updateData.status = 'Assigned';
            } else {
                updateData.status = 'Available';
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        const affected = await Asset.updateAsset(req.params.id, updateData);
        if (!affected) return res.status(404).json({ message: 'Asset not found' });

        // Send notification to employee if just assigned/re-assigned
        if (updateData.assigned_to) {
            const io = req.app.get('socketio');
            const { sendNotification } = require('../utils/notificationHelper');
            const assetInfo = await Asset.getAssetById(req.params.id);
            if (assetInfo) {
                await sendNotification(io, {
                    user_id: updateData.assigned_to,
                    type: 'asset',
                    title: 'Asset Assigned',
                    message: `The asset "${assetInfo.name}" has been assigned to you.`,
                    extra_data: { asset_id: req.params.id, type: 'asset_assignment' }
                });
            }
        }

        res.status(200).json({ message: 'Asset updated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteAsset = async (req, res) => {
    try {
        const affected = await Asset.deleteAsset(req.params.id);
        if (!affected) return res.status(404).json({ message: 'Asset not found' });
        res.status(200).json({ message: 'Asset deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMyAssets = async (req, res) => {
    try {
        const userId = req.user.id;
        const rows = await Asset.getMyAssets(userId);

        const mappedAssets = rows.map(a => ({
            id: a.asset_ref,
            db_id: a.id,
            name: a.name,
            category: a.category_name,
            category_id: a.category_id,
            serial: a.serial,
            purchaseDate: a.purchase_date,
            status: a.status,
            assignedTo: a.assigned_to ? {
                id: a.assigned_to,
                name: a.assigned_user_name,
                emp_id: a.assigned_user_emp_id,
                department: a.assigned_user_department
            } : null
        }));

        res.status(200).json(mappedAssets);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAssetAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'StartDate and EndDate are required' });
        }
        const analytics = await Asset.getAssetAnalytics({ startDate, endDate });
        res.status(200).json(analytics);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const requestAsset = async (req, res) => {
    try {
        const { asset_category_id, asset_name, reason } = req.body;
        const userId = req.user.id;

        if (!asset_name || !reason) {
            return res.status(400).json({ message: 'Asset name and reason are required' });
        }

        const id = await Asset.createAssetRequest({
            user_id: userId,
            asset_category_id: asset_category_id || null,
            asset_name,
            reason
        });

        // Send notification to admin
        const io = req.app.get('socketio');
        const { sendNotification } = require('../utils/notificationHelper');
        const userName = req.user.name || 'Employee';

        await sendNotification(io, {
            role: 'admin',
            type: 'request',
            title: 'New Asset Request',
            message: `${userName} has requested a new asset: ${asset_name}`,
            extra_data: { request_id: id, type: 'asset_request' }
        });

        res.status(201).json({ id, message: 'Asset request submitted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAssetRequests = async (req, res) => {
    try {
        const { status = 'All', search = '' } = req.query;
        const requests = await Asset.getAssetRequests({ status, search });
        res.status(200).json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMyAssetRequests = async (req, res) => {
    try {
        const requests = await Asset.getUserAssetRequests(req.user.id);
        res.status(200).json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateRequestStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rejection_reason } = req.body;

        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const affected = await Asset.updateAssetRequestStatus(id, status, rejection_reason);
        if (!affected) return res.status(404).json({ message: 'Request not found' });

        // Send notification to employee
        const request = await Asset.getAssetRequestById(id);
        if (request) {
            const io = req.app.get('socketio');
            const { sendNotification } = require('../utils/notificationHelper');
            await sendNotification(io, {
                user_id: request.user_id,
                type: 'asset',
                title: `Asset Request ${status}`,
                message: `Your request for ${request.asset_name} has been ${status.toLowerCase()}${rejection_reason ? ': ' + rejection_reason : ''}`,
                extra_data: { request_id: id, status, type: 'asset_status_update' }
            });
        }

        res.status(200).json({ message: `Request ${status.toLowerCase()} successfully` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const generateAssetReport = async (req, res) => {
    try {
        const { fromDate, toDate, departments, categories, status, reportType, format } = req.query;

        const reportTitles = {
            'asset-inventory': 'Asset Inventory',
            'assigned-assets': 'Allocated List',
            'pending-requests': 'Pending Asset Requests',
            'maintenance-log': 'Maintenance Log',
            'scrapped-assets': 'Retired Assets',
            'category-stats': 'Asset Distribution'
        };

        const displayTitle = reportTitles[reportType] || 'Asset Report';

        let data = [];
        let isRequestReport = reportType === 'pending-requests';

        if (isRequestReport) {
            data = await Asset.getAssetRequests({
                status: 'Requested',
                departments: departments,
                startDate: fromDate,
                endDate: toDate
            });
        } else {
            const filters = {
                startDate: fromDate,
                endDate: toDate,
                departments: departments,
                category: categories && categories !== 'All' ? categories : null,
                status: status && status !== 'All' ? status : null,
                limit: 10000
            };

            if (reportType === 'assigned-assets') filters.status = 'Assigned';
            if (reportType === 'maintenance-log') filters.status = 'Maintenance,Broken';
            if (reportType === 'scrapped-assets') filters.status = 'Retired,Lost';

            const result = await Asset.getAllAssets(filters);
            data = result.data;
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ message: `No ${isRequestReport ? 'requests' : 'assets'} found for the selected criteria.` });
        }

        if (format === 'pdf') {
            const puppeteer = require('puppeteer');
            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        @page { size: A4 landscape; margin: 10mm; }
                        body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; color: #1e293b; }
                        .header { text-align: center; background: #41398B; color: white; padding: 25px; border-radius: 8px 8px 0 0; }
                        .header h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
                        .info-bar { background: #f8fafc; text-align: center; padding: 12px; border-bottom: 2px solid #e2e8f0; font-size: 11px; color: #64748b; font-style: italic; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 10px; }
                        th { background: #5C52C7; color: white; padding: 10px 5px; border: 1px solid #4a42a0; }
                        td { padding: 8px 5px; border: 1px solid #e2e8f0; text-align: center; }
                        tr:nth-child(even) { background: #f8fafc; }
                        .footer { margin-top: 30px; text-align: right; font-size: 10px; color: #94a3b8; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>${displayTitle.toUpperCase()} REPORT</h1>
                    </div>
                    <div class="info-bar">
                        Generated on: ${new Date().toLocaleString()} | Range: ${fromDate} to ${toDate} | Total Records: ${data.length}
                    </div>
                    <table>
                        <thead>
                            <tr>
                                ${isRequestReport
                    ? '<th>ID</th><th>User</th><th>Emp ID</th><th>Asset</th><th>Category</th><th>Reason</th><th>Status</th><th>Date</th>'
                    : '<th>Asset ID</th><th>Name</th><th>Category</th><th>Serial</th><th>Assigned To</th><th>Location</th><th>Price</th><th>Purchase Date</th>'
                }
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(item => `
                                <tr>
                                    ${isRequestReport
                        ? `<td>${item.id}</td><td>${item.user_name}</td><td>${item.emp_id}</td><td>${item.asset_name}</td><td>${item.category_name || '-'}</td><td>${item.reason}</td><td>${item.status}</td><td>${new Date(item.created_at).toLocaleDateString()}</td>`
                        : `<td>${item.asset_ref}</td><td>${item.name}</td><td>${item.category_name}</td><td>${item.serial || '-'}</td><td>${item.assigned_user_name || 'Unassigned'}</td><td>${item.branch || '-'}</td><td>${item.cost || '-'}</td><td>${item.purchase_date ? new Date(item.purchase_date).toLocaleDateString() : '-'}</td>`
                    }
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </body>
                </html>
            `;

            const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
            const page = await browser.newPage();
            await page.setContent(htmlContent);
            const pdfBuffer = await page.pdf({ format: 'A4', landscape: true, printBackground: true });
            await browser.close();

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=Asset_Report_${reportType}_${new Date().getTime()}.pdf`);
            return res.send(pdfBuffer);
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Asset Report');

        // ... existing Excel logic continues ...
        // (I'll keep the Excel logic below as it was)
        let headers = [];
        let columnWidths = [];

        if (isRequestReport) {
            headers = ['Request ID', 'User Name', 'Emp ID', 'Asset Name', 'Category', 'Reason', 'Status', 'Requested Date'];
            columnWidths = [12, 20, 12, 20, 15, 30, 12, 15];
        } else {
            headers = ['Asset ID', 'Name', 'Category', 'Serial Number', 'Assigned To', 'Location', 'Price', 'Purchase Date', 'Warranty', 'Status'];
            columnWidths = [15, 25, 15, 20, 20, 15, 12, 15, 12, 12];
        }

        const maxCol = String.fromCharCode(64 + headers.length);
        worksheet.mergeCells(`A1:${maxCol}1`);
        const titleCell = worksheet.getCell('A1');
        titleCell.value = `ASSET REPORT - ${displayTitle.toUpperCase()}`;
        titleCell.font = { name: 'Arial Black', size: 16, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF41398B' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        worksheet.getRow(1).height = 40;

        worksheet.mergeCells(`A2:${maxCol}2`);
        const infoCell = worksheet.getCell('A2');
        infoCell.value = `Generated on: ${new Date().toLocaleString()} | Range: ${fromDate} to ${toDate}`;
        infoCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
        infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(2).height = 25;

        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5C52C7' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
        worksheet.getRow(3).height = 25;

        data.forEach((item, index) => {
            let rowData = [];
            if (isRequestReport) {
                rowData = [item.id, item.user_name, item.emp_id, item.asset_name, item.category_name || 'N/A', item.reason, item.status, item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'];
            } else {
                rowData = [item.asset_ref, item.name, item.category_name, item.serial || 'N/A', item.assigned_user_name || 'Unassigned', item.branch || 'Head Office', item.cost ? item.cost : '-', item.purchase_date ? new Date(item.purchase_date).toLocaleDateString() : '-', item.warranty_in_month ? `${item.warranty_in_month} months` : '-', item.status];
            }
            const row = worksheet.addRow(rowData);
            row.eachCell((cell, colNum) => {
                cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                if (!isRequestReport && colNum === 7) cell.alignment.horizontal = 'right';
                cell.font = { name: 'Arial', size: 10 };
            });
            if (index % 2 === 0) { row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; }); }
        });

        worksheet.columns = columnWidths.map(w => ({ width: w }));
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${reportType}_report_${new Date().getTime()}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error in generateAssetReport:', error);
        res.status(500).json({ message: 'Error generating asset report', error: error.message });
    }
};

module.exports = {
    getCategories,
    addCategory,
    deleteCategory,
    getAssets,
    createAsset,
    updateAsset,
    deleteAsset,
    getMyAssets,
    getAssetAnalytics,
    requestAsset,
    getAssetRequests,
    getMyAssetRequests,
    updateRequestStatus,
    generateAssetReport
};
