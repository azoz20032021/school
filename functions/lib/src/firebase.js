"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const app_1 = require("firebase/app");
const firestore_1 = require("firebase/firestore");
const firebaseConfig = {
    apiKey: "AIzaSyBmgX4oKMpAQYbkuOha2zv1idpd5qQocak",
    authDomain: "mangment-school.firebaseapp.com",
    projectId: "mangment-school",
    storageBucket: "mangment-school.firebasestorage.app",
    messagingSenderId: "824062335814",
    appId: "1:824062335814:web:10e971ee4d76d8ed4aa347"
};
// Initialize Firebase
const app = (0, app_1.initializeApp)(firebaseConfig);
exports.db = (0, firestore_1.getFirestore)(app);
//# sourceMappingURL=firebase.js.map