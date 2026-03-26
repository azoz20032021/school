import express from "express";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  limit
} from "firebase/firestore";
import { db } from "../src/lib/firebase";

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Collections references
const usersRef = collection(db, "users");
const classesRef = collection(db, "classes");
const enrollmentsRef = collection(db, "enrollments");
const attendanceRef = collection(db, "attendance");
const gradesRef = collection(db, "grades");
const notificationsRef = collection(db, "notifications");
const subjectsRef = collection(db, "subjects");
const validUidsRef = collection(db, "valid_uids");

// Run async seeding in background
(async () => {
  // Seed Firestore if empty
  const checkUsers = await getDocs(query(usersRef, where("role", "==", "admin")));
  if (checkUsers.empty) {
    console.log("Seeding Firestore with initial data...");

    // Create Admin
    const adminDoc = await addDoc(usersRef, {
      name: "مدير النظام",
      username: "admin",
      password: "admin123",
      uid: "ADM001",
      role: "admin",
      createdAt: serverTimestamp()
    });

    // Seed Subjects
    const initialSubjects = [
      { name: 'الرياضيات', color: 'bg-blue-500' },
      { name: 'اللغة العربية', color: 'bg-emerald-500' },
      { name: 'اللغة الإنجليزية', color: 'bg-orange-500' },
      { name: 'الأحياء', color: 'bg-rose-500' },
      { name: 'الفنية', color: 'bg-purple-500' },
      { name: 'الرياضة', color: 'bg-indigo-500' },
      { name: 'الفيزياء', color: 'bg-cyan-500' },
    ];
    for (const sub of initialSubjects) {
      await addDoc(subjectsRef, { ...sub, createdAt: serverTimestamp() });
    }

    // Create Teacher
    const teacherDoc = await addDoc(usersRef, {
      name: "أ. أحمد محمد",
      username: "teacher1",
      password: "teacher123",
      uid: "TCH001",
      role: "teacher",
      createdAt: serverTimestamp()
    });

    // Create Student
    const studentDoc = await addDoc(usersRef, {
      name: "خالد عبدالله",
      username: "student1",
      password: "student123",
      uid: "STD001",
      role: "student",
      createdAt: serverTimestamp()
    });

    // Create a Class
    const classDoc = await addDoc(classesRef, {
      name: "الرياضيات - الصف العاشر",
      teacher_id: teacherDoc.id,
      teacher_name: "أ. أحمد محمد",
      createdAt: serverTimestamp()
    });

    // Create Enrollment
    await addDoc(enrollmentsRef, {
      student_id: studentDoc.id,
      class_id: classDoc.id,
      createdAt: serverTimestamp()
    });

    console.log("Firestore seeding complete.");
  }

  // Check if subjects collection is empty
  const checkSubjects = await getDocs(query(subjectsRef, limit(1)));
  if (checkSubjects.empty) {
    console.log("Seeding Subjects...");
    const initialSubjects = [
      { name: 'الرياضيات', color: 'bg-blue-500' },
      { name: 'اللغة العربية', color: 'bg-emerald-500' },
      { name: 'اللغة الإنجليزية', color: 'bg-orange-500' },
      { name: 'الأحياء', color: 'bg-rose-500' },
      { name: 'الفنية', color: 'bg-purple-500' },
      { name: 'الرياضة', color: 'bg-indigo-500' },
      { name: 'الفيزياء', color: 'bg-cyan-500' },
    ];
    for (const sub of initialSubjects) {
      await addDoc(subjectsRef, { ...sub, createdAt: serverTimestamp() });
    }
  }
})().catch(console.error);
  app.post("/api/login", async (req, res) => {
    const { uid, password } = req.body;
    try {
      const q = query(usersRef, where("uid", "==", uid), where("password", "==", password));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        res.json({ id: userDoc.id, ...userDoc.data() });
      } else {
        res.status(401).json({ error: "بيانات الدخول غير صحيحة (تحقق من الـ UID وكلمة المرور)" });
      }
    } catch (err) {
      res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول" });
    }
  });

  app.post("/api/register", async (req, res) => {
    const { name, password, uid, classId } = req.body;
    try {
      // 1. Verify UID exists and is not used
      const qUid = query(validUidsRef, where("uid", "==", uid));
      const uidSnapshot = await getDocs(qUid);

      if (uidSnapshot.empty) {
        return res.status(400).json({ error: "الـ UID غير صالح. يرجى الحصول على UID من الإدارة." });
      }

      const uidDoc = uidSnapshot.docs[0];
      if (uidDoc.data().used) {
        return res.status(400).json({ error: "هذا الـ UID مستخدم بالفعل." });
      }

      // 2. Check if user with this UID already exists (extra safety)
      const qUser = query(usersRef, where("uid", "==", uid));
      const existingUserSnapshot = await getDocs(qUser);
      if (!existingUserSnapshot.empty) {
        return res.status(400).json({ error: "تم إنشاء حساب لهذا الـ UID مسبقاً." });
      }

      // 3. Create User
      const newUserData = {
        name,
        username: uid,
        password,
        uid,
        role: "student"
      };
      
      const newUserDoc = await addDoc(usersRef, {
        ...newUserData,
        createdAt: serverTimestamp()
      });

      // 4. Mark UID as used
      await updateDoc(doc(db, "valid_uids", uidDoc.id), {
        used: true,
        usedBy: newUserDoc.id,
        updatedAt: serverTimestamp()
      });

      if (classId) {
        await addDoc(enrollmentsRef, {
          student_id: newUserDoc.id,
          class_id: classId
        });
      }

      res.json({ id: newUserDoc.id, ...newUserData });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({ error: "حدث خطأ أثناء التسجيل" });
    }
  });

  // Admin UID Management
  app.get("/api/admin/uids", async (req, res) => {
    console.log("GET /api/admin/uids requested");
    try {
      const snapshot = await getDocs(validUidsRef);
      const uids = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log(`Found ${uids.length} UIDs`);
      res.json(uids);
    } catch (err) {
      console.error("Error fetching UIDs:", err);
      res.status(500).json({ error: "فشل استرجاع الـ UIDs" });
    }
  });

  app.post("/api/admin/uids/generate", async (req, res) => {
    console.log("POST /api/admin/uids/generate requested");
    try {
      const snapshot = await getDocs(validUidsRef);
      let maxId = 0;
      snapshot.forEach(doc => {
        const num = parseInt(doc.data().uid);
        if (!isNaN(num) && num > maxId) {
          maxId = num;
        }
      });

      const batch = writeBatch(db);
      const generated = [];
      for (let i = 1; i <= 10; i++) {
        const customUid = (maxId + i).toString();
        const newRef = doc(validUidsRef);
        batch.set(newRef, {
          uid: customUid,
          used: false,
          createdAt: serverTimestamp()
        });
        generated.push(customUid);
      }
      await batch.commit();
      console.log("Successfully generated 10 UIDs");
      res.json({ success: true, count: generated.length });
    } catch (err) {
      console.error("Error generating UIDs:", err);
      res.status(500).json({ error: "فشل توليد الـ UIDs" });
    }
  });

  app.delete("/api/admin/uids/:id", async (req, res) => {
    console.log(`DELETE /api/admin/uids/${req.params.id} requested`);
    try {
      await deleteDoc(doc(db, "valid_uids", req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting UID:", err);
      res.status(500).json({ error: "فشل حذف الـ UID" });
    }
  });

  app.post("/api/admin/uids/add", async (req, res) => {
    const { uid } = req.body;
    try {
      // Check if exists
      const q = query(validUidsRef, where("uid", "==", uid));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return res.status(400).json({ error: "هذا الـ UID موجود بالفعل" });
      }

      await addDoc(validUidsRef, {
        uid,
        used: false,
        createdAt: serverTimestamp()
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "فشل إضافة الـ UID" });
    }
  });

  app.get("/api/classes", async (req, res) => {
    try {
      const querySnapshot = await getDocs(classesRef);
      const classes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(classes);
    } catch (err) {
      res.status(500).json({ error: "فشل استرجاع الصفوف" });
    }
  });

  app.get("/api/admin/students", async (req, res) => {
    try {
      const q = query(usersRef, where("role", "==", "student"));
      const querySnapshot = await getDocs(q);
      const students = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(students);
    } catch (err) {
      res.status(500).json({ error: "فشل استرجاع الطلاب" });
    }
  });

  app.get("/api/teacher/classes/:teacherId", async (req, res) => {
    try {
      // 1. Query new structure (array of teachers)
      const qArray = query(classesRef, where("teacher_ids", "array-contains", req.params.teacherId));
      const snapshotArray = await getDocs(qArray);

      // 2. Query old structure (single teacher_id)
      const qSingle = query(classesRef, where("teacher_id", "==", req.params.teacherId));
      const snapshotSingle = await getDocs(qSingle);

      // Merge results
      const resultsMap = new Map();
      snapshotArray.docs.forEach(doc => resultsMap.set(doc.id, { id: doc.id, ...doc.data() }));
      snapshotSingle.docs.forEach(doc => resultsMap.set(doc.id, { id: doc.id, ...doc.data() }));

      res.json(Array.from(resultsMap.values()));
    } catch (err) {
      console.error("Error fetching teacher classes:", err);
      res.status(500).json({ error: "فشل استرجاع صفوف المعلم" });
    }
  });

  app.get("/api/student/classes/:studentId", async (req, res) => {
    try {
      const q = query(enrollmentsRef, where("student_id", "==", req.params.studentId));
      const enrollmentSnapshot = await getDocs(q);

      const classIds = enrollmentSnapshot.docs.map(doc => doc.data().class_id);
      if (classIds.length === 0) return res.json([]);

      // Fetch classes details
      const classes = [];
      for (const classId of classIds) {
        const classDoc = await getDoc(doc(db, "classes", classId));
        if (classDoc.exists()) {
          classes.push({ id: classDoc.id, ...classDoc.data() });
        }
      }
      res.json(classes);
    } catch (err) {
      res.status(500).json({ error: "فشل استرجاع صفوف الطالب" });
    }
  });

  app.get("/api/class/:classId/students", async (req, res) => {
    try {
      const q = query(enrollmentsRef, where("class_id", "==", req.params.classId));
      const enrollmentSnapshot = await getDocs(q);

      const studentIds = enrollmentSnapshot.docs.map(doc => doc.data().student_id);
      if (studentIds.length === 0) return res.json([]);

      const students = [];
      console.log(`Checking absences for ${studentIds.length} students in class ${req.params.classId}`);
      for (const studentId of studentIds) {
        console.log(`Processing student: ${studentId}`);
        const studentDoc = await getDoc(doc(db, "users", studentId));
        if (studentDoc.exists()) {
          const data = studentDoc.data();

          // Get absences count
          let absencesCount = 0;
          try {
            const attendanceQ = query(
              attendanceRef,
              where("student_id", "==", studentId)
            );
            const attendanceSnapshot = await getDocs(attendanceQ);
            console.log(`Found ${attendanceSnapshot.size} total attendance documents for student ${studentId}`);
            absencesCount = attendanceSnapshot.docs.filter(doc => {
              const d = doc.data();
              const match = d.class_id === req.params.classId && d.status === 'absent';
              if (!match) {
                // console.log(`No match: ${d.class_id} === ${req.params.classId} (${d.class_id === req.params.classId}), ${d.status} === absent (${d.status === 'absent'})`);
              }
              return match;
            }).length;
            console.log(`Final count for ${studentId}: ${absencesCount}`);
          } catch (e) {
            console.error(`Error querying absences for student ${studentId}:`, e);
          }
          console.log(`Student ${data.name}: ${absencesCount} absences`);

          students.push({
            id: studentDoc.id,
            name: data.name,
            uid: data.uid,
            absences: absencesCount
          });
        }
      }
      console.log(`Processing complete for class ${req.params.classId}. Total students: ${students.length}`);
      res.json(students);
    } catch (err) {
      res.status(500).json({ error: "فشل استرجاع طلاب الصف" });
    }
  });

  app.post("/api/attendance", async (req, res) => {
    const { classId, date, attendanceData } = req.body;
    console.log(`Recording attendance for class ${classId} on ${date}`);
    try {
      const batch = writeBatch(db);

      // Get class info for notification
      const classDoc = await getDoc(doc(db, "classes", classId));
      const className = classDoc.exists() ? classDoc.data().name : "الصف";

      for (const item of attendanceData) {
        console.log(`Student ${item.studentId}: ${item.status}`);
        const newAttendanceRef = doc(attendanceRef);
        batch.set(newAttendanceRef, {
          student_id: item.studentId,
          class_id: classId,
          date: date,
          status: item.status,
          createdAt: serverTimestamp()
        });

        // Create notification for absent students
        if (item.status === 'absent') {
          const newNotifRef = doc(notificationsRef);
          batch.set(newNotifRef, {
            user_id: item.studentId,
            title: "تنبيه غياب",
            message: `قد تم تسجيل الطالب كغائب بتاريخ: ${date}`,
            type: "absence",
            isRead: false,
            createdAt: serverTimestamp()
          });
        }
      }
      await batch.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "فشل تسجيل الحضور" });
    }
  });

  app.get("/api/admin/absences/daily", async (req, res) => {
    const { date } = req.query;
    const targetDate = (date as string) || new Date().toISOString().split('T')[0];
    console.log(`Fetching absences for date: ${targetDate}`);
    try {
      const q = query(attendanceRef, where("date", "==", targetDate), where("status", "==", "absent"));
      const querySnapshot = await getDocs(q);

      const absences = [];
      for (const d of querySnapshot.docs) {
        const attendanceData = d.data();
        const studentDoc = await getDoc(doc(db, "users", attendanceData.student_id));
        const classDoc = await getDoc(doc(db, "classes", attendanceData.class_id));

        absences.push({
          id: d.id,
          studentName: studentDoc.exists() ? studentDoc.data().name : "طالب غير معروف",
          studentUid: studentDoc.exists() ? studentDoc.data().uid : "N/A",
          className: classDoc.exists() ? classDoc.data().name : "صف غير معروف",
          time: attendanceData.createdAt?.toDate() || new Date()
        });
      }
      res.json(absences);
    } catch (err) {
      console.error("Error fetching daily absences:", err);
      res.status(500).json({ error: "فشل استرجاع غيابات اليوم" });
    }
  });

  app.get("/api/notifications/:userId", async (req, res) => {
    try {
      const q = query(
        notificationsRef,
        where("user_id", "==", req.params.userId),
        // orderBy("createdAt", "desc"), // Requires index in Firebase, simpler for now:
      );
      const querySnapshot = await getDocs(q);
      const notifications = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 10);
      res.json(notifications);
    } catch (err) {
      res.status(500).json({ error: "فشل استرجاع الإشعارات" });
    }
  });

  app.post("/api/notifications/read/:id", async (req, res) => {
    try {
      await updateDoc(doc(db, "notifications", req.params.id), { isRead: true });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "فشل تحديث الإشعار" });
    }
  });

  app.post("/api/admin/broadcast", async (req, res) => {
    const { title, message, classId, studentId } = req.body;
    console.log(`Broadcasting: ${title} - ${message} (Target: ${studentId ? 'Student ' + studentId : (classId || 'All')})`);
    try {
      let studentIds: string[] = [];

      if (studentId) {
        studentIds = [studentId];
      } else if (classId) {
        const q = query(enrollmentsRef, where("class_id", "==", classId));
        const snapshot = await getDocs(q);
        studentIds = snapshot.docs.map(doc => doc.data().student_id);
      } else {
        const q = query(usersRef, where("role", "==", "student"));
        const snapshot = await getDocs(q);
        studentIds = snapshot.docs.map(doc => doc.id);
      }

      console.log(`Found ${studentIds.length} students to notify`);

      if (studentIds.length === 0) return res.json({ success: true, count: 0 });

      const batch = writeBatch(db);
      for (const sId of studentIds) {
        const newNotifRef = doc(notificationsRef);
        batch.set(newNotifRef, {
          user_id: sId,
          title: title || "تنبيه من الإدارة",
          message,
          type: "broadcast",
          isRead: false,
          createdAt: serverTimestamp()
        });
      }
      await batch.commit();
      console.log(`Broadcast success: sent to ${studentIds.length} students`);
      res.json({ success: true, count: studentIds.length });
    } catch (err) {
      console.error("Broadcast Error:", err);
      res.status(500).json({ error: "فشل إرسال الإشعارات" });
    }
  });

  app.get("/api/student/:studentId/attendance", async (req, res) => {
    try {
      const q = query(attendanceRef, where("student_id", "==", req.params.studentId));
      const querySnapshot = await getDocs(q);
      const attendance = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(attendance);
    } catch (err) {
      res.status(500).json({ error: "فشل استرجاع سجلات الحضور" });
    }
  });

  app.post("/api/admin/classes", async (req, res) => {
    const { name, teachers } = req.body; // teachers: Array of { id, name }
    try {
      const newClassDoc = await addDoc(classesRef, {
        name,
        teacher_ids: teachers.map((t: any) => t.id),
        teacher_names: teachers.map((t: any) => t.name),
        createdAt: serverTimestamp()
      });
      res.json({ success: true, id: newClassDoc.id });
    } catch (err) {
      console.error("Error adding class:", err);
      res.status(500).json({ error: "فشل إضافة الصف" });
    }
  });

  app.delete("/api/admin/classes/:id", async (req, res) => {
    try {
      await deleteDoc(doc(db, "classes", req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "فشل حذف الصف" });
    }
  });

  app.put("/api/admin/classes/:id", async (req, res) => {
    const { name, teachers } = req.body;
    console.log(`Updating class ${req.params.id}:`, { name, teachers });
    try {
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (teachers !== undefined) {
        updateData.teacher_ids = teachers.map((t: any) => t.id);
        updateData.teacher_names = teachers.map((t: any) => t.name);
      }

      await updateDoc(doc(db, "classes", req.params.id), {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      console.log(`Class ${req.params.id} updated successfully`);
      res.json({ success: true });
    } catch (err) {
      console.error(`Error updating class ${req.params.id}:`, err);
      res.status(500).json({ error: "فشل تحديث بيانات الصف" });
    }
  });

  app.post("/api/admin/enroll", async (req, res) => {
    const { student_id, class_id } = req.body;
    try {
      // Remove previous enrollments for this student (exclusive reassignment)
      const q = query(enrollmentsRef, where("student_id", "==", student_id));
      const snapshot = await getDocs(q);

      const batch = writeBatch(db);
      snapshot.forEach((d) => {
        batch.delete(doc(db, "enrollments", d.id));
      });

      // Add new enrollment
      const newRef = doc(enrollmentsRef);
      batch.set(newRef, {
        student_id,
        class_id,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      res.json({ success: true });
    } catch (err) {
      console.error("Enrollment error:", err);
      res.status(500).json({ error: "فشل إعادة تعيين الطالب للصف" });
    }
  });

  app.get("/api/class/:classId/grades", async (req, res) => {
    try {
      const q = query(gradesRef, where("class_id", "==", req.params.classId));
      const querySnapshot = await getDocs(q);
      const grades = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(grades);
    } catch (err) {
      res.status(500).json({ error: "فشل استرجاع الدرجات" });
    }
  });

  app.get("/api/class/grades/student/:studentId", async (req, res) => {
    try {
      const q = query(gradesRef, where("student_id", "==", req.params.studentId));
      const querySnapshot = await getDocs(q);
      const grades = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(grades);
    } catch (err) {
      res.status(500).json({ error: "فشل استرجاع درجات الطالب" });
    }
  });

  app.post("/api/grades", async (req, res) => {
    const { student_id, class_id, subject, score, total, status, category, semester, performed_by } = req.body;
    try {
      if (performed_by) {
        const userDoc = await getDoc(doc(db, "users", performed_by));
        if (userDoc.exists() && userDoc.data().role === 'teacher') {
          const subjects = userDoc.data().subjects || [];
          if (!subjects.includes(subject)) {
            return res.status(403).json({ error: "غير مصرح لك بإضافة درجات لهذه المادة" });
          }
        }
      }

      const newGradeDoc = await addDoc(gradesRef, {
        student_id,
        class_id,
        subject,
        score,
        total,
        status,
        category: category || 'يومي',
        semester: semester || 'الفصل الأول',
        createdAt: serverTimestamp()
      });
      res.json({ success: true, id: newGradeDoc.id });
    } catch (err) {
      res.status(500).json({ error: "فشل إضافة الدرجة" });
    }
  });

  app.delete("/api/grades/:id", async (req, res) => {
    const { performed_by } = req.body;
    try {
      if (performed_by) {
        const userDoc = await getDoc(doc(db, "users", performed_by));
        if (userDoc.exists() && userDoc.data().role === 'teacher') {
          const gradeDoc = await getDoc(doc(db, "grades", req.params.id));
          if (gradeDoc.exists()) {
            const subjects = userDoc.data().subjects || [];
            if (!subjects.includes(gradeDoc.data().subject)) {
              return res.status(403).json({ error: "غير مصرح لك بحذف درجات هذه المادة" });
            }
          }
        }
      }
      await deleteDoc(doc(db, "grades", req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "فشل حذف الدرجة" });
    }
  });

  app.put("/api/grades/:id", async (req, res) => {
    const { subject, score, total, status, category, semester, performed_by } = req.body;
    try {
      if (performed_by) {
        const userDoc = await getDoc(doc(db, "users", performed_by));
        if (userDoc.exists() && userDoc.data().role === 'teacher') {
          const gradeDoc = await getDoc(doc(db, "grades", req.params.id));
          if (gradeDoc.exists()) {
            const subjects = userDoc.data().subjects || [];
            if (!subjects.includes(gradeDoc.data().subject)) {
              return res.status(403).json({ error: "غير مصرح لك بتعديل درجات هذه المادة" });
            }
          }
        }
      }

      await updateDoc(doc(db, "grades", req.params.id), {
        subject,
        score,
        total,
        status,
        category,
        semester,
        updatedAt: serverTimestamp()
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "فشل تحديث الدرجة" });
    }
  });

  app.get("/api/admin/teachers", async (req, res) => {
    try {
      const q = query(usersRef, where("role", "==", "teacher"));
      const querySnapshot = await getDocs(q);
      const teachers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(teachers);
    } catch (err) {
      res.status(500).json({ error: "فشل استرجاع المعلمين" });
    }
  });

  app.post("/api/admin/teachers", async (req, res) => {
    const { username, password, name } = req.body;
    try {
      const newUser = await addDoc(usersRef, {
        username,
        password,
        name,
        role: "teacher",
        uid: "TCH" + Math.floor(Math.random() * 1000000),
        createdAt: serverTimestamp()
      });
      res.json({ success: true, id: newUser.id });
    } catch (err) {
      res.status(500).json({ error: "فشل إضافة المعلم" });
    }
  });

  app.put("/api/admin/teachers/:id", async (req, res) => {
    const { subjects, name } = req.body;
    try {
      const updateData: any = {};
      if (subjects !== undefined) updateData.subjects = subjects;
      if (name !== undefined) updateData.name = name;

      await updateDoc(doc(db, "users", req.params.id), {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "فشل تحديث بيانات المعلم" });
    }
  });

  app.delete("/api/admin/teachers/:id", async (req, res) => {
    try {
      await deleteDoc(doc(db, "users", req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "فشل حذف المعلم" });
    }
  });

  app.get("/api/admin/assistants", async (req, res) => {
    try {
      const q = query(usersRef, where("role", "==", "assistant_admin"));
      const querySnapshot = await getDocs(q);
      const assistants = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(assistants);
    } catch (err) {
      res.status(500).json({ error: "فشل استرجاع مساعدي الإدارة" });
    }
  });

  app.post("/api/admin/assistants", async (req, res) => {
    const { username, password, name } = req.body;
    try {
      const newUser = await addDoc(usersRef, {
        username,
        password,
        name,
        role: "assistant_admin",
        uid: "ADM_ASST" + Math.floor(Math.random() * 10000),
        createdAt: serverTimestamp()
      });
      res.json({ success: true, id: newUser.id });
    } catch (err) {
      res.status(500).json({ error: "فشل إضافة المساعد" });
    }
  });

  // Admin student deletion
  app.delete("/api/admin/students/:id", async (req, res) => {
    try {
      await deleteDoc(doc(db, "users", req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "فشل حذف الطالب" });
    }
  });

  // Admin student addition with explicit UID
  app.post("/api/admin/students", async (req, res) => {
    const { username, password, name, uid } = req.body;
    try {
      // Check if UID already exists
      const q = query(usersRef, where("uid", "==", uid));
      const existingUserSnapshot = await getDocs(q);
      if (!existingUserSnapshot.empty) {
        return res.status(400).json({ error: "هذا الـ UID مستخدم بالفعل، يرجى اختيار واحد آخر" });
      }

      const newUser = await addDoc(usersRef, {
        username,
        password, // In real app, hash this
        name,
        role: "student",
        uid: uid || ("STD" + Math.floor(Math.random() * 1000000)),
        createdAt: serverTimestamp()
      });
      res.json({ success: true, id: newUser.id });
    } catch (err) {
      console.error("Error adding student:", err);
      res.status(500).json({ error: "فشل إضافة الطالب" });
    }
  });

  // Schedule management
  const schedulesRef = collection(db, "schedules");
  app.get("/api/schedules/:classId", async (req, res) => {
    try {
      const q = query(schedulesRef, where("class_id", "==", req.params.classId));
      const querySnapshot = await getDocs(q);
      const schedule = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(schedule);
    } catch (err) {
      res.status(500).json({ error: "فشل استرجاع الجدول" });
    }
  });

  app.post("/api/admin/schedules", async (req, res) => {
    const { class_id, day, time, subject, teacher, room } = req.body;
    try {
      await addDoc(schedulesRef, {
        class_id,
        day,
        time,
        subject,
        teacher,
        room,
        createdAt: serverTimestamp()
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "فشل إضافة الحصة للجدول" });
    }
  });

  app.delete("/api/admin/schedules/:id", async (req, res) => {
    try {
      await deleteDoc(doc(db, "schedules", req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "فشل حذف الحصة من الجدول" });
    }
  });

  app.get("/api/subjects", async (req, res) => {
    try {
      const querySnapshot = await getDocs(subjectsRef);
      const subjects = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(subjects);
    } catch (err) {
      res.status(500).json({ error: "فشل استرجاع المواد" });
    }
  });

  app.post("/api/admin/subjects", async (req, res) => {
    const { name } = req.body;
    console.log("Adding subject:", name);
    try {
      const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-rose-500', 'bg-purple-500', 'bg-indigo-500', 'bg-cyan-500'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const newSubject = await addDoc(subjectsRef, {
        name,
        color: randomColor,
        createdAt: serverTimestamp()
      });
      res.json({ success: true, id: newSubject.id });
    } catch (err) {
      console.error("Error adding subject:", err);
      res.status(500).json({ error: "فشل إضافة المادة" });
    }
  });

  app.delete("/api/admin/subjects/:id", async (req, res) => {
    try {
      await deleteDoc(doc(db, "subjects", req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting subject:", err);
      res.status(500).json({ error: "فشل حذف المادة" });
    }
  });

export default app;
