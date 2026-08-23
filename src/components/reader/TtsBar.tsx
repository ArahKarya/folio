import { motion } from "framer-motion";
import { Pause, Play, Square } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import type { ReadAloud } from "@/lib/tts";
import { useSettings } from "@/store/settings";

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

export function TtsBar({ tts }: { tts: ReadAloud }) {
  const { behavior, setBehavior } = useSettings();
  if (!tts.speaking) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="panel absolute bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 px-2 py-1.5"
    >
      <IconButton label={tts.paused ? "Resume" : "Pause"} onClick={tts.togglePause}>
        {tts.paused ? <Play size={16} /> : <Pause size={16} />}
      </IconButton>
      <IconButton label="Stop reading" onClick={tts.stop}>
        <Square size={15} />
      </IconButton>
      <span className="mx-1 h-5 w-px bg-[var(--border)]" />
      <label className="flex items-center gap-1.5 pr-1 text-[12px] text-dim">
        Speed
        <select
          value={behavior.ttsRate}
          onChange={(event) => setBehavior({ ttsRate: Number(event.target.value) })}
          className="field h-7 w-auto py-0 text-[12px]"
        >
          {RATES.map((rate) => (
            <option key={rate} value={rate}>
              {rate}×
            </option>
          ))}
        </select>
      </label>
    </motion.div>
  );
}
