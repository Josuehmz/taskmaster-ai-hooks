// Entidad Comment: comentario de una tarea.

export type Comment = {
  readonly id: string
  readonly task_id: string
  /** Lo pone la base con auth.uid() (default + with check de la política de insert). */
  readonly author_id: string
  readonly body: string
  readonly created_at: string
}

/** Crear comentario: author_id, id y created_at los fija la base. */
export type CreateCommentInput = {
  task_id: string
  body: string
}
