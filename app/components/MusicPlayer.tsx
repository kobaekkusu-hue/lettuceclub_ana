'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Music, Volume2, VolumeX, AlertCircle, Loader2 } from 'lucide-react';

interface Track {
  id: string;
  name: string;
  url: string;
  type: 'ambient' | 'music';
}

export default function MusicPlayer() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [volume, setVolume] = useState(0.3); // デフォルト音量は少し控えめ
  const [isMuted, setIsMuted] = useState(false);
  const [hasError, setHasError] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrack = tracks[currentTrackIndex];

  // 音声ファイル一覧の取得
  useEffect(() => {
    async function fetchTracks() {
      try {
        const response = await fetch('/api/audio');
        if (response.ok) {
          const data = await response.json();
          setTracks(data);
        }
      } catch (err) {
        console.error('Failed to load tracks:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchTracks();
  }, []);

  // 音声の初期化と切り替え
  useEffect(() => {
    if (!currentTrack) return;

    // 既存の音声を停止
    if (audioRef.current) {
      audioRef.current.pause();
    }

    setHasError(false);
    audioRef.current = new Audio(currentTrack.url);
    audioRef.current.loop = true;
    audioRef.current.volume = isMuted ? 0 : volume;

    // トラック切り替え時、すでに再生中だった場合は再生を引き継ぐ
    if (isPlaying) {
      playAudio();
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [currentTrackIndex, tracks]);

  // ボリューム・ミュート設定の同期
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const playAudio = async () => {
    if (!audioRef.current) return;
    try {
      setHasError(false);
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (err) {
      console.warn('Audio play failed:', err);
      setHasError(true);
      setIsPlaying(false);
    }
  };

  const pauseAudio = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  };

  const handleTrackChange = (index: number) => {
    handlePlayStateChange(false);
    setCurrentTrackIndex(index);
    // トラック切り替え後に自動的に再生開始を試みる
    setTimeout(() => {
      playAudio();
    }, 100);
  };

  // 内部状態を一貫させるヘルパー
  const handlePlayStateChange = (playing: boolean) => {
    if (!playing && audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(playing);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  // トラックがない、またはロード中の場合はコントロールを無効化
  const isControlDisabled = isLoading || tracks.length === 0;

  return (
    <div className="fixed bottom-6 left-6 z-50 font-sans">
      {/* フローティングBGMコントロールパネル */}
      {isOpen && (
        <div className="mb-3 w-72 glass-panel p-4 bg-emerald-900/95 dark:bg-gray-900/95 text-white border border-emerald-500/20 shadow-2xl animate-fade-in rounded-2xl">
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-emerald-800/50">
            <h4 className="text-sm font-extrabold flex items-center gap-2 text-white">
              <Music className="w-4 h-4 text-emerald-300" />
              森のヒーリングBGM
            </h4>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-xs text-emerald-200 hover:text-white font-bold transition-colors underline decoration-emerald-400/50"
            >
              閉じる
            </button>
          </div>

          {/* トラック選択リスト / ロード中表示 */}
          <div className="mb-3.5">
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-emerald-300 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">音源スキャン中...</span>
              </div>
            ) : tracks.length === 0 ? (
              <div className="text-xs text-emerald-300 py-4 text-center leading-relaxed bg-emerald-950/40 rounded-xl border border-emerald-800/30 px-3">
                再生可能な音源がありません。
                <br />
                <code className="text-white bg-emerald-950 px-1 py-0.5 rounded text-[10px]">public/audio/</code> フォルダに
                <br />
                .mp3 ファイルを配置してください。
              </div>
            ) : (
              <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                {tracks.map((track, idx) => (
                  <button
                    key={track.id}
                    onClick={() => handleTrackChange(idx)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex justify-between items-center transition-all ${
                      currentTrackIndex === idx
                        ? 'bg-emerald-700/80 font-bold text-white shadow-inner border border-emerald-500/30'
                        : 'hover:bg-emerald-800/40 text-emerald-200 hover:text-white'
                    }`}
                  >
                    <span className="truncate pr-2">{track.name}</span>
                    {currentTrackIndex === idx && isPlaying && (
                      <span className="flex gap-0.5 items-end h-3 shrink-0">
                        <span className="w-0.5 bg-emerald-300 animate-[eq-bar_0.8s_infinite_ease-in-out]"></span>
                        <span className="w-0.5 bg-emerald-300 animate-[eq-bar_0.5s_infinite_ease-in-out_0.2s]"></span>
                        <span className="w-0.5 bg-emerald-300 animate-[eq-bar_0.7s_infinite_ease-in-out_0.1s]"></span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* コントロールエリア */}
          <div className={`flex items-center gap-3 ${isControlDisabled ? 'opacity-40 pointer-events-none' : ''}`}>
            {/* 再生/一時停止 */}
            <button
              onClick={togglePlay}
              disabled={isControlDisabled}
              className="p-2.5 bg-white text-emerald-900 hover:bg-emerald-100 rounded-full shadow-lg transition-transform active:scale-95 flex-shrink-0 disabled:opacity-50"
              title={isPlaying ? '一時停止' : '再生'}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-emerald-900" /> : <Play className="w-4 h-4 fill-emerald-900 ml-0.5" />}
            </button>

            {/* 音量調整 */}
            <div className="flex items-center gap-2 flex-1">
              <button 
                onClick={toggleMute}
                disabled={isControlDisabled}
                className="text-emerald-300 hover:text-white transition-colors"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                disabled={isControlDisabled}
                onChange={(e) => {
                  setVolume(parseFloat(e.target.value));
                  if (isMuted) setIsMuted(false);
                }}
                className="w-full accent-emerald-400 h-1 bg-emerald-950 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* 音声ファイルエラー表示 */}
          {hasError && !isControlDisabled && (
            <div className="mt-3 p-2 bg-emerald-950/70 border border-emerald-500/20 rounded-xl flex items-start gap-1.5 text-[10px] text-emerald-300 leading-tight">
              <AlertCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                音声ファイルの再生に失敗しました。
                <br />
                ファイル <code className="text-white">{currentTrack.name}.mp3</code> が正しく配置されているかご確認ください。
              </span>
            </div>
          )}
        </div>
      )}

      {/* フローティング BGM アイコンボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-3.5 rounded-full shadow-2xl transition-all duration-300 flex items-center justify-center border ${
          isPlaying
            ? 'bg-emerald-700 text-white border-emerald-500 animate-[pulse_2s_infinite] scale-105'
            : 'bg-emerald-800 text-emerald-200 border-emerald-700 hover:bg-emerald-700 hover:text-white hover:scale-105'
        }`}
        title="BGMプレイヤーを開く"
      >
        <Music className={`w-5 h-5 ${isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`} />
      </button>
    </div>
  );
}
