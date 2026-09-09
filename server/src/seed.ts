import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';

async function main() {
  console.log('🌱 Seeding Arabic Lab Database...');

  // Create Professor
  const profPassword = await bcrypt.hash('Prof@Lab2026', 10);
  await prisma.user.upsert({
    where: { username: 'professor' },
    update: { passwordHash: profPassword, isActive: true },
    create: {
      name: 'Dr. Tariq Al-Mansoor (Professor)',
      username: 'professor',
      passwordHash: profPassword,
      role: 'PROFESSOR',
      isActive: true,
    },
  });
  console.log('✅ Professor created: professor / Prof@Lab2026');

  // Create Admin
  const adminPassword = await bcrypt.hash('Admin@Lab2026', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: adminPassword, isActive: true },
    create: {
      name: 'Lab System Administrator',
      username: 'admin',
      passwordHash: adminPassword,
      role: 'ADMIN',
      isActive: true,
    },
  });
  console.log('✅ Admin created: admin / Admin@Lab2026');

  // Create 25 Student Cabins
  const studentNames = [
    'Zayd Al-Farsi', 'Layla Hassan', 'Omar Farooq', 'Fatima Zahra', 'Bilal Ahmed',
    'Maryam Khalid', 'Hamza Idris', 'Aisha Siddiqui', 'Yusuf Qasim', 'Noor Al-Huda',
    'Ibrahim Malik', 'Sana Tariq', 'Ali Raza', 'Hafsa Bint-Umar', 'Mustafa Karim',
    'Khadijah Noor', 'Salman Farsi', 'Zainab Qureshi', 'Haroon Rasheed', 'Asmahan Begum',
    'Tariq Ziyad', 'Sumayya Ammar', 'Adnan Sami', 'Rania Bashir', 'Mahmood Ghaznavi'
  ];

  for (let i = 1; i <= 25; i++) {
    const cabinPad = String(i).padStart(2, '0');
    const username = `cabin${cabinPad}`;
    const password = `Student@Lab2026`;
    const passwordHash = await bcrypt.hash(password, 10);
    const studentName = `${studentNames[i - 1]} (Cabin ${cabinPad})`;

    await prisma.user.upsert({
      where: { username },
      update: {
        name: studentName,
        passwordHash,
        cabinNumber: i,
        isActive: true,
      },
      create: {
        name: studentName,
        username,
        passwordHash,
        role: 'STUDENT',
        cabinNumber: i,
        isActive: true,
      },
    });
  }
  console.log('✅ 25 Student Cabins seeded (cabin01 .. cabin25 / Student@Lab2026)');

  console.log('🎉 Seeding complete successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
