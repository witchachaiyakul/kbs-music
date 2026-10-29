// ========================================================
// CONFIGURATION & WEB API BACKEND
// ========================================================
const SPREADSHEET_ID = "1no_VqFBCqqjtybmcx5K1xeHyADszGr3DlgGaqDedYfA";
const VIDEO_FOLDER_ID = "1Hb4FSTKMrk6SSiVWM2liMOGAmsTwSfou";

function getSS() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: "online", message: "KBS Music GAS API Ready" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    const payload = requestData.payload || {};
    let result = { success: false, message: "Invalid Action" };

    if (action === "verifyAndLogAccess") {
      result = verifyAndLogAccess(payload);
    } else if (action === "registerUser") {
      result = registerUser(payload);
    } else if (action === "getRegistrationOptions") {
      result = getRegistrationOptions();
    } else if (action === "getTeacherDashboard") {
      result = getTeacherDashboard();
    } else if (action === "getSingingEvaluationStatus") {
      result = getSingingEvaluationStatus(payload);
    } else if (action === "submitSingingEvaluation") {
      result = submitSingingEvaluation(payload);
    } else if (action === "uploadSingingVideo") {
      result = uploadSingingVideo(payload);
    } else if (action === "getSingingHistory") {
      result = getSingingHistory(payload.studentCode);
    } else if (action === "getStudentInfo") {
      result = getStudentInfo(payload);
    } else if (action === "getStudentOverallProgress") {
      result = getStudentOverallProgress(payload);
    }
    

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function testDrivePermission() {
  const folder = DriveApp.getFolderById("1Hb4FSTKMrk6SSiVWM2liMOGAmsTwSfou");
  const tempFile = folder.createFile("test_perm.txt", "permission test");
  tempFile.setTrashed(true); // สร้างเสร็จแล้วย้ายลงถังขยะทันที
}

function verifyAndLogAccess(lineProfile) {
  try {
    const ss = getSS();
    const userSheet = ss.getSheetByName('users');
    const logSheet = ss.getSheetByName('Access_Logs');
    
    if (!userSheet) throw new Error("ไม่พบแท็บชีท 'users'");

    const userId = lineProfile.userId;
    const displayName = lineProfile.displayName || '';
    const userData = userSheet.getDataRange().getValues();
    let foundUser = null;
    
    for (let i = 1; i < userData.length; i++) {
      if (String(userData[i][0]) === String(userId)) {
        foundUser = {
          userId: userData[i][0],
          displayName: userData[i][1],
          pictureUrl: userData[i][2],
          role: userData[i][3],
          studentCode: String(userData[i][4]),
          fullName: userData[i][5],
          classRoom: String(userData[i][6])
        };
        break;
      }
    }
    
    if (logSheet) {
      logSheet.appendRow([
        new Date(),
        userId,
        displayName,
        foundUser ? foundUser.role : 'Unregistered',
        foundUser ? foundUser.studentCode : '-',
        'LINE Access Login (Firebase)'
      ]);
    }
    
    return { success: true, isRegistered: foundUser !== null, user: foundUser };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 1. ดึงเฉพาะรายชื่อนักเรียนที่ยังไม่ได้ลงทะเบียน (คอลัมน์ E ไม่เป็น 'done')
function getRegistrationOptions() {
  try {
    const ss = getSS();
    const listSheet = ss.getSheetByName('list');
    if (!listSheet) throw new Error("ไม่พบแท็บชีท 'list'");

    const data = listSheet.getDataRange().getValues();
    const classroomSet = new Set();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] !== "" && data[i][0] !== undefined) {
        const classroom = String(data[i][2]).trim();
        if (classroom && classroom !== "0") {
          classroomSet.add(classroom);
        }
      }
    }

    return {
      success: true,
      classrooms: Array.from(classroomSet).sort((a, b) => Number(a) - Number(b))
    };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getStudentsByClassroom(payload) {
  try {
    const ss = getSS();
    const listSheet = ss.getSheetByName('list');
    if (!listSheet) throw new Error("ไม่พบแท็บชีท 'list'");

    const data = listSheet.getDataRange().getValues();
    const targetClass = String(payload.classRoom).trim();
    const students = [];

    // 🔍 บันทึก Log ดูว่าหน้าเว็บส่งค่าห้องอะไรมา
    Logger.log("=== เริ่มต้นค้นหาห้อง: [" + targetClass + "] ===");

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] !== "" && data[i][0] !== undefined) {
        const studentCode = String(data[i][0]).trim();
        const name = String(data[i][1]).trim();
        const classroom = String(data[i][2]).trim(); // คอลัมน์ C (ห้องในชีต)
        const status = String(data[i][4] || '').trim().toLowerCase();

        // 🔍 (เปิดบรรทัดล่างนี้ถ้าต้องการดูข้อมูลทุกแถวตอนเช็ค)
        // Logger.log("แถวที่ " + (i+1) + " -> รหัส: " + studentCode + ", ห้องในชีต: [" + classroom + "], สถานะ: [" + status + "]");

        // ตรวจสอบตรงห้อง และยังไม่ลงทะเบียน
        if (classroom === targetClass && status !== 'done') {
          students.push({ id: studentCode, name: name, classroom: classroom });
          Logger.log("✅ พบนักเรียน: " + name + " (ห้อง " + classroom + ")");
        }
      }
    }

    Logger.log("=== สิ้นสุดการค้นหา พบนักเรียนทั้งหมด: " + students.length + " คน ===");

    return {
      success: true,
      students: students
    };
  } catch (err) {
    Logger.log("❌ เกิดข้อผิดพลาด: " + err.toString());
    return { success: false, message: err.toString() };
  }
}

// 2. บันทึกการลงทะเบียนผู้ใช้ใหม่ พร้อมตรวจสอบ ID และอัปเดตคอลัมน์ E เป็น "done"
function registerUser(formData) {
  try {
    const ss = getSS();
    const listSheet = ss.getSheetByName('list');
    const userSheet = ss.getSheetByName('users');
    
    if (!listSheet) throw new Error("ไม่พบแท็บชีท 'list'");
    if (!userSheet) throw new Error("ไม่พบแท็บชีท 'users'");

    const listData = listSheet.getDataRange().getValues();
    let foundRowIndex = -1;
    let isAlreadyDone = false;

    for (let i = 1; i < listData.length; i++) {
      if (String(listData[i][0]) === String(formData.studentCode)) {
        foundRowIndex = i + 1;
        const currentStatus = String(listData[i][4] || '').trim().toLowerCase();
        if (currentStatus === 'done') {
          isAlreadyDone = true;
        }
        break;
      }
    }

    if (foundRowIndex === -1) {
      return { success: false, message: "ไม่พบรหัสนักเรียนนี้ในระบบ ไม่สามารถลงทะเบียนได้" };
    }

    if (isAlreadyDone) {
      return { success: false, message: "มีการลงทะเบียนแล้ว" };
    }

    listSheet.getRange(foundRowIndex, 5).setValue("done");

    userSheet.appendRow([
      formData.userId,
      formData.displayName,
      formData.pictureUrl,
      formData.role,
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

function getTeacherDashboard() {
  try {
    const ss = getSS();
    const listSheet = ss.getSheetByName('list');
    const evalSheet = ss.getSheetByName('evaluations');
    
    if (!listSheet) throw new Error("ไม่พบแท็บชีท 'list'");
    
    const listData = listSheet.getDataRange().getValues();
    const evalData = evalSheet ? evalSheet.getDataRange().getValues() : [];
    
    // จัดกลุ่มการประเมินตาม studentCode + category (เช่น 'ร้องเพลง')
    const evalMap = {}; // key: studentCode_category, value: Set of evaluator roles ('teacher', 'student', 'parent')
    
    for (let i = 1; i < evalData.length; i++) {
      const studentCode = String(evalData[i][8] || evalData[i][1]); // คอลัมน์ studentCode
      const category = String(evalData[i][4] || 'ร้องเพลง').trim();
      const evaluatorType = String(evalData[i][2]).toLowerCase().trim(); // 'teacher', 'student', 'parent'
      
      const key = `${studentCode}_${category}`;
      if (!evalMap[key]) evalMap[key] = new Set();
      
      if (evaluatorType.includes('teacher') || evaluatorType.includes('ครู')) evalMap[key].add('teacher');
      if (evaluatorType.includes('student') || evaluatorType.includes('นักเรียน')) evalMap[key].add('student');
      if (evaluatorType.includes('parent') || evaluatorType.includes('ผู้ปกครอง')) evalMap[key].add('parent');
    }

    const students = [];
    const classroomSet = new Set();

    for (let i = 1; i < listData.length; i++) {
      if (listData[i][0] !== "" && listData[i][0] !== undefined) {
        const studentCode = String(listData[i][0]);
        const name = String(listData[i][1]);
        const classroom = String(listData[i][2]);
        const no = listData[i][3];

        if (classroom && classroom !== "0") classroomSet.add(classroom);

        // ตรวจสอบความครบถ้วน 3 ฝ่าย
        const singingSet = evalMap[`${studentCode}_ร้องเพลง`] || new Set();
        const guitarSet = evalMap[`${studentCode}_เล่นกีต้าร์`] || new Set();
        const ensembleSet = evalMap[`${studentCode}_รวมวง`] || new Set();

        students.push({
          id: studentCode,
          name: name,
          classroom: classroom,
          no: no,
          singingStatus: singingSet.size >= 3 ? 'done' : 'not',
          guitarStatus: guitarSet.size >= 3 ? 'done' : 'not',
          ensembleStatus: ensembleSet.size >= 3 ? 'done' : 'not'
        });
      }
    }

    return {
      success: true,
      classrooms: Array.from(classroomSet).sort((a, b) => Number(a) - Number(b)),
      students: students
    };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getSingingEvaluationStatus(payload) {
  try {
    const targetStudentCode = String(payload.studentCode || '').trim();
    const currentUserRole = String(payload.role || '').toLowerCase().trim();
    
    const ss = getSS();
    const evalSheet = ss.getSheetByName('evaluations');
    const subSheet = ss.getSheetByName('Video_Submissions');
    
    let latestVideoUrl = null;
    let latestSubmissionId = null;
    let latestFileId = null

    // 1. ดึงคลิปล่าสุด
    if (subSheet) {
      const subData = subSheet.getDataRange().getValues();
      for (let i = subData.length - 1; i >= 1; i--) {
        const subCode = String(subData[i][1] || '').trim();
        if (subCode === targetStudentCode || Number(subCode) === Number(targetStudentCode)) {
          latestSubmissionId = String(subData[i][0]);
          latestFileId = String(subData[i][6] || ''); // คอลัมน์ G
          latestVideoUrl = String(subData[i][7] || ''); // คอลัมน์ H
          
          // ดึง File ID จาก URL หากคอลัมน์ G ว่าง
          if (!latestFileId && latestVideoUrl) {
            const m = latestVideoUrl.match(/[\/=]([a-zA-Z0-9_-]{25,})/);
            if (m) latestFileId = m[1];
          }
          break;
        }
      }
    }

    // 2. ดึงคะแนนประเมิน 3 ฝ่าย
    let teacherScores = null;
    let studentScores = null;
    let parentScores = null;
    let isCurrentRoleEvaluated = false;

    if (evalSheet) {
      const evalData = evalSheet.getDataRange().getValues();
      for (let i = 1; i < evalData.length; i++) {
        const codeInSheet = String(evalData[i][8] || '').trim(); // คอลัมน์ I (student_code)
        const category = String(evalData[i][4] || '').trim();    // คอลัมน์ E (category)
        
        // 🟢 เปรียบเทียบรหัสนักเรียนยืดหยุ่น (แก้ปัญหา "08714" vs 8714)
        const isCodeMatch = (codeInSheet === targetStudentCode) || 
                            (Number(codeInSheet) === Number(targetStudentCode) && targetStudentCode !== "");

        if (isCodeMatch && category.includes('ร้องเพลง')) {
          const type = String(evalData[i][2]).toLowerCase().trim(); // คอลัมน์ C (evaluator_type)
          const scores = [
            Number(evalData[i][5]) || 0, // คอลัมน์ F (rhythm_score)
            Number(evalData[i][6]) || 0, // คอลัมน์ G (expression_score/ทำนอง)
            Number(evalData[i][7]) || 0  // คอลัมน์ H (total_score/การแสดงออก)
          ];

          if (type.includes('teacher') || type.includes('ครู')) {
            teacherScores = scores;
            if (currentUserRole.includes('teacher') || currentUserRole.includes('ครู')) isCurrentRoleEvaluated = true;
          } else if (type.includes('student') || type.includes('นักเรียน')) {
            studentScores = scores;
            if (currentUserRole.includes('student') || currentUserRole.includes('นักเรียน')) isCurrentRoleEvaluated = true;
          } else if (type.includes('parent') || type.includes('ผู้ปกครอง')) {
            parentScores = scores;
            if (currentUserRole.includes('parent') || currentUserRole.includes('ผู้ปกครอง')) isCurrentRoleEvaluated = true;
          }
        }
      }
    }

    return {
      success: true,
      studentCode: targetStudentCode,
      latestVideoUrl: latestVideoUrl,
      latestSubmissionId: latestSubmissionId,
      latestFileId: latestFileId,
      isEvaluated: isCurrentRoleEvaluated,
      teacherScores: teacherScores,
      studentScores: studentScores,
      parentScores: parentScores
    };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function submitSingingEvaluation(payload) {
  try {
    const ss = getSS();
    let evalSheet = ss.getSheetByName('evaluations');
    
    if (!evalSheet) {
      evalSheet = ss.insertSheet('evaluations');
      evalSheet.appendRow(['evaluation_id', 'submission_id', 'evaluator_type', 'evaluator_line_id', 'category', 'rhythm_score', 'expression_score', 'total_score', 'student_code', 'evaluated_at']);
    }

    const evalData = evalSheet.getDataRange().getValues();
    const roleKey = String(payload.role || '').toLowerCase().trim();
    const targetCode = String(payload.studentCode || '').trim();

    // 🔒 1. ตรวจสอบข้อมูลใน Sheet ว่าเคยบันทึกไว้แล้วหรือยัง
    for (let i = 1; i < evalData.length; i++) {
      const codeInSheet = String(evalData[i][8] || '').trim(); // คอลัมน์ I (student_code)
      const typeInSheet = String(evalData[i][2] || '').toLowerCase().trim(); // คอลัมน์ C (evaluator_type)
      const catInSheet = String(evalData[i][4] || '').trim(); // คอลัมน์ E (category)

      // เช็กว่ารหัสนักเรียนตรงกัน (รองรับทั้งแบบมี 0 และไม่มี 0 นำหน้า)
      const isCodeMatch = (codeInSheet === targetCode) || 
                          (Number(codeInSheet) === Number(targetCode) && targetCode !== "");

      // เช็กว่าบทบาทผู้ประเมินตรงกันหรือไม่
      const isRoleMatch = (roleKey.includes('teacher') && typeInSheet.includes('teacher')) ||
                          (roleKey.includes('ครู') && typeInSheet.includes('ครู')) ||
                          (roleKey.includes('student') && typeInSheet.includes('student')) ||
                          (roleKey.includes('นักเรียน') && typeInSheet.includes('นักเรียน')) ||
                          (roleKey.includes('parent') && typeInSheet.includes('parent')) ||
                          (roleKey.includes('ผู้ปกครอง') && typeInSheet.includes('ผู้ปกครอง'));

      if (isCodeMatch && catInSheet.includes('ร้องเพลง') && isRoleMatch) {
        // ❌ ถ้าพบบันทึกอยู่แล้ว ให้ส่งข้อความแจ้งเตือนกลับไปที่หน้าเว็บ
        return { 
          success: false, 
          message: "ท่านได้ทำการประเมินรายการนี้ไปแล้ว ไม่สามารถบันทึกซ้ำได้" 
        };
      }
    }

    // 2. หากยังไม่เคยบันทึก ให้ทำการลงข้อมูลใหม่
    const evalId = "EV_" + Date.now();
    evalSheet.appendRow([
      evalId,
      payload.submissionId || 'SUB_MANUAL',
      payload.role,
      payload.evaluatorName || payload.displayName,
      'ร้องเพลง',
      payload.rhythmScore,
      payload.melodyScore,
      payload.expressionScore,
      "'" + payload.studentCode, // ใส่ ' ด้านหน้า เพื่อคงเลข 0 นำหน้าไว้เสมอ
      new Date()
    ]);

    return { success: true };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getStudentProgressData(studentCode) {
  try {
    const ss = getSS();
    const progressSheet = ss.getSheetByName('Learning_Progress');
    if (!progressSheet) throw new Error("ไม่พบแท็บชีท 'Learning_Progress'");

    const data = progressSheet.getDataRange().getValues();
    let result = null;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(studentCode)) {
        result = {
          studentCode: data[i][0],
          studentName: data[i][1],
          classroom: data[i][2],
          subject: data[i][3],
          lo1Level: data[i][4],
          lo2Level: data[i][5],
          grade: data[i][6],
          remark: data[i][7],
          updatedAt: data[i][8] ? Utilities.formatDate(new Date(data[i][8]), "GMT+7", "dd/MM/yyyy HH:mm") : "-"
        };
        break;
      }
    }
    
    return { success: true, data: result };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function uploadSingingVideo(payload) {
  try {
    const folder = DriveApp.getFolderById(VIDEO_FOLDER_ID);
    const bytes = Utilities.base64Decode(payload.base64);
    const blob = Utilities.newBlob(bytes, payload.mimeType || 'video/webm', `Singing_${payload.studentCode}_${Date.now()}.webm`);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const ss = getSS();
    const subSheet = ss.getSheetByName('Video_Submissions');
    const submissionId = "SUB_" + Date.now();
    const fileUrl = file.getUrl();

    if (subSheet) {
      subSheet.appendRow([
        submissionId,
        payload.studentCode,
        payload.studentName,
        payload.classRoom,
        payload.category || 'ร้องเพลง',
        payload.assignmentTitle || 'คลิปอัปโหลดการร้องเพลง',
        file.getId(),
        fileUrl,
        new Date(),
        'Submitted'
      ]);
    }

    return { success: true, fileUrl: fileUrl, fileId: file.getId() };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getSingingHistory(studentCode) {
  try {
    const ss = getSS();
    const subSheet = ss.getSheetByName('Video_Submissions');
    if (!subSheet) return { success: true, history: [] };

    const data = subSheet.getDataRange().getValues();
    const history = [];

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(studentCode)) {
        history.push({
          submissionId: data[i][0],
          title: data[i][5] || 'คลิปทดสอบการร้องเพลง',
          url: data[i][7],
          submittedAt: data[i][8] ? Utilities.formatDate(new Date(data[i][8]), "GMT+7", "dd/MM/yyyy HH:mm") : "-",
          status: data[i][9]
        });
      }
    }

    return { success: true, history: history.reverse() };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}
// เพิ่มเงื่อนไขใน doPost
// else if (action === "getEvaluationData") { result = getEvaluationData(payload.submissionId); }

function getEvaluationData(submissionId) {
  try {
    const ss = getSS();
    const evalSheet = ss.getSheetByName('evaluations');
    if (!evalSheet) return { success: true, teacher: [0,0,0], student: [0,0,0], parent: [0,0,0] };

    const data = evalSheet.getDataRange().getValues();
    let teacher = [0, 0, 0];
    let student = [0, 0, 0];
    let parent = [0, 0, 0];

    for (let i = 1; i < data.length; i++) {
      // ตรวจสอบ submission_id (คอลัมน์ B - index 1)
      if (String(data[i][1]) === String(submissionId)) {
        const evaluatorType = String(data[i][2]).toLowerCase(); // Teacher / Student / Parent
        const rhythmScore = Number(data[i][5]) || 0;        // 1. จังหวะ
        const melodyScore = Number(data[i][6]) || 0;        // 2. ทำนอง
        const expressionScore = Number(data[i][7]) || 0;    // 3. การถ่ายทอดและการแสดงออก

        const scores = [rhythmScore, melodyScore, expressionScore];

        if (evaluatorType.includes('teacher') || evaluatorType.includes('ครู')) {
          teacher = scores;
        } else if (evaluatorType.includes('student') || evaluatorType.includes('นักเรียน')) {
          student = scores;
        } else if (evaluatorType.includes('parent') || evaluatorType.includes('ผู้ปกครอง')) {
          parent = scores;
        }
      }
    }

    return {
      success: true,
      teacher: teacher,
      student: student,
      parent: parent
    };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getStudentInfo(payload) {
  try {
    const targetCode = String(payload.studentCode || '').trim();
    const ss = getSS();
    // ค้นหาในชีท list (หรือ users)
    const listSheet = ss.getSheetByName('list') || ss.getSheetByName('users');
    if (!listSheet) return { success: false };

    const data = listSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const codeInSheet = String(data[i][0] || '').trim(); // สมมติว่ารหัสนักเรียนอยู่คอลัมน์ A
      
      if (codeInSheet === targetCode || Number(codeInSheet) === Number(targetCode)) {
        return {
          success: true,
          student: {
            studentCode: codeInSheet,
            fullName: data[i][1] || `นักเรียนรหัส ${targetCode}`, // คอลัมน์ B (ชื่อ-นามสกุล)
            classRoom: data[i][2] || "1"                          // คอลัมน์ C (ห้อง)
          }
        };
      }
    }
    return { success: false, message: "ไม่พบรหัสนักเรียนนี้ในชีท" };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 2. เพิ่มฟังก์ชันคำนวณคะแนนเฉลี่ย 4 วิชาด้านล่างสุดของ code.gs
function getStudentOverallProgress(payload) {
  try {
    const targetCode = String(payload.studentCode || '').trim();
    const ss = getSS();
    const evalSheet = ss.getSheetByName('evaluations');
    
    const skills = {
      'ร้องเพลง': { sum: 0, count: 0 },
      'ตีกลอง': { sum: 0, count: 0 },
      'เล่นกีต้าร์': { sum: 0, count: 0 },
      'รวมวง': { sum: 0, count: 0 }
    };

    if (evalSheet) {
      const evalData = evalSheet.getDataRange().getValues();
      for (let i = 1; i < evalData.length; i++) {
        const codeInSheet = String(evalData[i][8] || '').trim(); // คอลัมน์ I (student_code)
        const isMatch = (codeInSheet === targetCode) || 
                        (targetCode !== "" && Number(codeInSheet) === Number(targetCode));

        if (isMatch) {
          const category = String(evalData[i][4] || '').trim(); // คอลัมน์ E (category)
          const r = Number(evalData[i][5]) || 0;
          const m = Number(evalData[i][6]) || 0;
          const e = Number(evalData[i][7]) || 0;
          const evalAvg = (r + m + e) / 3;

          for (let key in skills) {
            if (category.includes(key)) {
              skills[key].sum += evalAvg;
              skills[key].count += 1;
            }
          }
        }
      }
    }

    const resultScores = {};
    for (let key in skills) {
      resultScores[key] = skills[key].count > 0 
        ? parseFloat((skills[key].sum / skills[key].count).toFixed(2)) 
        : 0;
    }

    return {
      success: true,
      studentCode: targetCode,
      scores: resultScores
    };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}