const config = require('./config.json');

async function testExport30() {
  const appsScriptUrl = config.appsScriptUrl;
  console.log('Using Apps Script URL:', appsScriptUrl);
  
  // Column F is column index 5 (A=0, B=1, C=2, D=3, E=4, F=5)
  // Date "30" is located in Column F, Row 8
  const updates = [
    // Khăn tắm: Hotel (Row 52) = 169, Laun (Row 53) = 150
    { range: "'HK'!F52", value: 169, note: "Số phiếu: 000192\nBộ phận: HK\nNgày: 30/5" },
    { range: "'HK'!F53", value: 150, note: "Số phiếu: 000192\nBộ phận: HK\nNgày: 30/5" },
    
    // Khăn tay: Hotel (Row 57) = 139, Laun (Row 58) = 137
    { range: "'HK'!F57", value: 139, note: "Số phiếu: 000192\nBộ phận: HK\nNgày: 30/5" },
    { range: "'HK'!F58", value: 137, note: "Số phiếu: 000192\nBộ phận: HK\nNgày: 30/5" },
    
    // Khăn mặt: Hotel (Row 61) = 111, Laun (Row 62) = 107
    { range: "'HK'!F61", value: 111, note: "Số phiếu: 000192\nBộ phận: HK\nNgày: 30/5" },
    { range: "'HK'!F62", value: 107, note: "Số phiếu: 000192\nBộ phận: HK\nNgày: 30/5" },
    
    // Khăn chân: Hotel (Row 65) = 79, Laun (Row 66) = 84
    { range: "'HK'!F65", value: 79, note: "Số phiếu: 000192\nBộ phận: HK\nNgày: 30/5" },
    { range: "'HK'!F66", value: 84, note: "Số phiếu: 000192\nBộ phận: HK\nNgày: 30/5" }
  ];
  
  try {
    console.log('Sending updates to Google Sheets via Apps Script Web App for Date 30 (Column F)...');
    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'write',
        tabName: 'HK',
        updates: updates
      })
    });
    
    const data = await response.json();
    console.log('Response from Apps Script:', data);
    if (data.success) {
      console.log('✅ TEST EXPORT FOR DATE 30 SUCCESSFUL! Check Column F (day 30) in your Google Sheet HK tab!');
    } else {
      console.error('❌ Apps Script error:', data.error);
    }
  } catch (error) {
    console.error('❌ Network or runtime error:', error.message);
  }
}

testExport30();
