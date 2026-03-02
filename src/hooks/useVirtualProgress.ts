import { useMemo, useEffect, useState } from "react";
import { ReportLog } from "@/hooks/useReportLogs";

interface VirtualPhase {
  label: string;
  progress: number;
}

const PHASES: VirtualPhase[] = [
  { label: "Initializing...", progress: 3 },
  { label: "Preparing prompt and context...", progress: 10 },
  { label: "Calling Claude API...", progress: 20 },
  { label: "Waiting for AI response...", progress: 40 },
  { label: "Processing result...", progress: 55 },
  { label: "Validating references...", progress: 65 },
  { label: "Checking sources with AI...", progress: 78 },
  { label: "Saving report...", progress: 90 },
  { label: "Report generation complete", progress: 100 },
];

const PHASE_TRIGGERS: [string, number][] = [
  ["Preparing prompt", 1],
  ["Calling Claude API", 2],
  ["Waiting for AI", 3],
  ["Claude response received", 4],
  ["Validating references", 5],
  ["Running AI verification", 6],
  ["Reference validation complete", 7],
  ["Report saved", 7],
  ["Report generation complete", 8],
];

/**
 * For single-step (Claude) runs, derives virtual progress phases from log messages.
 * Between phases, slowly interpolates progress to prevent the bar from appearing frozen.
 */
export function useVirtualProgress(logs: ReportLog[], isRunning: boolean) {
  const [interpolated, setInterpolated] = useState(0);

  // Determine phase index from latest matching log
  const phaseIndex = useMemo(() => {
    let idx = 0;
    for (const log of logs) {
      const msg = log.message;
      for (const [trigger, phase] of PHASE_TRIGGERS) {
        if (msg.includes(trigger) && phase > idx) {
          idx = phase;
        }
      }
    }
    return idx;
  }, [logs]);

  const phase = PHASES[phaseIndex];
  const nextPhase = phaseIndex < PHASES.length - 1 ? PHASES[phaseIndex + 1] : null;

  // Slowly interpolate between current phase progress and next phase progress
  useEffect(() => {
    setInterpolated(phase.progress);

    if (!isRunning || !nextPhase) return;

    // Creep forward at ~1% every 3 seconds, up to 80% of the gap to next phase
    const gap = nextPhase.progress - phase.progress;
    const maxCreep = phase.progress + gap * 0.8;
    
    const timer = setInterval(() => {
      setInterpolated((prev) => {
        if (prev >= maxCreep) return prev;
        return Math.min(prev + 1, maxCreep);
      });
    }, 3000);

    return () => clearInterval(timer);
  }, [phaseIndex, isRunning, phase.progress, nextPhase]);

  return {
    progress: interpolated,
    phaseLabel: phase.label,
    phaseIndex,
    isWaitingForAI: phaseIndex >= 2 && phaseIndex <= 3,
    isValidatingRefs: phaseIndex >= 5 && phaseIndex <= 6,
  };
}
