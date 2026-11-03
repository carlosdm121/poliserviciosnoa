/**
 * Regla de ESLint: prohíbe el uso de `$queryRawUnsafe` y `$executeRawUnsafe`.
 *
 * Estos métodos permiten inyección SQL si se usan con strings concatenadas.
 * Toda consulta cruda debe usar `Prisma.sql` (tagged template) con parámetros,
 * nunca concatenar entrada de usuario.
 *
 * Usar en .eslintrc.json:
 *   "plugins": ["poliservicios"],
 *   "rules": {"poliservicios/no-unsafe-raw-queries": "error"}
 */

type RuleContext = any
type RuleModule = any

export const rule: RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prohíbe $queryRawUnsafe y $executeRawUnsafe (riesgo de inyección SQL)',
      category: 'Seguridad',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      noUnsafeRawQuery:
        'No se permite `{{name}}`. Usa `Prisma.sql` con parámetros para prevenir inyección SQL.',
    },
  },

  create(context: RuleContext) {
    return {
      CallExpression(node: any) {
        const callee = node.callee

        let nombre = ''
        if (callee.type === 'MemberExpression') {
          const objeto =
            callee.object.type === 'Identifier' ? callee.object.name : ''
          const propiedad =
            callee.property.type === 'Identifier'
              ? callee.property.name
              : callee.property.type === 'Literal'
                ? String(callee.property.value)
                : ''
          nombre = `${objeto}.${propiedad}`
        }

        if (nombre === '$queryRawUnsafe' || nombre === '$executeRawUnsafe') {
          context.report({
            node,
            messageId: 'noUnsafeRawQuery',
            data: { nombre },
          })
        }
      },
    }
  },
}

export default rule
