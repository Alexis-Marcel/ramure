import { useStore } from '../store'

export function EmptyState({ onImport }: { onImport: () => void }) {
  const addPerson = useStore((s) => s.addPerson)
  const loadSample = useStore((s) => s.loadSample)

  return (
    <div className="empty-state">
      <div className="empty-icon">
        <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 22 V9 M12 9 C12 5 8.5 4 5 3 M12 12 C12 8 15.5 6.5 19 4.5 M12 17 C12 14.5 9.5 14 7.5 13.5 M12 19 C12 17 14 16.5 16 16"
            fill="none"
            stroke="#17A673"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h1>Commencez votre arbre</h1>
      <p>
        Ajoutez une première personne — vous, un parent, un ancêtre — puis remontez les branches,
        génération après génération. Tout reste sur votre ordinateur.
      </p>
      <div className="empty-actions">
        <button className="btn btn-primary" onClick={() => addPerson()}>
          Ajouter la première personne
        </button>
        <button className="btn" onClick={onImport}>
          Importer un fichier GEDCOM
        </button>
      </div>
      <button className="link" onClick={loadSample}>
        Ou explorez un exemple : la famille de Victor Hugo
      </button>
    </div>
  )
}
