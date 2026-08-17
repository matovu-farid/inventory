export function getVisibleSuppliers<T>(
  activeSuppliers: readonly T[],
  archivedSuppliers: readonly T[] | null,
  showArchived: boolean,
): readonly T[] {
  return showArchived ? (archivedSuppliers ?? activeSuppliers) : activeSuppliers
}
