"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
const functions = __importStar(require("firebase-functions"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("./firebase");
async function startServer() {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)({ origin: true }));
    app.use(express_1.default.json());
    app.use((req, res, next) => {
        console.log(`${req.method} ${req.url}`);
        next();
    });
    // Collections references
    const usersRef = (0, firestore_1.collection)(firebase_1.db, "users");
    const classesRef = (0, firestore_1.collection)(firebase_1.db, "classes");
    const enrollmentsRef = (0, firestore_1.collection)(firebase_1.db, "enrollments");
    const attendanceRef = (0, firestore_1.collection)(firebase_1.db, "attendance");
    const gradesRef = (0, firestore_1.collection)(firebase_1.db, "grades");
    const notificationsRef = (0, firestore_1.collection)(firebase_1.db, "notifications");
    const subjectsRef = (0, firestore_1.collection)(firebase_1.db, "subjects");
    const validUidsRef = (0, firestore_1.collection)(firebase_1.db, "valid_uids");
    // Seed Firestore if empty
    const checkUsers = await (0, firestore_1.getDocs)((0, firestore_1.query)(usersRef, (0, firestore_1.where)("role", "==", "admin")));
    if (checkUsers.empty) {
        console.log("Seeding Firestore with initial data...");
        // Create Admin
        const adminDoc = await (0, firestore_1.addDoc)(usersRef, {
            name: "مدير النظام",
            username: "admin",
            password: "admin123",
            uid: "ADM001",
            role: "admin",
            createdAt: (0, firestore_1.serverTimestamp)()
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
            await (0, firestore_1.addDoc)(subjectsRef, Object.assign(Object.assign({}, sub), { createdAt: (0, firestore_1.serverTimestamp)() }));
        }
        // Create Teacher
        const teacherDoc = await (0, firestore_1.addDoc)(usersRef, {
            name: "أ. أحمد محمد",
            username: "teacher1",
            password: "teacher123",
            uid: "TCH001",
            role: "teacher",
            createdAt: (0, firestore_1.serverTimestamp)()
        });
        // Create Student
        const studentDoc = await (0, firestore_1.addDoc)(usersRef, {
            name: "خالد عبدالله",
            username: "student1",
            password: "student123",
            uid: "STD001",
            role: "student",
            createdAt: (0, firestore_1.serverTimestamp)()
        });
        // Create a Class
        const classDoc = await (0, firestore_1.addDoc)(classesRef, {
            name: "الرياضيات - الصف العاشر",
            teacher_id: teacherDoc.id,
            teacher_name: "أ. أحمد محمد",
            createdAt: (0, firestore_1.serverTimestamp)()
        });
        // Create Enrollment
        await (0, firestore_1.addDoc)(enrollmentsRef, {
            student_id: studentDoc.id,
            class_id: classDoc.id,
            createdAt: (0, firestore_1.serverTimestamp)()
        });
        console.log("Firestore seeding complete.");
    }
    // Check if subjects collection is empty separately to ensure they exist even if users are already seeded
    const checkSubjects = await (0, firestore_1.getDocs)((0, firestore_1.query)(subjectsRef, (0, firestore_1.limit)(1)));
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
            await (0, firestore_1.addDoc)(subjectsRef, Object.assign(Object.assign({}, sub), { createdAt: (0, firestore_1.serverTimestamp)() }));
        }
    }
    app.post("/api/login", async (req, res) => {
        const { uid, password } = req.body;
        try {
            const q = (0, firestore_1.query)(usersRef, (0, firestore_1.where)("uid", "==", uid), (0, firestore_1.where)("password", "==", password));
            const querySnapshot = await (0, firestore_1.getDocs)(q);
            if (!querySnapshot.empty) {
                const userDoc = querySnapshot.docs[0];
                res.json(Object.assign({ id: userDoc.id }, userDoc.data()));
            }
            else {
                res.status(401).json({ error: "بيانات الدخول غير صحيحة (تحقق من الـ UID وكلمة المرور)" });
            }
        }
        catch (err) {
            res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول" });
        }
    });
    app.post("/api/register", async (req, res) => {
        const { name, password, uid, classId } = req.body;
        try {
            // 1. Verify UID exists and is not used
            const qUid = (0, firestore_1.query)(validUidsRef, (0, firestore_1.where)("uid", "==", uid));
            const uidSnapshot = await (0, firestore_1.getDocs)(qUid);
            if (uidSnapshot.empty) {
                return res.status(400).json({ error: "الـ UID غير صالح. يرجى الحصول على UID من الإدارة." });
            }
            const uidDoc = uidSnapshot.docs[0];
            if (uidDoc.data().used) {
                return res.status(400).json({ error: "هذا الـ UID مستخدم بالفعل." });
            }
            // 2. Check if user with this UID already exists (extra safety)
            const qUser = (0, firestore_1.query)(usersRef, (0, firestore_1.where)("uid", "==", uid));
            const existingUserSnapshot = await (0, firestore_1.getDocs)(qUser);
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
            const newUserDoc = await (0, firestore_1.addDoc)(usersRef, Object.assign(Object.assign({}, newUserData), { createdAt: (0, firestore_1.serverTimestamp)() }));
            // 4. Mark UID as used
            await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, "valid_uids", uidDoc.id), {
                used: true,
                usedBy: newUserDoc.id,
                updatedAt: (0, firestore_1.serverTimestamp)()
            });
            if (classId) {
                await (0, firestore_1.addDoc)(enrollmentsRef, {
                    student_id: newUserDoc.id,
                    class_id: classId
                });
            }
            res.json(Object.assign({ id: newUserDoc.id }, newUserData));
        }
        catch (err) {
            console.error("Registration error:", err);
            res.status(500).json({ error: "حدث خطأ أثناء التسجيل" });
        }
    });
    // Admin UID Management
    app.get("/api/admin/uids", async (req, res) => {
        console.log("GET /api/admin/uids requested");
        try {
            const snapshot = await (0, firestore_1.getDocs)(validUidsRef);
            const uids = snapshot.docs.map(d => (Object.assign({ id: d.id }, d.data())));
            console.log(`Found ${uids.length} UIDs`);
            res.json(uids);
        }
        catch (err) {
            console.error("Error fetching UIDs:", err);
            res.status(500).json({ error: "فشل استرجاع الـ UIDs" });
        }
    });
    app.post("/api/admin/uids/generate", async (req, res) => {
        console.log("POST /api/admin/uids/generate requested");
        try {
            const snapshot = await (0, firestore_1.getDocs)(validUidsRef);
            let maxId = 0;
            snapshot.forEach(doc => {
                const num = parseInt(doc.data().uid);
                if (!isNaN(num) && num > maxId) {
                    maxId = num;
                }
            });
            const batch = (0, firestore_1.writeBatch)(firebase_1.db);
            const generated = [];
            for (let i = 1; i <= 10; i++) {
                const customUid = (maxId + i).toString();
                const newRef = (0, firestore_1.doc)(validUidsRef);
                batch.set(newRef, {
                    uid: customUid,
                    used: false,
                    createdAt: (0, firestore_1.serverTimestamp)()
                });
                generated.push(customUid);
            }
            await batch.commit();
            console.log("Successfully generated 10 UIDs");
            res.json({ success: true, count: generated.length });
        }
        catch (err) {
            console.error("Error generating UIDs:", err);
            res.status(500).json({ error: "فشل توليد الـ UIDs" });
        }
    });
    app.delete("/api/admin/uids/:id", async (req, res) => {
        console.log(`DELETE /api/admin/uids/${req.params.id} requested`);
        try {
            await (0, firestore_1.deleteDoc)((0, firestore_1.doc)(firebase_1.db, "valid_uids", req.params.id));
            res.json({ success: true });
        }
        catch (err) {
            console.error("Error deleting UID:", err);
            res.status(500).json({ error: "فشل حذف الـ UID" });
        }
    });
    app.post("/api/admin/uids/add", async (req, res) => {
        const { uid } = req.body;
        try {
            // Check if exists
            const q = (0, firestore_1.query)(validUidsRef, (0, firestore_1.where)("uid", "==", uid));
            const snapshot = await (0, firestore_1.getDocs)(q);
            if (!snapshot.empty) {
                return res.status(400).json({ error: "هذا الـ UID موجود بالفعل" });
            }
            await (0, firestore_1.addDoc)(validUidsRef, {
                uid,
                used: false,
                createdAt: (0, firestore_1.serverTimestamp)()
            });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: "فشل إضافة الـ UID" });
        }
    });
    app.get("/api/classes", async (req, res) => {
        try {
            const querySnapshot = await (0, firestore_1.getDocs)(classesRef);
            const classes = querySnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            res.json(classes);
        }
        catch (err) {
            res.status(500).json({ error: "فشل استرجاع الصفوف" });
        }
    });
    app.get("/api/admin/students", async (req, res) => {
        try {
            const q = (0, firestore_1.query)(usersRef, (0, firestore_1.where)("role", "==", "student"));
            const querySnapshot = await (0, firestore_1.getDocs)(q);
            const students = querySnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            res.json(students);
        }
        catch (err) {
            res.status(500).json({ error: "فشل استرجاع الطلاب" });
        }
    });
    app.get("/api/teacher/classes/:teacherId", async (req, res) => {
        try {
            // 1. Query new structure (array of teachers)
            const qArray = (0, firestore_1.query)(classesRef, (0, firestore_1.where)("teacher_ids", "array-contains", req.params.teacherId));
            const snapshotArray = await (0, firestore_1.getDocs)(qArray);
            // 2. Query old structure (single teacher_id)
            const qSingle = (0, firestore_1.query)(classesRef, (0, firestore_1.where)("teacher_id", "==", req.params.teacherId));
            const snapshotSingle = await (0, firestore_1.getDocs)(qSingle);
            // Merge results
            const resultsMap = new Map();
            snapshotArray.docs.forEach(doc => resultsMap.set(doc.id, Object.assign({ id: doc.id }, doc.data())));
            snapshotSingle.docs.forEach(doc => resultsMap.set(doc.id, Object.assign({ id: doc.id }, doc.data())));
            res.json(Array.from(resultsMap.values()));
        }
        catch (err) {
            console.error("Error fetching teacher classes:", err);
            res.status(500).json({ error: "فشل استرجاع صفوف المعلم" });
        }
    });
    app.get("/api/student/classes/:studentId", async (req, res) => {
        try {
            const q = (0, firestore_1.query)(enrollmentsRef, (0, firestore_1.where)("student_id", "==", req.params.studentId));
            const enrollmentSnapshot = await (0, firestore_1.getDocs)(q);
            const classIds = enrollmentSnapshot.docs.map(doc => doc.data().class_id);
            if (classIds.length === 0)
                return res.json([]);
            // Fetch classes details
            const classes = [];
            for (const classId of classIds) {
                const classDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "classes", classId));
                if (classDoc.exists()) {
                    classes.push(Object.assign({ id: classDoc.id }, classDoc.data()));
                }
            }
            res.json(classes);
        }
        catch (err) {
            res.status(500).json({ error: "فشل استرجاع صفوف الطالب" });
        }
    });
    app.get("/api/class/:classId/students", async (req, res) => {
        try {
            const q = (0, firestore_1.query)(enrollmentsRef, (0, firestore_1.where)("class_id", "==", req.params.classId));
            const enrollmentSnapshot = await (0, firestore_1.getDocs)(q);
            const studentIds = enrollmentSnapshot.docs.map(doc => doc.data().student_id);
            if (studentIds.length === 0)
                return res.json([]);
            const students = [];
            console.log(`Checking absences for ${studentIds.length} students in class ${req.params.classId}`);
            for (const studentId of studentIds) {
                console.log(`Processing student: ${studentId}`);
                const studentDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "users", studentId));
                if (studentDoc.exists()) {
                    const data = studentDoc.data();
                    // Get absences count
                    let absencesCount = 0;
                    try {
                        const attendanceQ = (0, firestore_1.query)(attendanceRef, (0, firestore_1.where)("student_id", "==", studentId));
                        const attendanceSnapshot = await (0, firestore_1.getDocs)(attendanceQ);
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
                    }
                    catch (e) {
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
        }
        catch (err) {
            res.status(500).json({ error: "فشل استرجاع طلاب الصف" });
        }
    });
    app.post("/api/attendance", async (req, res) => {
        const { classId, date, attendanceData } = req.body;
        console.log(`Recording attendance for class ${classId} on ${date}`);
        try {
            const batch = (0, firestore_1.writeBatch)(firebase_1.db);
            // Get class info for notification
            const classDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "classes", classId));
            const className = classDoc.exists() ? classDoc.data().name : "الصف";
            for (const item of attendanceData) {
                console.log(`Student ${item.studentId}: ${item.status}`);
                const newAttendanceRef = (0, firestore_1.doc)(attendanceRef);
                batch.set(newAttendanceRef, {
                    student_id: item.studentId,
                    class_id: classId,
                    date: date,
                    status: item.status,
                    createdAt: (0, firestore_1.serverTimestamp)()
                });
                // Create notification for absent students
                if (item.status === 'absent') {
                    const newNotifRef = (0, firestore_1.doc)(notificationsRef);
                    batch.set(newNotifRef, {
                        user_id: item.studentId,
                        title: "تنبيه غياب",
                        message: `قد تم تسجيل الطالب كغائب بتاريخ: ${date}`,
                        type: "absence",
                        isRead: false,
                        createdAt: (0, firestore_1.serverTimestamp)()
                    });
                }
            }
            await batch.commit();
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: "فشل تسجيل الحضور" });
        }
    });
    app.get("/api/admin/absences/daily", async (req, res) => {
        var _a;
        const { date } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];
        console.log(`Fetching absences for date: ${targetDate}`);
        try {
            const q = (0, firestore_1.query)(attendanceRef, (0, firestore_1.where)("date", "==", targetDate), (0, firestore_1.where)("status", "==", "absent"));
            const querySnapshot = await (0, firestore_1.getDocs)(q);
            const absences = [];
            for (const d of querySnapshot.docs) {
                const attendanceData = d.data();
                const studentDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "users", attendanceData.student_id));
                const classDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "classes", attendanceData.class_id));
                absences.push({
                    id: d.id,
                    studentName: studentDoc.exists() ? studentDoc.data().name : "طالب غير معروف",
                    studentUid: studentDoc.exists() ? studentDoc.data().uid : "N/A",
                    className: classDoc.exists() ? classDoc.data().name : "صف غير معروف",
                    time: ((_a = attendanceData.createdAt) === null || _a === void 0 ? void 0 : _a.toDate()) || new Date()
                });
            }
            res.json(absences);
        }
        catch (err) {
            console.error("Error fetching daily absences:", err);
            res.status(500).json({ error: "فشل استرجاع غيابات اليوم" });
        }
    });
    app.get("/api/notifications/:userId", async (req, res) => {
        try {
            const q = (0, firestore_1.query)(notificationsRef, (0, firestore_1.where)("user_id", "==", req.params.userId));
            const querySnapshot = await (0, firestore_1.getDocs)(q);
            const notifications = querySnapshot.docs
                .map(doc => (Object.assign({ id: doc.id }, doc.data())))
                .sort((a, b) => { var _a, _b; return (((_a = b.createdAt) === null || _a === void 0 ? void 0 : _a.seconds) || 0) - (((_b = a.createdAt) === null || _b === void 0 ? void 0 : _b.seconds) || 0); })
                .slice(0, 10);
            res.json(notifications);
        }
        catch (err) {
            res.status(500).json({ error: "فشل استرجاع الإشعارات" });
        }
    });
    app.post("/api/notifications/read/:id", async (req, res) => {
        try {
            await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, "notifications", req.params.id), { isRead: true });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: "فشل تحديث الإشعار" });
        }
    });
    app.post("/api/admin/broadcast", async (req, res) => {
        const { title, message, classId, studentId } = req.body;
        console.log(`Broadcasting: ${title} - ${message} (Target: ${studentId ? 'Student ' + studentId : (classId || 'All')})`);
        try {
            let studentIds = [];
            if (studentId) {
                studentIds = [studentId];
            }
            else if (classId) {
                const q = (0, firestore_1.query)(enrollmentsRef, (0, firestore_1.where)("class_id", "==", classId));
                const snapshot = await (0, firestore_1.getDocs)(q);
                studentIds = snapshot.docs.map(doc => doc.data().student_id);
            }
            else {
                const q = (0, firestore_1.query)(usersRef, (0, firestore_1.where)("role", "==", "student"));
                const snapshot = await (0, firestore_1.getDocs)(q);
                studentIds = snapshot.docs.map(doc => doc.id);
            }
            console.log(`Found ${studentIds.length} students to notify`);
            if (studentIds.length === 0)
                return res.json({ success: true, count: 0 });
            const batch = (0, firestore_1.writeBatch)(firebase_1.db);
            for (const sId of studentIds) {
                const newNotifRef = (0, firestore_1.doc)(notificationsRef);
                batch.set(newNotifRef, {
                    user_id: sId,
                    title: title || "تنبيه من الإدارة",
                    message,
                    type: "broadcast",
                    isRead: false,
                    createdAt: (0, firestore_1.serverTimestamp)()
                });
            }
            await batch.commit();
            console.log(`Broadcast success: sent to ${studentIds.length} students`);
            res.json({ success: true, count: studentIds.length });
        }
        catch (err) {
            console.error("Broadcast Error:", err);
            res.status(500).json({ error: "فشل إرسال الإشعارات" });
        }
    });
    app.get("/api/student/:studentId/attendance", async (req, res) => {
        try {
            const q = (0, firestore_1.query)(attendanceRef, (0, firestore_1.where)("student_id", "==", req.params.studentId));
            const querySnapshot = await (0, firestore_1.getDocs)(q);
            const attendance = querySnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            res.json(attendance);
        }
        catch (err) {
            res.status(500).json({ error: "فشل استرجاع سجلات الحضور" });
        }
    });
    app.post("/api/admin/classes", async (req, res) => {
        const { name, teachers } = req.body; // teachers: Array of { id, name }
        try {
            const newClassDoc = await (0, firestore_1.addDoc)(classesRef, {
                name,
                teacher_ids: teachers.map((t) => t.id),
                teacher_names: teachers.map((t) => t.name),
                createdAt: (0, firestore_1.serverTimestamp)()
            });
            res.json({ success: true, id: newClassDoc.id });
        }
        catch (err) {
            console.error("Error adding class:", err);
            res.status(500).json({ error: "فشل إضافة الصف" });
        }
    });
    app.delete("/api/admin/classes/:id", async (req, res) => {
        try {
            await (0, firestore_1.deleteDoc)((0, firestore_1.doc)(firebase_1.db, "classes", req.params.id));
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: "فشل حذف الصف" });
        }
    });
    app.put("/api/admin/classes/:id", async (req, res) => {
        const { name, teachers } = req.body;
        console.log(`Updating class ${req.params.id}:`, { name, teachers });
        try {
            const updateData = {};
            if (name !== undefined)
                updateData.name = name;
            if (teachers !== undefined) {
                updateData.teacher_ids = teachers.map((t) => t.id);
                updateData.teacher_names = teachers.map((t) => t.name);
            }
            await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, "classes", req.params.id), Object.assign(Object.assign({}, updateData), { updatedAt: (0, firestore_1.serverTimestamp)() }));
            console.log(`Class ${req.params.id} updated successfully`);
            res.json({ success: true });
        }
        catch (err) {
            console.error(`Error updating class ${req.params.id}:`, err);
            res.status(500).json({ error: "فشل تحديث بيانات الصف" });
        }
    });
    app.post("/api/admin/enroll", async (req, res) => {
        const { student_id, class_id } = req.body;
        try {
            // Remove previous enrollments for this student (exclusive reassignment)
            const q = (0, firestore_1.query)(enrollmentsRef, (0, firestore_1.where)("student_id", "==", student_id));
            const snapshot = await (0, firestore_1.getDocs)(q);
            const batch = (0, firestore_1.writeBatch)(firebase_1.db);
            snapshot.forEach((d) => {
                batch.delete((0, firestore_1.doc)(firebase_1.db, "enrollments", d.id));
            });
            // Add new enrollment
            const newRef = (0, firestore_1.doc)(enrollmentsRef);
            batch.set(newRef, {
                student_id,
                class_id,
                createdAt: (0, firestore_1.serverTimestamp)()
            });
            await batch.commit();
            res.json({ success: true });
        }
        catch (err) {
            console.error("Enrollment error:", err);
            res.status(500).json({ error: "فشل إعادة تعيين الطالب للصف" });
        }
    });
    app.get("/api/class/:classId/grades", async (req, res) => {
        try {
            const q = (0, firestore_1.query)(gradesRef, (0, firestore_1.where)("class_id", "==", req.params.classId));
            const querySnapshot = await (0, firestore_1.getDocs)(q);
            const grades = querySnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            res.json(grades);
        }
        catch (err) {
            res.status(500).json({ error: "فشل استرجاع الدرجات" });
        }
    });
    app.get("/api/class/grades/student/:studentId", async (req, res) => {
        try {
            const q = (0, firestore_1.query)(gradesRef, (0, firestore_1.where)("student_id", "==", req.params.studentId));
            const querySnapshot = await (0, firestore_1.getDocs)(q);
            const grades = querySnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            res.json(grades);
        }
        catch (err) {
            res.status(500).json({ error: "فشل استرجاع درجات الطالب" });
        }
    });
    app.post("/api/grades", async (req, res) => {
        const { student_id, class_id, subject, score, total, status, category, semester, performed_by } = req.body;
        try {
            if (performed_by) {
                const userDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "users", performed_by));
                if (userDoc.exists() && userDoc.data().role === 'teacher') {
                    const subjects = userDoc.data().subjects || [];
                    if (!subjects.includes(subject)) {
                        return res.status(403).json({ error: "غير مصرح لك بإضافة درجات لهذه المادة" });
                    }
                }
            }
            const newGradeDoc = await (0, firestore_1.addDoc)(gradesRef, {
                student_id,
                class_id,
                subject,
                score,
                total,
                status,
                category: category || 'يومي',
                semester: semester || 'الفصل الأول',
                createdAt: (0, firestore_1.serverTimestamp)()
            });
            res.json({ success: true, id: newGradeDoc.id });
        }
        catch (err) {
            res.status(500).json({ error: "فشل إضافة الدرجة" });
        }
    });
    app.delete("/api/grades/:id", async (req, res) => {
        const { performed_by } = req.body;
        try {
            if (performed_by) {
                const userDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "users", performed_by));
                if (userDoc.exists() && userDoc.data().role === 'teacher') {
                    const gradeDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "grades", req.params.id));
                    if (gradeDoc.exists()) {
                        const subjects = userDoc.data().subjects || [];
                        if (!subjects.includes(gradeDoc.data().subject)) {
                            return res.status(403).json({ error: "غير مصرح لك بحذف درجات هذه المادة" });
                        }
                    }
                }
            }
            await (0, firestore_1.deleteDoc)((0, firestore_1.doc)(firebase_1.db, "grades", req.params.id));
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: "فشل حذف الدرجة" });
        }
    });
    app.put("/api/grades/:id", async (req, res) => {
        const { subject, score, total, status, category, semester, performed_by } = req.body;
        try {
            if (performed_by) {
                const userDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "users", performed_by));
                if (userDoc.exists() && userDoc.data().role === 'teacher') {
                    const gradeDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "grades", req.params.id));
                    if (gradeDoc.exists()) {
                        const subjects = userDoc.data().subjects || [];
                        if (!subjects.includes(gradeDoc.data().subject)) {
                            return res.status(403).json({ error: "غير مصرح لك بتعديل درجات هذه المادة" });
                        }
                    }
                }
            }
            await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, "grades", req.params.id), {
                subject,
                score,
                total,
                status,
                category,
                semester,
                updatedAt: (0, firestore_1.serverTimestamp)()
            });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: "فشل تحديث الدرجة" });
        }
    });
    app.get("/api/admin/teachers", async (req, res) => {
        try {
            const q = (0, firestore_1.query)(usersRef, (0, firestore_1.where)("role", "==", "teacher"));
            const querySnapshot = await (0, firestore_1.getDocs)(q);
            const teachers = querySnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            res.json(teachers);
        }
        catch (err) {
            res.status(500).json({ error: "فشل استرجاع المعلمين" });
        }
    });
    app.post("/api/admin/teachers", async (req, res) => {
        const { username, password, name } = req.body;
        try {
            const newUser = await (0, firestore_1.addDoc)(usersRef, {
                username,
                password,
                name,
                role: "teacher",
                uid: "TCH" + Math.floor(Math.random() * 1000000),
                createdAt: (0, firestore_1.serverTimestamp)()
            });
            res.json({ success: true, id: newUser.id });
        }
        catch (err) {
            res.status(500).json({ error: "فشل إضافة المعلم" });
        }
    });
    app.put("/api/admin/teachers/:id", async (req, res) => {
        const { subjects, name } = req.body;
        try {
            const updateData = {};
            if (subjects !== undefined)
                updateData.subjects = subjects;
            if (name !== undefined)
                updateData.name = name;
            await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, "users", req.params.id), Object.assign(Object.assign({}, updateData), { updatedAt: (0, firestore_1.serverTimestamp)() }));
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: "فشل تحديث بيانات المعلم" });
        }
    });
    app.delete("/api/admin/teachers/:id", async (req, res) => {
        try {
            await (0, firestore_1.deleteDoc)((0, firestore_1.doc)(firebase_1.db, "users", req.params.id));
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: "فشل حذف المعلم" });
        }
    });
    app.get("/api/admin/assistants", async (req, res) => {
        try {
            const q = (0, firestore_1.query)(usersRef, (0, firestore_1.where)("role", "==", "assistant_admin"));
            const querySnapshot = await (0, firestore_1.getDocs)(q);
            const assistants = querySnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            res.json(assistants);
        }
        catch (err) {
            res.status(500).json({ error: "فشل استرجاع مساعدي الإدارة" });
        }
    });
    app.post("/api/admin/assistants", async (req, res) => {
        const { username, password, name } = req.body;
        try {
            const newUser = await (0, firestore_1.addDoc)(usersRef, {
                username,
                password,
                name,
                role: "assistant_admin",
                uid: "ADM_ASST" + Math.floor(Math.random() * 10000),
                createdAt: (0, firestore_1.serverTimestamp)()
            });
            res.json({ success: true, id: newUser.id });
        }
        catch (err) {
            res.status(500).json({ error: "فشل إضافة المساعد" });
        }
    });
    // Admin student deletion
    app.delete("/api/admin/students/:id", async (req, res) => {
        try {
            await (0, firestore_1.deleteDoc)((0, firestore_1.doc)(firebase_1.db, "users", req.params.id));
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: "فشل حذف الطالب" });
        }
    });
    // Admin student addition with explicit UID
    app.post("/api/admin/students", async (req, res) => {
        const { username, password, name, uid } = req.body;
        try {
            // Check if UID already exists
            const q = (0, firestore_1.query)(usersRef, (0, firestore_1.where)("uid", "==", uid));
            const existingUserSnapshot = await (0, firestore_1.getDocs)(q);
            if (!existingUserSnapshot.empty) {
                return res.status(400).json({ error: "هذا الـ UID مستخدم بالفعل، يرجى اختيار واحد آخر" });
            }
            const newUser = await (0, firestore_1.addDoc)(usersRef, {
                username,
                password, // In real app, hash this
                name,
                role: "student",
                uid: uid || ("STD" + Math.floor(Math.random() * 1000000)),
                createdAt: (0, firestore_1.serverTimestamp)()
            });
            res.json({ success: true, id: newUser.id });
        }
        catch (err) {
            console.error("Error adding student:", err);
            res.status(500).json({ error: "فشل إضافة الطالب" });
        }
    });
    // Schedule management
    const schedulesRef = (0, firestore_1.collection)(firebase_1.db, "schedules");
    app.get("/api/schedules/:classId", async (req, res) => {
        try {
            const q = (0, firestore_1.query)(schedulesRef, (0, firestore_1.where)("class_id", "==", req.params.classId));
            const querySnapshot = await (0, firestore_1.getDocs)(q);
            const schedule = querySnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            res.json(schedule);
        }
        catch (err) {
            res.status(500).json({ error: "فشل استرجاع الجدول" });
        }
    });
    app.post("/api/admin/schedules", async (req, res) => {
        const { class_id, day, time, subject, teacher, room } = req.body;
        try {
            await (0, firestore_1.addDoc)(schedulesRef, {
                class_id,
                day,
                time,
                subject,
                teacher,
                room,
                createdAt: (0, firestore_1.serverTimestamp)()
            });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: "فشل إضافة الحصة للجدول" });
        }
    });
    app.delete("/api/admin/schedules/:id", async (req, res) => {
        try {
            await (0, firestore_1.deleteDoc)((0, firestore_1.doc)(firebase_1.db, "schedules", req.params.id));
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: "فشل حذف الحصة من الجدول" });
        }
    });
    app.get("/api/subjects", async (req, res) => {
        try {
            const querySnapshot = await (0, firestore_1.getDocs)(subjectsRef);
            const subjects = querySnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            res.json(subjects);
        }
        catch (err) {
            res.status(500).json({ error: "فشل استرجاع المواد" });
        }
    });
    app.post("/api/admin/subjects", async (req, res) => {
        const { name } = req.body;
        console.log("Adding subject:", name);
        try {
            const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-rose-500', 'bg-purple-500', 'bg-indigo-500', 'bg-cyan-500'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            const newSubject = await (0, firestore_1.addDoc)(subjectsRef, {
                name,
                color: randomColor,
                createdAt: (0, firestore_1.serverTimestamp)()
            });
            res.json({ success: true, id: newSubject.id });
        }
        catch (err) {
            console.error("Error adding subject:", err);
            res.status(500).json({ error: "فشل إضافة المادة" });
        }
    });
    app.delete("/api/admin/subjects/:id", async (req, res) => {
        try {
            await (0, firestore_1.deleteDoc)((0, firestore_1.doc)(firebase_1.db, "subjects", req.params.id));
            res.json({ success: true });
        }
        catch (err) {
            console.error("Error deleting subject:", err);
            res.status(500).json({ error: "فشل حذف المادة" });
        }
    });
    return app;
}
let cachedApp;
exports.api = functions.https.onRequest(async (req, res) => {
    if (!cachedApp) {
        cachedApp = await startServer();
    }
    return cachedApp(req, res);
});
//# sourceMappingURL=index.js.map