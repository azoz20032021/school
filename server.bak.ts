import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const db = new Database("school.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT, -- 'admin', 'teacher', 'student'
    name TEXT,
    uid TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    teacher_id INTEGER,
    FOREIGN KEY(teacher_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    student_id INTEGER,
    class_id INTEGER,
    PRIMARY KEY(student_id, class_id),
    FOREIGN KEY(student_id) REFERENCES users(id),
    FOREIGN KEY(class_id) REFERENCES classes(id)
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER,
    title TEXT,
    description TEXT,
    due_date TEXT,
    FOREIGN KEY(class_id) REFERENCES classes(id)
  );

  CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    assignment_id INTEGER,
    grade TEXT,
    FOREIGN KEY(student_id) REFERENCES users(id),
    FOREIGN KEY(assignment_id) REFERENCES assignments(id)
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    class_id INTEGER,
    date TEXT,
    status TEXT, -- 'present', 'absent'
    FOREIGN KEY(student_id) REFERENCES users(id),
    FOREIGN KEY(class_id) REFERENCES classes(id)
  );
`);

// Seed data if empty
const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
if (userCount.count === 0) {
  const insertUser = db.prepare("INSERT INTO users (username, password, role, name, uid) VALUES (?, ?, ?, ?, ?)");
  insertUser.run("admin", "admin123", "admin", "مدير النظام", "ADM001");
  insertUser.run("teacher1", "teacher123", "teacher", "أ. أحمد محمد", "TCH001");
  insertUser.run("student1", "student123", "student", "خالد عبدالله", "STD001");
  
  const insertClass = db.prepare("INSERT INTO classes (name, teacher_id) VALUES (?, ?)");
  insertClass.run("الرياضيات - الصف العاشر", 2);
  
  const insertEnrollment = db.prepare("INSERT INTO enrollments (student_id, class_id) VALUES (?, ?)");
  insertEnrollment.run(3, 1);
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.post("/api/login", (req, res) => {
    const { uid, password } = req.body;
    const user = db.prepare("SELECT id, username, role, name, uid FROM users WHERE uid = ? AND password = ?").get(uid, password);
    if (user) {
      res.json(user);
    } else {
      res.status(401).json({ error: "بيانات الدخول غير صحيحة (تحقق من الـ UID وكلمة المرور)" });
    }
  });

  app.post("/api/register", (req, res) => {
    const { name, password, uid, classId } = req.body;
    try {
      // Use uid as both username and uid to maintain compatibility with schema
      const result = db.prepare("INSERT INTO users (name, username, password, uid, role) VALUES (?, ?, ?, ?, 'student')").run(name, uid, password, uid);
      const studentId = result.lastInsertRowid;
      
      if (classId) {
        db.prepare("INSERT INTO enrollments (student_id, class_id) VALUES (?, ?)").run(studentId, classId);
      }
      
      res.json({ success: true, id: studentId });
    } catch (err) {
      res.status(400).json({ error: "اسم المستخدم أو الـ UID مستخدم بالفعل" });
    }
  });

  app.get("/api/classes", (req, res) => {
    const classes = db.prepare(`
      SELECT c.*, u.name as teacher_name 
      FROM classes c 
      JOIN users u ON c.teacher_id = u.id
    `).all();
    res.json(classes);
  });

  app.get("/api/admin/students", (req, res) => {
    const students = db.prepare("SELECT id, name, uid, username FROM users WHERE role = 'student'").all();
    res.json(students);
  });

  app.get("/api/teacher/classes/:teacherId", (req, res) => {
    const classes = db.prepare("SELECT * FROM classes WHERE teacher_id = ?").all(req.params.teacherId);
    res.json(classes);
  });

  app.get("/api/student/classes/:studentId", (req, res) => {
    const classes = db.prepare(`
      SELECT c.* 
      FROM classes c 
      JOIN enrollments e ON c.id = e.class_id 
      WHERE e.student_id = ?
    `).all(req.params.studentId);
    res.json(classes);
  });

  app.get("/api/class/:classId/students", (req, res) => {
    const students = db.prepare(`
      SELECT u.id, u.name 
      FROM users u 
      JOIN enrollments e ON u.id = e.student_id 
      WHERE e.class_id = ?
    `).all(req.params.classId);
    res.json(students);
  });

  app.post("/api/attendance", (req, res) => {
    const { classId, date, attendanceData } = req.body;
    const insert = db.prepare("INSERT INTO attendance (student_id, class_id, date, status) VALUES (?, ?, ?, ?)");
    const transaction = db.transaction((data) => {
      for (const item of data) {
        insert.run(item.studentId, classId, date, item.status);
      }
    });
    transaction(attendanceData);
    res.json({ success: true });
  });

  app.get("/api/student/:studentId/attendance", (req, res) => {
    const attendance = db.prepare(`
      SELECT a.*, c.name as class_name 
      FROM attendance a 
      JOIN classes c ON a.class_id = c.id 
      WHERE a.student_id = ?
    `).all(req.params.studentId);
    res.json(attendance);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
