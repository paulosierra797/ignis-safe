import './OrgChartLayout.css';

export default function OrgChartLayout({ data, renderNode, loadingMessage }) {
  return (
    <section className="org-tree" aria-label="Organizational hierarchy">
      {loadingMessage && <p className="chart-loading" role="status">{loadingMessage}</p>}
      <div className="org-tree-leader">{renderNode(data.top)}</div>
      <div className="org-tree-stem" aria-hidden="true" />
      <div className="org-tree-leader">{renderNode(data.second)}</div>
      {data.departments.length > 0 && <>
        <div className="org-tree-stem" aria-hidden="true" />
        <div className="org-tree-branches" style={{ '--org-branches': data.departments.length }}>
          {data.departments.map(department => (
            <section className="org-tree-branch" key={department.id} aria-label={department.title}>
              <div className="org-tree-department">{renderNode(department)}</div>
              {department.units.length > 0 && <ul className="org-tree-units">
                {department.units.map(unit => (
                  <li className="org-tree-unit" key={unit.id}>{renderNode(unit)}</li>
                ))}
              </ul>}
            </section>
          ))}
        </div>
      </>}
    </section>
  );
}
