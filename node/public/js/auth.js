// js/auth.js
function checkAuth() {
  const user = JSON.parse(localStorage.getItem("kbs_user_data") || "null");
  
  // ถ้ายังไม่มีข้อมูลผู้ใช้งาน และไม่ได้อยู่ในหน้า login.html ให้เด้งไปหน้า login
  if (!user && !window.location.pathname.endsWith("login.html")) {
    window.location.href = "login.html";
  }
  
  return user;
}

// เรียกเช็กทันทีที่โหลดสคริปต์
const currentUserData = checkAuth();