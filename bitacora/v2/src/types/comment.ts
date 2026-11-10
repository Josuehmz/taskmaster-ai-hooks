// Entidad Comment: comentario de una tarea.

export type Comment = {
  readonly id: string
  readonly task_id: string
  /** Lo pone la base con auth.uid() (default + with check de la política de insert). */
  readonly author_id: string
  readonly body: string
  readonly created_at: string
}

/** Crear comentario: author_id y created_at los fija la base; id lo puede generar el hook. */
export type CreateCommentInput = {
  id?: string
  task_id: string
  body: string
}
