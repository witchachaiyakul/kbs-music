// ==========================================
// 🔑 LOGIN & REGISTRATION MODULE (js/login.js)
// ==========================================

const LIFF_ID = "2012217753-jKG877EO";
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyeSwvNSfHtXULSvj_QLLYACKYfZ2Yf0T4Aqa3fFroDF3ugCxJ-1oYRItsZzkAyAqIa/exec";

let currentUserProfile = null;

// 🟢 1. เริ่มต้นระบบเมื่อโหลด DOM
document.addEventListener("DOMContentLoaded", function() {
  initLIFF();
});

// 🟢 2. ฟังก์ชันเรียก API ไปยัง Google Apps Script
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

// 🟢 3. เริ่มการทำงานของ LINE LIFF
function initLIFF() {
  if (typeof liff === "undefined") {
    alert("ไม่พบ LIFF SDK กรุณาเปิดผ่านแอปพลิเคชัน LINE");
    return;
  }
  
  liff.init({ liffId: LIFF_ID })
    .then(() => {
      if (!liff.isLoggedIn()) {
        liff.login();
      } else {
        liff.getProfile().then(async profile => {
          currentUserProfile = profile;
          // ตรวจสอบสิทธิเข้าใช้งานและสถานะการลงทะเบียนจากฐานข้อมูล
          const res = await apiCall("verifyAndLogAccess", profile);
          handleVerifyResponse(res);
        }).catch(err => {
          console.error("Get LINE Profile Error:", err);
          alert("ไม่สามารถดึงข้อมูลโปรไฟล์ LINE ได้");
        });
      }
    })
    .catch(err => {
      console.error("LIFF Init Error:", err);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ LINE: " + err);
    });
}

// 🟢 4. ตรวจสอบการลงทะเบียน และควบคุมทิศทาง (Routing)
function handleVerifyResponse(res) {
  const loadingEl = document.getElementById("loading");
  if (loadingEl) loadingEl.style.display = "none";

  if (res && res.isRegistered && res.user) {
    // 🟢 ตรวจสอบว่าปัจจุบันอยู่หน้า index.html หรือยัง
    const currentPath = window.location.pathname;
    const isIndexPage = currentPath.endsWith("index.html") || currentPath === "/" || currentPath === "";

    if (!isIndexPage) {
      // หากเปิดจากหน้าอื่น ให้เปลี่ยนไปหน้า index.html
      window.location.href = "index.html";
    } else {
      // หากอยู่ที่หน้า index.html อยู่แล้ว ให้แสดงเนื้อหาหลัก (ปรับชื่อ ID ตามที่มีใน HTML)
      const mainAppView = document.getElementById("mainAppView");
      if (mainAppView) mainAppView.style.display = "block";
    }
  } else {
    // ❌ หากยังไม่ได้ลงทะเบียน ให้เปิดฟอร์มลงทะเบียน
    const regView = document.getElementById("registerView");
    if (regView) regView.style.display = "block";

    // อัปเดตรูปโปรไฟล์ LINE บนฟอร์มลงทะเบียน
    const regUserImg = document.getElementById("regUserImg");
    if (regUserImg && currentUserProfile && currentUserProfile.pictureUrl) {
      regUserImg.src = currentUserProfile.pictureUrl;
    }

    loadRegistrationOptions();
  }
}

// 🟢 5. โหลดรายการห้องเรียนสำหรับลงทะเบียน
async function loadRegistrationOptions() {
  const res = await apiCall("getRegistrationOptions");
  if (res && res.success) {
    const classSelect = document.getElementById("regClassRoom");
    if (classSelect) {
      classSelect.innerHTML = '<option value="">-- เลือกห้องเรียน --</option>';
      res.classrooms.forEach(c => {
        classSelect.innerHTML += `<option value="${c}">${c}</option>`;
      });
    }
  }
}

// 🟢 6. เมื่อเปลี่ยนห้องเรียน ให้ดึงรายชื่อนักเรียน
async function onClassroomChange() {
  const classRoom = document.getElementById("regClassRoom").value;
  const studentSelect = document.getElementById("regStudentSelect");
  document.getElementById("regStudentCode").value = "";

  if (!classRoom) {
    studentSelect.innerHTML = '<option value="">-- กรุณาเลือกห้องเรียนก่อน --</option>';
    studentSelect.disabled = true;
    return;
  }

  studentSelect.disabled = true;
  studentSelect.innerHTML = '<option value="">-- กำลังโหลดรายชื่อ... --</option>';

  const res = await apiCall("getStudentsByClassroom", { classRoom: classRoom });

  if (res && res.success && res.students) {
    if (res.students.length === 0) {
      studentSelect.innerHTML = '<option value="">-- ไม่พบรายชื่อในห้องนี้ --</option>';
    } else {
      studentSelect.innerHTML = '<option value="">-- เลือกชื่อนักเรียน --</option>';
      res.students.forEach(s => {
        studentSelect.innerHTML += `<option value="${s.id}" data-code="${s.id}">${s.name}</option>`;
      });
    }
    studentSelect.disabled = false;
  } else {
    studentSelect.innerHTML = '<option value="">-- ไม่พบรายชื่อ --</option>';
  }
}

// 🟢 7. เมื่อเลือกนักเรียน ให้อัปเดตรหัสนักเรียนอัตโนมัติ
function onStudentChange() {
  const studentSelect = document.getElementById("regStudentSelect");
  const selectedOption = studentSelect.options[studentSelect.selectedIndex];
  const code = selectedOption ? selectedOption.getAttribute("data-code") : "";
  document.getElementById("regStudentCode").value = code || "";
}

// 🟢 8. บันทึกการลงทะเบียน
async function handleRegister(e) {
  e.preventDefault();

  const role = document.getElementById("regRole").value;
  const classRoom = document.getElementById("regClassRoom").value;
  const studentCode = document.getElementById("regStudentCode").value;
  const studentSelect = document.getElementById("regStudentSelect");
  const fullName = studentSelect.options[studentSelect.selectedIndex].text;

  if (!studentCode) {
    Swal.fire("ข้อมูลไม่ครบ", "กรุณาเลือกนักเรียน", "warning");
    return;
  }

  Swal.fire({
    title: 'กำลังบันทึกข้อมูล...',
    text: 'กรุณารอสักครู่ ระบบกำลังบันทึกการลงทะเบียน',
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  const res = await apiCall("registerUser", {
    userId: currentUserProfile ? currentUserProfile.userId : '',
    displayName: currentUserProfile ? currentUserProfile.displayName : '',
    pictureUrl: currentUserProfile ? currentUserProfile.pictureUrl : '',
    role: role,
    classRoom: classRoom,
    studentCode: studentCode,
    fullName: fullName
  });

  if (res && res.success) {
    Swal.fire({
      title: "สำเร็จ!",
      text: "ลงทะเบียนเรียบร้อยแล้ว กำลังนำท่านเข้าสู่ระบบ...",
      icon: "success",
      confirmButtonColor: "#d63384",
      timer: 1500,
      showConfirmButton: false
    }).then(() => {
      // 🟢 ลงทะเบียนสำเร็จ บังคับ Redirect เข้าหน้า index.html
      window.location.href = "index.html";
    });
  } else {
    Swal.fire("ข้อผิดพลาด", res ? res.message : "ลงทะเบียนไม่สำเร็จ", "error");
  }
}