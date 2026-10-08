// Email login (demo, client-side only). Accounts live in this browser's localStorage.
// NOTE: this is not real security - a production system needs a server-side backend.
const USERS_KEY = "ashaScheduler.users", SESSION_KEY = "ashaScheduler.session";
const $a = s => document.querySelector(s);
const readUsers = () => { try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; } catch { return {}; } };
const writeUsers = u => { try { localStorage.setItem(USERS_KEY, JSON.stringify(u)); } catch {} };

async function hashPw(email, pw) {
  const text = "asha|" + email + "|" + pw;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 5381; for (const c of text) h = ((h << 5) + h + c.charCodeAt(0)) | 0; // fallback
  return "f" + h;
}

let currentUser = null;
try { currentUser = localStorage.getItem(SESSION_KEY); } catch {}
if (currentUser && !readUsers()[currentUser]) currentUser = null;

const authMsg = m => { $a("#authMsg").textContent = m; };
let mode = "login";
function setMode(m) {
  mode = m; authMsg("");
  $a("#authTitle").textContent = m === "login" ? "Sign in" : "Create account";
  $a("#authSubmit").textContent = m === "login" ? "Sign in" : "Register";
  $a("#authSwitch").innerHTML = m === "login"
    ? 'New here? <a href="#" id="swLink">Create an account</a>'
    : 'Already registered? <a href="#" id="swLink">Sign in</a>';
  $a("#confirmWrap").hidden = m === "login";
  $a("#pw").autocomplete = m === "login" ? "current-password" : "new-password";
  $a("#swLink").onclick = e => { e.preventDefault(); setMode(m === "login" ? "register" : "login"); };
}

$a("#authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $a("#email").value.trim().toLowerCase(), pw = $a("#pw").value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return authMsg("Enter a valid email address.");
  const users = readUsers(), hash = await hashPw(email, pw);
  if (mode === "register") {
    if (pw.length < 6) return authMsg("Password must be at least 6 characters.");
    if (pw !== $a("#pw2").value) return authMsg("Passwords do not match.");
    if (users[email]) return authMsg("This email is already registered. Please sign in.");
    users[email] = { hash, created: new Date().toISOString() }; writeUsers(users);
  } else if (!users[email] || users[email].hash !== hash) {
    return authMsg("Incorrect email or password.");
  }
  try { localStorage.setItem(SESSION_KEY, email); } catch {}
  location.hash = "#dashboard"; location.reload();
});

$a("#logoutBtn").onclick = () => {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
  location.hash = ""; location.reload();
};

document.body.classList.toggle("authed", !!currentUser);
if (currentUser) $a("#userEmail").textContent = currentUser; else setMode("login");
