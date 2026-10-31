// ==========================================
// 🥁 DRUM MODULE LOGIC & WEBCAM RECORDING
// ==========================================

let audioCtx = null;
let masterGain = null;
let drumSoundBuffers = {};
let streamDestination = null;
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let isCanvasLoopRunning = false;
let activeDrumHits = {};

const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyeSwvNSfHtXULSvj_QLLYACKYfZ2Yf0T4Aqa3fFroDF3ugCxJ-1oYRItsZzkAyAqIa/exec";

let currentUserData = {
  role: "Student",
  studentCode: "",
  fullName: "ผู้ทดสอบผ่านเว็บ",
  classRoom: ""
};
let currentTargetStudentCode = null;

// 1. เริ่มต้นระบบเมื่อเปิดหน้าเว็บ
document.addEventListener("DOMContentLoaded", function() {
  // โหลดไฟล์เสียงเตรียมไว้ใน RAM
  preloadDrumSounds();

  // อ่านรหัสนักเรียนจาก URL Query Parameter (เช่น drum.html?studentCode=6601)
  const studentCode = new URLSearchParams(window.location.search).get("studentCode");
  if (studentCode) {
    currentTargetStudentCode = studentCode;
    currentUserData.studentCode = studentCode;
    currentUserData.fullName = `นักเรียนรหัส ${studentCode}`;
    
    const nameEl = document.getElementById("drumStudentName");
    if (nameEl) nameEl.textContent = currentUserData.fullName;

    fetchAndSetupCategoryEvaluation('ตีกลอง', studentCode, 'drum');
  }

  // โหลดสถานะมือซ้าย/มือขวาจาก localStorage
  if (localStorage.getItem('drum_layout_left_handed') === 'true') {
    document.querySelector('.drum-stage-container')?.classList.add('is-left-handed');
  }
});

// ปลดล็อกระบบ Web Audio API เมื่อมีการแตะหน้าจอครั้งแรก
document.addEventListener("pointerdown", function unlockAudio() {
  initAudioContext();
  document.removeEventListener("pointerdown", unlockAudio);
}, { once: true });

// 2. Web Audio API Setup
function initAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass({ latencyHint: 'interactive' });
    
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    
    streamDestination = audioCtx.createMediaStreamDestination();
    masterGain.connect(streamDestination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

async function preloadDrumSounds() {
  const drumSounds = {
    hihat: "open-hi-hat.mp3",
    closehihat: "close-hi-hat.mp3",
    tom1: "tom1.mp3",
    tom2: "tom2.mp3",
    tom3: "tom3.mp3",
    crash: "crash.mp3",
    cymbal: "ride.mp3",
    snare: "snare.mp3",
    kick: "kick.mp3"
  };

  try {
    initAudioContext();
    const results = await Promise.allSettled(Object.entries(drumSounds).map(async ([type, fileName]) => {
      const response = await fetch(`audio/${fileName}`);
      if (!response.ok) throw new Error(`โหลด ${fileName} ไม่สำเร็จ`);
      const audioData = await response.arrayBuffer();
      const decodedBuffer = await audioCtx.decodeAudioData(audioData);
      drumSoundBuffers[type] = trimAudioBufferSilence(decodedBuffer);
    }));

    const status = document.getElementById("drumAudioStatus");
    if (status) {
      status.textContent = "โหลดเสียงกลองพร้อมใช้งานแล้ว";
      status.className = "small text-success mb-2";
    }
  } catch (err) {
    console.error("Drum audio error:", err);
    const status = document.getElementById("drumAudioStatus");
    if (status) {
      status.textContent = "เริ่มระบบเสียงไม่สำเร็จ กรุณารีโหลดหน้าเว็บ";
      status.className = "small text-danger mb-2";
    }
  }
}

function trimAudioBufferSilence(buffer) {
  const channelData = buffer.getChannelData(0);
  let start = 0;
  const threshold = 0.005;

  for (let i = 0; i < channelData.length; i++) {
    if (Math.abs(channelData[i]) > threshold) {
      start = i;
      break;
    }
  }
  if (start === 0) return buffer;

  const trimmedLength = buffer.length - start;
  const trimmedBuffer = audioCtx.createBuffer(buffer.numberOfChannels, trimmedLength, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    trimmedBuffer.getChannelData(c).set(buffer.getChannelData(c).subarray(start));
  }
  return trimmedBuffer;
}

function playDrum(type) {
  if (!audioCtx) initAudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const buffer = drumSoundBuffers[type];
  if (!buffer) return;

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(masterGain);
  source.start(audioCtx.currentTime);
}

function triggerDrum(type) {
  playDrum(type);
  activeDrumHits[type] = Date.now();

  const pieceEl = document.getElementById(`piece-${type}`);
  if (pieceEl) {
    pieceEl.classList.add("hit-red-circle");
    setTimeout(() => pieceEl.classList.remove("hit-red-circle"), 100);
  }
}

// อีเวนต์แป้นกลอง & คีย์บอร์ด
document.getElementById("drumKitStage")?.addEventListener("pointerdown", function(event) {
  const drumPiece = event.target.closest(".drum-piece-item");
  if (!drumPiece) return;
  event.preventDefault();
  triggerDrum(drumPiece.id.replace("piece-", ""));
}, { passive: false });

document.addEventListener('keydown', function(e) {
  if (e.repeat) return;
  const key = e.key.toLowerCase();
  const drumByKey = {
    a: "hihat", z: "closehihat", s: "snare", d: "kick",
    f: "tom1", j: "tom2", l: "tom3", i: "crash", k: "cymbal"
  };
  if (drumByKey[key]) triggerDrum(drumByKey[key]);
});

// 3. ระบบกล้องสด + Canvas Rendering Loop
async function startDrumCompositeCamera() {
  initAudioContext();

  try {
    const constraints = { 
      video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: "user" }, 
      audio: true 
    };
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    const videoEl = document.getElementById("drumRawWebcam");
    videoEl.srcObject = mediaStream;

    videoEl.onloadedmetadata = () => {
      videoEl.play();
      isCanvasLoopRunning = true;
      requestAnimationFrame(renderDrumCanvasLoop);
    };

    document.getElementById("btnDrumStartCam")?.classList.add("d-none");
    document.getElementById("btnDrumRecord")?.classList.remove("d-none");

  } catch (err) {
    Swal.fire("ข้อผิดพลาด", "ไม่สามารถเปิดกล้องได้: " + err.message, "error");
  }
}

function renderDrumCanvasLoop() {
  if (!isCanvasLoopRunning) return;

  const canvas = document.getElementById("drumCompositeCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const videoEl = document.getElementById("drumRawWebcam");

  if (canvas.width !== 640 || canvas.height !== 360) {
    canvas.width = 640;
    canvas.height = 360;
  }

  // วาดภาพกล้องสด
  if (videoEl && videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ป้ายชื่อนักเรียน
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.beginPath();
  ctx.roundRect(10, 10, 240, 35, 8);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px Sarabun, sans-serif";
  ctx.fillText(`👤 ${currentUserData.fullName}`, 20, 32);

  // วาดบรรทัด 5 เส้น และโน้ตกลอง
  const staffBgY = 240;
  const staffBgH = 110;
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.beginPath();
  ctx.roundRect(10, staffBgY, canvas.width - 20, staffBgH, 12);
  ctx.fill();

  const lineSpacing = 8;
  const line5Y = staffBgY + 50;
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    const y = line5Y + (i * lineSpacing);
    ctx.beginPath();
    ctx.moveTo(25, y);
    ctx.lineTo(canvas.width - 25, y);
    ctx.stroke();
  }

  // กุญแจกลอง
  ctx.fillStyle = "#000000";
  ctx.fillRect(35, line5Y + 8, 3, lineSpacing * 2);
  ctx.fillRect(43, line5Y + 8, 3, lineSpacing * 2);

  // ตำแหน่งโน้ตกลอง 9 ชิ้น
  const drumNotesConfig = [
    { id: 'crash',      label: 'Crash',    x: 95,  y: line5Y - 12, shape: 'x_ledger' },
    { id: 'hihat',      label: 'Open HH',  x: 160, y: line5Y - 4,  shape: 'open_x' },
    { id: 'closehihat', label: 'Close HH', x: 220, y: line5Y - 4,  shape: 'x' },
    { id: 'cymbal',     label: 'Ride',     x: 280, y: line5Y,      shape: 'x' },
    { id: 'tom1',       label: 'Tom 1',    x: 340, y: line5Y + 4,  shape: 'head' },
    { id: 'tom2',       label: 'Tom 2',    x: 400, y: line5Y + 8,  shape: 'head' },
    { id: 'snare',      label: 'Snare',    x: 460, y: line5Y + 12, shape: 'head' },
    { id: 'tom3',       label: 'Tom 3',    x: 520, y: line5Y + 20, shape: 'head' },
    { id: 'kick',       label: 'Kick',     x: 580, y: line5Y + 28, shape: 'head' }
  ];

  const now = Date.now();
  drumNotesConfig.forEach(note => {
    const isHit = activeDrumHits[note.id] && (now - activeDrumHits[note.id] < 180);
    const mainColor = isHit ? '#ff0000' : '#000000';
    const labelColor = isHit ? '#cc0000' : '#444444';

    if (note.shape === 'x_ledger') {
      ctx.strokeStyle = mainColor;
      ctx.beginPath(); ctx.moveTo(note.x - 8, note.y); ctx.lineTo(note.x + 8, note.y); ctx.stroke();
    }

    if (note.shape === 'head') {
      ctx.fillStyle = mainColor;
      ctx.beginPath();
      ctx.ellipse(note.x, note.y, 6.5, 4.2, -0.42, 0, Math.PI * 2);
      ctx.fill();
    } else if (note.shape === 'open_x') {
      ctx.strokeStyle = mainColor; ctx.lineWidth = isHit ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(note.x - 3.5, note.y - 3.5); ctx.lineTo(note.x + 3.5, note.y + 3.5);
      ctx.moveTo(note.x + 3.5, note.y - 3.5); ctx.lineTo(note.x - 3.5, note.y + 3.5);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(note.x, note.y, 5.5, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.strokeStyle = mainColor; ctx.lineWidth = isHit ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(note.x - 4, note.y - 4); ctx.lineTo(note.x + 4, note.y + 4);
      ctx.moveTo(note.x + 4, note.y - 4); ctx.lineTo(note.x - 4, note.y + 4);
      ctx.stroke();
    }

    // ชื่อเครื่องกลอง
    ctx.fillStyle = labelColor;
    ctx.font = isHit ? "bold 11px Sarabun, sans-serif" : "10px Sarabun, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(note.label, note.x, staffBgY + 16);
  });

  requestAnimationFrame(renderDrumCanvasLoop);
}

// 4. บันทึกวิดีโอ & สลับเลย์เอาต์
function toggleDrumCompositeRecording() {
  const btnRecord = document.getElementById("btnDrumRecord");
  const statusBadge = document.getElementById("drumRecordingStatus");

  if (!isRecording) {
    recordedChunks = [];
    const canvas = document.getElementById("drumCompositeCanvas");

    const canvasVideoStream = canvas.captureStream(30);
    const videoTrack = canvasVideoStream.getVideoTracks()[0];
    const micTrack = mediaStream ? mediaStream.getAudioTracks()[0] : null;
    const drumAudioTrack = streamDestination ? streamDestination.stream.getAudioTracks()[0] : null;

    const tracks = [videoTrack];
    if (micTrack) tracks.push(micTrack);
    if (drumAudioTrack) tracks.push(drumAudioTrack);

    const finalStream = new MediaStream(tracks);

    try {
      mediaRecorder = new MediaRecorder(finalStream, { mimeType: 'video/webm;codecs=vp8,opus' });
    } catch (e) {
      mediaRecorder = new MediaRecorder(finalStream);
    }

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = saveRecordedVideo;
    mediaRecorder.start();

    isRecording = true;
    btnRecord.innerHTML = '<i class="fa-solid fa-square me-1"></i>หยุดอัดและส่งคลิปประเมิน';
    btnRecord.className = "btn btn-danger fw-bold py-2 px-4 w-100";
    if (statusBadge) statusBadge.classList.remove("d-none");

  } else {
    mediaRecorder.stop();
    isRecording = false;
    isCanvasLoopRunning = false;
    btnRecord.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>กำลังประมวลผลวิดีโอ...';
    btnRecord.disabled = true;
    if (statusBadge) statusBadge.classList.add("d-none");
  }
}

function saveRecordedVideo() {
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  if (!currentTargetStudentCode) {
    const downloadUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = "drum-recording.webm";
    downloadLink.click();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    stopCamera();
    resetDrumRecordingControls();
    Swal.fire("บันทึกวิดีโอแล้ว", "ดาวน์โหลดวิดีโอไว้ในเครื่องเรียบร้อย", "info");
    return;
  }

  const reader = new FileReader();
  reader.onloadend = async function() {
    const base64Data = reader.result.split(',')[1];
    document.getElementById("loadingText").textContent = "กำลังอัปโหลดวิดีโอลง Google Drive...";
    document.getElementById("loading").style.display = "flex";

    const res = await apiCall("uploadSingingVideo", {
      studentCode: currentTargetStudentCode,
      studentName: currentUserData.fullName,
      classRoom: currentUserData.classRoom || '1',
      category: 'ตีกลอง',
      mimeType: 'video/webm',
      base64: base64Data
    });

    document.getElementById("loading").style.display = "none";
    stopCamera();
    resetDrumRecordingControls();

    if (res && res.success) {
      Swal.fire("สำเร็จ!", "อัปโหลดวิดีโอเรียบร้อยแล้ว", "success").then(() => {
        fetchAndSetupCategoryEvaluation('ตีกลอง', currentTargetStudentCode, 'drum');
      });
    } else {
      Swal.fire("ข้อผิดพลาด", res ? res.message : "อัปโหลดไม่สำเร็จ", "error");
    }
  };
  reader.readAsDataURL(blob);
}

function resetDrumRecordingControls() {
  const btnStartCam = document.getElementById("btnDrumStartCam");
  const btnRecord = document.getElementById("btnDrumRecord");
  if (btnStartCam) btnStartCam.classList.remove("d-none");
  if (btnRecord) {
    btnRecord.classList.add("d-none");
    btnRecord.disabled = false;
    btnRecord.innerHTML = '<i class="fa-solid fa-circle me-1"></i>เริ่มบันทึกการตีกลอง';
  }
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  isRecording = false;
}

function toggleDrumLayout() {
  const stage = document.querySelector('.drum-stage-container');
  if (!stage) return;

  stage.classList.toggle('is-left-handed');
  const isLeftHanded = stage.classList.contains('is-left-handed');
  localStorage.setItem('drum_layout_left_handed', isLeftHanded ? 'true' : 'false');
}

// 5. API Helpers
async function apiCall(action, payload = {}) {
  try {
    const response = await fetch(GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, payload: payload }),
      redirect: "follow"
    });
    return await response.json();
  } catch (err) {
    console.error("API Error:", err);
    return { success: false, message: err.toString() };
  }
}

async function fetchAndSetupCategoryEvaluation(categoryName, studentCode, prefix) {
  const videoContainer = document.getElementById(`${prefix}VideoContainer`);
  const noVideoAlert = document.getElementById(`${prefix}NoVideoAlert`);
  const videoFrame = document.getElementById(`${prefix}VideoPlayerFrame`);

  const res = await apiCall("getSingingEvaluationStatus", {
    studentCode: studentCode,
    category: categoryName,
    role: currentUserData.role
  });

  if (!res || !res.success) return;

  let fileId = res.latestFileId;
  if (!fileId && res.latestVideoUrl) {
    const match = res.latestVideoUrl.match(/[\/=]([a-zA-Z0-9_-]{25,})/);
    if (match) fileId = match[1];
  }

  if (fileId && videoContainer && videoFrame && noVideoAlert) {
    videoFrame.src = `https://drive.google.com/file/d/${fileId}/preview`;
    videoContainer.classList.remove("d-none");
    noVideoAlert.classList.add("d-none");
  } else if (videoContainer && noVideoAlert) {
    videoContainer.classList.add("d-none");
    noVideoAlert.classList.remove("d-none");
  }
}

// 🟢 การจัดการคลิกเลือก Rubric วิชาตีกลอง (กดซ้ำเพื่อยกเลิกได้)
function selectDrumRubric(element, rowKey, score) {
  if (typeof isDrumEvalLocked !== 'undefined' && isDrumEvalLocked) return;

  const isAlreadySelected = (drumSelectedScores[rowKey] === score);

  document.querySelectorAll(`.drum-rubric[data-drow="${rowKey}"]`).forEach(cell => {
    cell.classList.remove("selected-1", "selected-2", "selected-3", "selected-4");
  });

  if (isAlreadySelected) {
    drumSelectedScores[rowKey] = 0;
  } else {
    element.classList.add(`selected-${score}`);
    drumSelectedScores[rowKey] = score;
  }
}