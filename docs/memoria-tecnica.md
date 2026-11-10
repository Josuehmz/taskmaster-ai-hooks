# Memoria técnica

**Por qué esta estructura.** La lógica de datos quedó en tres capas que solo dependen hacia abajo.
Los componentes llaman hooks (`useTasks`, `useComments`, `useProjectMembers`, `useProfiles`,
`useSession`). Los hooks hablan con repositorios, que son interfaces. Y solo los repositorios de
Supabase importan `supabase-js`. Una regla `no-restricted-imports` de oxlint hace fallar el lint si
un componente importa Supabase. La lógica difícil se escribió una sola vez en un núcleo,
`useRealtimeCollection`: carga, canal, reconciliación, optimismo y limpieza. Cada hook de entidad
solo declara su clave, su orden y sus mutaciones. Como el repositorio llega por contexto, el mismo
hook corre contra Supabase, contra un modo demo rotulado o contra un doble de prueba. Así se
probaron 38 casos sin red.

**Consistencia en tiempo real.** El canal `postgres_changes` filtra por `project_id=eq.<id>` y la
RLS decide qué eventos recibe cada usuario. Cinco decisiones sostienen la consistencia:

1. El id de una tarea nueva lo genera el cliente. La fila optimista ya tiene su clave real, así que
   el eco del INSERT y la respuesta HTTP caen sobre la misma fila, llegue primero cualquiera.
2. Mientras una mutación propia viaja, los eventos de esa fila se difieren. Al terminar se aplica
   el último con control de versión (`updated_at`): el eco no cambia nada y un cambio ajeno más
   nuevo gana. Si el servidor falla, se restaura la fila previa exacta.
3. Los DELETE se aplican como «quitar si está». Medido en Supabase local, llegan solo con el `id`
   y también a usuarios fuera del proyecto.
4. Cada `SUBSCRIBED`, al montar y en cada reconexión, recarga la lista. Realtime no reenvía lo
   perdido: tras reiniciar la base se perdió un INSERT.
5. Al cambiar de proyecto o desmontar se llama a `removeChannel`, se aborta la consulta y ninguna
   respuesta tardía toca el estado.

Límite conocido: entre dos ediciones simultáneas gana la última escritura.
