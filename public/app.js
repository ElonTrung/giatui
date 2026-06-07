// Global State
let config = {};
let hasCredentials = false;
let currentFile = null;
let dateHeaders = [];
let extractedData = null;

// DOM Elements
const sidebarItems = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.workspace-panel');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');
const connectionStatus = document.getElementById('sheets-connection');

// Upload Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadPromptView = document.getElementById('upload-prompt-view');
const uploadPreviewView = document.getElementById('upload-preview-view');
const previewImg = document.getElementById('preview-img');
const btnReupload = document.getElementById('btn-reupload');
const btnScan = document.getElementById('btn-scan');
const ocrModelSelect = document.getElementById('ocr-model');

// Results Elements
const resultsPlaceholder = document.getElementById('results-placeholder');
const resultsView = document.getElementById('results-view');
const btnExportSheet = document.getElementById('btn-export-sheet');
const resHotelName = document.getElementById('res-hotel-name');
const resPickupDate = document.getElementById('res-pickup-date');
const resDeliveryDate = document.getElementById('res-delivery-date');
const extractedRows = document.getElementById('extracted-rows');
const resNotes = document.getElementById('res-notes');
const resSlipNo = document.getElementById('res-slip-no');
const resDepartment = document.getElementById('res-department');
const resPickupDateAI = document.getElementById('res-pickup-date-ai');
const resDeliveryDateAI = document.getElementById('res-delivery-date-ai');

// Teach AI Elements
const rulesRows = document.getElementById('rules-rows');
const btnAddRule = document.getElementById('btn-add-rule');
const customInstructionsText = document.getElementById('custom-instructions');
const btnSaveLearn = document.getElementById('btn-save-learn');

// Config Elements
const configGeminiKey = document.getElementById('config-gemini-key');
const configSheetId = document.getElementById('config-sheet-id');
const configTabName = document.getElementById('config-tab-name');
const btnSaveConfig = document.getElementById('btn-save-config');
const credentialsStatusBox = document.getElementById('credentials-status-box');
const credentialsStatusText = document.getElementById('credentials-status-text');
const mappingRows = document.getElementById('mapping-rows');
const btnSaveMapping = document.getElementById('btn-save-mapping');

// Loader & Toast
const loader = document.getElementById('loader');
const loaderTitle = document.getElementById('loader-title');
const loaderSubtitle = document.getElementById('loader-subtitle');

/* ==========================================================================
   Navigation & Initialization
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
});

// App Initialization
async function initApp() {
  showLoader(true, 'Đang tải cấu hình...', 'Liên kết với máy chủ cục bộ...');
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    
    config = data.config || {};
    hasCredentials = data.hasCredentials;
    
    updateConnectionStatus();
    populateProfileSelectors();
    populateConfigFields();
    populateRulesTable();
    populateMappingTable();
    
  } catch (err) {
    showToast('Không thể kết nối đến server backend.', 'error');
    console.error(err);
  } finally {
    showLoader(false);
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Sidebar Navigation
  sidebarItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = item.getAttribute('data-target');
      
      sidebarItems.forEach(nav => nav.classList.remove('active'));
      panels.forEach(panel => panel.classList.remove('active'));
      
      item.classList.add('active');
      const targetPanel = document.getElementById(targetId);
      targetPanel.classList.add('active');
      
      // Update Header Text
      if (targetId === 'panel-scan') {
        pageTitle.innerText = 'Quét Phiếu Giao Nhận';
        pageSubtitle.innerText = 'Tải ảnh chụp phiếu lên để AI tự động trích xuất bảng số liệu';
      } else if (targetId === 'panel-learn') {
        pageTitle.innerText = 'Dạy AI & Luật Viết Tắt';
        pageSubtitle.innerText = 'Hướng dẫn mô hình cách đọc các cụm viết tắt hoặc chữ viết tay đặc thù';
      } else if (targetId === 'panel-config') {
        pageTitle.innerText = 'Cấu hình Google Sheets';
        pageSubtitle.innerText = 'Kết nối ứng dụng với trang tính và ánh xạ các dòng dữ liệu';
      }
    });
  });

  // Drag and Drop Upload Setup
  // (We use native HTML label 'for' association to trigger the file browser natively)
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragging');
  });
  
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragging');
  });
  
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  });
  
  btnReupload.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation(); // Avoid triggering file input click
    currentFile = null;
    uploadPreviewView.style.display = 'none';
    uploadPromptView.style.display = 'flex';
    btnScan.disabled = true;
    fileInput.value = '';
  });

  // OCR Scan Action
  btnScan.addEventListener('click', runOcrScan);

  // Teach AI Actions
  btnAddRule.addEventListener('click', addNewRuleRow);
  btnSaveLearn.addEventListener('click', saveAiRules);

  // Save Settings Actions
  btnSaveConfig.addEventListener('click', saveConnectionConfig);
  btnSaveMapping.addEventListener('click', saveRowMappings);
  
  // Sync dropdown selections
  function syncProfileDropdowns(value) {
    const select1 = document.getElementById('config-profile-select');
    const select2 = document.getElementById('global-profile-select');
    if (select1) select1.value = value;
    if (select2) select2.value = value;
  }

  // Handle Profile Change Actions
  async function handleProfileChange(profileName) {
    config.activeProfile = profileName;
    syncProfileDropdowns(profileName);
    
    // Clear previous scan results to avoid confusion across profiles
    extractedData = null;
    if (resultsPlaceholder) resultsPlaceholder.style.display = 'flex';
    if (resultsView) resultsView.style.display = 'none';
    
    showLoader(true, 'Chuyển đổi cấu hình...', 'Đang cập nhật giao diện...');
    try {
      await saveConfigRaw({ activeProfile: config.activeProfile });
      populateConfigFields();
      populateMappingTable();
      populateRulesTable();
      showToast(`Đã chuyển sang cấu hình "${config.activeProfile}"`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      showLoader(false);
    }
  }

  // Profile Selector & Actions Setup
  const configProfileSelect = document.getElementById('config-profile-select');
  if (configProfileSelect) {
    configProfileSelect.addEventListener('change', async (e) => {
      await handleProfileChange(e.target.value);
    });
  }
  
  const globalProfileSelect = document.getElementById('global-profile-select');
  if (globalProfileSelect) {
    globalProfileSelect.addEventListener('change', async (e) => {
      await handleProfileChange(e.target.value);
    });
  }
  
  const btnCreateProfile = document.getElementById('btn-create-profile');
  if (btnCreateProfile) {
    btnCreateProfile.addEventListener('click', async () => {
      const name = prompt('Nhập tên khách sạn / cấu hình mới:');
      if (!name || name.trim() === '') return;
      const cleanName = name.trim();
      
      if (config.profiles && config.profiles[cleanName]) {
        showToast('Khách sạn này đã tồn tại!', 'error');
        return;
      }
      
      if (!config.profiles) config.profiles = {};
      
      // Copy current mappings as a starter template
      const currentProfile = getActiveProfile();
      config.profiles[cleanName] = {
        sheetId: '',
        tabName: 'HK',
        appsScriptUrl: '',
        rowMapping: { ...currentProfile.rowMapping },
        aiRules: [ ...currentProfile.aiRules ],
        customInstructions: currentProfile.customInstructions || '1. Nhận dạng đúng các số lượng trên phiếu.'
      };
      
      config.activeProfile = cleanName;
      
      showLoader(true, 'Đang tạo cấu hình mới...', 'Lưu cấu hình...');
      try {
        await saveConfigRaw(config);
        showToast(`Đã tạo cấu hình "${cleanName}" thành công!`, 'success');
        populateProfileSelectors();
        populateConfigFields();
        populateMappingTable();
        populateRulesTable();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        showLoader(false);
      }
    });
  }
  
  const btnDeleteProfile = document.getElementById('btn-delete-profile');
  if (btnDeleteProfile) {
    btnDeleteProfile.addEventListener('click', async () => {
      if (!config.profiles || Object.keys(config.profiles).length <= 1) {
        showToast('Không thể xóa cấu hình duy nhất còn lại.', 'error');
        return;
      }
      
      const toDelete = config.activeProfile;
      if (!confirm(`Bạn có chắc chắn muốn xóa cấu hình khách sạn "${toDelete}" không?`)) {
        return;
      }
      
      delete config.profiles[toDelete];
      config.activeProfile = Object.keys(config.profiles)[0];
      
      showLoader(true, 'Đang xóa cấu hình...', 'Lưu thay đổi...');
      try {
        await saveConfigRaw(config);
        showToast(`Đã xóa cấu hình "${toDelete}" thành công!`, 'success');
        populateProfileSelectors();
        populateConfigFields();
        populateMappingTable();
        populateRulesTable();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        showLoader(false);
      }
    });
  }
  
  const btnAddMappingRow = document.getElementById('btn-add-mapping-row');
  if (btnAddMappingRow) {
    btnAddMappingRow.addEventListener('click', () => {
      addMappingRow('', '');
    });
  }
  
  // Copy Apps Script Code button
  const btnCopyScript = document.getElementById('btn-copy-script');
  if (btnCopyScript) {
    btnCopyScript.addEventListener('click', () => {
      const codeArea = document.getElementById('apps-script-code');
      codeArea.select();
      codeArea.setSelectionRange(0, 99999); // For mobile devices
      navigator.clipboard.writeText(codeArea.value)
        .then(() => {
          showToast('Đã sao chép mã Apps Script vào bộ nhớ tạm!', 'success');
        })
        .catch(err => {
          // Fallback
          document.execCommand('copy');
          showToast('Đã sao chép mã Apps Script vào bộ nhớ tạm!', 'success');
        });
    });
  }

  // Export Action
  btnExportSheet.addEventListener('click', exportToGoogleSheet);
}

/* ==========================================================================
   UI Helpers
   ========================================================================== */
function showLoader(show, title = 'Đang xử lý...', subtitle = 'Vui lòng đợi giây lát') {
  loaderTitle.innerText = title;
  loaderSubtitle.innerText = subtitle;
  if (show) {
    loader.classList.add('active');
  } else {
    loader.classList.remove('active');
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'info';
  if (type === 'success') icon = 'check_circle';
  if (type === 'error') icon = 'error';
  
  toast.innerHTML = `
    <span class="material-symbols-outlined toast-icon">${icon}</span>
    <div class="toast-message">${message}</div>
    <span class="material-symbols-outlined toast-close">close</span>
  `;
  
  container.appendChild(toast);
  
  // Bind close event
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.remove();
  });
  
  // Auto remove
  setTimeout(() => {
    toast.style.animation = 'none';
    toast.remove();
  }, 4500);
}

function updateConnectionStatus() {
  const dot = connectionStatus.querySelector('.status-dot');
  const text = connectionStatus.querySelector('.status-text');
  
  if (config.appsScriptUrl) {
    dot.className = 'status-dot active';
    text.innerText = 'Đã kết nối Apps Script';
    credentialsStatusBox.style.display = 'none';
    return;
  }
  
  credentialsStatusBox.style.display = 'block';
  if (!hasCredentials) {
    dot.className = 'status-dot error';
    text.innerText = 'Thiếu credentials.json';
    credentialsStatusBox.className = 'status-box error';
    credentialsStatusBox.innerHTML = '<span class="material-symbols-outlined" style="color: var(--error)">error</span> <span>Không tìm thấy tệp credentials.json! Hãy kiểm tra thư mục dự án hoặc cấu hình Apps Script ở trên.</span>';
  } else if (!config.sheetId) {
    dot.className = 'status-dot warning';
    text.innerText = 'Chưa cấu hình Sheet ID';
    credentialsStatusBox.className = 'status-box warning';
    credentialsStatusBox.innerHTML = '<span class="material-symbols-outlined" style="color: var(--warning)">warning</span> <span>File credentials.json OK, cần điền Google Sheet ID bên dưới hoặc dùng Apps Script.</span>';
  } else {
    dot.className = 'status-dot active';
    text.innerText = 'Đã kết nối Google Sheets';
    credentialsStatusBox.className = 'status-box success';
    credentialsStatusBox.innerHTML = '<span class="material-symbols-outlined" style="color: var(--success)">check_circle</span> <span>Đã kết nối! credentials.json và Sheet ID hoạt động.</span>';
  }
}

/* ==========================================================================
   File Upload & Selection
   ========================================================================== */
function handleFileSelect(file) {
  console.log('Selected file:', file.name, 'Mime:', file.type, 'Size:', file.size);
  
  const isImageMime = file.type && file.type.startsWith('image/');
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.gif', '.heic'];
  const hasImageExt = file.name && imageExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
  
  if (!isImageMime && !hasImageExt) {
    showToast('Vui lòng chỉ tải lên tệp ảnh (JPG, PNG, WEBP, HEIC, TIFF).', 'error');
    return;
  }
  
  currentFile = file;
  const reader = new FileReader();
  reader.onerror = (err) => {
    console.error('Error reading file:', err);
    showToast('Lỗi đọc file hình ảnh.', 'error');
  };
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    uploadPromptView.style.display = 'none';
    uploadPreviewView.style.display = 'flex';
    btnScan.disabled = false;
    showToast('Đã nhận hình ảnh, nhấn Bắt đầu quét!', 'info');
  };
  reader.readAsDataURL(file);
}

/* ==========================================================================
   OCR Parsing & API Integration
   ========================================================================== */
async function runOcrScan() {
  if (!currentFile) return;
  
  showLoader(true, 'Đang gửi ảnh đến Gemini AI...', 'Mô hình đang phân tích bảng và áp dụng từ điển dạy học...');
  
  const formData = new FormData();
  formData.append('image', currentFile);
  formData.append('model', ocrModelSelect.value);
  
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      body: formData
    });
    
    const result = await res.json();
    
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Lỗi quét không xác định');
    }
    
    showToast('Phân tích ảnh thành công!', 'success');
    
    // Switch UI from placeholder to results view
    resultsPlaceholder.style.display = 'none';
    resultsView.style.display = 'block';
    
    extractedData = result.data;
    
    // Load date headers from Sheets to prepare date selectors
    await fetchSheetDates();
    renderExtractedData();
    
  } catch (err) {
    showToast(err.message, 'error');
    console.error(err);
  } finally {
    showLoader(false);
  }
}

// Fetch Dates list from Google Sheet columns
async function fetchSheetDates() {
  if (!config.sheetId) {
    // If not connected, add placeholders for dates in dropdowns
    dateHeaders = [];
    populateDateSelectors(null, null);
    return;
  }
  
  try {
    const tabParam = extractedData && extractedData.department ? encodeURIComponent(extractedData.department.trim().toUpperCase()) : '';
    const res = await fetch(`/api/sheets/dates?tab=${tabParam}`);
    const data = await res.json();
    
    if (res.ok && data.success) {
      dateHeaders = data.dateHeaders || [];
      populateDateSelectors(extractedData.pickupDate, extractedData.deliveryDate);
    } else {
      console.warn('Cannot load dates list from Sheets:', data.error);
      populateDateSelectors(extractedData.pickupDate, extractedData.deliveryDate);
    }
  } catch (err) {
    console.error('Failed fetching dates:', err);
    populateDateSelectors(extractedData.pickupDate, extractedData.deliveryDate);
  }
}

// Populate Date dropdown options
function populateDateSelectors(extractedPickup, extractedDelivery) {
  resPickupDate.innerHTML = '';
  resDeliveryDate.innerHTML = '';
  
  // Clean dates strings
  // Example: extractedPickup: "30/5" -> day is "30"
  const pickupDay = extractedPickup ? extractedPickup.split('/')[0].trim() : '';
  const deliveryDay = extractedDelivery ? extractedDelivery.split('/')[0].trim() : '';
  
  if (dateHeaders.length === 0) {
    // Fallback: If no sheet access, create simple list
    for (let i = 1; i <= 31; i++) {
      const option1 = new Option(i.toString(), i.toString());
      const option2 = new Option(i.toString(), i.toString());
      resPickupDate.add(option1);
      resDeliveryDate.add(option2);
    }
    
    resPickupDate.value = pickupDay;
    resDeliveryDate.value = deliveryDay;
    return;
  }
  
  // Add values from Google Sheets Columns
  dateHeaders.forEach(header => {
    // Check if label contains date numbers
    const optText = `${header.label} (Cột ${header.columnLetter})`;
    const optValue = header.index.toString(); // We save the column INDEX as the value
    
    resPickupDate.add(new Option(optText, optValue));
    resDeliveryDate.add(new Option(optText, optValue));
  });
  
  // Try to find matching columns based on day
  const pickupCol = dateHeaders.find(h => h.label === pickupDay);
  if (pickupCol) {
    resPickupDate.value = pickupCol.index.toString();
  } else {
    // Try fuzzy match, or fallback first item
    resPickupDate.selectedIndex = 0;
  }
  
  const deliveryCol = dateHeaders.find(h => h.label === deliveryDay);
  if (deliveryCol) {
    resDeliveryDate.value = deliveryCol.index.toString();
  } else {
    // Try fuzzy match, or fallback first item
    resDeliveryDate.selectedIndex = Math.min(1, dateHeaders.length - 1);
  }
}

// Render Scanned receipt data into editable table
function renderExtractedData() {
  if (!extractedData) return;
  
  resHotelName.value = extractedData.hotelName || '';
  resNotes.value = extractedData.generalNotes || '';
  if (resSlipNo) resSlipNo.value = extractedData.slipNo || '';
  if (resDepartment) resDepartment.value = extractedData.department || '';
  if (resPickupDateAI) resPickupDateAI.value = extractedData.pickupDate || '';
  if (resDeliveryDateAI) resDeliveryDateAI.value = extractedData.deliveryDate || '';
  extractedRows.innerHTML = '';
  
  const items = extractedData.items || [];
  const rowMapping = config.rowMapping || {};
  
  items.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.dataset.index = index;
    
    const mappedSheetName = rowMapping[item.itemName] || item.itemName;
    
    tr.innerHTML = `
      <td><input type="number" class="cell-code" value="${item.code || ''}"></td>
      <td><input type="text" class="cell-item-name" value="${item.itemName || ''}"></td>
      <td><span class="badge badge-success">${mappedSheetName}</span></td>
      <td><input type="number" class="cell-qty" value="${item.nhanDo !== null ? item.nhanDo : ''}"></td>
      <td><input type="number" class="cell-qty" value="${item.giaoSach !== null ? item.giaoSach : ''}"></td>
      <td><input type="number" class="cell-qty" value="${item.xuLyN !== null ? item.xuLyN : ''}"></td>
      <td><input type="number" class="cell-qty" value="${item.xuLyG !== null ? item.xuLyG : ''}"></td>
      <td><input type="text" class="cell-notes" value="${item.notes || ''}"></td>
    `;
    
    extractedRows.appendChild(tr);
  });
}

// Read Current Scanned Table values from DOM
function getTableData() {
  const trElements = extractedRows.querySelectorAll('tr');
  const items = [];
  
  trElements.forEach(tr => {
    items.push({
      code: parseInt(tr.querySelector('.cell-code').value, 10) || null,
      itemName: tr.querySelector('.cell-item-name').value,
      nhanDo: parseInt(tr.querySelector('td:nth-child(4) input').value, 10) || 0,
      giaoSach: parseInt(tr.querySelector('td:nth-child(5) input').value, 10) || 0,
      xuLyN: parseInt(tr.querySelector('td:nth-child(6) input').value, 10) || 0,
      xuLyG: parseInt(tr.querySelector('td:nth-child(7) input').value, 10) || 0,
      notes: tr.querySelector('.cell-notes').value
    });
  });
  
  return items;
}

/* ==========================================================================
   Google Sheets Export
   ========================================================================== */
async function exportToGoogleSheet() {
  if (!config.sheetId) {
    showToast('Chưa cấu hình Google Sheet ID. Hãy cấu hình ở mục cài đặt.', 'error');
    return;
  }
  
  const items = getTableData();
  const pickupColIndex = parseInt(resPickupDate.value, 10);
  const deliveryColIndex = parseInt(resDeliveryDate.value, 10);
  
  // Extract metadata fields
  const slipNo = resSlipNo ? resSlipNo.value.trim() : '';
  const hotelName = resHotelName ? resHotelName.value.trim() : '';
  const department = resDepartment ? resDepartment.value.trim() : '';
  const pickupDateAI = resPickupDateAI ? resPickupDateAI.value.trim() : '';
  const deliveryDateAI = resDeliveryDateAI ? resDeliveryDateAI.value.trim() : '';
  
  showLoader(true, 'Đang xuất dữ liệu sang Google Sheets...', 'Đang gửi dữ liệu ô và thực hiện cập nhật hàng loạt (Batch Update)...');
  
  try {
    const res = await fetch('/api/sheets/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        pickupColIndex,
        deliveryColIndex,
        metadata: {
          slipNo,
          hotelName,
          department,
          pickupDate: pickupDateAI,
          deliveryDate: deliveryDateAI
        }
      })
    });
    
    const result = await res.json();
    
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Lỗi xuất dữ liệu');
    }
    
    showToast(result.message || 'Xuất Google Sheets thành công!', 'success');
    
  } catch (err) {
    showToast(err.message, 'error');
    console.error(err);
  } finally {
    showLoader(false);
  }
}

/* ==========================================================================
   Profile Management Helpers
   ========================================================================== */
function getActiveProfile() {
  if (!config.profiles) {
    config.profiles = {};
  }
  if (!config.activeProfile) {
    config.activeProfile = 'Sen Villa';
  }
  // Initialize default profile if it doesn't exist
  if (!config.profiles[config.activeProfile]) {
    config.profiles[config.activeProfile] = {
      sheetId: config.sheetId || '',
      tabName: config.tabName || 'SEN VILLA',
      appsScriptUrl: config.appsScriptUrl || '',
      rowMapping: config.rowMapping || {
        "Ga giường L": "Ga Lớn",
        "Ga giường T": "Ga over",
        "Ga giường N": "Ga Nhỏ",
        "Bọc L": "Bọc Lớn",
        "Bọc T": "Bọc over",
        "Bọc N": "Bọc Nhỏ",
        "Bọc gối L": "Bọc gối Lớn",
        "Bọc gối N": "Bọc gối Nhỏ",
        "Ruột gối L": "Ruột gối Lớn",
        "Ruột gối N": "Ruột gối Nhỏ",
        "Khăn tắm": "Khăn tắm",
        "Khăn tay": "Khăn tay",
        "Khăn mặt": "Khăn mặt",
        "Khăn chân": "Khăn chân"
      },
      aiRules: config.aiRules || [],
      customInstructions: config.customInstructions || ''
    };
  }
  return config.profiles[config.activeProfile];
}

function populateProfileSelectors() {
  const configSelect = document.getElementById('config-profile-select');
  const globalSelect = document.getElementById('global-profile-select');
  
  if (configSelect) configSelect.innerHTML = '';
  if (globalSelect) globalSelect.innerHTML = '';
  
  if (!config.profiles) {
    config.profiles = {};
  }
  
  // Make sure at least one profile exists
  const profileNames = Object.keys(config.profiles);
  if (profileNames.length === 0) {
    const defaultName = 'Sen Villa';
    config.activeProfile = defaultName;
    config.profiles[defaultName] = {
      sheetId: config.sheetId || '',
      tabName: config.tabName || 'SEN VILLA',
      appsScriptUrl: config.appsScriptUrl || '',
      rowMapping: config.rowMapping || {
        "Ga giường L": "Ga Lớn",
        "Ga giường T": "Ga over",
        "Ga giường N": "Ga Nhỏ",
        "Bọc L": "Bọc Lớn",
        "Bọc T": "Bọc over",
        "Bọc N": "Bọc Nhỏ",
        "Bọc gối L": "Bọc gối Lớn",
        "Bọc gối N": "Bọc gối Nhỏ",
        "Ruột gối L": "Ruột gối Lớn",
        "Ruột gối N": "Ruột gối Nhỏ",
        "Khăn tắm": "Khăn tắm",
        "Khăn tay": "Khăn tay",
        "Khăn mặt": "Khăn mặt",
        "Khăn chân": "Khăn chân"
      },
      aiRules: config.aiRules || [],
      customInstructions: config.customInstructions || ''
    };
  }
  
  if (!config.activeProfile) {
    config.activeProfile = Object.keys(config.profiles)[0];
  }
  
  Object.keys(config.profiles).forEach(name => {
    const optConfig = document.createElement('option');
    optConfig.value = name;
    optConfig.textContent = name;
    optConfig.selected = (name === config.activeProfile);
    if (configSelect) configSelect.appendChild(optConfig);
    
    const optGlobal = document.createElement('option');
    optGlobal.value = name;
    optGlobal.textContent = name;
    optGlobal.selected = (name === config.activeProfile);
    if (globalSelect) globalSelect.appendChild(optGlobal);
  });
}

async function saveConfigRaw(updatedConfig) {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedConfig)
  });
  const result = await res.json();
  if (res.ok && result.success) {
    config = result.config;
    updateConnectionStatus();
  } else {
    throw new Error(result.error || 'Lỗi lưu cấu hình');
  }
}

/* ==========================================================================
   Teach AI Rules Tab
   ========================================================================== */
function populateRulesTable() {
  rulesRows.innerHTML = '';
  const profile = getActiveProfile();
  const rules = profile.aiRules || [];
  
  rules.forEach((rule, idx) => {
    appendRuleRow(rule.term, rule.definition);
  });
  
  customInstructionsText.value = profile.customInstructions || '';
}

function appendRuleRow(term = '', definition = '') {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="rule-term" value="${term}" placeholder="Ví dụ: gt"></td>
    <td><input type="text" class="rule-def" value="${definition}" placeholder="Ví dụ: giặt thiếu (cộng vào số lượng giao sạch)"></td>
    <td>
      <button class="btn btn-danger btn-sm btn-delete-rule" type="button">
        <span class="material-symbols-outlined">delete</span> Xóa
      </button>
    </td>
  `;
  
  tr.querySelector('.btn-delete-rule').addEventListener('click', () => tr.remove());
  rulesRows.appendChild(tr);
}

function addNewRuleRow() {
  appendRuleRow();
  showToast('Đã tạo dòng luật viết tắt trống mới.', 'info');
}

async function saveAiRules() {
  const ruleRows = rulesRows.querySelectorAll('tr');
  const aiRules = [];
  
  ruleRows.forEach(tr => {
    const term = tr.querySelector('.rule-term').value.trim();
    const definition = tr.querySelector('.rule-def').value.trim();
    if (term && definition) {
      aiRules.push({ term, definition });
    }
  });
  
  const customInstructions = customInstructionsText.value;
  const profile = getActiveProfile();
  profile.aiRules = aiRules;
  profile.customInstructions = customInstructions;
  
  showLoader(true, 'Đang lưu quy tắc AI...', 'Ghi dữ liệu học vào cấu hình cục bộ...');
  
  try {
    await saveConfigRaw({ profiles: config.profiles });
    showToast('Đã lưu quy tắc và hướng dẫn dạy AI thành công!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

/* ==========================================================================
   Google Sheets & Mapping Config Tab
   ========================================================================== */
function populateConfigFields() {
  configGeminiKey.value = config.geminiApiKey || '';
  
  const profile = getActiveProfile();
  configSheetId.value = profile.sheetId || '';
  configTabName.value = profile.tabName || 'SEN VILLA';
  
  const configAppsScriptUrl = document.getElementById('config-apps-script-url');
  if (configAppsScriptUrl) {
    configAppsScriptUrl.value = profile.appsScriptUrl || '';
  }
}

async function saveConnectionConfig() {
  const geminiApiKey = configGeminiKey.value.trim();
  const profile = getActiveProfile();
  
  profile.sheetId = configSheetId.value.trim();
  profile.tabName = configTabName.value.trim();
  
  const configAppsScriptUrl = document.getElementById('config-apps-script-url');
  if (configAppsScriptUrl) {
    profile.appsScriptUrl = configAppsScriptUrl.value.trim();
  }
  
  const toSave = {
    geminiApiKey,
    profiles: config.profiles
  };
  
  showLoader(true, 'Đang lưu cấu hình kết nối...', 'Cập nhật khóa API và ID trang tính...');
  
  try {
    await saveConfigRaw(toSave);
    showToast('Đã lưu cấu hình kết nối thành công!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

// Row Mapping Management
function populateMappingTable() {
  mappingRows.innerHTML = '';
  const profile = getActiveProfile();
  const mapping = profile.rowMapping || {};
  
  const items = Object.keys(mapping);
  
  if (items.length === 0) {
    addMappingRow('', '');
  } else {
    items.forEach(item => {
      addMappingRow(item, mapping[item]);
    });
  }
}

function addMappingRow(sourceVal = '', targetVal = '') {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="mapping-source" placeholder="Ví dụ: Ga giường L" value="${sourceVal}" style="width: 100%; background: #080c14; color: #a5b4fc; border: 1px solid rgba(255,255,255,0.05); padding: 8px; border-radius: 4px;"></td>
    <td><input type="text" class="mapping-target" placeholder="Ví dụ: Ga Lớn" value="${targetVal}" style="width: 100%; background: #080c14; color: #a5b4fc; border: 1px solid rgba(255,255,255,0.05); padding: 8px; border-radius: 4px;"></td>
    <td style="text-align: center;">
      <button class="btn btn-secondary btn-sm btn-delete-row" type="button" style="background-color: rgba(239, 68, 68, 0.15); color: #ef4444; border: none; padding: 4px 8px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;">
        <span class="material-symbols-outlined" style="font-size: 1.1rem;">delete</span>
      </button>
    </td>
  `;
  
  const btnDelete = tr.querySelector('.btn-delete-row');
  btnDelete.addEventListener('click', () => {
    tr.remove();
  });
  
  mappingRows.appendChild(tr);
}

async function saveRowMappings() {
  const rows = mappingRows.querySelectorAll('tr');
  const rowMapping = {};
  
  rows.forEach(tr => {
    const sourceInput = tr.querySelector('.mapping-source');
    const targetInput = tr.querySelector('.mapping-target');
    
    if (sourceInput && targetInput) {
      const source = sourceInput.value.trim();
      const target = targetInput.value.trim();
      if (source && target) {
        rowMapping[source] = target;
      }
    }
  });
  
  const profile = getActiveProfile();
  profile.rowMapping = rowMapping;
  
  showLoader(true, 'Đang lưu bản đồ ánh xạ...', 'Ghi dữ liệu hàng vào tệp cấu hình...');
  
  try {
    await saveConfigRaw({ profiles: config.profiles });
    showToast('Đã lưu bản đồ ánh xạ thành công!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}
