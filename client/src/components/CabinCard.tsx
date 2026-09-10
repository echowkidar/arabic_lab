import React, { useEffect, useRef } from 'react';
import { Cabin, Language } from '../types';
import { Eye, Video, Mic, Volume2, Hand, Monitor, Camera } from 'lucide-react';
import { renderMockWorkstation, renderOfflineWorkstation } from '../services/screenSimulators';

interface CabinCardProps {
  cabin: Cabin;
  onMonitor: (cabin: Cabin) => void;
  onCall: (cabin: Cabin, type: 'VIDEO' | 'AUDIO') => void;
  language: Language;
}

export const CabinCard: React.FC<CabinCardProps> = ({ cabin, onMonitor, onCall, language }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isArabic = language === 'ar';

  const isSpeaking = cabin.online && cabin.audioLevel > 20;

  // Render animated preview canvas
  useEffect(() => {
    let startTime = Date.now();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let active = true;

    const render = () => {
      if (!active) return;
      if (cabin.online && cabin.screenData) {
        // Real screen image is rendered via <img> tag, pause canvas loop
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }
      const elapsed = (Date.now() - startTime) / 1000;

      if (cabin.online) {
        renderMockWorkstation(
          ctx,
          canvas.width,
          canvas.height,
          cabin.cabinNumber,
          cabin.student?.name || `Student ${cabin.cabinNumber}`,
          elapsed,
          isSpeaking
        );
      } else {
        renderOfflineWorkstation(
          ctx,
          canvas.width,
          canvas.height,
          cabin.cabinNumber,
          cabin.student?.name || `Student ${cabin.cabinNumber}`,
          isArabic
        );
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [cabin.cabinNumber, cabin.student?.name, isSpeaking, cabin.online, isArabic]);

  const cabinPad = String(cabin.cabinNumber).padStart(2, '0');

  return (
    <div
      className={`glass-card p-3 relative flex flex-col justify-between overflow-hidden ${
        cabin.handRaised
          ? 'hand-raised'
          : cabin.inCall
          ? 'in-call'
          : cabin.online
          ? 'active-card'
          : ''
      }`}
    >
      {/* Hand Raised Alert Banner */}
      {cabin.handRaised && (
        <div className="absolute top-0 inset-x-0 bg-gradient-to-r from-orange-600 to-amber-600 text-white text-[10px] font-bold py-0.5 px-2 flex items-center justify-center gap-1 z-20 shadow-md">
          <Hand className="w-3 h-3 animate-bounce" />
          <span>{isArabic ? 'رفع اليد — استفسار' : 'Hand Raised — Question'}</span>
        </div>
      )}

      {/* Card Header: Cabin Number & Status */}
      <div className={`flex items-center justify-between mb-2 ${cabin.handRaised ? 'mt-3.5' : ''}`}>
        <div className="flex items-center gap-2">
          <span className="font-heading font-black text-sm tracking-wider text-emerald-300 bg-emerald-950/90 px-2 py-0.5 rounded border border-emerald-500/30">
            C-{cabinPad}
          </span>
          <div className="overflow-hidden">
            <h3 className="text-xs font-semibold text-slate-100 truncate max-w-[120px]" title={cabin.student?.name || 'Unassigned'}>
              {cabin.student?.name || (isArabic ? 'غير معين' : 'Unassigned')}
            </h3>
          </div>
        </div>

        {/* Status Pill */}
        <span
          className={`status-badge text-[10px] px-2 py-0.5 ${
            cabin.online || cabin.status === 'ONLINE'
              ? 'status-online'
              : cabin.inCall || cabin.status === 'IN_CALL'
              ? 'status-in-call'
              : cabin.status === 'DISABLED'
              ? 'status-disabled'
              : 'status-offline'
          }`}
        >
          <span className="pulse-dot" />
          <span>
            {cabin.online || cabin.status === 'ONLINE'
              ? isArabic ? 'متصل' : 'Online'
              : cabin.inCall || cabin.status === 'IN_CALL'
              ? isArabic ? 'في مكالمة' : 'In Call'
              : cabin.status === 'DISABLED'
              ? isArabic ? 'معطل' : 'Disabled'
              : isArabic ? 'غير متصل' : 'Offline'}
          </span>
        </span>
      </div>

      {/* Screen Preview Canvas or Real Live Desktop */}
      <div className="relative rounded-lg overflow-hidden border border-emerald-900/40 bg-black/60 aspect-video mb-2.5 group cursor-pointer"
           onClick={() => onMonitor(cabin)}>
        {cabin.online && cabin.screenData ? (
          <img
            src={cabin.screenData}
            alt={`Cabin ${cabinPad} Live Desktop`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <canvas
            ref={canvasRef}
            width={280}
            height={158}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        )}

        {/* Hover Overlay Hint */}
        <div className="absolute inset-0 bg-emerald-950/75 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 text-emerald-300">
          <Eye className="w-5 h-5 text-emerald-400" />
          <span className="text-[11px] font-bold tracking-wide">
            {isArabic ? 'مراقبة الشاشة والصوت' : 'Silent Monitor Screen'}
          </span>
        </div>

        {/* Badges on preview */}
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
          {cabin.isWebcamActive && (
            <span className="bg-cyan-950/90 text-cyan-300 text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5 border border-cyan-500/40">
              <Camera className="w-2.5 h-2.5" />
              <span>CAM</span>
            </span>
          )}
          {cabin.online && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 font-bold ${
              cabin.screenData
                ? 'bg-emerald-600/90 text-white shadow-sm border border-emerald-400/40'
                : 'bg-black/70 text-emerald-400'
            }`}>
              <Monitor className="w-2.5 h-2.5" />
              <span>{cabin.screenData ? 'DESKTOP' : 'LIVE'}</span>
            </span>
          )}
        </div>
      </div>

      {/* Real-time Audio VU Meter */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
          <div className="flex items-center gap-1">
            <Volume2 className={`w-3 h-3 ${isSpeaking ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <span>{isArabic ? 'مستوى الصوت' : 'Audio Level'}</span>
          </div>
          <span className={`font-mono text-[9px] font-bold ${isSpeaking ? 'text-emerald-300' : 'text-slate-500'}`}>
            {cabin.online ? `${cabin.audioLevel}%` : '0%'}
          </span>
        </div>

        {/* 10-Segment VU Bar */}
        <div className="grid grid-cols-10 gap-1 h-1.5">
          {Array.from({ length: 10 }).map((_, idx) => {
            const threshold = (idx + 1) * 10;
            const active = cabin.online && cabin.audioLevel >= threshold;
            let color = 'bg-emerald-500';
            if (idx >= 7) color = 'bg-yellow-400';
            if (idx >= 9) color = 'bg-red-500';

            return (
              <div
                key={idx}
                className={`h-full rounded-sm transition-colors duration-100 ${
                  active ? color : 'bg-emerald-950/60'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-emerald-900/40">
        {/* Silent Monitor */}
        <button
          onClick={() => onMonitor(cabin)}
          className="btn-outline text-[11px] py-1.5 px-2 flex items-center justify-center gap-1 text-emerald-300 hover:text-white"
          title="Silent Screen & Audio Monitor (Without Student Notification)"
        >
          <Eye className="w-3.5 h-3.5 text-cyan-400" />
          <span>{isArabic ? 'مراقبة' : 'Monitor'}</span>
        </button>

        {/* 1:1 Video Call */}
        <button
          onClick={() => onCall(cabin, 'VIDEO')}
          className="btn-outline text-[11px] py-1.5 px-2 flex items-center justify-center gap-1 text-yellow-300 hover:text-white hover:border-yellow-400/50"
          title="Start 1:1 Video Call"
        >
          <Video className="w-3.5 h-3.5 text-yellow-400" />
          <span>{isArabic ? 'فيديو' : 'Video'}</span>
        </button>

        {/* 1:1 Audio Call */}
        <button
          onClick={() => onCall(cabin, 'AUDIO')}
          className="btn-outline text-[11px] py-1.5 px-2 flex items-center justify-center gap-1 text-slate-300 hover:text-white"
          title="Start 1:1 Audio Call"
        >
          <Mic className="w-3.5 h-3.5 text-emerald-400" />
          <span>{isArabic ? 'صوت' : 'Audio'}</span>
        </button>
      </div>
    </div>
  );
};
