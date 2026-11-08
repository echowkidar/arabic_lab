import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getPlaybackUrl } from '../../services/api';

interface SignedAudioProps {
  type: 'student' | 'media';
  id: string;
  autoPlay?: boolean;
  video?: boolean;
  className?: string;
  mediaRef?: React.Ref<HTMLMediaElement>;
}

// Fetches a short-lived signed URL (permission-checked on the server) and
// plays it with native controls - used for previews and grading.
export const SignedAudio: React.FC<SignedAudioProps> = ({ type, id, autoPlay, video, className, mediaRef }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setError(null);
    getPlaybackUrl(type, id)
      .then((u) => { if (alive) setUrl(u); })
      .catch((e) => { if (alive) setError(e.message || 'Cannot play this file'); });
    return () => { alive = false; };
  }, [type, id]);

  if (error) return <div className="text-xs text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg p-2">{error}</div>;
  if (!url) return <div className="flex items-center gap-2 text-xs text-slate-400 p-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  return video
    ? <video ref={mediaRef as React.Ref<HTMLVideoElement>} src={url} controls autoPlay={autoPlay} className={className || 'w-full max-h-72 rounded-lg bg-black'} />
    : <audio ref={mediaRef as React.Ref<HTMLAudioElement>} src={url} controls autoPlay={autoPlay} className={className || 'w-full'} />;
};
