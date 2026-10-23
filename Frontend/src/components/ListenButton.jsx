import React, { useState, useRef, useEffect } from 'react';
import { Volume2, Square, Loader2, AlertCircle } from 'lucide-react';
import { BASE_URL } from '../api/client';

export const ListenButton = ({ segmentId }) => {
  const [state, setState] = useState('idle'); // 'idle' | 'loading' | 'playing' | 'error'
  const audioRef = useRef(null);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  const handleClick = async () => {
    if (state === 'playing') {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setState('idle');
      return;
    }

    // Stop any globally playing audio (simplified approach for this component)
    document.querySelectorAll('audio').forEach((el) => {
      if (el !== audioRef.current) el.pause();
    });

    setState('loading');
    
    try {
      const url = `${BASE_URL}/voice-alert?segment_id=${segmentId || ''}`;
      
      if (!audioRef.current) {
        audioRef.current = new Audio(url);
        audioRef.current.onended = () => setState('idle');
        audioRef.current.onerror = () => setState('error');
      } else {
        audioRef.current.src = url;
      }

      await audioRef.current.play();
      setState('playing');
    } catch (err) {
      console.error('Audio playback failed', err);
      setState('error');
      // Auto-hide error after 3 seconds
      setTimeout(() => {
        if (state !== 'idle') setState('idle');
      }, 3000);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-mist bg-snow text-ink hover:bg-glacier active:bg-mist transition-colors focus:outline-none focus:ring-2 focus:ring-river focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
      aria-label="Listen to voice alert"
    >
      {state === 'idle' && (
        <>
          <Volume2 className="w-5 h-5 text-river" />
          <span className="font-sans text-sm font-medium">Listen</span>
        </>
      )}
      {state === 'loading' && (
        <>
          <Loader2 className="w-5 h-5 text-granite animate-spin" />
          <span className="font-sans text-sm font-medium">Loading...</span>
        </>
      )}
      {state === 'playing' && (
        <>
          <Square className="w-4 h-4 fill-current text-river" />
          <span className="font-sans text-sm font-medium">Stop</span>
        </>
      )}
      {state === 'error' && (
        <>
          <AlertCircle className="w-5 h-5 text-risk-severe" />
          <span className="font-sans text-sm font-medium">Unavailable</span>
        </>
      )}
    </button>
  );
};
