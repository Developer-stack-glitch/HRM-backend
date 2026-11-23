const axios = require('axios');
const xml2js = require('xml2js');
const mysql = require('mysql2/promise');

function normalizeDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return dateStr;
}

function calculateTotalHours(inTime, outTime) {
  if (!inTime || !outTime) return "00:00:00";
  const [hIn, mIn, sIn] = inTime.split(':').map(Number);
  const [hOut, mOut, sOut] = outTime.split(':').map(Number);

  let diff = (hOut * 3600 + mOut * 60 + (sOut || 0)) - (hIn * 3600 + mIn * 60 + (sIn || 0));
  if (diff < 0) diff += 24 * 3600;

  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function syncAllSoapHistory() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  // 1. Clean dummy test devices
  console.log('1. Cleaning dummy test devices...');
  await conn.query("DELETE FROM devices WHERE serial_number IN ('UNKNOWN', 'TESTDEVICE123', 'TEST123')");

  const [devices] = await conn.query('SELECT * FROM devices');
  console.log(`Active devices in database: ${devices.length}`);
  console.table(devices);

  // 2. Fetch SOAP API punches from 2026-11-15 to 2026-11-23
  const fromDate = '2026-11-15 00:00';
  const toDate = '2026-11-23 23:59';
  const biometricApiUrl = 'http://210.18.138.85:80/iclock/webapiservice.asmx?op=GetTransactionsLog';
  const biometricUser = 'API';
  const biometricPassword = 'Essl@123';

  console.log(`\n2. Fetching punches from SOAP API for date range ${fromDate} to ${toDate}...`);

  let totalParsed = 0;
  let totalSaved = 0;

  for (const dev of devices) {
    console.log(`Fetching from ${dev.name} (${dev.serial_number})...`);
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <GetTransactionsLog xmlns="http://tempuri.org/">
            <FromDate>${fromDate}</FromDate>
            <ToDate>${toDate}</ToDate>
            <SerialNumber>${dev.serial_number}</SerialNumber>
            <UserName>${biometricUser}</UserName>
            <UserPassword>${biometricPassword}</UserPassword>
            <strDataList>123</strDataList>
        </GetTransactionsLog>
    </soap:Body>
</soap:Envelope>`;

    try {
      const response = await axios.post(biometricApiUrl, soapEnvelope, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'http://tempuri.org/GetTransactionsLog'
        },
        timeout: 15000
      });

      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
      const result = await parser.parseStringPromise(response.data);
      const body = result['soap:Envelope']?.['soap:Body'] || result['s:Envelope']?.['s:Body'] || result['Envelope']?.['Body'];
      const apiResponse = body?.['GetTransactionsLogResponse'] || body?.['ns0:GetTransactionsLogResponse'];
      const rawData = apiResponse?.['strDataList'];

      if (!rawData || typeof rawData !== 'string') {
        console.log(`  No data returned for ${dev.name}`);
        continue;
      }

      const lines = rawData.trim().split('\n').filter(Boolean);
      const parsedPunches = [];

      lines.forEach(line => {
        const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
        if (parts.length < 2) return;
        const empId = parts[0];
        const timestamp = parts[1];
        if (!timestamp || timestamp === '123') return;
        const [dateRaw, time] = timestamp.split(' ');
        if (!dateRaw || !time) return;
        const date = normalizeDate(dateRaw);
        parsedPunches.push({
          device_sn: dev.serial_number,
          device_name: dev.name,
          emp_id: String(empId).trim(),
          punch_time: `${date} ${time}`,
          date,
          time
        });
      });

      totalParsed += parsedPunches.length;
      console.log(`  Parsed ${parsedPunches.length} punches for ${dev.name}`);

      // Insert into biometric_punches
      if (parsedPunches.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < parsedPunches.length; i += batchSize) {
          const chunk = parsedPunches.slice(i, i + batchSize);
          const values = [];
          const placeholders = chunk.map(p => {
            values.push(p.device_sn, p.device_name, p.emp_id, p.punch_time, p.date, p.time, 1, 0);
            return '(?, ?, ?, ?, ?, ?, ?, ?)';
          }).join(', ');

          const [ins] = await conn.execute(
            `INSERT IGNORE INTO biometric_punches 
              (device_sn, device_name, emp_id, punch_time, date, time, verify_type, punch_state) 
             VALUES ${placeholders}`,
            values
          );
          totalSaved += ins.affectedRows;
        }
      }
    } catch (e) {
      console.error(`  Error for ${dev.name}:`, e.message);
    }
  }

  console.log(`\nFinished fetching! Total parsed: ${totalParsed}, Total new rows inserted: ${totalSaved}`);

  await conn.end();
}

syncAllSoapHistory().catch(console.error);
