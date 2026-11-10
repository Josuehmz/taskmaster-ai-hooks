# Respuesta al prompt 4 · la reconexión con una carga en vuelo

> Escrita en la sesión principal y guardada antes de verificar ([verificacion.txt](verificacion.txt)).

## Por qué la lista se quedaba con "antes"

En v3, al recibir `SUBSCRIBED` el núcleo solo recargaba si no había una carga en vuelo
(`bufferRef.current === null`), confiando en que "el búfer cubre el hueco". En la prueba:

1. El primer `SUBSCRIBED` lanza una recarga; su `list()` sale **en ese instante** con el estado
   "antes".
2. `CHANNEL_ERROR`, el cambio ocurre en el servidor sin evento, y llega el segundo `SUBSCRIBED`.
3. Como la recarga del paso 1 sigue en vuelo, v3 no lanza otra. Esa recarga responde con "antes" y
   el búfer está vacío, porque el cambio nunca llegó como evento. Resultado: "antes".

El búfer solo cubre lo que **llega por el canal** mientras la consulta viaja. No cubre lo que pasó
cuando el canal no escuchaba.

## El mismo hueco en un montaje normal

Con Supabase, `subscribe()` se pide antes de la consulta, pero el canal solo escucha desde su
`SUBSCRIBED`, que llega después del join por WebSocket. Si la consulta inicial sale antes, un cambio
entre la consulta y el `SUBSCRIBED` no está en la respuesta ni llega como evento. v3 no lo cubría
si la consulta seguía en vuelo al llegar el `SUBSCRIBED`.

## Corrección

**Cada `SUBSCRIBED` lanza una carga nueva**, haya o no otra en vuelo. `load()` aborta la anterior y
su respuesta tardía se descarta por la señal. La lista final siempre sale de una consulta que
empezó con el canal ya escuchando, más los eventos del búfer. Costo: una consulta extra por montaje
cuando el `SUBSCRIBED` llega después de la consulta inicial. Si llega antes (como en el modo demo),
la primera consulta se aborta y no se repite trabajo.

Prueba nueva: "el primer SUBSCRIBED llega con la consulta inicial ya enviada: recarga y no pierde el
cambio". La consulta inicial queda en vuelo con "antes", el cambio ocurre sin evento, llega
`SUBSCRIBED` y después la respuesta vieja. La lista termina con el cambio y la primera señal queda
abortada.
