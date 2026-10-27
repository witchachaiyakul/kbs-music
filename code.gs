function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('ระบบรายงานความก้าวหน้าการเรียนรู้')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 1. ตรวจสอบผู้ใช้และบันทึก Log การเข้าใช้งาน
function verifyAndLogAccess(lineProfile) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName('Users');
  const logSheet = ss.getSheetByName('Access_Logs');
  
  const userId = lineProfile.userId;
  const displayName = lineProfile.displayName || '';
  const pictureUrl = lineProfile.pictureUrl || '';
  
  // ค้นหาผู้ใช้ในตาราง Users
  const userData = userSheet.getDataRange().getValues();
  let foundUser = null;
  
  for (let i = 1; i < userData.length; i++) {
    if (userData[i][0] === userId) {
      foundUser = {
        userId: userData[i][0],
        displayName: userData[i][1],
        pictureUrl: userData[i][2],
        role: userData[i][3],
        studentCode: String(userData[i][4]),
        fullName: userData[i][5],
        classRoom: userData[i][6]
      };
      break;
    }
  }
  
  // บันทึก Access Log ทุกครั้งที่กดเข้า App
  logSheet.appendRow([
    new Date(),
    userId,
    displayName,
    foundUser ? foundUser.role : 'Unregistered',
    foundUser ? foundUser.studentCode : '-',
    'LINE Access Login'
  ]);
  
  return {
    isRegistered: foundUser !== null,
    user: foundUser
  };
}

// 2. บันทึกการลงทะเบียนผู้ใช้ใหม่ (ผูกรหัสนักเรียน)
function registerUser(formData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const userSheet = ss.getSheetByName('Users');
    
    userSheet.appendRow([
      formData.userId,
      formData.displayName,
      formData.pictureUrl,
      formData.role, // 'Student' หรือ 'Parent'
      formData.studentCode,
      formData.fullName,
      formData.classRoom,
      new Date()
    ]);
    
    return { success: true };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 3. ดึงข้อมูลรายงานความก้าวหน้าการเรียนรู้รายบุคคล (สำหรับโมดูลที่ 1)
function getStudentProgressData(studentCode) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const progressSheet = ss.getSheetByName('Learning_Progress');
    const data = progressSheet.getDataRange().getValues();
    
    let result = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(studentCode)) {
        result = {
          studentCode: data[i][0],
          studentName: data[i][1],
          subject: data[i][2],
          lo1Level: data[i][3], // เริ่มต้น, กำลังพัฒนา, สามารถ, เหนือความคาดหวัง[cite: 1]
          lo2Level: data[i][4],
          grade: data[i][5],
          remark: data[i][6],
          updatedAt: Utilities.formatDate(new Date(data[i][7] || new Date()), "GMT+7", "dd/MM/yyyy HH:mm")
        };
        break;
      }
    }
    
    return { success: true, data: result };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}