import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Info } from "lucide-react";
import { create } from "zustand";

type ToastKind = "info" | "success" | "error";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, kind, message }] });
    // Errors stay long enough to be read twice; confirmations get out of the way.
    setTimeout(() => get().dismiss(id), kind === "error" ? 7000 : 3200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}));

/** Imperative helper so non-component code can raise a message. */
export const toast = {
  info: (message: string) => useToastStore.getState().push("info", message),
  success: (message: string) => useToastStore.getState().push("success", message),
  error: (message: string) => useToastStore.getState().push("error", message),
};

const ICONS: Record<ToastKind, typeof Info> = {
  info: Info,
  success: Check,
  error: AlertTriangle,
};

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((item) => {
          const Icon = ICONS[item.kind];
          return (
            <motion.button
              key={item.id}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => dismiss(item.id)}
              className="panel pointer-events-auto flex max-w-[min(30rem,90vw)] items-start gap-2.5 px-4 py-2.5 text-left text-[13px]"
            >
              <Icon
                size={16}
                className={
                  item.kind === "error"
                    ? "mt-px text-red-400"
                    : item.kind === "success"
                      ? "mt-px text-emerald-400"
                      : "mt-px text-accent"
                }
              />
              <span className="text-ink">{item.message}</span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
