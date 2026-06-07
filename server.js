const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON body parsing
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for file uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

const CONFIG_PATH = path.join(__dirname, 'config.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

// Helper: Read config
function readConfig() {
  let config = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.error('Error reading config:', e);
    }
  }
  
  // Apply environment variable fallbacks (useful for cloud deployments like Render)
  if (process.env.GEMINI_API_KEY && !config.geminiApiKey) {
    config.geminiApiKey = process.env.GEMINI_API_KEY;
  }
  if (process.env.APPS_SCRIPT_URL && !config.appsScriptUrl) {
    config.appsScriptUrl = process.env.APPS_SCRIPT_URL;
  }
  if (process.env.SHEET_ID && !config.sheetId) {
    config.sheetId = process.env.SHEET_ID;
  }
  if (process.env.TAB_NAME && !config.tabName) {
    config.tabName = process.env.TAB_NAME;
  }
  return config;
}

// Helper: Write config
function writeConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing config:', e);
    return false;
  }
}

// Helper: Convert Column Index to Excel Letter
function getColumnLetter(colIndex) {
  let letter = '';
  let temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// Helper: Call Gemini with retries and exponential backoff
async function generateContentWithRetry(model, prompt, imagePart, retries = 4, delay = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Gemini API call attempt ${attempt}/${retries}...`);
      const result = await model.generateContent([prompt, imagePart]);
      return result;
    } catch (error) {
      const errMsg = error.message || '';
      console.error(`Attempt ${attempt} failed with error:`, errMsg);
      
      const isRetryable = 
        errMsg.includes('429') || 
        errMsg.includes('Too Many Requests') ||
        errMsg.includes('Quota exceeded') ||
        errMsg.includes('503') || 
        errMsg.includes('Service Unavailable') ||
        errMsg.includes('high demand') ||
        errMsg.includes('Resource temporarily unavailable');
      
      if (isRetryable && attempt < retries) {
        // Try to parse the required retry delay from the error details
        let waitTime = delay * Math.pow(2, attempt - 1);
        
        try {
          if (error.errorDetails && Array.isArray(error.errorDetails)) {
            const retryInfo = error.errorDetails.find(detail => 
              (detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo') || 
              detail.retryDelay
            );
            if (retryInfo && retryInfo.retryDelay) {
              const match = retryInfo.retryDelay.match(/(\d+)/);
              if (match) {
                // Parse seconds, add 2 seconds safety buffer, convert to ms
                waitTime = (parseInt(match[1], 10) + 2) * 1000;
              }
            }
          } else {
            // Fuzzy regex match on string message for "Please retry in 15.544358015s" or similar
            const match = errMsg.match(/retry in ([\d\.]+)s/i);
            if (match) {
              waitTime = (Math.ceil(parseFloat(match[1])) + 2) * 1000;
            }
          }
        } catch (parseErr) {
          console.warn('Failed parsing retryDelay, falling back to exponential delay:', parseErr.message);
        }
        
        console.log(`Transient Gemini error. Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        throw error;
      }
    }
  }
}

// Endpoint: Get Config & Info
app.get('/api/config', (req, res) => {
  const config = readConfig();
  const hasCredentials = fs.existsSync(CREDENTIALS_PATH);
  res.json({
    config,
    hasCredentials
  });
});

// Endpoint: Save Config
app.post('/api/config', (req, res) => {
  const newConfig = req.body;
  const currentConfig = readConfig();
  const merged = { ...currentConfig, ...newConfig };
  
  if (writeConfig(merged)) {
    res.json({ success: true, config: merged });
  } else {
    res.status(500).json({ error: 'Failed to write config file.' });
  }
});

// Endpoint: Test / Get Date Columns from Google Sheets
app.get('/api/sheets/dates', async (req, res) => {
  const config = readConfig();
  const appsScriptUrl = config.appsScriptUrl;
  const sheetId = config.sheetId;
  const tabName = req.query.tab || config.tabName || 'SEN VILLA';
  
  if (!appsScriptUrl && !sheetId) {
    return res.status(400).json({ error: 'Chưa cấu hình Google Sheet ID hoặc Apps Script URL.' });
  }
  
  let rows = [];
  
  try {
    if (appsScriptUrl) {
      console.log('Fetching sheet dates from Google Apps Script URL:', appsScriptUrl);
      const url = `${appsScriptUrl}?tab=${encodeURIComponent(tabName)}`;
      const resFetch = await fetch(url);
      if (!resFetch.ok) {
        throw new Error(`Apps Script HTTP error: ${resFetch.status}`);
      }
      const dataFetch = await resFetch.json();
      if (!dataFetch.success) {
        throw new Error(dataFetch.error || 'Apps Script returned success=false');
      }
      rows = dataFetch.values;
    } else {
      if (!fs.existsSync(CREDENTIALS_PATH)) {
        return res.status(400).json({ error: 'Chưa có file credentials.json trong thư mục dự án và chưa cấu hình Apps Script URL.' });
      }
      
      const auth = new google.auth.GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
      
      const sheets = google.sheets({ version: 'v4', auth });
      
      // Read first 15 rows to find the headers and date row
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `'${tabName}'!A1:AZ20`,
      });
      rows = response.data.values;
    }
    
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy dữ liệu trong bảng tính.' });
    }
    
    // Look for the header row containing date columns.
    // Usually, this row contains columns with numbers like 1, 2, 3, etc. or matches STT / Linen.
    // Let's scan rows 5 to 15.
    let headerRowIndex = -1;
    let dateHeaders = [];
    
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      // Check if this row looks like a header row (has 'STT' and 'Linen' or similar)
      const hasStt = row.some(cell => cell && cell.toString().toLowerCase().trim() === 'stt');
      const hasLinen = row.some(cell => cell && cell.toString().toLowerCase().trim() === 'linen');
      
      if (hasStt || hasLinen) {
        headerRowIndex = r;
        // Collect headers from Column D (index 3) onwards
        for (let c = 3; c < row.length; c++) {
          if (row[c]) {
            dateHeaders.push({
              index: c,
              label: row[c].toString().trim(),
              columnLetter: getColumnLetter(c)
            });
          }
        }
        break;
      }
    }
    
    if (headerRowIndex === -1) {
      // Fallback: If no header found, take row 8 (index 7) as default
      headerRowIndex = 7;
      const row = rows[headerRowIndex] || [];
      for (let c = 3; c < row.length; c++) {
        if (row[c]) {
          dateHeaders.push({
            index: c,
            label: row[c].toString().trim(),
            columnLetter: getColumnLetter(c)
          });
        }
      }
    }
    
    res.json({
      success: true,
      headerRowIndex,
      dateHeaders
    });
    
  } catch (error) {
    console.error('Error fetching sheet dates:', error);
    res.status(500).json({ error: 'Lỗi truy cập Google Sheets: ' + error.message });
  }
});

// Endpoint: Scan Image with Gemini OCR
app.post('/api/scan', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Không nhận được file ảnh.' });
  }
  
  const config = readConfig();
  let apiKey = process.env.GEMINI_API_KEY;
  
  // If the env key is missing or is the default template placeholder, fallback to config key
  if (!apiKey || apiKey.includes('your_gemini_api_key') || apiKey.trim() === '') {
    apiKey = config.geminiApiKey;
  }
  
  if (!apiKey || apiKey.includes('your_gemini_api_key') || apiKey.trim() === '') {
    return res.status(400).json({ error: 'Chưa cấu hình Gemini API Key. Hãy điền Key trong phần Cấu hình.' });
  }
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = 'gemini-flash-latest';
    console.log('Calling Gemini model:', modelName);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' }
    });
    
    // Prepare image buffer
    const imgBuffer = fs.readFileSync(req.file.path);
    const imagePart = {
      inlineData: {
        data: imgBuffer.toString('base64'),
        mimeType: req.file.mimetype
      }
    };
    
    // Build Prompt with AI learning rules
    let rulesText = '';
    if (config.aiRules && config.aiRules.length > 0) {
      rulesText += '\nBảng tra cứu viết tắt viết tay từ người dùng:\n';
      config.aiRules.forEach(r => {
        rulesText += `- Từ viết tắt '${r.term}' có nghĩa là: ${r.definition}\n`;
      });
    }
    if (config.customInstructions) {
      rulesText += `\nHướng dẫn đặc biệt bổ sung:\n${config.customInstructions}\n`;
    }
    
    const prompt = `Bạn là chuyên gia số hóa phiếu giao nhận đồ vải (laundry receipt parser).
Nhiệm vụ của bạn là đọc hình ảnh phiếu giao nhận này, nhận dạng chữ viết tay và chữ in để xuất ra dữ liệu JSON chính xác.

${rulesText}

Hãy trả về một đối tượng JSON có cấu trúc chính xác như sau:
{
  "slipNo": "Mã số phiếu giao nhận (ví dụ số màu đỏ: '000442')",
  "hotelName": "Tên khách sạn được viết tay hoặc in trên phiếu (ví dụ: 'Sen villa')",
  "department": "Tên bộ phận viết tay trên phiếu (ví dụ: 'HK')",
  "pickupDate": "Ngày nhận (ví dụ: '30/5' hoặc '30/05' hoặc '3015' -> điền là '30/5')",
  "deliveryDate": "Ngày giao (ví dụ: '31/5' hoặc '31/05' hoặc '3115' -> điền là '31/5')",
  "items": [
    {
      "code": 1, // Mã số thứ tự (Mã code) trên phiếu
      "itemName": "Tên gốc loại đồ vải (ví dụ: 'Ga giường L')",
      "nhanDo": 94, // Số lượng ở cột 'Nhận Hàng Dơ' (nếu trống thì trả về null hoặc 0)
      "giaoSach": 31, // Số lượng ở cột 'Giao Hàng Sạch' (nếu trống hoặc checkmark thì trả về null hoặc 0, nếu có phép cộng hãy tính tổng hoặc điền giá trị số cuối cùng theo quy tắc)
      "tonDau": null, // Cột 'Tồn Đầu ở Nhà Giặt'
      "tonCuoi": null, // Cột 'Tồn Cuối Ở Nhà'
      "xuLyN": null, // Xử lý cột N (Nhận)
      "xuLyG": null, // Xử lý cột G (Giao)
      "notes": "Ghi chú viết tay riêng bên cạnh dòng này (nếu có)"
    }
  ],
  "generalNotes": "Nội dung ghi chú viết tay ở phần cuối phiếu (ví dụ: 'trả gt: 6 mặt, 6 tay, 9 chân...')"
}

Lưu ý quan trọng:
1. Hãy cẩn thận phân tích chữ viết tay ở cột Nhận Hàng Dơ và Giao Hàng Sạch.
2. Nếu cột chỉ có dấu tích (v hoặc tick), hãy để là null hoặc 0 trừ khi quy tắc chỉ ra khác.
3. Nếu có nhãn dán màu vàng như 'vt: 19 tấm, 4 chân', hãy áp dụng quy tắc hướng dẫn đặc biệt để cộng vào các dòng tương ứng.
4. Trả về đúng định dạng JSON và không chứa ký tự bao ngoài như \`\`\`json.`;

    const result = await generateContentWithRetry(model, prompt, imagePart);
    const responseText = result.response.text();
    
    // Parse response
    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Failed to parse Gemini response as JSON. Raw response:', responseText);
      // Fallback clean markdown blocks
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleanJson);
    }
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json({
      success: true,
      data: parsedData
    });
    
  } catch (error) {
    console.error('OCR Extraction error:', error);
    // Try to clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Lỗi xử lý ảnh bằng AI: ' + error.message });
  }
});

// Endpoint: Export to Google Sheets
app.post('/api/sheets/export', async (req, res) => {
  const config = readConfig();
  const appsScriptUrl = config.appsScriptUrl;
  const sheetId = config.sheetId;
  
  if (!appsScriptUrl && !sheetId) {
    return res.status(400).json({ error: 'Chưa cấu hình Google Sheet ID hoặc Apps Script URL.' });
  }
  
  const { items, pickupColIndex, deliveryColIndex, metadata } = req.body;
  
  let tabName = config.tabName || 'SEN VILLA';
  if (metadata && metadata.department && metadata.department.trim() !== '') {
    tabName = metadata.department.trim().toUpperCase();
  }
  
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Dữ liệu xuất không hợp lệ (thiếu danh sách items).' });
  }
  
  try {
    // 1. Fetch current Sheet contents to find item rows
    let sheetRows = [];
    if (appsScriptUrl) {
      console.log('Reading spreadsheet headers via Apps Script URL:', appsScriptUrl);
      const url = `${appsScriptUrl}?tab=${encodeURIComponent(tabName)}`;
      const resFetch = await fetch(url);
      if (!resFetch.ok) {
        throw new Error(`Apps Script read HTTP error: ${resFetch.status}`);
      }
      const dataFetch = await resFetch.json();
      if (!dataFetch.success) {
        throw new Error(dataFetch.error || 'Apps Script read returned success=false');
      }
      sheetRows = dataFetch.values;
    } else {
      if (!fs.existsSync(CREDENTIALS_PATH)) {
        return res.status(400).json({ error: 'Chưa có file credentials.json trong thư mục dự án và chưa cấu hình Apps Script URL.' });
      }
      
      const auth = new google.auth.GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      
      const sheets = google.sheets({ version: 'v4', auth });
      
      const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `'${tabName}'!A1:C100`, // We only need Columns A, B, C to locate item rows
      });
      sheetRows = sheetData.data.values;
    }
    
    if (!sheetRows || sheetRows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy dữ liệu trong Google Sheet.' });
    }
    
    // Mapping config
    const rowMapping = config.rowMapping || {};
    
    // Create updates array
    const updates = [];
    
    // Construct cell note from metadata
    let cellNote = '';
    if (metadata) {
      const parts = [];
      if (metadata.slipNo) parts.push(`Số phiếu: ${metadata.slipNo}`);
      if (metadata.department) parts.push(`Bộ phận: ${metadata.department}`);
      if (metadata.hotelName) parts.push(`Khách sạn: ${metadata.hotelName}`);
      if (metadata.pickupDate || metadata.deliveryDate) {
        parts.push(`Ngày: ${metadata.pickupDate || '?'} -> ${metadata.deliveryDate || '?'}`);
      }
      cellNote = parts.join('\n');
    }
    
    // Helper: Add cell update
    function addUpdate(rowIndex, colIndex, value) {
      if (colIndex === undefined || colIndex === -1 || rowIndex === -1) return;
      if (value === undefined || value === null || value === '') return;
      
      const colLetter = getColumnLetter(colIndex);
      const cellRange = `'${tabName}'!${colLetter}${rowIndex + 1}`; // Google Sheets is 1-indexed
      
      const updateObj = {
        range: cellRange,
        values: [[value]]
      };
      if (cellNote) {
        updateObj.note = cellNote;
      }
      updates.push(updateObj);
    }
    
    // Process each item
    for (const item of items) {
      const originalName = item.itemName;
      const targetName = rowMapping[originalName] || originalName;
      
      // Find row index for targetName in Column B (index 1)
      let itemBaseIndex = -1;
      for (let r = 0; r < sheetRows.length; r++) {
        const row = sheetRows[r];
        if (row && row[1] && row[1].toString().trim().toLowerCase() === targetName.toLowerCase().trim()) {
          itemBaseIndex = r;
          break;
        }
      }
      
      if (itemBaseIndex === -1) {
        console.warn(`Could not find row in Google Sheet for mapped item: "${targetName}" (original: "${originalName}")`);
        continue;
      }
      
      const mainHotelRow = itemBaseIndex;
      const mainLaunRow = itemBaseIndex + 1;
      
      // For main quantities:
      // Let's write 'Nhận Hàng Dơ' (nhanDo) to the Pickup Date column.
      // Let's write 'Giao Hàng Sạch' (giaoSach) to the Delivery Date column.
      // We write to the "Laun" row by default.
      if (item.nhanDo !== null && item.nhanDo !== undefined && item.nhanDo !== 0) {
        addUpdate(mainHotelRow, pickupColIndex, item.nhanDo);
      }
      
      if (item.giaoSach !== null && item.giaoSach !== undefined && item.giaoSach !== 0) {
        addUpdate(mainLaunRow, deliveryColIndex, item.giaoSach);
      }
      
      // Check if we need to write "Hàng rách"
      // Search subsequent 3 rows for "rách" in Column B
      let rachRow = -1;
      for (let offset = 1; offset <= 4; offset++) {
        const checkIdx = itemBaseIndex + offset;
        if (checkIdx < sheetRows.length && sheetRows[checkIdx]) {
          const colB = sheetRows[checkIdx][1] || '';
          if (colB.toLowerCase().includes('rách')) {
            rachRow = checkIdx;
            break;
          }
        }
      }
      
      // If there is rách note or quantity, write to the delivery date column or pickup column?
      if (rachRow !== -1 && item.notes && item.notes.toLowerCase().includes('rách')) {
        const match = item.notes.match(/\d+/);
        if (match) {
          const qty = parseInt(match[0], 10);
          addUpdate(rachRow, deliveryColIndex, qty);
        }
      }
      
      // Check if we need to write "Xử lý"
      // Search subsequent 4 rows for "xử lý" in Column B
      let xulyHotelRow = -1;
      for (let offset = 1; offset <= 4; offset++) {
        const checkIdx = itemBaseIndex + offset;
        if (checkIdx < sheetRows.length && sheetRows[checkIdx]) {
          const colB = sheetRows[checkIdx][1] || '';
          if (colB.toLowerCase().includes('xử lý')) {
            xulyHotelRow = checkIdx;
            break;
          }
        }
      }
      
      if (xulyHotelRow !== -1) {
        const xulyLaunRow = xulyHotelRow + 1;
        // If there's processing value
        if (item.xuLyN !== null && item.xuLyN !== undefined && item.xuLyN !== 0) {
          addUpdate(xulyHotelRow, pickupColIndex, item.xuLyN);
        }
        if (item.xuLyG !== null && item.xuLyG !== undefined && item.xuLyG !== 0) {
          addUpdate(xulyLaunRow, deliveryColIndex, item.xuLyG);
        }
      }
    }
    
    // 2. Perform Update
    if (updates.length > 0) {
      if (appsScriptUrl) {
        console.log(`Sending ${updates.length} updates via POST to Apps Script...`);
        const scriptUpdates = updates.map(u => ({
          range: u.range,
          value: u.values[0][0],
          note: u.note || ''
        }));
        
        const resFetch = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'write',
            tabName: tabName,
            updates: scriptUpdates
          })
        });
        
        if (!resFetch.ok) {
          throw new Error(`Apps Script write HTTP error: ${resFetch.status}`);
        }
        const dataFetch = await resFetch.json();
        if (!dataFetch.success) {
          throw new Error(dataFetch.error || 'Apps Script write returned success=false');
        }
        
        res.json({
          success: true,
          message: `Đã cập nhật thành công ${scriptUpdates.length} ô dữ liệu thông qua Apps Script.`,
          updatedCells: scriptUpdates.length
        });
      } else {
        // Google Sheets API Service Account
        const auth = new google.auth.GoogleAuth({
          keyFile: CREDENTIALS_PATH,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        
        const sheets = google.sheets({ version: 'v4', auth });
        
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: updates
          }
        });
        
        res.json({
          success: true,
          message: `Đã cập nhật thành công ${updates.length} ô dữ liệu trên Google Sheets.`,
          updatedCells: updates.length
        });
      }
    } else {
      res.json({
        success: true,
        message: 'Không có dữ liệu hợp lệ nào cần cập nhật (số lượng bằng 0 hoặc trống).',
        updatedCells: 0
      });
    }
    
  } catch (error) {
    console.error('Error writing to sheets:', error);
    res.status(500).json({ error: 'Lỗi ghi Google Sheets: ' + error.message });
  }
});

// Serve frontend SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log(`To share, find your IP and open http://<your-ip>:${PORT}`);
});
