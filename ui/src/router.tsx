import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ProjectsPage } from './pages/ProjectsPage';
import { HomePage } from './pages/HomePage';
import { PlatformPage } from './pages/PlatformPage';
import { NewProjectPage } from './pages/NewProjectPage';
import { InboxPage } from './pages/InboxPage';
import { DeploymentsPage } from './pages/DeploymentsPage';
import { CatalogPage } from './pages/CatalogPage';
import { AgentsPage } from './pages/AgentsPage';
import { ProjectLayout } from './pages/project/ProjectLayout';
import { OverviewPage } from './pages/project/OverviewPage';
import { FeaturesPage } from './pages/project/FeaturesPage';
import { ModelLabPage } from './pages/project/ModelLabPage';
import { DeployPage } from './pages/project/DeployPage';
import { ArtifactsPage } from './pages/project/ArtifactsPage';
import { ActivityPage } from './pages/project/ActivityPage';
import { SettingsPage } from './pages/project/SettingsPage';
import { NotFound } from './pages/NotFound';

const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/new', element: <NewProjectPage /> },
      { path: 'inbox', element: <InboxPage /> },
      { path: 'platform', element: <PlatformPage /> },
      { path: 'deployments', element: <DeploymentsPage /> },
      { path: 'catalog', element: <CatalogPage /> },
      { path: 'agents', element: <AgentsPage /> },
      {
        path: 'projects/:projectId',
        element: <ProjectLayout />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'features', element: <FeaturesPage /> },
          { path: 'models', element: <ModelLabPage /> },
          { path: 'deploy', element: <DeployPage /> },
          { path: 'artifacts', element: <ArtifactsPage /> },
          { path: 'activity', element: <ActivityPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];

/** Memory routing is used for single-file previews where the URL cannot change. */
export const router = import.meta.env.VITE_ROUTER === 'memory' ? createMemoryRouter(routes) : createBrowserRouter(routes);
