const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

console.log('=== KIỂM TRA KẾT NỐI GOOGLE SHEETS ===\n');

// 1. Check files
if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error('❌ LỖI: Không tìm thấy file "credentials.json" trong thư mục dự án.');
  console.log('👉 Vui lòng tạo Service Account trên Google Cloud Console, tải key JSON và đổi tên thành "credentials.json" rồi đặt vào đây.');
  process.exit(1);
}
console.log('✅ Đã tìm thấy tệp credentials.json');

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('❌ LỖI: Không tìm thấy file "config.json" trong thư mục dự án.');
  process.exit(1);
}
console.log('✅ Đã tìm thấy tệp config.json');

// 2. Load config
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const sheetId = config.sheetId;
const tabName = config.tabName || 'SEN VILLA';

if (!sheetId) {
  console.error('❌ LỖI: Google Sheet ID trong "config.json" đang để trống.');
  console.log('👉 Hãy mở ứng dụng hoặc chỉnh sửa file config.json để điền "sheetId".');
  process.exit(1);
}
console.log(`ℹ️ Sheet ID: ${sheetId}`);
console.log(`ℹ️ Tên Tab: ${tabName}`);

// 3. Try to connect
async function testConnection() {
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    console.log(`ℹ️ Service Account Email: ${credentials.client_email}`);
    console.log('👉 Hãy đảm bảo bạn đã chia sẻ quyền "Người chỉnh sửa" (Editor) cho email này trên file Google Sheet của bạn.');
    console.log('\nĐang kết nối tới Google Sheets...');
    
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Read range
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${tabName}'!A1:AZ15`,
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('⚠️ Bảng tính trống hoặc không tìm thấy dữ liệu.');
      return;
    }
    
    console.log('✅ Kết nối thành công! Đã đọc được dữ liệu từ Google Sheet.');
    console.log(`ℹ️ Đã tìm thấy ${rows.length} dòng dữ liệu mẫu.`);
    
    // Try to search for dates header
    let headerRowIndex = -1;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const hasStt = row.some(cell => cell && cell.toString().toLowerCase().trim() === 'stt');
      const hasLinen = row.some(cell => cell && cell.toString().toLowerCase().trim() === 'linen');
      if (hasStt || hasLinen) {
        headerRowIndex = r;
        console.log(`✅ Tìm thấy dòng tiêu đề ngày tại dòng thứ ${r + 1} trong Sheets:`);
        const dateHeaders = [];
        for (let c = 3; c < row.length; c++) {
          if (row[c]) {
            dateHeaders.push(row[c].toString().trim());
          }
        }
        console.log(`👉 Các cột ngày phát hiện được: [ ${dateHeaders.join(' | ')} ]`);
        break;
      }
    }
    
    if (headerRowIndex === -1) {
      console.log('⚠️ Không tự động phát hiện được dòng tiêu đề chứa chữ "STT" hoặc "Linen". Mặc định sẽ dùng dòng 8 làm tiêu đề.');
    }
    
  } catch (error) {
    console.error('\n❌ KẾT NỐI THẤT BẠI!');
    console.error('Chi tiết lỗi:', error.message);
    console.log('\n💡 Gợi ý khắc phục:');
    if (error.message.includes('not found') || error.message.includes('404')) {
      console.log('- Đảm bảo Google Sheet ID chính xác.');
      console.log(`- Đảm bảo tên Tab là "${tabName}" có tồn tại trong file Sheet.`);
    } else if (error.message.includes('permission') || error.message.includes('403')) {
      console.log('- Hãy kiểm tra lại xem đã chia sẻ quyền truy cập cho email Service Account chưa.');
    } else {
      console.log('- Kiểm tra kết nối mạng Internet.');
    }
  }
}

testConnection();
