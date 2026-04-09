const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const generatePayslipPDF = async (data) => {
    const { company, employee, payrollRun } = data;
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Format numbers
    const formatCurrency = (val) => Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Logo processing
    let logoHtml = '';
    if (company.logo) {
        // Construct absolute path for the logo
        const logoPath = path.join(__dirname, '..', company.logo.replace(/\\/g, '/'));
        if (fs.existsSync(logoPath)) {
            const logoBase64 = fs.readFileSync(logoPath).toString('base64');
            const mimeType = path.extname(logoPath).substring(1) === 'png' ? 'image/png' : 'image/jpeg';
            logoHtml = `<img src="data:${mimeType};base64,${logoBase64}" style="max-height: 80px; max-width: 250px; object-contain: fit;" />`;
        }
    }

    if (!logoHtml && company.name) {
        logoHtml = `<div style="font-weight: bold; font-size: 13px; color: #1f2937; text-transform: uppercase;">${company.name}</div>`;
    }

    const monthYear = new Date(payrollRun.period_start).toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();

    // Split address
    const addressLines = (company.address || '').split('\n').filter(l => l.trim());

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
            body {
                font-family: 'Outfit', sans-serif;
                margin: 0;
                padding: 13mm;
                color: #000;
                background: #fff;
                font-size: 11px;
                text-transform: uppercase;
                width: 210mm;
                box-sizing: border-box;
            }
            .header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 25px;
            }
            .company-info {
                max-width: 250px;
            }
            .contact-info {
                text-align: right;
                font-weight: 600;
                line-height: 1.6;
            }
            .contact-info p {
                margin: 0;
            }
            .title {
                text-align: center;
                margin-bottom: 20px;
            }
            .title h2 {
                font-size: 14px;
                font-weight: 700;
                letter-spacing: 0.1em;
                margin: 0;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                border: 1.5px solid #000;
                table-layout: fixed;
                margin-bottom: 20px;
            }
            th, td {
                border: 1.5px solid #000;
                padding: 9px 12px;
                word-wrap: break-word;
            }
            th {
                background: #fff;
                font-weight: 700;
                text-align: center;
            }
            .table-header {
                font-size: 12px;
                letter-spacing: 0.1em;
                text-align: center;
                font-weight: 700;
            }
            .label-cell {
                font-weight: 600;
                width: 25%;
            }
            .value-cell {
                width: 25%;
            }
            .salary-header th {
                text-align: left;
                font-size: 12px;
            }
            .salary-header th.right {
                text-align: right;
            }
            .bold {
                font-weight: 700;
            }
            .text-right {
                text-align: right;
            }
            .footer {
                text-align: center;
                margin-top: 20px;
                font-weight: 600;
                text-transform: none;
            }
            .footer p {
                margin: 10px 0;
            }
            .email-link {
                color: #1a5ea8;
                font-weight: 700;
                border-bottom: 1px solid #1a5ea8;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="company-info">
                ${logoHtml}
            </div>
            <div class="contact-info">
                ${addressLines.map(line => `<p>${line}</p>`).join('')}
                <p>PHONE: ${company.phone || 'N/A'}</p>
                <p>E-MAIL:- ${company.email || 'N/A'}</p>
                <p>${company.website || ''}</p>
            </div>
        </div>

        <div class="title">
            <h2>PAY SLIP FOR THE MONTH OF ${monthYear}</h2>
        </div>

        <table>
            <thead>
                <tr>
                    <th colspan="4" class="table-header">EMPLOYEE DETAILS</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="label-cell">CODE</td>
                    <td class="value-cell">${employee.emp_id || 'N/A'}</td>
                    <td class="label-cell">NAME</td>
                    <td class="value-cell">${employee.name || 'N/A'}</td>
                </tr>
                <tr>
                    <td class="label-cell">DESIGNATION</td>
                    <td class="value-cell">${employee.designation || 'N/A'}</td>
                    <td class="label-cell">PAY MODE</td>
                    <td class="value-cell">TRANSFER</td>
                </tr>
                <tr>
                    <td class="label-cell">DEPARTMENT</td>
                    <td class="value-cell">${employee.department || 'N/A'}</td>
                    <td class="label-cell">ACCT. NO.</td>
                    <td class="value-cell">${employee.bank_ac_no || 'XXXXXXXXXXXX'}</td>
                </tr>
                <tr>
                    <td class="label-cell">LOSS OF PAY</td>
                    <td class="value-cell">${employee.absentDays || 0}</td>
                    <td class="label-cell">PF NO.</td>
                    <td class="value-cell">${employee.pf_no || 'XXXXXXXXXXXX'}</td>
                </tr>
            </tbody>
        </table>

        <table>
            <thead>
                <tr>
                    <th colspan="4" class="table-header">SALARY DETAILS</th>
                </tr>
                <tr class="salary-header">
                    <th style="width: 35%;">EARNINGS</th>
                    <th style="width: 15%; text-align: right;">RUPEES</th>
                    <th style="width: 35%;">DEDUCTIONS</th>
                    <th style="width: 15%; text-align: right;">RUPEES</th>
                </tr>
            </thead>
            <tbody>
                ${(() => {
                    const earnings = { ...(employee.earnings_breakdown || {}) };
                    const deductions = { ...(employee.deductions_breakdown || {}) };

                    // Always ensure key deduction fields are present if they have values
                    if (employee.lop > 0) deductions['LOSS OF PAY'] = employee.lop;
                    if (employee.epf && !deductions['PF'] && !deductions['EPF']) deductions['PF'] = employee.epf;
                    if (employee.esi && !deductions['ESI']) deductions['ESI'] = employee.esi;
                    if (employee.pt && !deductions['PT']) deductions['PT'] = employee.pt;
                    if (employee.it && !deductions['IT'] && !deductions['Income Tax']) deductions['IT'] = employee.it;
                    if (employee.vpf && !deductions['VPF']) deductions['VPF'] = employee.vpf;

                    // If earnings breakdown is empty, use legacy fields
                    if (Object.keys(earnings).length === 0) {
                        earnings['BASIC'] = employee.salary || 0;
                        earnings['HRA'] = employee.hra || 0;
                        if (employee.conveyance) earnings['CONVEYANCE'] = employee.conveyance;
                        if (employee.medical) earnings['MEDICAL REIM'] = employee.medical;
                        if (employee.special) earnings['SPECIAL ALLOW'] = employee.special;
                        if (employee.travel) earnings['TRAVEL ALLOW'] = employee.travel;
                        if (employee.perDiem) earnings['PER DIEM ALLOW'] = employee.perDiem;
                        if (employee.variable) earnings['VARIABLE'] = employee.variable;
                        if (employee.incentives) earnings['INCENTIVES'] = employee.incentives;
                    }

                    // Filter out 0 value items to keep it clean
                    const earnKeys = Object.keys(earnings).filter(k => earnings[k] !== 0);
                    const deductKeys = Object.keys(deductions).filter(k => deductions[k] !== 0);
                    const maxRows = Math.max(earnKeys.length, deductKeys.length);
                    
                    let rowsHtml = '';
                    for (let i = 0; i < maxRows; i++) {
                        const eKey = earnKeys[i];
                        const dKey = deductKeys[i];
                        rowsHtml += `
                            <tr>
                                <td class="${eKey === 'GROSS' ? 'bold' : ''}">${eKey || ''}</td>
                                <td class="text-right ${eKey === 'GROSS' ? 'bold' : ''}">${eKey ? formatCurrency(earnings[eKey]) : ''}</td>
                                <td class="${dKey === 'NET' ? 'bold' : ''}">${dKey || ''}</td>
                                <td class="text-right ${dKey === 'NET' ? 'bold' : ''}">${dKey ? formatCurrency(deductions[dKey]) : ''}</td>
                            </tr>
                        `;
                    }
                    return rowsHtml;
                })()}
                <tr>
                    <td class="bold">GROSS EARNINGS</td>
                    <td class="text-right bold">${formatCurrency(employee.gross)}</td>
                    <td class="bold">TOTAL DEDUCTIONS</td>
                    <td class="text-right bold">${formatCurrency(employee.deductions)}</td>
                </tr>
                <tr style="background-color: #f9fafb;">
                    <td colspan="2"></td>
                    <td class="bold" style="font-size: 13px;">NET PAY</td>
                    <td class="text-right bold" style="font-size: 13px;">${formatCurrency(employee.net)}</td>
                </tr>
            </tbody>
        </table>

        <table>
            <thead>
                <tr>
                    <th style="width: 50%; text-align: left;">LEAVE DETAILS</th>
                    <th style="width: 25%;">OPENING BALANCE</th>
                    <th style="width: 25%;">CLOSING BALANCE</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="bold">CASUAL LEAVE</td>
                    <td class="text-center">${employee.cl_used || 0}</td>
                    <td class="text-center">0</td>
                </tr>
                <tr>
                    <td class="bold">PERMISSION (HRS)</td>
                    <td class="text-center">${((employee.permission_used || 0) * 10).toFixed(1)}</td>
                    <td class="text-center">0</td>
                </tr>
                <tr>
                    <td class="bold">WEEKLY OFF</td>
                    <td class="text-center">0</td>
                    <td class="text-center">0</td>
                </tr>
            </tbody>
        </table>

        <div class="footer">
            <p>System generated pay slip signature not required</p>
            <p>Regarding any queries on pay structure please write a mail to <span class="email-link">${company.email || ''}</span></p>
        </div>
    </body>
    </html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' }
    });

    await browser.close();
    return pdf;
};

module.exports = { generatePayslipPDF };
