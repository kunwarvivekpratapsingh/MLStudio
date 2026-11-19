import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ArtifactMeta } from '@/api';
import { useArtifact, useArtifacts } from '@/lib/queries';
import { AGENT_META, LOOPS, timeAgo } from '@/lib/format';
import { AgentBadge, CodeBlock, Empty, Icon, LoadingBlock, Markdown } from '@/components/ui';
import { useProjectCtx } from './ProjectLayout';

const GROUPS: { key: ArtifactMeta['loop']; label: string; color: string }[] = [
  { key: 'project', label: 'project/', color: 'var(--accent)' },
  { key: 'features', label: `features/ · Loop ${LOOPS.features.n}`, color: 'var(--features)' },
  { key: 'models', label: `models/ · Loop ${LOOPS.models.n}`, color: 'var(--models)' },
  { key: 'deploy', label: `deploy/ · Loop ${LOOPS.deploy.n}`, color: 'var(--deploy)' },
];

export function ArtifactsPage() {
  const { project: p } = useProjectCtx();
  const list = useArtifacts(p.id);
  const [sp, setSp] = useSearchParams();
  const path = sp.get('path');
  const art = useArtifact(p.id, path);
  useEffect(() => {
    if (!path && list.data?.length) setSp({ path: list.data[0].path }, { replace: true });
  }, [path, list.data, setSp]);

  function download() {
    if (!art.data) return;
    const blob = new Blob([art.data.content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = art.data.path.split('/').pop()!;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h2 style={{ fontSize: 20 }}>Artifacts</h2>
          <p>Every file the agents write for this project, versioned. These are the same files the <span className="mono">/mltc</span> skills produce in Claude Code.</p>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 300px) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="card files" style={{ paddingBottom: 8 }}>
          {list.isLoading && <LoadingBlock />}
          {GROUPS.map((g) => {
            const items = list.data?.filter((a) => a.loop === g.key) ?? [];
            if (!items.length) return null;
            return (
              <div key={g.key}>
                <div className="folder"><span className="dot" style={{ background: g.color }} />{g.label}</div>
                {items.map((a) => (
                  <div key={a.path} className={`file ${a.path === path ? 'sel' : ''}`} role="button" tabIndex={0} onClick={() => setSp({ path: a.path })} onKeyDown={(e) => e.key === 'Enter' && setSp({ path: a.path })}>
                    <Icon name="file" size={15} />
                    <span className="nm ellipsis">{a.path.split('/')[1]}</span>
                    <span className="meta">v{a.version} · {timeAgo(a.updatedAt)} · {AGENT_META[a.producedBy].name}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <div className="card">
          {!path || art.isLoading ? <LoadingBlock rows={10} /> : art.error ? <Empty title="This artifact isn’t available yet">The agent that writes it hasn’t run for this project.</Empty> : art.data && (
            <>
              <div className="card-head">
                <AgentBadge agent={art.data.producedBy} size={26} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontWeight: 600 }}>{art.data.path}</div>
                  <div className="faint xs">{art.data.description} · v{art.data.version} · updated {timeAgo(art.data.updatedAt)} by {AGENT_META[art.data.producedBy].name} · {(art.data.sizeBytes / 1024).toFixed(1)} KB</div>
                </div>
                <button className="btn sm" onClick={download}><Icon name="download" size={13} /> Download</button>
              </div>
              <div className="card-pad">
                {art.data.kind === 'markdown' ? <Markdown>{art.data.content}</Markdown> : <CodeBlock code={art.data.content} />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
