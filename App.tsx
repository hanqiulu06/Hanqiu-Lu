
import React, { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, Noise, Vignette } from '@react-three/postprocessing';
import ChristmasTree from './components/ChristmasTree';
import { generateChristmasWishList } from './services/gemini';
import { ChristmasWish, AppStatus } from './types';

declare const Hands: any;
declare const Camera: any;

const App: React.FC = () => {
  // Tree state
  const [power, setPower] = useState(false);
  const [spread, setSpread] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [isExploded, setIsExploded] = useState(false);
  
  // App logic state
  const [wishPool, setWishPool] = useState<ChristmasWish[]>([]);
  const [currentWish, setCurrentWish] = useState<ChristmasWish | null>(null);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [cameraActive, setCameraActive] = useState(false);

  // UI states
  const [isMakeWishOpen, setIsMakeWishOpen] = useState(false);
  const [userWishText, setUserWishText] = useState('');
  const [showSantaToast, setShowSantaToast] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const handsRef = useRef<any>(null);

  /** -----------------------------
   * Reversible Gesture State Machine
   * ----------------------------- */
  const idleTimerRef = useRef<number | null>(null);
  const explosionTriggerCounter = useRef(0);

  useEffect(() => {
    if (!videoRef.current) return;

    const hands = new Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    hands.onResults((results: any) => {
      // 1. Check for Hand Presence (IDLE <-> AWAKENED)
      if (!results.multiHandLandmarks?.length) {
        if (!idleTimerRef.current) {
          idleTimerRef.current = window.setTimeout(() => {
            setPower(false);
            setSpread(0);
            setIsExploded(false);
            idleTimerRef.current = null;
          }, 800); // 800ms grace period before turning off
        }
        return;
      }

      // Hand detected, clear idle timer
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }

      setPower(true);

      const lm = results.multiHandLandmarks[0];
      const wrist = lm[0];
      const indexTip = lm[8];
      const thumbTip = lm[4];

      // Hand openness check
      const openDistance = Math.hypot(
        indexTip.x - thumbTip.x,
        indexTip.y - thumbTip.y
      );
      const isOpenHand = openDistance > 0.12;

      // Z depth mapping (normalized around -0.05 to -0.25)
      const z = indexTip.z ?? wrist.z ?? 0;

      // 2. BREATHING / EXPLODED Logic
      if (isOpenHand) {
        // If already exploded, check for reverse trigger (pulling back)
        if (isExploded) {
          // If hand pulled far back (Z > -0.1), revert to breathing
          if (z > -0.1) {
            setIsExploded(false);
          }
        } else {
          // Normal breathing control
          const targetSpread = Math.min(1, Math.max(0, (-z - 0.05) * 3));
          setSpread(prev => prev + (targetSpread - prev) * 0.15);

          // Push forward to trigger explosion
          if (z < -0.25) {
            explosionTriggerCounter.current += 1;
            if (explosionTriggerCounter.current > 10) {
              setIsExploded(true);
              setSpread(1);
              explosionTriggerCounter.current = 0;
            }
          } else {
            explosionTriggerCounter.current = 0;
          }
        }
      } else {
        // Hand closed: BREATHING -> AWAKENED (reset spread)
        setSpread(prev => prev * 0.85); // Shrink back
        setIsExploded(false);
        explosionTriggerCounter.current = 0;
      }

      // 3. Rotation logic (Freezes during explosion)
      if (!isExploded) {
        setRotation((wrist.x - 0.5) * 2);
      }
    });

    handsRef.current = hands;

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) await hands.send({ image: videoRef.current });
      },
      width: 640,
      height: 480
    });

    camera.start().then(() => setCameraActive(true));

    return () => {
      camera.stop();
      hands.close();
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [isExploded]); // Dependency on isExploded to allow state checks in callback

  const handleMagicWish = async () => {
    let pool = wishPool;
    if (pool.length === 0) {
      setStatus(AppStatus.LOADING);
      try {
        pool = await generateChristmasWishList();
        setWishPool(pool);
        setStatus(AppStatus.ACTIVE);
      } catch (err) {
        setStatus(AppStatus.ERROR);
        return;
      }
    }
    
    const randomIndex = Math.floor(Math.random() * pool.length);
    const nextWish = pool[randomIndex];
    setCurrentWish(nextWish);
    setStatus(AppStatus.ACTIVE);
  };

  const handleSendToSanta = () => {
    if (!userWishText.trim()) return;
    setIsMakeWishOpen(false);
    setUserWishText('');
    setShowSantaToast(true);
    setTimeout(() => setShowSantaToast(false), 5000);
  };

  return (
    <div className="relative w-full h-screen bg-[#020617] font-sans selection:bg-blue-500/30 overflow-hidden text-white">
      {/* Background 3D Scene */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
          <ChristmasTree 
            power={power} 
            spread={spread} 
            rotation={rotation} 
            isExploded={isExploded} 
          />
          <EffectComposer>
            <Bloom intensity={power ? 1.5 : 0.5} luminanceThreshold={0.2} radius={0.8} />
            <Noise opacity={0.05} />
            <Vignette eskil={false} offset={0.1} darkness={1.1} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* UI Overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6 md:p-12">
        {/* Top Header */}
        <header className="flex justify-between items-start pointer-events-auto">
          <div>
            <h1 className="text-4xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-white to-emerald-400 drop-shadow-lg tracking-tighter">
              Frohe Weihnachten
            </h1>
            <p className="text-slate-400 mt-2 max-w-md font-medium">
              Push forward to explode. Pull back to reform the tree. Close hand to dim the aura.
            </p>
          </div>
          <div className="bg-slate-900/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 hidden md:block">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Gesture Phase</p>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${cameraActive && power ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`} />
              <span className="text-xs font-bold tracking-tight">
                {!power ? 'IDLE' : isExploded ? 'EXPLODED' : spread > 0.1 ? 'BREATHING' : 'AWAKENED'}
              </span>
            </div>
          </div>
        </header>

        {/* Wish Content Display */}
        <main className="flex flex-col items-center pointer-events-auto">
          {currentWish && status === AppStatus.ACTIVE && !isMakeWishOpen && (
            <div className="max-w-2xl w-full bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-12 shadow-2xl animate-in fade-in zoom-in duration-500">
              <h2 className="text-xl font-bold text-blue-300 mb-8 tracking-widest flex items-center gap-4 justify-center text-center">
                <span className="w-8 h-[1px] bg-blue-500/30"></span>
                {currentWish.title}
                <span className="w-8 h-[1px] bg-blue-500/30"></span>
              </h2>
              <div className="space-y-6 text-center">
                <p className="text-2xl md:text-3xl text-white font-light italic leading-snug">
                  {currentWish.message}
                </p>
              </div>
              <div className="mt-10 pt-8 border-t border-white/5 flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  AI Generated • Bilingual
                </span>
                <button 
                  onClick={() => setCurrentWish(null)}
                  className="px-4 py-2 rounded-full hover:bg-white/5 transition-colors text-xs font-bold text-slate-400"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Footer Controls */}
        <footer className="w-full flex flex-col md:flex-row gap-6 items-center justify-between pointer-events-auto">
          <div className="flex gap-4">
             <button 
              onClick={handleMagicWish}
              disabled={status === AppStatus.LOADING}
              className="group relative px-10 py-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 transition-all font-black text-sm shadow-2xl shadow-indigo-500/30 active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              <span className="group-hover:rotate-12 transition-transform">✨</span>
              Magic Wish
            </button>
            <button 
              onClick={() => setIsMakeWishOpen(true)}
              className="px-10 py-5 rounded-2xl bg-amber-500 hover:bg-amber-400 transition-all font-black text-sm text-black shadow-2xl shadow-amber-500/40 active:scale-95"
            >
              🎁 Make a Wish
            </button>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Atmosphere</p>
              <p className={`text-sm font-black tracking-tighter transition-colors duration-500 ${isExploded ? 'text-blue-400 animate-pulse' : power ? 'text-emerald-400' : 'text-slate-600'}`}>
                {isExploded ? 'MAXIMUM BURST' : power ? `${Math.round(spread * 100)}% EXPANSION` : 'SYSTEM STANDBY'}
              </p>
            </div>
            
            <div className="relative w-40 h-32 overflow-hidden rounded-3xl border-2 border-white/5 bg-black/60 shadow-inner group">
               <video 
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 mirror grayscale group-hover:grayscale-0 ${power ? 'opacity-60 grayscale-0' : 'opacity-30'}`}
                style={{ transform: 'scaleX(-1)' }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-40" />
            </div>
          </div>
        </footer>
      </div>

      {/* Make a Wish Modal */}
      {isMakeWishOpen && (
        <div className="absolute inset-0 z-[60] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="max-w-lg w-full bg-slate-900 border border-yellow-500/20 rounded-[3rem] p-12 shadow-[0_0_100px_rgba(234,179,8,0.15)]">
            <h3 className="text-3xl font-black text-yellow-500 mb-2 tracking-tight">Write to Santa</h3>
            <p className="text-slate-400 mb-8 font-medium">Tell Santa what you wish for most this year.</p>
            <textarea 
              autoFocus
              value={userWishText}
              onChange={(e) => setUserWishText(e.target.value)}
              placeholder="I wish for..."
              className="w-full h-40 bg-slate-950/50 border border-white/10 rounded-2xl p-6 text-xl text-white placeholder:text-slate-700 focus:outline-none focus:border-yellow-500/50 transition-all resize-none mb-8"
            />
            <div className="flex gap-4">
              <button 
                onClick={handleSendToSanta}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black font-black py-5 rounded-2xl transition-all shadow-xl shadow-yellow-500/30 active:scale-95"
              >
                Send to Santa
              </button>
              <button 
                onClick={() => setIsMakeWishOpen(false)}
                className="px-8 py-5 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Santa Confirmation Toast */}
      {showSantaToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[70] animate-in slide-in-from-top-12 duration-700 w-full max-w-lg px-6">
          <div className="bg-emerald-500 text-black px-10 py-6 rounded-3xl font-black shadow-[0_20px_60px_rgba(16,185,129,0.4)] flex flex-col items-center gap-1 border-2 border-emerald-400 text-center">
            <span className="text-2xl">圣诞老人已经收到你的愿望了！</span>
            <span className="text-sm opacity-80 uppercase tracking-widest font-bold">Der Weihnachtsmann hat deinen Wunsch erhalten!</span>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {status === AppStatus.LOADING && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-8">
             <div className="relative">
                <div className="w-20 h-20 border-2 border-blue-500/20 rounded-full" />
                <div className="absolute inset-0 w-20 h-20 border-t-2 border-blue-400 rounded-full animate-spin shadow-[0_0_20px_rgba(96,165,250,0.5)]" />
             </div>
             <p className="text-blue-400 font-black tracking-[0.4em] uppercase text-xs animate-pulse">Summoning Joy</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
