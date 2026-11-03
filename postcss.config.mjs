/**
 * PostCSS en formato ESM.
 *
 * `.mjs` obliga a `export default`. Usar `module.exports` acá hace fallar el
 * build con "module is not defined in ES module scope", que es un error
 * confuso porque el archivo parece un CommonJS normal.
 */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

export default config