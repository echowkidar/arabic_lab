// Generates dynamic simulated workstation screens for Arabic Lab cabins
export const ARABIC_LAB_LESSONS = [
  { topic: 'مخارج الحروف', title: 'Arabic Phonetics & Articulation Points', arabic: 'مَخَارِجُ الحُرُوفِ العَرَبِيَّة' },
  { topic: 'قواعد النحو', title: 'Arabic Grammar — Al-Jumla Al-Fi\'liyya', arabic: 'الجُمْلَةُ الفِعْلِيَّةُ وَأَرْكَانُهَا' },
  { topic: 'المحادثة اليومية', title: 'Daily Conversation at the Market', arabic: 'حِوَارٌ فِي السُّوقِ التَّقْلِيدِي' },
  { topic: 'الصرف العربي', title: 'Verb Conjugation & Morphology', arabic: 'تَصْرِيفُ الأَفْعَالِ الثُّلَاثِيَّة' },
  { topic: 'القراءة والاستماع', title: 'Listening Comprehension & Dictation', arabic: 'فَهْمُ المَسْمُوعِ وَالإِمْلَاء' },
];

export function renderMockWorkstation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cabinNumber: number,
  studentName: string,
  timeSec: number,
  isSpeaking: boolean
) {
  const lesson = ARABIC_LAB_LESSONS[(cabinNumber - 1) % ARABIC_LAB_LESSONS.length];

  // Background desktop
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0a1a14');
  bgGrad.addColorStop(1, '#050d0a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Top window header
  ctx.fillStyle = '#0f291f';
  ctx.fillRect(0, 0, width, 24);

  // Window dots
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(10, 12, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.arc(22, 12, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(34, 12, 4, 0, Math.PI * 2);
  ctx.fill();

  // Window title
  ctx.fillStyle = '#9db2a8';
  ctx.font = '10px Inter, sans-serif';
  ctx.fillText(`Cabin ${String(cabinNumber).padStart(2, '0')} — ${studentName}`, 46, 16);

  // Content card
  ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(12, 36, width - 24, height - 48, 8);
  ctx.fill();
  ctx.stroke();

  // Arabic lesson title
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fde047';
  ctx.font = 'bold 15px "Amiri", serif';
  ctx.fillText(lesson.arabic, width - 24, 62);

  // English subtitle
  ctx.fillStyle = '#9db2a8';
  ctx.font = '10px "Inter", sans-serif';
  ctx.fillText(lesson.title, width - 24, 78);

  // Simulated Arabic text lines
  ctx.fillStyle = '#e2f0ea';
  ctx.font = '13px "Amiri", serif';
  const sampleLines = [
    'بِسْمِ اللَّـهِ الرَّحْمَـٰنِ الرَّحِيمِ',
    'العِلْمُ نُورٌ يَهْدِي العُقُولَ إِلَى الحَقِّ',
    'اللُّغَةُ العَرَبِيَّةُ لُغَةُ البَيَانِ وَالفَصَاحَةِ',
  ];
  sampleLines.forEach((line, idx) => {
    ctx.fillText(line, width - 24, 105 + idx * 22);
  });

  // Audio wave visualizer bar at bottom
  ctx.textAlign = 'left';
  const barCount = 18;
  const barStartX = 24;
  const barWidth = 4;
  const barGap = 3;
  for (let i = 0; i < barCount; i++) {
    const wave = isSpeaking
      ? Math.abs(Math.sin(timeSec * 4 + i * 0.4)) * 26 + 4
      : Math.abs(Math.sin(timeSec + i * 0.2)) * 6 + 2;

    ctx.fillStyle = isSpeaking ? (wave > 20 ? '#facc15' : '#10b981') : '#34d399';
    ctx.fillRect(barStartX + i * (barWidth + barGap), height - 20 - wave, barWidth, wave);
  }

  // Active student status pill
  ctx.fillStyle = isSpeaking ? 'rgba(234, 179, 8, 0.2)' : 'rgba(16, 185, 129, 0.2)';
  ctx.strokeStyle = isSpeaking ? '#eab308' : '#10b981';
  ctx.beginPath();
  ctx.roundRect(width - 110, height - 30, 96, 18, 9);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isSpeaking ? '#fef08a' : '#a7f3d0';
  ctx.font = '9px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(isSpeaking ? '● SPEAKING' : '✓ LISTENING', width - 62, height - 18);
}

export function renderOfflineWorkstation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cabinNumber: number,
  studentName: string,
  isArabic: boolean
) {
  // Dark idle background
  ctx.fillStyle = '#060a0e';
  ctx.fillRect(0, 0, width, height);

  // Subtle grid
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Standby Icon in Center
  const centerX = width / 2;
  const centerY = height / 2;

  ctx.fillStyle = '#0d181c';
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(centerX, centerY - 14, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('⚡', centerX, centerY - 9);

  // Cabin Badge & Standby Title
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(
    isArabic
      ? `مقصورة ${String(cabinNumber).padStart(2, '0')} — في وضع الاستعداد`
      : `CABIN ${String(cabinNumber).padStart(2, '0')} — STANDBY`,
    centerX,
    centerY + 16
  );

  // Waiting Subtitle
  ctx.font = '10px Inter, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText(
    isArabic ? 'في انتظار تسجيل دخول الطالب' : 'Waiting for student to login...',
    centerX,
    centerY + 32
  );

  ctx.textAlign = 'left';
}

