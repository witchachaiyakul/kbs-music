const IS_DEV = false; // 👈 เปลี่ยนเป็น true เพื่อทดสอบแบบไม่ผ่าน LINE LIFF / เปลี่ยนเป็น false เมื่อใช้งานจริง
const DEV_ROLE = "Student"; // "Student", "Teacher", หรือ "Parent"
const DEV_STUDENT_ID = "1"; // รหัสนักเรียนสำหรับใช้ทดสอบ

const LIFF_ID = "2012217753-jKG877EO";
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyeSwvNSfHtXULSvj_QLLYACKYfZ2Yf0T4Aqa3fFroDF3ugCxJ-1oYRItsZzkAyAqIa/exec";

let currentUserProfile = null;
let currentUserData = {
  role: "Student",
  studentCode: "",
  fullName: "",
  classRoom: ""
};

// 🟢 2. เริ่มต้นระบบเมื่อเปิดหน้าเว็บ
document.addEventListener("DOMContentLoaded", function() {
  if (IS_DEV) {
    runDevMode();
  } else {
    initLIFF();
  }
});

// 🟢 3. ฟังก์ชันเรียก API
async function apiCall(action, payload = {}) {
  try {
    const response = await fetch(GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, payload: payload }),
      redirect: "follow"
    });
    const textData = await response.text();
    try {
      return JSON.parse(textData);
    } catch (e) {
      console.error("Response is not JSON:", textData);
      return { success: false, message: "ตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง" };
    }
  } catch (err) {
    console.error("API Call Error:", err);
    return { success: false, message: "ไม่สามารถติดต่อเซิร์ฟเวอร์ได้: " + err.toString() };
  }
}

// 🟢 4. โหมดทดสอบสำหรับนักพัฒนา (ไม่ต้องเปิดผ่าน LINE)
async function runDevMode() {
  console.log(`🛠️ รันโหมด DEV (บทบาท: ${DEV_ROLE} | รหัสนักเรียน: ${DEV_STUDENT_ID})`);
  
  if (DEV_ROLE === "Teacher") {
    window.location.href = "teacher.html";
    return;
  } else if (DEV_ROLE === "Parent") {
    window.location.href = `parent.html?studentCode=${encodeURIComponent(DEV_STUDENT_ID)}`;
    return;
  }

  // กรณีเป็น Student ในโหมด DEV
  currentUserData = {
    role: "Student",
    studentCode: DEV_STUDENT_ID,
    fullName: `นักเรียนทดสอบ (รหัส ${DEV_STUDENT_ID})`,
    classRoom: "1",
    pictureUrl: "https://via.placeholder.com/55"
  };

  // ดึงข้อมูลชื่อจริงจากเซิร์ฟเวอร์ (ถ้ามี)
  const resStudent = await apiCall("getStudentInfo", { studentCode: DEV_STUDENT_ID });
  if (resStudent && resStudent.success && resStudent.student) {
    currentUserData.fullName = resStudent.student.fullName || currentUserData.fullName;
    currentUserData.classRoom = resStudent.student.classRoom || currentUserData.classRoom;
  }

  setupStudentUI();
}

// 🟢 5. เริ่มการทำงานของ LINE LIFF
function initLIFF() {
  if (typeof liff === "undefined") {
    showLIFFError("ไม่พบ LIFF SDK กรุณาเปิดผ่านแอปพลิเคชัน LINE");
    return;
  }

  liff.init({ liffId: LIFF_ID })
    .then(() => {
      if (!liff.isLoggedIn()) {
        // 🟢 แก้ไข: หากยังไม่ล็อกอิน ให้เรียกหน้าล็อกอินของ LINE แทนการเด้งไป login.html
        liff.login();
      } else {
        liff.getProfile().then(async profile => {
          if (!profile || !profile.userId) {
            showLIFFError("ไม่พบ LINE user ID กรุณาเข้าสู่ระบบผ่าน LINE ใหม่อีกครั้ง");
            return;
          }

          currentUserProfile = profile;
          const res = await apiCall("verifyAndLogAccess", profile);

          if (!res || !res.success) {
            showLIFFError(res && res.message
              ? res.message
              : "ไม่สามารถตรวจสอบ LINE user ID ได้ กรุณาลองใหม่อีกครั้ง");
            return;
          }

          if (res && res.isRegistered && res.user) {
            currentUserData = res.user;

            // นำทางตามบทบาทที่ลงทะเบียนไว้
            if (currentUserData.role === "Teacher") {
              window.location.href = "teacher.html";
            } else if (currentUserData.role === "Parent") {
              window.location.href = `parent.html?studentCode=${encodeURIComponent(currentUserData.studentCode)}`;
            } else {
              setupStudentUI();
            }
          } else {
            // ผ่าน LIFF และตรวจสอบ LINE user ID แล้ว แต่ยังไม่พบข้อมูลลงทะเบียน
            window.location.href = "login.html";
          }
        }).catch(err => {
          console.error("LIFF Get Profile Error:", err);
          showLIFFError("ไม่สามารถดึงข้อมูลโปรไฟล์ LINE ได้ กรุณาลองเข้าใช้งานใหม่อีกครั้ง");
        });
      }
    })
    .catch(err => {
      console.error("LIFF Init Error:", err);
      showLIFFError("เกิดข้อผิดพลาดในการเชื่อมต่อ LINE: " + err);
    });
}

function showLIFFError(message) {
  const loadingEl = document.getElementById("loading");
  if (loadingEl) loadingEl.style.display = "none";

  if (typeof Swal !== "undefined") {
    Swal.fire("ไม่สามารถเข้าใช้งานได้", message, "error");
  } else {
    alert(message);
  }
}

// 🟢 6. แสดงผล UI และดึงความก้าวหน้าของนักเรียน
function setupStudentUI() {
  const loadingEl = document.getElementById("loading");
  if (loadingEl) loadingEl.style.display = "none";

  const mainDashboard = document.getElementById("mainDashboard");
  if (mainDashboard) mainDashboard.style.display = "block";

  const userImg = document.getElementById("userImg");
  if (userImg && currentUserData.pictureUrl) userImg.src = currentUserData.pictureUrl;

  const userName = document.getElementById("userName");
  if (userName) userName.textContent = currentUserData.fullName;

  const userStudentInfo = document.getElementById("userStudentInfo");
  if (userStudentInfo) {
    userStudentInfo.textContent = `รหัส: ${currentUserData.studentCode || '-'} | ชั้น: ${currentUserData.classRoom || '-'}`;
  }

  loadStudentProgressDashboard(currentUserData.studentCode);
}

// 🟢 7. ดึงข้อมูลคะแนนความก้าวหน้าและคำนวณเกรด
async function loadStudentProgressDashboard(studentCode) {
  if (!studentCode) return;

  const res = await apiCall("getStudentOverallProgress", { studentCode: studentCode });
  let scores = { 'ร้องเพลง': 0, 'ตีกลอง': 0, 'เล่นกีต้าร์': 0, 'รวมวง': 0 };

  if (res && res.success && res.scores) {
    scores = res.scores;
  }

  const updateBar = (barId, valId, score) => {
    const barEl = document.getElementById(barId);
    const valEl = document.getElementById(valId);
    if (!barEl || !valEl) return;

    const numScore = Number(score) || 0;
    const percent = Math.min(100, Math.max(0, (numScore / 4) * 100));
    barEl.style.width = percent + "%";
    valEl.textContent = `${numScore.toFixed(2)} / 4.0`;

    barEl.className = "progress-bar rounded-pill transition-all ";
    if (numScore >= 3.5) barEl.classList.add("bg-primary");
    else if (numScore >= 3.0) barEl.classList.add("bg-success");
    else if (numScore >= 2.0) barEl.classList.add("bg-warning");
    else if (numScore > 0) barEl.classList.add("bg-danger");
    else barEl.classList.add("bg-secondary");
  };

  updateBar("barSinging", "valSinging", scores['ร้องเพลง']);
  updateBar("barDrum", "valDrum", scores['ตีกลอง']);
  updateBar("barGuitar", "valGuitar", scores['เล่นกีต้าร์']);
  updateBar("barEnsemble", "valEnsemble", scores['รวมวง']);

  const sSinging = Number(scores['ร้องเพลง']) || 0;
  const sDrum = Number(scores['ตีกลอง']) || 0;
  const sGuitar = Number(scores['เล่นกีต้าร์']) || 0;
  const sEnsemble = Number(scores['รวมวง']) || 0;

  const wSinging = (sSinging * 20) / 4;
  const wDrum = (sDrum * 15) / 4;
  const wGuitar = (sGuitar * 15) / 4;
  const wEnsemble = (sEnsemble * 50) / 4;

  const elScoreSinging = document.getElementById("scoreSinging");
  if (elScoreSinging) elScoreSinging.textContent = `${wSinging.toFixed(1)} / 20`;

  const elScoreDrum = document.getElementById("scoreDrum");
  if (elScoreDrum) elScoreDrum.textContent = `${wDrum.toFixed(1)} / 15`;

  const elScoreGuitar = document.getElementById("scoreGuitar");
  if (elScoreGuitar) elScoreGuitar.textContent = `${wGuitar.toFixed(1)} / 15`;

  const elScoreEnsemble = document.getElementById("scoreEnsemble");
  if (elScoreEnsemble) elScoreEnsemble.textContent = `${wEnsemble.toFixed(1)} / 50`;

  const totalWeightedScore = wSinging + wDrum + wGuitar + wEnsemble;
  const totalBadge = document.getElementById("totalWeightedScoreBadge");
  if (totalBadge) totalBadge.textContent = `คะแนนรวม: ${totalWeightedScore.toFixed(1)} / 100`;

  let finalGrade = "0";
  if (totalWeightedScore >= 80) finalGrade = "4";
  else if (totalWeightedScore >= 75) finalGrade = "3.5";
  else if (totalWeightedScore >= 70) finalGrade = "3";
  else if (totalWeightedScore >= 65) finalGrade = "2.5";
  else if (totalWeightedScore >= 60) finalGrade = "2";
  else if (totalWeightedScore >= 55) finalGrade = "1.5";
  else if (totalWeightedScore >= 50) finalGrade = "1";
  else finalGrade = "0";

  const finalGradeText = document.getElementById("finalGradeText");
  if (finalGradeText) finalGradeText.textContent = `เกรด: ${finalGrade}`;

  const segments = document.querySelectorAll("#gradeSegmentsContainer [data-grade]");
  segments.forEach(seg => {
    const gradeVal = seg.getAttribute("data-grade");
    const innerBox = seg.querySelector("div");
    if (!innerBox) return;

    if (gradeVal === finalGrade) {
      innerBox.className = "p-1 rounded border small fw-bold bg-danger text-white shadow-sm scale-110";
    } else {
      innerBox.className = "p-1 rounded border small fw-bold bg-light text-muted opacity-50";
    }
  });
}

// 🟢 8. นำทางไปยังโมดูลการประเมินวิชาต่างๆ (Multi-Page Navigation)
function openModule(categoryName, prefix) {
  const code = currentUserData ? currentUserData.studentCode : DEV_STUDENT_ID;
  if (!code) {
    Swal.fire("แจ้งเตือน", "ไม่พบรหัสนักเรียน", "warning");
    return;
  }

  let targetUrl = "";
  if (prefix === "sing" || categoryName === "ร้องเพลง" || prefix === "") {
    targetUrl = `sing.html?studentCode=${encodeURIComponent(code)}`;
  } else if (prefix === "drum" || categoryName === "ตีกลอง") {
    targetUrl = `drum.html?studentCode=${encodeURIComponent(code)}`;
  } else if (prefix === "guitar" || categoryName === "เล่นกีต้าร์") {
    targetUrl = `guitar.html?studentCode=${encodeURIComponent(code)}`;
  } else if (prefix === "ensemble" || categoryName === "รวมวง") {
    targetUrl = `ensemble.html?studentCode=${encodeURIComponent(code)}`;
  }

  if (targetUrl) {
    window.location.href = targetUrl;
  }
}