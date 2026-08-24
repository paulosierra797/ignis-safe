import { useEffect, useState } from 'react';
import Header from './Header';
import Footer from './Footer';
import { OrgCard, initialOrgData, normalizeOrgData } from './Chart';
import { getOrgChartConfig } from '../utils/orgChartService';
import './Chart.css';
import './OrganizationalChartView.css';
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

      <section className="org-chart-page" id="main-content">
        <div className="org-chart-page-container">
          <div className="org-chart-page-header">
            <p className="org-chart-page-eyebrow">{copy.publicInformation}</p>
            <h2>{copy.organizationalChart}</h2>
            <p className="org-chart-page-note">
              {copy.organizationalChartNote}
            </p>
          </div>

          <div className="org-chart">
            {isLoading && <p className="chart-loading">{copy.loadingOrganizationalChart}</p>}

            <div className="org-level">
              <OrgCard node={orgData.top} editMode={false} canEdit={false} />
            </div>

            <div className="org-connector vertical" />

            <div className="org-level">
              <OrgCard node={orgData.second} editMode={false} canEdit={false} />
            </div>

            <div className="org-connector vertical" />
            <div className="org-connector horizontal" />

            <div className="org-columns">
              {orgData.departments.map((department) => (
                <div className="org-column" key={department.id}>
                  <OrgCard node={department} editMode={false} canEdit={false} />
                  <div className="org-connector vertical short" />
                  <div className="org-subunits">
                    {department.units.map((unit) => (
                      <OrgCard key={unit.id} node={unit} editMode={false} canEdit={false} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
