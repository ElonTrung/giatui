const config = require('./config.json');

async function testExportHK() {
  const appsScriptUrl = config.appsScriptUrl;
  console.log('Using Apps Script URL:', appsScriptUrl);
  
  // Column K is column index 10 (A=0, B=1, ... K=10)
  // Date "4" is located in Column K, Row 8
  const updates = [
    // Khăn tắm: Hotel (Row 52) = 169, Laun (Row 53) = 150
    { range: "'HK'!K52", value: 169, note: "Số phiếu: 000192 (TEST)\nBộ phận: HK" },
    { range: "'HK'!K53", value: 150, note: "Số phiếu: 000192 (TEST)\nBộ phận: HK" },
    
    // Khăn tay: Hotel (Row 57) = 139, Laun (Row 58) = 137
    { range: "'HK'!K57", value: 139, note: "Số phiếu: 000192 (TEST)\nBộ phận: HK" },
    { range: "'HK'!K58", value: 137, note: "Số phiếu: 000192 (TEST)\nBộ phận: HK" },
    
    // Khăn mặt: Hotel (Row 61) = 111, Laun (Row 62) = 107
    { range: "'HK'!K61", value: 111, note: "Số phiếu: 000192 (TEST)\nBộ phận: HK" },
    { range: "'HK'!K62", value: 107, note: "Số phiếu: 000192 (TEST)\nBộ phận: HK" },
    
    // Khăn chân: Hotel (Row 65) = 79, Laun (Row 66) = 84
    { range: "'HK'!K65", value: 79, note: "Số phiếu: 000192 (TEST)\nBộ phận: HK" },
    { range: "'HK'!K66", value: 84, note: "Số phiếu: 000192 (TEST)\nBộ phận: HK" }
  ];
  
  try {
    console.log('Sending updates to Google Sheets via Apps Script Web App...');
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
      console.log('✅ TEST EXPORT SUCCESSFUL! Check row 52, 53, 57, 58, 61, 62, 65, 66 in your Google Sheet tab HK!');
    } else {
      console.error('❌ Apps Script error:', data.error);
    }
  } catch (error) {
    console.error('❌ Network or runtime error:', error.message);
  }
}

testExportHK();
