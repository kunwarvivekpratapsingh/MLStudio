import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router-dom';
import { useDecisions, useLiveUpdates, useProjects } from '@/lib/queries';
import { Icon, Logo } from './ui';
import { Guide, useGuide } from './Guide';

const navCls = ({ isActive }: { isActive: boolean }) => `nav-item ${isActive ? 'active' : ''}`;

export function AppShell() {
  useLiveUpdates();
  const [navOpen, setNavOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setNavOpen(false), [loc.pathname]);
  const projects = useProjects();
  const decisions = useDecisions();
  const guide = useGuide();
  const projMatch = useMatch('/projects/:projectId/*');
  const activeId = projMatch?.params.projectId;
  const active = activeId && activeId !== 'new' ? projects.data?.find((p) => p.id === activeId) : undefined;

  const reviewCount = decisions.data?.length ?? 0;

  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Navigation">
        <Link to="/" className="brand">
          <Logo />
          <div>
            <b>ML Studio</b>
            <span>MLTC on VisaNet data</span>
          </div>
        </Link>
        <div className="side-cta">
          <Link to="/projects/new" className="btn gold block"><Icon name="plus" size={15} /> New project</Link>
        </div>
        <div className="side-scroll">
          <nav className="stack" style={{ gap: 2 }}>
            <NavLink end to="/" className={navCls}><Icon name="home" /> Home</NavLink>
            <NavLink to="/projects" className={({ isActive }) => navCls({ isActive: isActive && !loc.pathname.startsWith('/projects/new') })}><Icon name="folder" /> Projects</NavLink>
            <NavLink to="/inbox" className={navCls}>
              <Icon name="bell" /> Review
              {reviewCount > 0 && <span className="count">{reviewCount}</span>}
            </NavLink>
            <NavLink to="/platform" className={({ isActive }) => navCls({ isActive: isActive || ['/deployments', '/catalog', '/agents'].some((x) => loc.pathname.startsWith(x)) })}><Icon name="data" /> Platform</NavLink>
          </nav>
        </div>
        <div className="side-foot">
          <div className="avatar">PR</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--nav-fg-strong)' }}>Priya Raman</div>
            <div className="xs" style={{ color: 'var(--nav-faint)' }}>Data scientist</div>
          </div>
        </div>
      </aside>
      {navOpen && <div className="scrim" style={{ zIndex: 45 }} onClick={() => setNavOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label="Open navigation">
            <Icon name="menu" />
          </button>
          <div className="crumbs">
            {active ? (
              <>
                <Link to="/projects">Projects</Link>
                <span>/</span>
                <b>{active.name}</b>
              </>
            ) : (
              <b>{crumbFor(loc.pathname)}</b>
            )}
          </div>
          <span className="pill env" title="Agents run in the sandbox environment">Sandbox</span>
          <button className="icon-btn" onClick={guide.show} aria-label="How ML Studio works" title="How ML Studio works"><Icon name="help" /></button>
          {reviewCount > 0 && (
            <Link to="/inbox" className="btn gate sm" aria-label={`${reviewCount} items need your review`}>
              <Icon name="bell" size={14} /> {reviewCount} to review
            </Link>
          )}
        </header>
        <main className="content" id="content">
          <Outlet />
        </main>
      </div>
      {guide.open && <Guide onClose={guide.hide} />}
    </div>
  );
}

function crumbFor(path: string) {
  if (path.startsWith('/projects/new')) return 'New project';
  if (path.startsWith('/projects')) return 'Projects';
  if (path.startsWith('/inbox')) return 'Review';
  if (path.startsWith('/platform')) return 'Platform';
  if (path.startsWith('/deployments')) return 'Platform / Deployments';
  if (path.startsWith('/catalog')) return 'Platform / VisaNet data';
  if (path.startsWith('/agents')) return 'Platform / Agents and skills';
  return 'Home';
}
