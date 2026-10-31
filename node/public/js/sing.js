// ==========================================
// 🎤 SINGING EVALUATION MODULE LOGIC (sing.js)
// ==========================================

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

  if (studentCode) {
    singTargetStudentCode = studentCode;
    singCurrentUserData.studentCode = studentCode;

    // ดึงข้อมูลการประเมินวิชาร้องเพลง
    singFetchAndSetupEvaluation(studentCode);
  }
});

// 🟢 2. ฟังก์ชันเรียก API เฉพาะของโมดูลร้องเพลง (อ้างอิง GAS_API_URL จากสคริปต์กลาง)
async function singApiCall(action, payload = {}) {
  try {
    const apiUrl = typeof GAS_API_URL !== "undefined" ? GAS_API_URL : "";
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, payload: payload }),
      redirect: "follow"
    });
    return await response.json();
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

    // อัปเดตชื่อนักเรียนจากข้อมูลจริงที่ API ส่งกลับมา
    if (res.studentName) {
      singCurrentUserData.fullName = res.studentName;
      const nameEl = document.getElementById("singStudentName");
      if (nameEl) nameEl.innerHTML = `<i class="fa-solid fa-microphone text-danger me-2"></i>${res.studentName}`;
    }

    // ตรวจหา File ID จากข้อมูลในระบบ
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

    // อัปเดตตาราง Rubric & สถานะประเมิน
    const alertEl = document.getElementById("singEvalStatusAlert");
    const titleEl = document.getElementById("singEvalAlertTitle");
    const descEl = document.getElementById("singEvalAlertDesc");
    const btnContainer = document.getElementById("singSaveEvalBtnContainer");

    // 🟢 ล้างค่าคะแนนในตัวแปรหน่วยความจำทุกครั้งที่โหลดข้อมูลใหม่
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

    // 🟢 แสดงผลและวาด Radar Chart เฉพาะเมื่อมีส่วนประกอบใน DOM
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
}async function singFetchAndSetupEvaluation(studentCode) {
  const loadingText = document.getElementById("loadingText");
  const loadingEl = document.getElementById("loading");

  if (loadingText) loadingText.textContent = "กำลังดึงข้อมูลการประเมิน (การร้องเพลง)...";
  if (loadingEl) loadingEl.style.display = "flex";

  const videoContainer = document.getElementById("singVideoContainer");
  const noVideoAlert = document.getElementById("singNoVideoAlert");
  const videoFrame = document.getElementById("singVideoPlayerFrame");

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

    // อัปเดตชื่อนักเรียนจากข้อมูลจริงที่ API ส่งกลับมา
    if (res.studentName) {
      singCurrentUserData.fullName = res.studentName;
      const nameEl = document.getElementById("singStudentName");
      if (nameEl) nameEl.innerHTML = `<i class="fa-solid fa-microphone text-danger me-2"></i>${res.studentName}`;
    }

    // ตรวจหา File ID จากข้อมูลในระบบ
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

    // อัปเดตตาราง Rubric & สถานะประเมิน
    const alertEl = document.getElementById("singEvalStatusAlert");
    const titleEl = document.getElementById("singEvalAlertTitle");
    const descEl = document.getElementById("singEvalAlertDesc");
    const btnContainer = document.getElementById("singSaveEvalBtnContainer");

    // 🟢 ล้างค่าคะแนนในตัวแปรหน่วยความจำทุกครั้งที่โหลดข้อมูลใหม่
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

    // 🟢 แสดงผลและวาด Radar Chart เฉพาะเมื่อมีส่วนประกอบใน DOM
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

      const res = await singApiCall("saveSingingEvaluation", {
        studentCode: singTargetStudentCode,
        category: "การร้องเพลง",
        role: singCurrentUserData ? singCurrentUserData.role : 'Student',
        evaluatorName: singCurrentUserData ? singCurrentUserData.fullName : '',
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
    
    let options = {};
    if (typeof MediaRecorder.isTypeSupported === 'function') {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        options = { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 500000 };
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        options = { mimeType: 'video/mp4' };
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

    const res = await singApiCall("uploadSingingVideo", {
      studentCode: singTargetStudentCode,
      studentName: singCurrentUserData ? singCurrentUserData.fullName : '',
      classRoom: singCurrentUserData ? singCurrentUserData.classRoom : '',
      category: 'การร้องเพลง',
      mimeType: mimeType,
      base64: base64Data
    });

    if (loadingEl) loadingEl.style.display = "none";
    singStopCamera();

    if (res && res.success) {
      Swal.fire("สำเร็จ!", "อัปโหลดวิดีโอลง Google Drive สำเร็จ", "success").then(() => {
        singFetchAndSetupEvaluation(singTargetStudentCode);
      });
    } else {
      Swal.fire("ข้อผิดพลาด", res ? res.message : "อัปโหลดไม่สำเร็จ", "error");
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