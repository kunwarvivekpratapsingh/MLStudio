import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentId, LoopId, LoopState, ProjectStatus, LoopStatus } from '@/api';
import { AGENT_META, LOOP_STATUS, LOOPS, PROJECT_STATUS, loopColor } from '@/lib/format';

/* ---------------- Icons ---------------- */
const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  plus: 'M12 5v14M5 12h14',
  rocket: 'M12 3c3 2 5 5.5 5 9.5L15 15H9l-2-2.5C7 8.5 9 5 12 3zM9 15l-2 4 3-1M15 15l2 4-3-1',
  data: 'M4 5.5C4 4.1 7.6 3 12 3s8 1.1 8 2.5S16.4 8 12 8 4 6.9 4 5.5zM4 5.5v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-6M4 11.5v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-6',
  bot: 'M5 8h14v11H5zM12 4v4M9 13h.01M15 13h.01',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12 4 4 10-10',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 5v14l12-7z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  send: 'M4 12 20 4l-6 16-3-7z',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  lock: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
  flask: 'M9 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4A1.5 1.5 0 0 0 20 19l-5-10V3M8 3h8',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
};
export function Icon({ name, size = 16 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

export function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1434cb" />
      <circle cx="16" cy="16" r="10" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="6" fill="none" stroke="#ffffff" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="2.6" fill="#f7b600" />
    </svg>
  );
}

/* ---------------- Status ---------------- */
export function ProjectStatusPill({ status }: { status: ProjectStatus }) {
  const s = PROJECT_STATUS[status];
  return <span className={`pill ${s.cls} ${s.live ? 'live' : ''}`}>{s.label}</span>;
}
export function LoopStatusPill({ status }: { status: LoopStatus }) {
  const s = LOOP_STATUS[status];
  return <span className={`pill ${s.cls} ${s.live ? 'live' : ''}`}>{s.label}</span>;
}
export function statusDotColor(status: ProjectStatus) {
  return { draft: 'var(--line-2)', running: 'var(--accent)', needs_review: 'var(--gate)', paused: 'var(--warn)', deployed: 'var(--good)', failed: 'var(--bad)' }[status];
}

export function PipelineMini({ loops }: { loops: Record<LoopId, LoopState> }) {
  return (
    <div className="pipe-mini" aria-label="Loop progress">
      {(Object.keys(LOOPS) as LoopId[]).map((k) => (
        <i key={k} className={loops[k].status} title={`${LOOPS[k].label}: ${LOOP_STATUS[loops[k].status].label}`}>
          <u style={{ width: `${Math.max(loops[k].status === 'not_started' ? 0 : 6, loops[k].progress * 100)}%`, background: loops[k].status === 'waiting' ? 'var(--gate)' : LOOPS[k].color }} />
        </i>
      ))}
    </div>
  );
}

export function AgentBadge({ agent, size = 30 }: { agent: AgentId; size?: number }) {
  const m = AGENT_META[agent];
  const { c, s } = loopColor(m.loop);
  return (
    <span className="agent-badge" style={{ width: size, height: size, background: s, color: c, fontSize: size < 26 ? 9.5 : 11 }} title={m.name}>
      {m.ab}
    </span>
  );
}

export function Bar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }} />
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}
export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack card-pad" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={14} w={`${90 - i * 12}%`} />)}
    </div>
  );
}
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p style={{ maxWidth: '52ch' }}>{children}</p>}
      {action}
    </div>
  );
}
export function ErrorBlock({ error }: { error: unknown }) {
  return (
    <div className="callout warn" role="alert">
      <div>
        <b>Couldn’t load this.</b> <span className="muted">{error instanceof Error ? error.message : String(error)}</span>
      </div>
    </div>
  );
}

/* ---------------- Drawer ---------------- */
export function Drawer({ title, eyebrow, onClose, children, actions }: { title: ReactNode; eyebrow?: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div className="grow stack" style={{ gap: 4 }}>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 style={{ wordBreak: 'break-word' }}>{title}</h2>
          </div>
          {actions}
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

/* ---------------- Markdown and code ---------------- */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const toast = useToast();
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        {label && <span className="eyebrow grow">{label}</span>}
        <button
          className="btn sm ghost"
          onClick={() =>
            navigator.clipboard
              .writeText(code)
              .then(() => toast('Copied to clipboard'))
              .catch(() => toast('Copy is blocked here. Select the text instead.'))
          }
        >
          <Icon name="copy" size={13} /> Copy
        </button>
      </div>
      <pre className="code">{code}</pre>
    </div>
  );
}

/* ---------------- Toasts ---------------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className="toast">{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="toggle" onClick={() => onChange(!checked)} />;
}
