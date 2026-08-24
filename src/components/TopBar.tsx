import { useSync } from './useSync'

interface Props {
  hasData: boolean
  onImport: () => void
  onExportGedcom: () => void
  onExportJson: () => void
  onExportHtml: () => void
  onCollab: () => void
}

export function TopBar({
  hasData,
  onImport,
  onExportGedcom,
  onExportJson,
  onExportHtml,
  onCollab,
}: Props) {
  const { status, peers } = useSync()
  return (
    <header className="topbar">
      <div className="brand">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 21 V11 M12 11 C12 7 9 6 6 5 M12 13 C12 9 15 8 18 6 M12 17 C12 15 10 14.5 8.5 14"
            fill="none"
            stroke="#17A673"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span className="brand-name">Ramure</span>
        <span className="brand-tagline">votre arbre, chez vous</span>
      </div>
      <div className="topbar-actions">
        <button className="btn" onClick={onCollab}>
          <span className={`dot dot-${status}`} aria-hidden="true" />
          Famille
          {status === 'connected' && peers.length > 0 && ` (${peers.length + 1})`}
        </button>
        <button className="btn" onClick={onImport}>
          Importer
        </button>
        <details className="menu">
          <summary className="btn" role="button">
            Exporter
          </summary>
          <div className="menu-list">
            <button onClick={onExportGedcom} disabled={!hasData}>
              Fichier GEDCOM <span>.ged — standard généalogique</span>
            </button>
            <button onClick={onExportJson} disabled={!hasData}>
              Sauvegarde Ramure <span>.json — copie complète</span>
            </button>
            <button onClick={onExportHtml} disabled={!hasData}>
              Page à partager <span>.html — arbre consultable par la famille</span>
            </button>
          </div>
        </details>
      </div>
    </header>
  )
}
