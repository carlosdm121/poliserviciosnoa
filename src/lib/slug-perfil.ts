/**
 * Forma de un slug de perfil público.
 *
 * `generarSlugPerfil` arma el nombre slugificado más `-` y 4 caracteres al
 * azar, así que todo slug real termina en `-xxxx`. Eso es lo que permite
 * distinguir la URL corta de un perfil (`/ana-perez-x7k2`) de una ruta fija
 * (`/buscar`) o de una provincia (`/tucuman`) sin mantener una lista de rutas
 * reservadas que se desactualiza con el primer link nuevo.
 *
 * Vive en su propio módulo, sin imports, porque lo usa el middleware: corre en
 * el runtime edge y no puede arrastrar `@prisma/client`.
 */
export const SLUG_PERFIL = /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{4}$/
