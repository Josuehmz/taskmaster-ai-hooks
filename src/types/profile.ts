// Entidad Profile: el usuario visible para los demás.
// id = auth.users.id. La fila la crea un trigger sobre auth.users; el cliente nunca la inserta.

export type Profile = {
  readonly id: string
  readonly display_name: string
  readonly created_at: string
}
