const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const apiKey = config.geminiApiKey;

const genAI = new GoogleGenerativeAI(apiKey);

async function testGeneration() {
  console.log('=== THỬ NGHIỆM GỌI CÁC MÔ HÌNH GEMINI ===\n');
  
  // Test Model 1.5 Flash
  try {
    console.log('1. Thử nghiệm với Gemini 1.5 Flash...');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent('Xin chào, tôi đang test kết nối.');
    console.log('👉 KẾT QUẢ 1.5 FLASH THÀNH CÔNG:', result.response.text());
  } catch (error) {
    console.error('👉 KẾT QUẢ 1.5 FLASH THẤT BẠI:', error.message);
  }
  
  console.log('\n----------------------------------------\n');
  
  // Test Model 2.0 Flash
  try {
    console.log('2. Thử nghiệm với Gemini 2.0 Flash...');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent('Xin chào, tôi đang test kết nối.');
    console.log('👉 KẾT QUẢ 2.0 FLASH THÀNH CÔNG:', result.response.text());
  } catch (error) {
    console.error('👉 KẾT QUẢ 2.0 FLASH THẤT BẠI:', error.message);
  }

  console.log('\n----------------------------------------\n');
  
  // Test Model 2.5 Flash
  try {
    console.log('3. Thử nghiệm với Gemini 2.5 Flash...');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent('Xin chào, tôi đang test kết nối.');
    console.log('👉 KẾT QUẢ 2.5 FLASH THÀNH CÔNG:', result.response.text());
  } catch (error) {
    console.error('👉 KẾT QUẢ 2.5 FLASH THẤT BẠI:', error.message);
  }
}

testGeneration();
