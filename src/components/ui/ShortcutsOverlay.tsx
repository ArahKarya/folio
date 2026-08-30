import { Modal } from "./Modal";
import { SHORTCUT_GROUPS } from "@/lib/shortcuts";

export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Keyboard shortcuts" onClose={onClose} width="34rem">
      <div className="grid gap-6 sm:grid-cols-2">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">
              {group.title}
            </h3>
            <dl className="space-y-1.5">
              {group.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3">
                  <dt className="text-[13px] text-ink">{item.label}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {item.keys.map((key) => (
                      <kbd
                        key={key}
                        className="rounded-md border border-line bg-surface2 px-1.5 py-0.5 text-[11px] text-dim"
                      >
                        {key}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
