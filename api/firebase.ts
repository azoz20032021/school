import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBmgX4oKMpAQYbkuOha2zv1idpd5qQocak",
    authDomain: "mangment-school.firebaseapp.com",
    projectId: "mangment-school",
    storageBucket: "mangment-school.firebasestorage.app",
    messagingSenderId: "824062335814",
    appId: "1:824062335814:web:10e971ee4d76d8ed4aa347"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
