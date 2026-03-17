import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyALWG6u_VVXOnoXm1XFzhwQdGTFEVrZgJI",
  authDomain: "zakat-alfitr-7f713.firebaseapp.com",
  projectId: "zakat-alfitr-7f713",
  storageBucket: "zakat-alfitr-7f713.firebasestorage.app",
  messagingSenderId: "169912375527",
  appId: "1:169912375527:web:822fdf5f697876adb3aa42",
  measurementId: "G-NENHFBTNJ0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ✅ تفعيل الحفظ المحلي (أوفلاين)
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.log('الأوفلاين يعمل في تبويب واحد فقط');
  } else if (err.code === 'unimplemented') {
    console.log('المتصفح لا يدعم الأوفلاين');
  }
});

export { db };