import { useEffect, useState } from 'react';
import Header from './Header';
import Footer from './Footer';
import { OrgCard, initialOrgData, normalizeOrgData } from './Chart';
import { getOrgChartConfig } from '../utils/orgChartService';
import './Chart.css';
import './OrganizationalChartView.css';
import OrgChartLayout from './OrgChartLayout';
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy } from '../utils/landingLanguage';

export default function OrganizationalChartView() {
  const { language } = useLandingContent();
  const copy = getLandingUiCopy(language);
  const [orgData, setOrgData] = useState(initialOrgData);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadChartConfig = async () => {
      const { data, error } = await getOrgChartConfig();

      if (!isMounted) return;

      if (!error && data) {
        setOrgData(normalizeOrgData(data));
      }

      setIsLoading(false);
    };

    loadChartConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      <Header />

      <main className="org-chart-page" id="main-content">
        <div className="org-chart-page-container">
          <div className="org-chart-page-header">
            <p className="org-chart-page-eyebrow">{copy.publicInformation}</p>
            <h2>{copy.organizationalChart}</h2>
            <p className="org-chart-page-note">
              {copy.organizationalChartNote}
            </p>
          </div>

          <OrgChartLayout
            data={orgData}
            loadingMessage={isLoading ? copy.loadingOrganizationalChart : undefined}
            renderNode={node => <OrgCard node={node} editMode={false} canEdit={false} />}
          />
        </div>
      </main>

      <Footer />
    </>
  );
}
