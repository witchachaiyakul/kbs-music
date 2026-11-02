// ==========================================
// 👨‍🏫 TEACHER DASHBOARD LOGIC (js/teacher.js)
// ==========================================

let allTeacherStudents = [];

const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyeSwvNSfHtXULSvj_QLLYACKYfZ2Yf0T4Aqa3fFroDF3ugCxJ-1oYRItsZzkAyAqIa/exec";


// 🟢 1. เริ่มต้นระบบเมื่อเปิดหน้า teacher.html
document.addEventListener("DOMContentLoaded", function() {
  loadTeacherDashboardData();
});

// 🟢 2. ฟังก์ชันเรียก API
async function apiCall(action, payload = {}) {
  try {
    if (!GAS_API_URL || GAS_API_URL.includes("YOUR_SCRIPT_ID_HERE")) {
      return { success: false, message: "ยังไม่ได้ระบุ GAS_API_URL ให้ถูกต้อง" };
    }

    const response = await fetch(GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, payload: payload }),
      redirect: "follow"
    });

    // อ่านข้อความตอบกลับเป็น Text ก่อนเพื่อตรวจสอบ
    const textData = await response.text();
    
    try {
      return JSON.parse(textData);
    } catch (e) {
      console.error("Response is not valid JSON:", textData);
      return { 
        success: false, 
        message: "เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (ส่งมาเป็น HTML/Text แทนที่จะเป็น JSON)" 
      };
    }

  } catch (err) {
    console.error("Teacher API Error:", err);
    return { success: false, message: "ไม่สามารถติดต่อเซิร์ฟเวอร์ได้: " + err.toString() };
  }
}

// 🟢 3. ดึงข้อมูลนักเรียนทั้งหมดของครู
async function loadTeacherDashboardData() {
  console.log("🔍 กำลังเริ่มดึงข้อมูล Teacher Dashboard...");
  const tbody = document.getElementById("tStudentTableBody");
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="py-3 text-muted">กำลังโหลดข้อมูล...</td></tr>';

  const res = await apiCall("getTeacherDashboard");

  if (!res || !res.success) {
    const errorMsg = res ? res.message : "ไม่สามารถติดต่อเซิร์ฟเวอร์ได้";
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="py-3 text-danger fw-bold"><i class="fa-solid fa-triangle-exclamation me-1"></i>เกิดข้อผิดพลาด: ${errorMsg}</td></tr>`;
    }
    return;
  }

  allTeacherStudents = res.students || [];
  
  // อัปเดตตัวเลือกห้องเรียน
  const filterSelect = document.getElementById("tFilterClassroom");
  if (filterSelect) {
    filterSelect.innerHTML = '<option value="ALL">-- ทั้งหมด --</option>';
    if (res.classrooms && Array.isArray(res.classrooms)) {
      res.classrooms.forEach(room => {
        filterSelect.innerHTML += `<option value="${room}">ห้อง ${room}</option>`;
      });
    }
  }

  // อัปเดตชื่อครู (ถ้ามีข้อมูลส่งกลับมา)
  if (res.teacherName) {
    const tUserName = document.getElementById("tUserName");
    if (tUserName) tUserName.textContent = res.teacherName;
  }

  renderTeacherTable(allTeacherStudents);
}

// 🟢 4. ฟังก์ชันกรองตารางตามห้องเรียน
function filterTeacherTable() {
  const room = document.getElementById("tFilterClassroom").value;
  if (room === "ALL") {
    renderTeacherTable(allTeacherStudents);
  } else {
    const filtered = allTeacherStudents.filter(s => String(s.classroom) === String(room));
    renderTeacherTable(filtered);
  }
}

// 🟢 5. วาดตารางแสดงข้อมูลนักเรียน
function renderTeacherTable(students) {
  const tbody = document.getElementById("tStudentTableBody");
  if (!tbody) return;

  if (!students || students.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="py-3 text-muted">ไม่พบข้อมูลนักเรียน</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  students.forEach(s => {
    const singingBadge = s.singingStatus === 'done' 
      ? '<span class="badge bg-success">ประเมินแล้ว</span>' 
      : '<span class="badge bg-danger">ยังไม่ประเมิน</span>';
    
    const guitarBadge = s.guitarStatus === 'done' 
      ? '<span class="badge bg-success">ประเมินแล้ว</span>' 
      : '<span class="badge bg-danger">ยังไม่ประเมิน</span>';
      
    const ensembleBadge = s.ensembleStatus === 'done' 
      ? '<span class="badge bg-success">ประเมินแล้ว</span>' 
      : '<span class="badge bg-danger">ยังไม่ประเมิน</span>';

    tbody.innerHTML += `
      <tr>
        <td>${s.id || '-'}</td>
        <td class="text-start fw-bold">${s.name || '-'}</td>
        <td>${s.classroom || '-'}</td>
        <td>${s.no || '-'}</td>
        <td>${singingBadge}</td>
        <td>${guitarBadge}</td>
        <td>${ensembleBadge}</td>
        <td>
          <button class="btn btn-sm btn-outline-danger" onclick="openSingingModuleForStudent('${s.id}')">
            <i class="fa-solid fa-file-pen me-1"></i>ประเมิน
          </button>
        </td>
      </tr>
    `;
  });
}

// 🟢 6. ส่งไปหน้าประเมินการร้องเพลง (Multi-Page Navigation)
function openSingingModuleForStudent(studentCode) {
  if (!studentCode) return;
  // เปลี่ยนหน้าไปยัง sing.html พร้อมส่งรหัสนักเรียนผ่าน URL Parameter
  window.location.href = `sing.html?studentCode=${encodeURIComponent(studentCode)}`;
}