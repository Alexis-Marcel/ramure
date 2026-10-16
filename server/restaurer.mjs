/**
 * Restaure un arbre depuis la corbeille (mode comptes).
 *
 *   node restaurer.mjs <DATA_DIR>/corbeille/<arbre>-<date>.json
 *
 * À lancer serveur ARRÊTÉ (LevelDB n'accepte qu'un processus). Remet le contenu (fichier .yjs voisin)
 * sous le même identifiant et l'arbre avec ses membres dans ramure-meta.json. Avec Docker :
 *   docker stop ramure
 *   docker run --rm -v <dossier données>:/data --entrypoint node ghcr.io/alexis-marcel/ramure \
 *     restaurer.mjs /data/corbeille/<fichier>.json
 *   docker start ramure
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LeveldbPersistence } from 'y-leveldb'
import { MetaStore } from './meta.mjs'

const file = process.argv[2]
if (!file?.endsWith('.json')) {
  console.error('usage : node restaurer.mjs <corbeille/arbre-date.json>')
  process.exit(1)
}
const DATA_DIR = process.env.DATA_DIR ?? '/data'
const { tree } = JSON.parse(readFileSync(file, 'utf8'))
const update = readFileSync(file.replace(/\.json$/, '.yjs'))

const meta = new MetaStore(join(DATA_DIR, 'ramure-meta.json'))
const ldb = new LeveldbPersistence(DATA_DIR)
const current = await ldb.getYDoc(tree.id)
if (current.getMap('persons').size > 0) {
  console.error(`l'arbre ${tree.id} a déjà du contenu : rien n'est écrasé`)
  process.exit(1)
}
await ldb.storeUpdate(tree.id, new Uint8Array(update))
meta.restoreTree(tree)
const back = await ldb.getYDoc(tree.id)
console.log(`« ${tree.name} » restauré : ${back.getMap('persons').size} personnes`)
await ldb.destroy()
