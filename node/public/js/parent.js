// ==========================================
// 👨‍👩‍👦 PARENT MODULE LOGIC (js/parent.js)
// ==========================================

const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyeSwvNSfHtXULSvj_QLLYACKYfZ2Yf0T4Aqa3fFroDF3ugCxJ-1oYRItsZzkAyAqIa/exec";

let currentUserData = {
  role: "Parent",
  studentCode: "",
  fullName: "ผู้ปกครอง",
  pictureUrl: "",
  classRoom: "1"
};

let currentTargetStudentCode = "";

// 🟢 1. เริ่มต้นระบบเมื่อเปิดหน้า parent.html
document.addEventListener("DOMContentLoaded", function() {
  const urlParams = new URLSearchParams(window.location.search);
  const studentCode = urlParams.get("studentCode") || "";

  if (studentCode) {
    currentTargetStudentCode = studentCode;
    currentUserData.studentCode = studentCode;
  }

  loadParentDashboardData(currentTargetStudentCode);
});

// 🟢 2. ฟังก์ชันเรียก API
async function apiCall(action, payload = {}) {
  try {
    if (!GAS_API_URL) {
      return { success: false, message: "ยังไม่ได้ระบุ GAS_API_URL" };
    }

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
      console.error("Response is not valid JSON:", textData);
      return { 
        success: false, 
        message: "เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (ส่งมาเป็น HTML/Text)" 
      };
    }

  } catch (err) {
    console.error("Parent API Error:", err);
    return { success: false, message: "ไม่สามารถติดต่อเซิร์ฟเวอร์ได้: " + err.toString() };
  }
}

// 🟢 3. ดึงคะแนนความก้าวหน้าของผู้ปกครอง
async function loadParentDashboardData(studentCode) {
  const targetCode = studentCode || currentUserData.studentCode;
  
  if (!targetCode) {
    console.warn("⚠️ ไม่พบรหัสนักเรียนสำหรับผู้ปกครอง");
    return;
  }

  // อัปเดต UI ผู้ปกครอง
  const imgEl = document.getElementById("pUserImg");
  if (imgEl && currentUserData.pictureUrl) imgEl.src = currentUserData.pictureUrl;

  const nameEl = document.getElementById("pUserName");
  if (nameEl) nameEl.textContent = currentUserData.fullName;

  // ดึงคะแนนความก้าวหน้า
  const res = await apiCall("getStudentOverallProgress", { studentCode: targetCode });
  
  if (res && res.studentName) {
    const infoEl = document.getElementById("pStudentChildInfo");
    if (infoEl) {
      infoEl.textContent = `นักเรียนในปกครอง: ${res.studentName} (รหัส: ${targetCode} | ชั้น: ${res.classRoom || '1'})`;
    }
  }

  let scores = { 'ร้องเพลง': 0, 'ตีกลอง': 0, 'เล่นกีต้าร์': 0, 'รวมวง': 0 };
  if (res && res.success && res.scores) scores = res.scores;

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

  updateBar("pBarSinging", "pValSinging", scores['ร้องเพลง']);
  updateBar("pBarDrum", "pValDrum", scores['ตีกลอง']);
  updateBar("pBarGuitar", "pValGuitar", scores['เล่นกีต้าร์']);
  updateBar("pBarEnsemble", "pValEnsemble", scores['รวมวง']);

  const sSinging = Number(scores['ร้องเพลง']) || 0;
  const sDrum = Number(scores['ตีกลอง']) || 0;
  const sGuitar = Number(scores['เล่นกีต้าร์']) || 0;
  const sEnsemble = Number(scores['รวมวง']) || 0;

  const wSinging = (sSinging * 20) / 4;
  const wDrum = (sDrum * 15) / 4;
  const wGuitar = (sGuitar * 15) / 4;
  const wEnsemble = (sEnsemble * 50) / 4;

  const elPSS = document.getElementById("pScoreSinging");
  if (elPSS) elPSS.textContent = `${wSinging.toFixed(1)} / 20`;

  const elPSD = document.getElementById("pScoreDrum");
  if (elPSD) elPSD.textContent = `${wDrum.toFixed(1)} / 15`;

  const elPSG = document.getElementById("pScoreGuitar");
  if (elPSG) elPSG.textContent = `${wGuitar.toFixed(1)} / 15`;

  const elPSE = document.getElementById("pScoreEnsemble");
  if (elPSE) elPSE.textContent = `${wEnsemble.toFixed(1)} / 50`;

  const totalWeightedScore = wSinging + wDrum + wGuitar + wEnsemble;
  const pTotalBadge = document.getElementById("pTotalWeightedScoreBadge");
  if (pTotalBadge) pTotalBadge.textContent = `คะแนนรวม: ${totalWeightedScore.toFixed(1)} / 100`;

  let finalGrade = "0";
  if (totalWeightedScore >= 80) finalGrade = "4";
  else if (totalWeightedScore >= 75) finalGrade = "3.5";
  else if (totalWeightedScore >= 70) finalGrade = "3";
  else if (totalWeightedScore >= 65) finalGrade = "2.5";
  else if (totalWeightedScore >= 60) finalGrade = "2";
  else if (totalWeightedScore >= 55) finalGrade = "1.5";
  else if (totalWeightedScore >= 50) finalGrade = "1";
  else finalGrade = "0";

  const pGradeText = document.getElementById("pFinalGradeText");
  if (pGradeText) pGradeText.textContent = `เกรด: ${finalGrade}`;

  const segments = document.querySelectorAll("#pGradeSegmentsContainer [data-pgrade]");
  segments.forEach(seg => {
    const gradeVal = seg.getAttribute("data-pgrade");
    const innerBox = seg.querySelector("div");
    if (!innerBox) return;

    if (gradeVal === finalGrade) {
      innerBox.className = "p-1 rounded border small fw-bold bg-success text-white shadow-sm scale-110";
    } else {
      innerBox.className = "p-1 rounded border small fw-bold bg-light text-muted opacity-50";
    }
  });
}

// 🟢 4. ปุ่มเปิดไปยังหน้าร้องเพลงเพื่อประเมินในฐานะผู้ปกครอง
function goToParentSinging() {
  const code = currentTargetStudentCode || currentUserData.studentCode;
  if (!code) {
    Swal.fire("แจ้งเตือน", "ไม่พบรหัสนักเรียน", "warning");
    return;
  }
  // นำทางไปยัง sing.html พร้อมระบุรหัสนักเรียน
  window.location.href = `sing.html?studentCode=${encodeURIComponent(code)}&role=Parent`;
}