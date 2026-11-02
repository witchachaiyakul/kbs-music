// js/auth.js
function checkAuth() {
  const user = JSON.parse(localStorage.getItem("kbs_user_data") || "null");
  return user;
}

const currentUserData = checkAuth();