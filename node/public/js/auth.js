// js/auth.js
function checkAuth() {
  const user = JSON.parse(localStorage.getItem("kbs_user_data") || "null");
  const path = window.location.pathname;

  // เช็คว่าเป็นหน้า Login หรือไม่ (รองรับทั้ง /login.html และ /login)
  const isLoginPage = path.endsWith("login.html") || path.endsWith("/login");

  // ถ้ายังไม่มีข้อมูลผู้ใช้งาน และไม่ได้อยู่ในหน้า login ให้เด้งไปหน้า login.html
  if (!user && !isLoginPage) {
    window.location.href = "login.html";
    return null;
  }

  return user;
}

// เรียกเช็คสถานะการเข้าใช้งาน
const currentUserData = checkAuth();