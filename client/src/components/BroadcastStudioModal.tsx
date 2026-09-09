import React, { useState, useEffect, useRef } from 'react';
import { Language } from '../types';
import { X, Radio, Monitor, Camera, CameraOff, Mic, MicOff, Users, Disc, CheckCircle } from 'lucide-react';
import { socket } from '../services/socket';
import { uploadRecording } from '../services/api';

interface BroadcastStudioModalProps {
  onClose: () => void;
  language: Language;
}

export const BroadcastStudioModal: React.FC<BroadcastStudioModalProps> = ({ onClose, language }) => {
  const isArabic = language === 'ar';

  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [shareScreen, setShareScreen] = useState(true);
  const [shareWebcamPiP, setShareWebcamPiP] = useState(true);
  const [shareMic, setShareMic] = useState(true);
  const [broadcastTarget, setBroadcastTarget] = useState<'ALL' | 'SELECTED'>('ALL');
  const [selectedCabins, setSelectedCabins] = useState<number[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [pipPos, setPipPos] = useState({ x: 40, y: 40 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, pipX: 0, pipY: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);

  // Toggle cabin selection
  const toggleCabin = (num: number) => {
    if (selectedCabins.includes(num)) {
      setSelectedCabins(selectedCabins.filter((c) => c !== num));
    } else {
      setSelectedCabins([...selectedCabins, num]);
    }
  };

  // Start Broadcast
  const handleStartBroadcast = () => {
    setIsBroadcasting(true);
    socket.emit('broadcast-start', {
      type: broadcastTarget,
      selectedCabins,
      hasScreenShare: shareScreen,
      hasWebcamPiP: shareWebcamPiP,
      hasAudio: shareMic,
      title: 'Professor Tariq — Arabic Lab Broadcast',
    });
  };

  const handleStopBroadcast = () => {
    setIsBroadcasting(false);
    socket.emit('broadcast-stop');
    if (isRecording) {
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // Record Broadcast
  const handleToggleRecord = () => {
    if (isRecording) {
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      setIsRecording(true);
      setRecSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecSeconds((p) => p + 1);
      }, 1000);
    }
  };

  // PiP Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, pipX: pipPos.x, pipY: pipPos.y };
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPipPos({
        x: Math.max(10, Math.min(window.innerWidth - 200, dragStart.current.pipX + (e.clientX - dragStart.current.x))),
        y: Math.max(10, Math.min(window.innerHeight - 200, dragStart.current.pipY + (e.clientY - dragStart.current.y))),
      });
    };
    const onMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

  // Animate professor presentation screen
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let start = Date.now();

    const render = () => {
      const elapsed = (Date.now() - start) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      // Dark background
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#061a14');
      grad.addColorStop(1, '#020705');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Slide presentation header
      ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
      ctx.fillRect(40, 40, w - 80, 80);
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
      ctx.strokeRect(40, 40, w - 80, 80);

      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 28px "Cairo", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('شرح قواعد اللغة العربية — الأستاذ طارق المنصور', w / 2, 90);

      // Slide content
      ctx.fillStyle = '#f1f7f4';
      ctx.font = '22px "Amiri", serif';
      ctx.textAlign = 'right';
      const arabicRules = [
        '١. الجملة الاسمية تبدأ بالمبتدأ والخبر، وكلاهما مرفوع.',
        '٢. الجملة الفعلية تتكون من فعل وفاعل ومفعول به عند التعدي.',
        '٣. علامات الإعراب الأصلية: الضمة للرفع، الفتحة للنصب، الكسرة للجر.',
      ];
      arabicRules.forEach((rule, idx) => {
        ctx.fillText(rule, w - 80, 180 + idx * 50);
      });

      // Animated wave at bottom
      ctx.fillStyle = '#10b981';
      for (let i = 0; i < 40; i++) {
        const barH = Math.sin(elapsed * 3 + i * 0.3) * 20 + 25;
        ctx.fillRect(100 + i * 16, h - 70, 8, -barH);
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="modal-backdrop">
      <div className="glass-panel-elevated w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden relative border border-gold-500/40 shadow-[0_0_40px_rgba(229,184,66,0.2)]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-emerald-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-black flex items-center justify-center font-bold shadow-lg">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-arabic">
                {isArabic ? 'استوديو البث المباشر للفصل' : 'Classroom Broadcast Studio'}
              </h2>
              <p className="text-xs text-slate-400">
                {isArabic ? 'بث الشاشة والصوت وصورة الكاميرا إلى كبائن الطلاب في نفس الوقت' : 'Broadcast professor screen, voice & PiP webcam across all 25 cabins'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isBroadcasting && (
              <span className="status-badge status-in-call">
                <span className="pulse-dot bg-amber-400" />
                <span>{isArabic ? 'البث مباشر الآن' : 'ON AIR LIVE'}</span>
              </span>
            )}

            <button onClick={onClose} className="btn-icon">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Studio Controls Bar */}
        <div className="px-6 py-3 bg-emerald-950/40 border-b border-emerald-900/40 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShareScreen(!shareScreen)}
              className={`btn-outline text-xs py-2 px-3 ${shareScreen ? 'text-emerald-300 border-emerald-500/50' : 'text-slate-500'}`}
            >
              <Monitor className="w-4 h-4" />
              <span>{isArabic ? 'مشاركة الشاشة' : 'Screen Share'}</span>
            </button>

            <button
              onClick={() => setShareWebcamPiP(!shareWebcamPiP)}
              className={`btn-outline text-xs py-2 px-3 ${shareWebcamPiP ? 'text-yellow-300 border-yellow-500/50' : 'text-slate-500'}`}
            >
              {shareWebcamPiP ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
              <span>{isArabic ? 'كاميرا PiP دائرية' : 'Circular PiP Cam'}</span>
            </button>

            <button
              onClick={() => setShareMic(!shareMic)}
              className={`btn-outline text-xs py-2 px-3 ${shareMic ? 'text-emerald-300 border-emerald-500/50' : 'text-slate-500'}`}
            >
              {shareMic ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              <span>{isArabic ? 'الميكروفون' : 'Microphone'}</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Target selection */}
            <div className="flex items-center gap-1 bg-black/50 p-1 rounded-lg border border-emerald-900/40 text-xs">
              <button
                onClick={() => setBroadcastTarget('ALL')}
                className={`px-3 py-1 rounded font-semibold transition-all ${
                  broadcastTarget === 'ALL' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                }`}
              >
                {isArabic ? 'كل الـ 25 كابينة' : 'All 25 Cabins'}
              </button>
              <button
                onClick={() => setBroadcastTarget('SELECTED')}
                className={`px-3 py-1 rounded font-semibold transition-all ${
                  broadcastTarget === 'SELECTED' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                }`}
              >
                {isArabic ? 'كبائن محددة' : 'Selected Cabins'}
              </button>
            </div>

            {/* Broadcast action button */}
            {!isBroadcasting ? (
              <button onClick={handleStartBroadcast} className="btn-gold text-xs py-2 px-4">
                <Radio className="w-4 h-4 text-black" />
                <span>{isArabic ? 'بدء البث للجميع' : 'Start Broadcast'}</span>
              </button>
            ) : (
              <button onClick={handleStopBroadcast} className="btn-danger text-xs py-2 px-4">
                <span>{isArabic ? 'إنهاء البث' : 'Stop Broadcast'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Target Cabins Selector if Selected */}
        {broadcastTarget === 'SELECTED' && (
          <div className="px-6 py-2.5 bg-black/60 border-b border-emerald-900/30 flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-slate-400 flex items-center gap-1 whitespace-nowrap">
              <Users className="w-3.5 h-3.5" />
              <span>{isArabic ? 'اختر الكبائن:' : 'Select Cabins:'}</span>
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {Array.from({ length: 25 }).map((_, i) => {
                const num = i + 1;
                const isSelected = selectedCabins.includes(num);
                return (
                  <button
                    key={num}
                    onClick={() => toggleCabin(num)}
                    className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                      isSelected
                        ? 'bg-emerald-600 border-emerald-400 text-white font-bold'
                        : 'bg-emerald-950/40 border-emerald-900/50 text-slate-400 hover:text-white'
                    }`}
                  >
                    C-{String(num).padStart(2, '0')}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Live Presentation Preview & PiP */}
        <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center min-h-[450px]">
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="w-full h-full max-h-[65vh] object-contain"
          />

          {/* Draggable Circular PiP Professor Webcam */}
          {shareWebcamPiP && (
            <div
              onMouseDown={handleMouseDown}
              style={{ top: `${pipPos.y}px`, left: `${pipPos.x}px` }}
              className="pip-webcam-overlay select-none"
              title="Professor Circular Webcam PiP (Drag to position anywhere)"
            >
              <div className="w-full h-full bg-gradient-to-tr from-amber-950 to-emerald-950 flex flex-col items-center justify-center p-2 text-center">
                <div className="text-3xl mb-1">👨‍🏫</div>
                <div className="text-[10px] font-bold text-amber-300">Dr. Tariq</div>
                <div className="text-[8px] text-emerald-400 font-mono tracking-widest">PROFESSOR PiP</div>
              </div>
            </div>
          )}

          {/* Stream Overlay Status */}
          <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between bg-black/70 backdrop-blur-md px-4 py-2 rounded-xl border border-emerald-900/50 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <span className="font-semibold text-amber-300">
                {isBroadcasting
                  ? isArabic ? `جاري البث لـ (${broadcastTarget === 'ALL' ? '25 كابينة' : `${selectedCabins.length} كبائن`})` : `Broadcasting to ${broadcastTarget === 'ALL' ? 'All 25 Cabins' : `${selectedCabins.length} Selected Cabins`}`
                  : isArabic ? 'جاهز للبث' : 'Broadcast Ready (Standby)'}
              </span>
            </div>
            <div className="text-slate-400 text-[11px]">
              {shareWebcamPiP ? 'Circular PiP Overlay Active' : 'PiP Disabled'} • LAN Multicast SFU
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
