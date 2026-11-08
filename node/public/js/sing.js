// ==========================================
// 🎤 SINGING EVALUATION MODULE LOGIC (sing.js)
// ==========================================
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyeSwvNSfHtXULSvj_QLLYACKYfZ2Yf0T4Aqa3fFroDF3ugCxJ-1oYRItsZzkAyAqIa/exec";

let singCurrentUserData = {
  role: "Student",
  studentCode: "",
  fullName: "",
  classRoom: ""
};

let singTargetStudentCode = "";
let singIsEvaluationLocked = false;
let singSelectedScores = { rhythm: 0, melody: 0, expression: 0 };

// Chart Instances
let singChartTeacherInstance = null;
let singChartStudentInstance = null;
let singChartParentInstance = null;

// Media Recording Variables
let singMediaStream = null;
let singMediaRecorder = null;
let singRecordedChunks = [];
let singIsRecording = false;

// 🟢 1. เริ่มต้นระบบเมื่อเปิดหน้าเว็บ
document.addEventListener("DOMContentLoaded", function() {
  const urlParams = new URLSearchParams(window.location.search);
  const studentCode = urlParams.get("studentCode") || "";
  const role = urlParams.get("role") || "Student"; // 👈 รองรับการส่งบทบาท Teacher/Parent ผ่าน URL

  if (studentCode) {
    singTargetStudentCode = studentCode;
    singCurrentUserData.studentCode = studentCode;
    singCurrentUserData.role = role;

    // ดึงข้อมูลการประเมินวิชาร้องเพลง
    singFetchAndSetupEvaluation(studentCode);
  }
});

// 🟢 2. ฟังก์ชันเรียก API ปลอดภัย ดักจับ Error ป้องกัน SyntaxError JSON
async function singApiCall(action, payload = {}) {
  try {
    const apiUrl = typeof GAS_API_URL !== "undefined" ? GAS_API_URL : "";
    if (!apiUrl) {
      return { success: false, message: "ยังไม่ได้กำหนด GAS_API_URL ในระบบ" };
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, payload: payload }),
      redirect: "follow"
    });

    const rawText = await response.text();
    if (!rawText) {
      return { success: false, message: "เซิร์ฟเวอร์ไม่ตอบกลับข้อมูล (ไฟล์วิดีโออาจมีขนาดใหญ่เกินไป)" };
    }

    try {
      return JSON.parse(rawText);
    } catch (parseErr) {
      console.error("Server Response Error (Non-JSON):", rawText);
      return { success: false, message: "ตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง โปรดเช็กการ Deploy ใน Apps Script" };
    }

  } catch (err) {
    console.error("Singing API Error:", err);
    return { success: false, message: "ไม่สามารถติดต่อเซิร์ฟเวอร์ได้: " + err.toString() };
  }
}

// 🟢 3. ฟังก์ชันดึงข้อมูลการประเมิน วิดีโอ ตาราง Rubric และ Radar Chart
async function singFetchAndSetupEvaluation(studentCode) {
  const loadingText = document.getElementById("loadingText");
  const loadingEl = document.getElementById("loading");

  if (loadingText) loadingText.textContent = "กำลังดึงข้อมูลการประเมิน (การร้องเพลง)...";
  if (loadingEl) loadingEl.style.display = "flex";

  const videoContainer = document.getElementById("singVideoContainer");
  const noVideoAlert = document.getElementById("singNoVideoAlert");
  const videoFrame = document.getElementById("singVideoPlayerFrame");

  // Elements สำหรับตรวจสอบและสลับแสดงผลสถานะหมดเวลาส่งงาน
  const deadlineAlert = document.getElementById("singDeadlineAlert");
  const actionButtonsContainer = document.getElementById("singActionButtonsContainer");

  try {
    const res = await singApiCall("getSingingEvaluationStatus", {
      studentCode: studentCode,
      category: "การร้องเพลง",
      role: singCurrentUserData ? singCurrentUserData.role : 'Student'
    });

    if (loadingEl) loadingEl.style.display = "none";

    if (!res || !res.success) {
      if (videoContainer) videoContainer.classList.add("d-none");
      if (noVideoAlert) noVideoAlert.classList.remove("d-none");
      if (videoFrame) videoFrame.src = "";
      Swal.fire("แจ้งเตือน", res ? res.message : "ไม่สามารถดึงข้อมูลวิชาการร้องเพลงได้", "warning");
      return;
    }

    // 🟢 1. ตรวจสอบสถานะการปิดรับส่งงาน (คอลัมน์ F ในชีต list)
    if (res.isDeadlineClosed) {
      if (deadlineAlert) deadlineAlert.classList.remove("d-none");
      if (actionButtonsContainer) actionButtonsContainer.classList.add("d-none");
    } else {
      if (deadlineAlert) deadlineAlert.classList.add("d-none");
      if (actionButtonsContainer) actionButtonsContainer.classList.remove("d-none");
    }

    // 🟢 2. อัปเดตชื่อนักเรียนและห้องเรียนจากข้อมูลจริงที่ API ส่งกลับมา
    if (res.studentName) {
      singCurrentUserData.fullName = res.studentName;
      const nameEl = document.getElementById("singStudentName");
      if (nameEl) nameEl.innerHTML = `<i class="fa-solid fa-microphone text-danger me-2"></i>${res.studentName}`;
    }

    if (res.classRoom || res.classroom) {
      singCurrentUserData.classRoom = res.classRoom || res.classroom;
    }

    // 🟢 3. ตรวจหา File ID จากข้อมูลในระบบ
    let fileId = res.latestFileId;
    if (!fileId && res.latestVideoUrl) {
      const match = res.latestVideoUrl.match(/[\/=]([a-zA-Z0-9_-]{25,})/);
      if (match) fileId = match[1];
    }

    // แสดงผลเล่นวิดีโอ
    if (fileId && videoContainer && videoFrame && noVideoAlert) {
      videoFrame.src = `https://drive.google.com/file/d/${fileId}/preview`;
      videoContainer.classList.remove("d-none");
      noVideoAlert.classList.add("d-none");
    } else if (videoContainer && noVideoAlert) {
      if (videoFrame) videoFrame.src = "";
      videoContainer.classList.add("d-none");
      noVideoAlert.classList.remove("d-none");
    }

    // 🟢 4. อัปเดตตาราง Rubric & สถานะประเมิน
    const alertEl = document.getElementById("singEvalStatusAlert");
    const titleEl = document.getElementById("singEvalAlertTitle");
    const descEl = document.getElementById("singEvalAlertDesc");
    const btnContainer = document.getElementById("singSaveEvalBtnContainer");

    // ล้างค่าคะแนนในตัวแปรหน่วยความจำทุกครั้งที่โหลดข้อมูลใหม่
    singSelectedScores = { rhythm: 0, melody: 0, expression: 0 };
    singIsEvaluationLocked = false;

    if (res.isEvaluated) {
      singIsEvaluationLocked = true;

      if (alertEl) alertEl.className = "alert alert-success rounded-4 shadow-sm mb-3 d-flex align-items-center gap-2";
      if (titleEl) titleEl.textContent = "ได้รับการประเมินเรียบร้อยแล้ว";
      if (descEl) descEl.textContent = "ระบบได้รับการบันทึกคะแนนเรียบร้อย ไม่สามารถกดแก้ไขได้";
      if (btnContainer) btnContainer.classList.add("d-none");

      const userRole = singCurrentUserData ? singCurrentUserData.role : 'Student';
      const myScores = userRole === "Teacher" ? res.teacherScores : (userRole === "Parent" ? res.parentScores : res.studentScores);

      if (myScores) {
        ['rhythm', 'melody', 'expression'].forEach((row, idx) => {
          const lvl = myScores[idx];
          if (lvl > 0) {
            singSelectedScores[row] = lvl;
            let cell = document.querySelector(`.rubric-cell[data-row="${row}"][data-level="${lvl}"]`);
            if (cell) cell.classList.add(`selected-${lvl}`);
          }
        });
      }

      document.querySelectorAll(`.rubric-cell`).forEach(c => c.classList.add('locked'));

    } else {
      if (alertEl) alertEl.className = "alert alert-warning rounded-4 shadow-sm mb-3 d-flex align-items-center gap-2";
      if (titleEl) titleEl.textContent = "ยังไม่ได้ประเมิน";
      if (descEl) descEl.textContent = "กรุณารับชมวิดีโอและทำการประเมินในตารางด้านล่าง";
      if (btnContainer) btnContainer.classList.remove("d-none");

      document.querySelectorAll(`.rubric-cell`).forEach(c => {
        c.classList.remove('locked', 'selected-1', 'selected-2', 'selected-3', 'selected-4');
      });
    }

    // 🟢 5. แสดงผลและวาด Radar Chart เฉพาะเมื่อมีส่วนประกอบใน DOM
    const radarSection = document.getElementById("singRadarSection");
    if (radarSection) {
      radarSection.classList.remove("d-none");

      requestAnimationFrame(() => {
        if (typeof singInitRadarCharts === 'function') {
          singInitRadarCharts(
            res.teacherScores || [0, 0, 0],
            res.studentScores || [0, 0, 0],
            res.parentScores || [0, 0, 0]
          );
        }
      });
    }

  } catch (err) {
    console.error("💥 [EXCEPTION ERROR]:", err);
    if (loadingEl) loadingEl.style.display = "none";
    if (videoContainer) videoContainer.classList.add("d-none");
    if (noVideoAlert) noVideoAlert.classList.remove("d-none");
  }
}

// 🟢 4. การจัดการคลิกเลือก Rubric (กดซ้ำเพื่อยกเลิกได้)
function singSelectRubric(cellElem, rowName, level) {
  if (singIsEvaluationLocked) return;

  const isAlreadySelected = (singSelectedScores[rowName] === level);

  const rowCells = document.querySelectorAll(`.rubric-cell[data-row="${rowName}"]`);
  rowCells.forEach(c => {
    c.classList.remove("selected-1", "selected-2", "selected-3", "selected-4");
  });

  if (isAlreadySelected) {
    singSelectedScores[rowName] = 0;
  } else {
    cellElem.classList.add(`selected-${level}`);
    singSelectedScores[rowName] = level;
  }
}

function singConfirmSubmitEvaluation() {
  if (singIsEvaluationLocked) {
    Swal.fire({
      title: "ไม่สามารถบันทึกได้",
      text: "รายการนี้ได้รับการประเมินเรียบร้อยแล้ว ไม่สามารถแก้ไขหรือบันทึกซ้ำได้",
      icon: "warning",
      confirmButtonColor: "#d63384"
    });
    return;
  }

  if (singSelectedScores.rhythm === 0 || singSelectedScores.melody === 0 || singSelectedScores.expression === 0) {
    Swal.fire({
      title: "ข้อมูลไม่ครบถ้วน",
      text: "กรุณากดเลือกเกณฑ์การประเมินให้ครบทั้ง 3 ด้าน (จังหวะ, ทำนอง, การแสดงออก)",
      icon: "warning",
      confirmButtonColor: "#d63384"
    });
    return;
  }

  Swal.fire({
    title: "ยืนยันการประเมิน?",
    text: "เมื่อยืนยันแล้ว ระบบจะทำการบันทึกและไม่สามารถกดแก้ไขได้อีก",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#d63384",
    cancelButtonColor: "#6c757d",
    confirmButtonText: "ยืนยันและบันทึก",
    cancelButtonText: "ยกเลิก"
  }).then(async (result) => {
    if (result.isConfirmed) {
      const loadingEl = document.getElementById("loading");
      const loadingText = document.getElementById("loadingText");
      
      if (loadingText) loadingText.textContent = "กำลังบันทึกผลการประเมิน...";
      if (loadingEl) loadingEl.style.display = "flex";

      // 🟢 แก้ไข: เปลี่ยน action เป็น "submitSingingEvaluation" และส่งคะแนนแยกทั้ง 3 ด้าน
      const res = await singApiCall("submitSingingEvaluation", {
        studentCode: singTargetStudentCode,
        category: "การร้องเพลง",
        role: singCurrentUserData ? singCurrentUserData.role : 'Student',
        evaluatorName: singCurrentUserData ? singCurrentUserData.fullName : '',
        rhythmScore: singSelectedScores.rhythm,
        melodyScore: singSelectedScores.melody,
        expressionScore: singSelectedScores.expression,
        scores: [singSelectedScores.rhythm, singSelectedScores.melody, singSelectedScores.expression]
      });

      if (loadingEl) loadingEl.style.display = "none";

      if (res && res.success) {
        Swal.fire({
          title: "บันทึกสำเร็จ!",
          text: "ระบบได้บันทึกการประเมินเรียบร้อยแล้ว",
          icon: "success",
          confirmButtonColor: "#d63384"
        }).then(() => {
          singFetchAndSetupEvaluation(singTargetStudentCode);
        });
      } else {
        Swal.fire("แจ้งเตือน", res ? res.message : "บันทึกไม่สำเร็จ", "warning");
      }
    }
  });
}
// 🟢 5. วาด Radar Chart 3 ฝ่าย
function singInitRadarCharts(tScores, sScores, pScores) {
  const levelLabels = ["", "เริ่มต้น", "กำลังพัฒนา", "สามารถ", "เหนือความคาดหวัง"];
  const radarLabels = ['1. จังหวะ', '2. ทำนอง', '3. การแสดงออก'];

  const getOptions = () => ({
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 20, bottom: 20, left: 35, right: 35 } },
    plugins: { legend: { display: false } },
    scales: {
      r: {
        min: 0, max: 4,
        grid: { circular: true, color: 'rgba(0, 0, 0, 0.12)' },
        angleLines: { display: true, color: 'rgba(0, 0, 0, 0.15)' },
        ticks: { stepSize: 1, callback: v => levelLabels[v] || '' },
        pointLabels: { font: { family: 'Sarabun', size: 12, weight: 'bold' } }
      }
    }
  });

  if (singChartTeacherInstance) singChartTeacherInstance.destroy();
  if (singChartStudentInstance) singChartStudentInstance.destroy();
  if (singChartParentInstance) singChartParentInstance.destroy();

  const ctxT = document.getElementById('singRadarChartTeacher');
  if (ctxT) {
    singChartTeacherInstance = new Chart(ctxT.getContext('2d'), {
      type: 'radar',
      data: {
        labels: radarLabels,
        datasets: [{ data: tScores || [0,0,0], backgroundColor: 'rgba(214, 51, 132, 0.25)', borderColor: '#d63384', borderWidth: 2, pointRadius: 5 }]
      },
      options: getOptions()
    });
  }

  const ctxS = document.getElementById('singRadarChartStudent');
  if (ctxS) {
    singChartStudentInstance = new Chart(ctxS.getContext('2d'), {
      type: 'radar',
      data: {
        labels: radarLabels,
        datasets: [{ data: sScores || [0,0,0], backgroundColor: 'rgba(13, 110, 253, 0.25)', borderColor: '#0d6efd', borderWidth: 2, pointRadius: 5 }]
      },
      options: getOptions()
    });
  }

  const ctxP = document.getElementById('singRadarChartParent');
  if (ctxP) {
    singChartParentInstance = new Chart(ctxP.getContext('2d'), {
      type: 'radar',
      data: {
        labels: radarLabels,
        datasets: [{ data: pScores || [0,0,0], backgroundColor: 'rgba(25, 135, 84, 0.25)', borderColor: '#198754', borderWidth: 2, pointRadius: 5 }]
      },
      options: getOptions()
    });
  }
}

// 🟢 6. WEBCAM LOGIC & VIDEO UPLOAD
async function singStartCamera() {
  try {
    // 🟢 คงสัดส่วนกล้องไว้ที่ 640x480 (4:3) ตามเดิม
    const constraints = { video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: true };
    singMediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    const videoPreview = document.getElementById("singWebcamPreview");
    if (videoPreview) videoPreview.srcObject = singMediaStream;

    const btnStartCam = document.getElementById("singBtnStartCam");
    const btnRecord = document.getElementById("singBtnRecord");

    if (btnStartCam) btnStartCam.classList.add("d-none");
    if (btnRecord) {
      btnRecord.classList.remove("d-none");
      btnRecord.disabled = false;
      btnRecord.innerHTML = '<i class="fa-solid fa-circle me-1 text-danger"></i>เริ่มบันทึกวิดีโอ';
    }
  } catch (err) { 
    Swal.fire("ข้อผิดพลาด", "ไม่สามารถเปิดกล้องได้: " + err.message, "error"); 
  }
}

function singToggleRecording() {
  const btnRecord = document.getElementById("singBtnRecord");
  const statusBadge = document.getElementById("singRecordingStatus");

  if (!singIsRecording) {
    singRecordedChunks = [];
    
    // บีบอัดวิดีโอ (Bitrate 250kbps) ป้องกัน Payload เกินขนาดส่งผ่าน Apps Script
    let options = { videoBitsPerSecond: 250000 };
    if (typeof MediaRecorder.isTypeSupported === 'function') {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        options.mimeType = 'video/webm;codecs=vp8,opus';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        options.mimeType = 'video/mp4';
      }
    }

    try { 
      singMediaRecorder = new MediaRecorder(singMediaStream, options); 
    } catch (e) { 
      singMediaRecorder = new MediaRecorder(singMediaStream); 
    }

    singMediaRecorder.ondataavailable = (e) => { 
      if (e.data && e.data.size > 0) singRecordedChunks.push(e.data); 
    };
    singMediaRecorder.onstop = singSaveRecordedVideo;
    singMediaRecorder.start();

    singIsRecording = true;
    if (btnRecord) btnRecord.innerHTML = '<i class="fa-solid fa-square me-1"></i>หยุดและบันทึกลง Drive';
    if (statusBadge) statusBadge.classList.remove("d-none");
  } else {
    if (singMediaRecorder && singMediaRecorder.state !== 'inactive') {
      singMediaRecorder.stop();
    }
    singIsRecording = false;
    if (btnRecord) {
      btnRecord.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>กำลังประมวลผล...';
      btnRecord.disabled = true;
    }
    if (statusBadge) statusBadge.classList.add("d-none");
  }
}

// 🟢 1. ฟังก์ชันช่วยสำหรับการส่ง API พร้อมระบบ Retry อัตโนมัติ (ลองส่งซ้ำสูงสุด 3 ครั้ง)
async function uploadVideoWithRetry(payload, maxRetries = 3, delayMs = 3000) {
  const loadingText = document.getElementById("loadingText");

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1 && loadingText) {
        loadingText.textContent = `เซิร์ฟเวอร์หนาแน่น กำลังพยายามส่งซ้ำ (ครั้งที่ ${attempt}/${maxRetries})...`;
      }

      const res = await singApiCall("uploadSingingVideo", payload);
      if (res && res.success) {
        return res; // ส่งสำเร็จ คืนค่าผลลัพธ์ทันที
      }

      // หากส่งไม่สำเร็จ แต่ยังไม่ครบจำนวนรอบ Retry ให้รอตามช่วงเวลาที่กำหนด
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      } else {
        return res; // พยายามครบแล้วยังไม่สำเร็จ ให้ส่งผลลัพธ์ล้มเหลวกลับไป
      }
    } catch (err) {
      console.warn(`[Upload Attempt ${attempt} Failed]:`, err);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      } else {
        throw err;
      }
    }
  }
}

// 🟢 2. ปรับปรุงฟังก์ชันบันทึกวิดีโอหลัก
function singSaveRecordedVideo() {
  const mimeType = (singMediaRecorder && singMediaRecorder.mimeType) ? singMediaRecorder.mimeType.split(';')[0] : 'video/webm';
  const blob = new Blob(singRecordedChunks, { type: mimeType });
  const reader = new FileReader();

  reader.onloadend = async function() {
    const base64Data = reader.result.split(',')[1];
    const loadingText = document.getElementById("loadingText");
    const loadingEl = document.getElementById("loading");

    if (loadingText) loadingText.textContent = "กำลังอัปโหลดวิดีโอลง Google Drive...";
    if (loadingEl) loadingEl.style.display = "flex";

    const sName = singCurrentUserData ? (singCurrentUserData.fullName || singCurrentUserData.studentName || '') : '';
    const sClass = singCurrentUserData ? (singCurrentUserData.classRoom || singCurrentUserData.classroom || '') : '';

    const payload = {
      studentCode: singTargetStudentCode,
      studentName: sName,
      classRoom: sClass,
      category: 'การร้องเพลง',
      mimeType: mimeType,
      base64: base64Data
    };

    try {
      // เรียกใช้ระบบ Retry ส่งซ้ำสูงสุด 3 ครั้งอัตโนมัติ
      const res = await uploadVideoWithRetry(payload, 3, 3000);

      if (loadingEl) loadingEl.style.display = "none";

      if (res && res.success) {
        singStopCamera(); // ปิดกล้องสดเมื่อส่งสำเร็จเรียบร้อยแล้ว
        Swal.fire("สำเร็จ!", "อัปโหลดวิดีโอลง Google Drive สำเร็จ", "success").then(() => {
          singFetchAndSetupEvaluation(singTargetStudentCode);
        });
      } else {
        // หากพยายามครบ 3 ครั้งแล้วยังล้มเหลว ให้แสดงปุ่มลองส่งใหม่จากไฟล์เดิม
        Swal.fire({
          title: "อัปโหลดไม่สำเร็จ",
          text: res ? res.message : "การเชื่อมต่อขัดข้องหรือเซิร์ฟเวอร์หนาแน่น",
          icon: "error",
          showCancelButton: true,
          confirmButtonText: "<i class='fa-solid fa-rotate-right me-1'></i>พยายามส่งใหม่อีกครั้ง",
          cancelButtonText: "ยกเลิก"
        }).then((result) => {
          if (result.isConfirmed) {
            singSaveRecordedVideo(); // เรียกฟังก์ชันส่งซ้ำทันทีโดยไม่ต้องอัดใหม่
          }
        });
      }
    } catch (err) {
      if (loadingEl) loadingEl.style.display = "none";
      Swal.fire({
        title: "เกิดข้อผิดพลาดในการส่งข้อมูล",
        text: err.message || "การเชื่อมต่อเครือข่ายขัดข้อง",
        icon: "error",
        showCancelButton: true,
        confirmButtonText: "<i class='fa-solid fa-rotate-right me-1'></i>พยายามส่งใหม่อีกครั้ง",
        cancelButtonText: "ยกเลิก"
      }).then((result) => {
        if (result.isConfirmed) {
          singSaveRecordedVideo(); // เรียกฟังก์ชันส่งซ้ำทันทีโดยไม่ต้องอัดใหม่
        }
      });
    }
  };
  reader.readAsDataURL(blob);
}

function singStopCamera() {
  if (singMediaStream) {
    singMediaStream.getTracks().forEach(track => track.stop());
    singMediaStream = null;
  }
  
  const videoPreview = document.getElementById("singWebcamPreview");
  if (videoPreview) videoPreview.srcObject = null;

  singIsRecording = false;

  const btnStartCam = document.getElementById("singBtnStartCam");
  const btnRecord = document.getElementById("singBtnRecord");
  const statusBadge = document.getElementById("singRecordingStatus");

  if (btnStartCam) btnStartCam.classList.remove("d-none");
  if (btnRecord) {
    btnRecord.classList.add("d-none");
    btnRecord.disabled = false;
    btnRecord.innerHTML = '<i class="fa-solid fa-circle me-1 text-danger"></i>เริ่มบันทึกวิดีโอ';
  }
  if (statusBadge) statusBadge.classList.add("d-none");
}