import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface IntroSplashProps {
  brandName?: string;
  durationMs?: number;
  onComplete?: () => void;
}

export default function IntroSplash({
  brandName = "THREAD DEN",
  durationMs = 5000,
  onComplete,
}: IntroSplashProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const exitLeadMs = 600;
    const exitStartMs = Math.max(800, durationMs - exitLeadMs);
    const startTime = performance.now();

    let rafId = 0;
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const pct = Math.min(100, Math.round((elapsed / exitStartMs) * 100));
      setProgress(pct);
      if (elapsed < exitStartMs) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);

    const exitTimer = window.setTimeout(() => {
      setProgress(100);
      setIsExiting(true);
    }, exitStartMs);

    const doneTimer = window.setTimeout(() => {
      setIsVisible(false);
      document.body.style.overflow = previousOverflow;
      onComplete?.();
    }, durationMs);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [durationMs, onComplete]);

  const handleSkip = () => {
    if (isExiting) return;
    setProgress(100);
    setIsExiting(true);
    window.setTimeout(() => {
      setIsVisible(false);
      document.body.style.overflow = "";
      onComplete?.();
    }, 350);
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="thread-den-intro-splash"
        initial={{ opacity: 1 }}
        animate={isExiting ? { opacity: 0, scale: reducedMotion ? 1 : 1.02 } : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center select-none overflow-hidden px-6"
        aria-label={`${brandName} loading screen`}
        role="status"
        id="intro-splash-screen"
      >
        {/* Subtle studio radial ambient glow behind emblem */}
        <motion.div
          initial={{ opacity: 0, scale: 0.75 }}
          animate={{ opacity: 0.22, scale: 1.05 }}
          transition={{ duration: 2.2, ease: "easeOut" }}
          className="absolute w-[420px] h-[420px] sm:w-[560px] sm:h-[560px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.28) 0%, rgba(16,185,129,0.08) 42%, rgba(0,0,0,0) 72%)",
          }}
        />

        {/* Animated fine silk stitch framing lines */}
        {!reducedMotion && (
          <svg
            viewBox="0 0 600 180"
            className="absolute w-[min(90vw,560px)] h-auto pointer-events-none opacity-30"
            fill="none"
            aria-hidden="true"
          >
            <motion.path
              d="M 20 92 Q 160 28 300 90 T 580 88"
              stroke="url(#threadGlowGradient)"
              strokeWidth="1.2"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: [0, 0.9, 0.45] }}
              transition={{ duration: 3.0, ease: [0.22, 1, 0.36, 1] }}
            />
            <defs>
              <linearGradient id="threadGlowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                <stop offset="35%" stopColor="rgba(255,255,255,0.85)" />
                <stop offset="65%" stopColor="rgba(16,185,129,0.8)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
            </defs>
          </svg>
        )}

        {/* Center Brand Reveal Stage */}
        <div className="relative z-10 flex flex-col items-center justify-center max-w-md w-full text-center">
          {/* Official THREAD DEN White Monogram Emblem Animation */}
          <motion.div
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.86, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-64 sm:w-80 flex items-center justify-center"
          >
            {!imgFailed ? (
              <motion.img
                src="/assets/aistudio/logo_monogram_white.png"
                alt={`${brandName} Logo`}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                animate={
                  reducedMotion
                    ? undefined
                    : {
                        scale: [1, 1.03, 1],
                        filter: [
                          "drop-shadow(0 0 0px rgba(255,255,255,0))",
                          "drop-shadow(0 0 22px rgba(255,255,255,0.22))",
                          "drop-shadow(0 0 10px rgba(255,255,255,0.12))",
                        ],
                      }
                }
                transition={{ duration: 3.2, delay: 0.9, ease: "easeInOut" }}
                className="w-full h-auto object-contain select-none"
              />
            ) : (
              <div className="py-10 space-y-2">
                <span className="font-display font-black tracking-[0.28em] text-4xl sm:text-5xl text-white block">
                  {brandName}
                </span>
                <span className="font-mono text-xs tracking-[0.35em] text-zinc-400 uppercase block">
                  Wear Your Story
                </span>
              </div>
            )}
          </motion.div>

          {/* Expanding Stitch Divider + Progress Track */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.75, ease: "easeOut" }}
            className="mt-8 w-56 sm:w-64 space-y-2.5"
          >
            <div className="h-[2px] w-full bg-zinc-900 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-zinc-400 via-white to-emerald-400 rounded-full transition-transform duration-100 ease-linear origin-left"
                style={{ transform: `scaleX(${progress / 100})` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 tabular-nums">
              <span className="tracking-widest uppercase">Curating Atelier</span>
              <span className="text-zinc-300 font-semibold">{progress}%</span>
            </div>
          </motion.div>
        </div>

        {/* Accessible Skip Control */}
        <motion.button
          type="button"
          onClick={handleSkip}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          whileHover={{ opacity: 1 }}
          transition={{ delay: 1.0, duration: 0.4 }}
          className="fixed bottom-6 right-6 min-h-10 px-4 py-2 rounded-xl border border-zinc-800 bg-zinc-950/80 text-xs font-mono text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
          id="skip-intro-splash-btn"
        >
          Skip Intro
        </motion.button>
      </motion.div>
    </AnimatePresence>
  );
}
