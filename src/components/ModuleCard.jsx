
import './ModuleCard.css';

export default function ModuleCard({ module, onOpen }) {
  return (
    <div
      className="module-card"
      onClick={() => onOpen(module.module_no)}
    >
      <div className="module-card-header">
        <span className="module-badge">
          Module {module.module_no}
        </span>
      </div>

      <h3>{module.title}</h3>

      <p className="module-description">
        {module.subtitle || "Learning material"}
      </p>

      
    </div>
  );
}