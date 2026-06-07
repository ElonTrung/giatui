const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('LỖI: Không tìm thấy file config.json.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const apiKey = config.geminiApiKey;

if (!apiKey) {
  console.error('LỖI: Chưa lưu geminiApiKey trong config.json.');
  process.exit(1);
}

console.log(`Đang kiểm tra API Key: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 6)}`);

async function testGeminiModels() {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    console.log('Đang gửi truy vấn danh sách mô hình tới Google...');
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      console.error('\n❌ TRUY VẤN THẤT BẠI!');
      console.error('Mã lỗi HTTP:', response.status);
      console.error('Chi tiết phản hồi từ Google:', JSON.stringify(data, null, 2));
      return;
    }
    
    console.log('\n✅ KẾT NỐI THÀNH CÔNG!');
    if (data.models && data.models.length > 0) {
      console.log(`\n🎉 Tài khoản của bạn có quyền sử dụng ${data.models.length} mô hình AI:`);
      data.models.slice(0, 10).forEach(m => {
        console.log(`- ${m.name} (${m.displayName})`);
      });
      if (data.models.length > 10) {
        console.log(`... và ${data.models.length - 10} mô hình khác.`);
      }
    } else {
      console.log('⚠️ Kết nối được nhưng danh sách mô hình trả về trống.');
    }
  } catch (error) {
    console.error('❌ Lỗi kết nối mạng:', error.message);
  }
}

testGeminiModels();
