import type { TreeSummary } from './api'

/**
 * Confirmation de suppression d'un arbre : il faut retaper son nom (le serveur l'exige aussi).
 * Renvoie le nom tapé s'il correspond, sinon null (annulé ou différent, avec un message).
 */
export function confirmTreeDeletion(tree: Pick<TreeSummary, 'name' | 'members'>): string | null {
  const typed = prompt(
    `Supprimer « ${tree.name} » pour ses ${tree.members} membre${tree.members > 1 ? 's' : ''} ?\n` +
      `Une copie est gardée sur le serveur, mais l'arbre disparaît pour tout le monde.\n` +
      `Pour confirmer, retape le nom de l'arbre :`,
  )
  if (typed === null) return null
  if (typed.trim() !== tree.name) {
    alert("Le nom ne correspond pas : l'arbre n'a pas été supprimé.")
    return null
  }
  return typed.trim()
}
