# Verificación de los criterios de aceptación del MVP

Criterios de `docs/prd.md` §14, verificados el 2026-09-27 sobre el paquete empaquetado con `pnpm pack` e instalado con `pnpm add -g` en un `PNPM_HOME` temporal. Entorno: Linux, Node.js 22.22, pnpm 10.33, Git 2.43.

| # | Criterio | Resultado | Cómo se verificó |
|---|---|---|---|
| 1 | Se instala con pnpm | Cumple | `pnpm add -g` del tarball expone el comando `actually` en `PNPM_HOME`. El tarball contiene solo `dist`, README, LICENSE y `package.json` |
| 2 | Funciona sin backend | Cumple | Solo consulta `registry.npmjs.org` y `api.github.com`, con allowlist de hosts probada en `tests/security` |
| 3 | Inspecciona entorno global y proyecto | Cumple | `status --global`, `status --project` y `status` con `scan.paths` sobre paquetes globales y proyectos reales |
| 4 | Identifica pnpm y Git en escenarios soportados | Cumple | Paquetes globales reales (`semver@7.5.0`, `is-number@6.0.0`), un paquete instalado desde tarball, un repo con tag `v1.2.0` enlazado desde un bin, un repo como proyecto |
| 5 | Resuelve versiones estables desde fuentes públicas | Cumple en npm; GitHub solo con dobles de prueba | npm: versiones reales del registry. GitHub responde 403 desde este entorno, así que el resolver se probó con respuestas simuladas: release, fallback a tags y límite de requests |
| 6 | Salida humana y JSON | Cumple | JSON válido con `schemaVersion`, sin `null`, con `diagnostics`; aviso y diagnósticos solo por stderr |
| 7 | Explica evidencia | Cumple | `explain` muestra cada claim con su confianza y evidencia `fact` o `inference`, y lo no determinado con su motivo |
| 8 | No ejecuta operaciones destructivas | Cumple | Foto de tamaño, fecha y permisos de cada archivo del entorno de prueba, más `git status` de cada repo, antes y después de ejecutar todos los comandos: idéntica. Solo cambian los directorios de caché y estado de `actually` |
| 9 | Pasa tests de arquitectura y seguridad | Cumple | `pnpm check`: 108 tests, incluido un repo hostil con `core.fsmonitor` y su control |
| 10 | Documentación de la funcionalidad central | Cumple | README, CONTRIBUTING, AGENTS.md, 8 ADRs, páginas de providers, modelo de amenazas, reglas de confianza y referencia de comandos |

Exit codes verificados con el binario instalado: `0` al completar, `1` con `--exit-code` y actualizaciones, `2` con un flag inválido o una herramienta inexistente, `3` con un archivo de config inválido, que igual emite JSON válido con `--json`.

`pnpm audit --prod`: sin vulnerabilidades conocidas.

## Pendiente fuera de este entorno

- ~~Probar el resolver de GitHub contra `api.github.com` real.~~ Hecho el 2026-09-28, desde Windows y sin token: release real y fallback a tags con la confianza esperada (findings.md, sección "Verificaciones").
- Publicar `@getactually/cli@0.1.0` en npm, con la organización `getactually` y la verificación en dos pasos ya configuradas.
- Probar en macOS. El código contempla sus directorios, pero no se ejecutó ahí.
