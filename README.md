# PUPPERDRAW

Lienzo colaborativo de pinceladas (Fullscreen Code). Nació del estudio de Van Gogh:
mismo motor de pinceladas (Vervette + trazo Van Gogh), mismo panel de parámetros, pero
**sin salas ni nada de Van Gogh**, y con el lienzo **compartido en vivo** por sockets.

## Qué hace

- Cada usuario elige **su pincel y su color** en el panel (a la derecha, ⚙).
- Lo que pinta la mano viaja al servidor y vuelve a los demás **con su color, su geometría y su estilo**
  (`x, y, ángulo, largo, ancho, rgb`, más curvatura, punta, cerda, veta y ruido): el que pinta amarillo con
  pincel grande lo ven todos igual.
- El que entra recibe el **historial** de la sala (hasta 6.000 pinceladas), los **parámetros globales** y el chat.
- **Dos familias de parámetros**: los del pincel son de cada cliente; los globales (luz, fluidos, materia) son
  de la sala y se sincronizan para todos.
- Cursores de los demás usuarios con su nombre.
- **CHAT** de la sala en la barra de arriba, con la lista de quién está conectado.
- LIMPIAR borra el lienzo para todos.
- Salas por `?sala=<nombre>`; COPIAR LINK arma el link para compartir.
- El nombre se guarda en `localStorage` (click en tu nombre para cambiarlo).

## Panel en tres capas

| Capa | Cómo se abre | Qué tiene |
|---|---|---|
| **MI PINCEL** (simple) | por defecto | color, tamaño de pincel, preset |
| **TODOS LOS PARÁMETROS** | switch arriba del panel | pincel completo, modos de color, presets, flowfield |
| **GLOBAL** | tecla `P` o la pestaña GLOBAL | fluidos, luz y materia (son de la sala) |

El estado de la interfaz queda escrito en la URL: `?panel=simple|todos|global|off` y `?chat=1`.


## Correr

```
install.bat     (una vez)
run.bat         (puerto 5124 · http://localhost:5124/pupperdraw/)
```

## Cómo está hecho

| Pieza | Rol |
|---|---|
| `server.js` | Express + Socket.IO. Salas en memoria, historial acotado, saneo de cada pincelada. |
| `public/js/colab.js` | Cliente: engancha `TRAZO.R.onSpawn`, manda lotes cada ~50 ms, aplica las remotas con `TRAZO.spawn(..., {color, len, wid, hand, pass, remoto:true})`. |
| `public/js/engine/trazo.js` | `spawn()` acepta `color`/`len`/`wid`/`hand` impuestos y avisa `R.onSpawn` de las pinceladas de la mano (las del autopintado no se sincronizan). |
| `public/index.html` | El estudio, rebrandeado: PUPPERDRAW, sin SALAS/NOCHE/GALERÍA. |

Eventos: `entrar` → `historial` + `usuarios`; `trazos` (lote) → broadcast; `cursor` (volátil);
`limpiar` → broadcast. Cada pincelada del lote lleva `{x,y,a,l,w,c,h,p}`: `h` es la velocidad de la
mano de quien la sembró y `p` las pinceladas por carga (`perPass`). Sin `h` el que recibe pinta con la
corriente del fluido apagada y la pincelada queda como un sello duro, sin mezcla.

## Lo que NO se sincroniza (a propósito)

- El **autopintado** (FLOWFIELD → AUTOMÁTICO): es de cada cliente, no de la sala.
- Los parámetros del panel: cada uno pinta con su pincel, que es justamente la idea.

## Cuenta, perfil y QR

- **LOGIN** en la barra: login unificado del ecosistema (JPCONNECT). Con sesión muestra avatar + nombre y abre el perfil.
- **Perfil**: MIS DIBUJOS (snapshots del lienzo, `GUARDAR LIENZO`) y MIS IMÁGENES (`SUBIR IMAGEN`). Se guardan en el
  backend (`perfil.js`: JWT de jpconnect + Mongo `pupperdraw` + PNG en `data/perfil/`).
- **QR**: el link de la sala para escanear desde el celular.
- **Panel rápido**: mantener apretado el lienzo ~0,5 s (sin mover) abre un panel arrastrable con tamaño, fuerza,
  densidad y pinceles.
- Nombres por defecto al entrar: `ANIMAL + ADJETIVO + COLOR` (mismo sistema que pizarraia).
