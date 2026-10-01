/** Legacy subjects remain stored, but the issue description is the item name. */
export function punchlistDescription(task: { title: string; details: string | null }) {
  return task.details?.trim() || task.title;
}
