
import React, { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, Noise, Vignette } from '@react-three/postprocessing';
import ChristmasTree from './components/ChristmasTree';
import ParticleText from './components/ParticleText';
import { generateChristmasWishList } from './services/gemini';
import { ChristmasWish, AppStatus } from './types';

declare const Hands: any;
declare const Camera: any;

const App: React.FC = () => {
  const [power, setPower] = useState(false);
  const [spread, setSpread] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [isExploded, setIsExploded] = useState(false);
  const [wishPool, setWishPool] = useState<ChristmasWish[]>([]);
  const [currentWish, setCurrentWish] = useState<ChristmasWish | null>(null);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [cameraActive, setCameraActive] = useState(false);
  const [isMakeWishOpen, setIsMakeWishOpen] = useState(false);
  const [userWishText, setUserWishText] = useState('');
  const [showSantaToast, setShowSantaToast] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const handsRef = useRef<any>(null);
  const isExplodedRef = useRef(isExploded);
  const idleTimerRef = useRef<number | null>(null);
  const explosionTriggerCounter = useRef(0);

  useEffect(() => {
    isExplodedRef.current = isExploded;
  }, [isExploded]);

  useEffect(() => {
    if (!videoRef.current) return;
    let isDisposed = false;
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
      if (isDisposed) return;
      if (!results.multiHandLandmarks?.length) {
        if (!idleTimerRef.current) {
          idleTimerRef.current = window.setTimeout(() => {
            if (isDisposed) return;
            setPower(false);
            setSpread(0);
            setIsExploded(false);
            idleTimerRef.current = null;
          }, 800);
        }
        return;
      }
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      setPower(true);
      const lm = results.multiHandLandmarks[0];
      const wrist = lm[0];
      const indexTip = lm[8];
      const thumbTip = lm[4];
      const openDistance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
      const isOpenHand = openDistance > 0.12;
      const z = indexTip.z ?? wrist.z ?? 0;
      if (isOpenHand) {
        if (isExplodedRef.current) {
          if (z > -0.1) setIsExploded(false);
        } else {
          const targetSpread = Math.min(1, Math.max(0, (-z - 0.05) * 3));
          setSpread(prev => prev + (targetSpread - prev) * 0.15);
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
        setSpread(prev => prev * 0.85);
        setIsExploded(false);
        explosionTriggerCounter.current = 0;
      }
      if (!isExplodedRef.current) setRotation((wrist.x - 0.5) * 2);
    });
    handsRef.current = hands;
    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (isDisposed) return;
        if (videoRef.current && hands) {
          try { await hands.send({ image: videoRef.current }); } catch (e) {}
        }
      },
      width: 640,
      height: 480
    });
    camera.start().then(() => { if (!isDisposed) setCameraActive(true); });
    return () => {
      isDisposed = true;
      camera.stop();
      try { hands.close(); } catch (e) {}
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, []);

  const handleMagicWish = async () => {
    let pool = wishPool;
    if (pool.length === 0) {
      setStatus(AppStatus.LOADING);
      try {
        pool = await generateChristmasWishList();
        setWishPool(pool);
        setStatus(AppStatus.ACTIVE);
      } catch (err) { setStatus(AppStatus.ERROR); return; }
    }
    const randomIndex = Math.floor(Math.random() * pool.length);
    setCurrentWish(pool[randomIndex]);
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
    <div className="relative w-full h-screen bg-[#020617] selection:bg-white/20 overflow-hidden text-white uppercase font-['Outfit']">
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
          <ChristmasTree power={power} spread={spread} rotation={rotation} isExploded={isExploded} />
          <EffectComposer>
            <Bloom intensity={power ? 1.5 : 0.5} luminanceThreshold={0.2} radius={0.8} />
            <Noise opacity={0.05} />
            <Vignette eskil={false} offset={0.1} darkness={1.1} />
          </EffectComposer>
        </Canvas>
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-8 md:p-12">
        <header className="flex flex-col md:flex-row justify-between items-start pointer-events-auto">
          <div className="w-full md:w-auto flex flex-col items-start translate-y-[-10px]">
            <ParticleText text="FROHE WEIHNACHTEN" />
          </div>
          <div className="bg-white/5 backdrop-blur-xl p-4 rounded-3xl border border-white/10 hidden md:block mt-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-black mb-2">SYSTEM PHASE</p>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${cameraActive && power ? 'bg-white shadow-[0_0_8px_white]' : 'bg-red-500'}`} />
              <span className="text-xs font-bold tracking-tight">
                {!power ? 'STANDBY' : isExploded ? 'BURST' : 'ACTIVE'}
              </span>
            </div>
          </div>
        </header>

        <main className="flex flex-col items-center pointer-events-auto">
          {currentWish && status === AppStatus.ACTIVE && !isMakeWishOpen && (
            <div className="max-w-2xl w-full bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[3rem] p-12 shadow-2xl animate-in fade-in zoom-in duration-500">
              <h2 className="text-xl font-bold text-white mb-8 tracking-widest flex items-center gap-4 justify-center text-center font-geometric">
                <span className="w-8 h-[1px] bg-white/20"></span>
                {currentWish.title}
                <span className="w-8 h-[1px] bg-white/20"></span>
              </h2>
              <div className="space-y-6 text-center">
                <p className="text-2xl md:text-3xl text-white font-light italic leading-snug">
                  {currentWish.message}
                </p>
              </div>
              <div className="mt-10 pt-8 border-t border-white/5 flex justify-between items-center">
                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">GEMINI AI ENGINE</span>
                <button onClick={() => setCurrentWish(null)} className="px-4 py-2 rounded-full hover:bg-white/5 transition-colors text-xs font-bold text-white/40">DISMISS</button>
              </div>
            </div>
          )}
        </main>

        <footer className="w-full flex flex-col md:flex-row gap-8 items-center justify-between pointer-events-auto">
          <div className="flex gap-6 items-center">
            <button onClick={handleMagicWish} disabled={status === AppStatus.LOADING} className="pill-btn btn-primary group">
              <div className="grain-overlay" />
              <div className="aberration-container">
                <span className="text-base">MAGIC WISH</span>
                <span className="text-cyan" aria-hidden="true">MAGIC WISH</span>
                <span className="text-magenta" aria-hidden="true">MAGIC WISH</span>
              </div>
            </button>

            <button onClick={() => setIsMakeWishOpen(true)} className="pill-btn btn-secondary">
              <div className="grain-overlay" />
              <div className="aberration-container">
                <span className="text-base">MAKE A WISH</span>
                <span className="text-cyan" aria-hidden="true">MAKE A WISH</span>
                <span className="text-magenta" aria-hidden="true">MAKE A WISH</span>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-10">
            <div className="text-right hidden sm:block mb-1">
              <p className="text-[10px] text-white/30 font-black uppercase tracking-widest mb-1">ATMOSPHERE</p>
              <p className={`text-sm font-black tracking-tighter transition-colors duration-500 ${isExploded ? 'text-white' : power ? 'text-white/80' : 'text-white/20'}`}>
                {isExploded ? 'PEAK' : power ? `${Math.round(spread * 100)}%` : 'OFF'}
              </p>
            </div>
            <div className="relative w-48 h-32 overflow-hidden rounded-[2rem] border border-white/10 bg-black/60 shadow-2xl group">
              <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 mirror grayscale group-hover:grayscale-0 ${power ? 'opacity-40 grayscale-0' : 'opacity-20'}`} style={{ transform: 'scaleX(-1)' }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-40" />
            </div>
          </div>
        </footer>
      </div>

      {isMakeWishOpen && (
        <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="max-w-lg w-full bg-white/[0.03] border border-white/10 rounded-[3rem] p-12 shadow-[0_0_100px_rgba(255,255,255,0.05)]">
            <h3 className="text-3xl font-black text-white mb-2 tracking-tight font-geometric">WISH LIST</h3>
            <p className="text-white/40 mb-8 font-medium">SEND YOUR MESSAGE INTO THE LIGHT.</p>
            <textarea autoFocus value={userWishText} onChange={(e) => setUserWishText(e.target.value)} placeholder="I WISH FOR..." className="w-full h-40 bg-white/[0.02] border border-white/10 rounded-2xl p-6 text-xl text-white placeholder:text-white/10 focus:outline-none focus:border-white/30 transition-all resize-none mb-8 font-['Outfit']" />
            <div className="flex gap-4">
              <button onClick={handleSendToSanta} className="flex-1 bg-white text-black font-black py-5 rounded-2xl transition-all active:scale-95 font-geometric">SEND</button>
              <button onClick={() => setIsMakeWishOpen(false)} className="px-8 py-5 rounded-2xl border border-white/10 text-white/40 hover:text-white transition-all font-bold">CLOSE</button>
            </div>
          </div>
        </div>
      )}

      {showSantaToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[70] animate-in slide-in-from-top-12 duration-700 w-full max-w-lg px-6">
          <div className="bg-white text-black px-10 py-6 rounded-3xl font-black shadow-2xl flex flex-col items-center gap-1 text-center border-4 border-white/20">
            <span className="text-2xl font-geometric">愿望已送达</span>
            <span className="text-sm opacity-60 uppercase tracking-widest font-bold">WISH SENT TO THE STARS</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
