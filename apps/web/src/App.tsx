import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell.js';
import { CompanySelectPage } from './pages/CompanySelectPage.js';
import { OverviewPage } from './pages/OverviewPage.js';
import { ArchitecturePage } from './pages/ArchitecturePage.js';
import { DomainModelPage } from './pages/DomainModelPage.js';
import { ExecutionFlowsPage } from './pages/ExecutionFlowsPage.js';
import { ReviewPage } from './pages/ReviewPage.js';
import { PersonasJourneysPage } from './pages/PersonasJourneysPage.js';
import { BacklogPage } from './pages/BacklogPage.js';
import { DeploymentPage } from './pages/DeploymentPage.js';
import { NfrPage } from './pages/NfrPage.js';
import { IntegrationsPage } from './pages/IntegrationsPage.js';
import { GapAnalysisPage } from './pages/GapAnalysisPage.js';
import { DriftHistoryPage } from './pages/DriftHistoryPage.js';
import { GraphExplorerPage } from './pages/GraphExplorerPage.js';
import { CorrelationExplorerPage } from './pages/CorrelationExplorerPage.js';
import { SystemMapPage } from './pages/SystemMapPage.js';
import { AgentPipelinePage } from './pages/AgentPipelinePage.js';
import {
  getActiveCompany,
  hasSelectedCompany,
  setActiveCompany,
  type CompanyId,
} from './data/index.js';

export function App(): JSX.Element {
  const [companyId, setCompanyId] = useState<CompanyId>(getActiveCompany());
  const [hasChosen, setHasChosen] = useState<boolean>(hasSelectedCompany());

  function selectCompany(id: CompanyId): void {
    setActiveCompany(id);
    setCompanyId(id);
    setHasChosen(true);
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/select"
          element={
            <CompanySelectPage
              selectedCompany={hasChosen ? companyId : null}
              onSelect={selectCompany}
            />
          }
        />
        <Route
          path="/*"
          element={
            hasChosen ? (
              // Keying on companyId remounts the whole shell (including the
              // global search index and every page's data fetch) whenever
              // the selected company changes, so nothing shows stale data
              // from the previously selected company.
              <AppShell key={companyId} companyId={companyId}>
                <Routes>
                  <Route path="/" element={<OverviewPage />} />
                  <Route path="/graph" element={<GraphExplorerPage />} />
                  <Route path="/correlation" element={<CorrelationExplorerPage />} />
                  <Route path="/system-map" element={<SystemMapPage />} />
                  <Route path="/agents" element={<AgentPipelinePage />} />
                  <Route path="/architecture" element={<ArchitecturePage />} />
                  <Route path="/domains" element={<DomainModelPage />} />
                  <Route path="/deployment" element={<DeploymentPage />} />
                  <Route path="/integrations" element={<IntegrationsPage />} />
                  <Route path="/nfrs" element={<NfrPage />} />
                  <Route path="/personas" element={<PersonasJourneysPage />} />
                  <Route path="/backlog" element={<BacklogPage />} />
                  <Route path="/flows" element={<ExecutionFlowsPage />} />
                  <Route path="/gaps" element={<GapAnalysisPage />} />
                  <Route path="/drift" element={<DriftHistoryPage />} />
                  <Route path="/review" element={<ReviewPage />} />
                </Routes>
              </AppShell>
            ) : (
              <Navigate to="/select" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
