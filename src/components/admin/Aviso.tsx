/**
 * Mensaje de resultado de una acción.
 *
 * Las páginas del panel redirigen con `?ok=` o `?error=`; este componente es el
 * único lugar que decide cómo se ve. Se usa `role="status"` en el éxito y
 * `role="alert"` en el error para que un lector de pantalla lo anuncie sin que
 * el foco salte.
 */
export function Aviso({ ok, error }: { ok?: string; error?: string }) {
  if (error) {
    return (
      <p role="alert" className="error">
        {error}
      </p>
    )
  }

  if (ok) {
    return (
      <p role="status" className="exito">
        {ok}
      </p>
    )
  }

  return null
}
