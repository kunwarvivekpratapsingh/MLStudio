import { useState } from 'react';
import { useCatalog } from '@/lib/queries';
import { LoadingBlock } from '@/components/ui';

export function CatalogPage() {
  const { data } = useCatalog();
  const [sel, setSel] = useState('vn_authorization');
  const t = data?.find((x) => x.name === sel);
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>VisaNet data</h1>
          <p>The tables agents can read when a project includes them. Agents only see tables listed in a project’s constraints, and always through tokenized identifiers.</p>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="card files">
          {!data && <LoadingBlock />}
          {data?.map((x) => (
            <div key={x.name} className={`file ${x.name === sel ? 'sel' : ''}`} role="button" tabIndex={0} onClick={() => setSel(x.name)} onKeyDown={(e) => e.key === 'Enter' && setSel(x.name)} style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
              <span className="nm">{x.name}</span>
              <span className="meta" style={{ gridColumn: 1 }}>{x.rows} rows · fresh {x.freshness}</span>
            </div>
          ))}
        </div>
        {t && (
          <div className="card">
            <div className="card-head"><div className="grow"><h3 className="mono">{t.name}</h3><div className="faint small">{t.description}</div></div><span className="chip">Join on {t.joinKeys.join(', ')}</span></div>
            <div className="tbl-wrap">
              <table className="t">
                <thead><tr><th>Column</th><th>Type</th><th>Meaning</th></tr></thead>
                <tbody>{t.columns.map((c) => <tr key={c.name}><td className="mono">{c.name}</td><td className="faint">{c.type}</td><td>{c.description}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
