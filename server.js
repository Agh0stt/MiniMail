const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const multer = require("multer");

const app = express();
const PORT = 3000;

// Paths
const USERS_FILE = path.join(__dirname, "users.json");
const EMAILS_DIR = path.join(__dirname, "emails");
const ATTACH_DIR = path.join(__dirname, "attachments");

// Ensure dirs exist
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
if (!fs.existsSync(EMAILS_DIR)) fs.mkdirSync(EMAILS_DIR);
if (!fs.existsSync(ATTACH_DIR)) fs.mkdirSync(ATTACH_DIR);

// Middleware
app.use(bodyParser.json());
app.use(express.static("public"));
app.use("/attachments", express.static(ATTACH_DIR));

// Multer storage for attachments
const storage = multer.diskStorage({
  destination: ATTACH_DIR,
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Helpers
function loadUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
function loadAllEmails() {
  return fs.readdirSync(EMAILS_DIR).map(f => {
    return JSON.parse(fs.readFileSync(path.join(EMAILS_DIR, f)));
  });
}
function saveEmail(email) {
  fs.writeFileSync(path.join(EMAILS_DIR, email.id + ".json"), JSON.stringify(email, null, 2));
}

// =================== AUTH ===================

// Register
app.post("/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });

  const users = loadUsers();
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: "Email already registered" });
  }

  users.push({ email, password });
  saveUsers(users);
  res.json({ success: true });
});

// Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const users = loadUsers();
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  res.json({ success: true, email });
});

// =================== EMAILS ===================

// Send email
app.post("/send", upload.array("attachments"), (req, res) => {
  const { from, to, subject, body } = req.body;
  if (!from || !to || !subject || !body) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const id = Date.now().toString();
  const email = {
    id,
    from,
    to,
    subject,
    body,
    date: new Date(),
    attachments: req.files.map(f => ({
      filename: f.originalname,
      path: "/attachments/" + path.basename(f.path)
    })),
    read: false,
    deleted: false
  };

  saveEmail(email);
  res.json({ success: true });
});

// Inbox
app.get("/inbox/:user", (req, res) => {
  const user = req.params.user;
  const emails = loadAllEmails()
    .filter(e => e.to === user && !e.deleted)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(emails);
});

// Outbox
app.get("/outbox/:user", (req, res) => {
  const user = req.params.user;
  const emails = loadAllEmails()
    .filter(e => e.from === user && !e.deleted)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(emails);
});

// Trash
app.get("/trash/:user", (req, res) => {
  const user = req.params.user;
  const emails = loadAllEmails()
    .filter(e => e.deleted && (e.to === user || e.from === user))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(emails);
});

// =================== DELETE / RESTORE ===================

// Soft delete → move to trash
app.post("/delete/:id/:user", (req, res) => {
  const { id } = req.params;
  const filePath = path.join(EMAILS_DIR, id + ".json");

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Email not found" });

  const email = JSON.parse(fs.readFileSync(filePath));
  email.deleted = true;
  saveEmail(email);

  res.json({ success: true });
});

// Restore from trash
app.post("/restore/:id/:user", (req, res) => {
  const { id } = req.params;
  const filePath = path.join(EMAILS_DIR, id + ".json");

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Email not found" });

  const email = JSON.parse(fs.readFileSync(filePath));
  email.deleted = false;
  saveEmail(email);

  res.json({ success: true });
});

// Permanent delete
app.delete("/permadelete/:id", (req, res) => {
  const filePath = path.join(EMAILS_DIR, req.params.id + ".json");

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Email not found" });

  fs.unlinkSync(filePath);
  res.json({ success: true });
});

// =================== START SERVER ===================
app.listen(PORT, () => {
  console.log(`server has started succesfully and is running at http://localhost:${PORT}`);
});
