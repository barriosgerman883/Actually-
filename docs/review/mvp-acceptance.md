# Verificación de los criterios de aceptación del MVP

Criterios de `docs/prd.md` §14, verificados el 2026-09-27 sobre el paquete empaquetado con `pnpm pack` e instalado con `pnpm add -g` en un `PNPM_HOME` temporal. Entorno: Linux, Node.js 22.22, pnpm 10.33, Git 2.43.

| # | Criterio | Resultado | Cómo se verificó |
|---|---|---|---|
| 1 | Se instala con pnpm | Cumple | `pnpm add -g` del tarball expone el comando `actually` en `PNPM_HOME`. El tarball contiene solo `dist`, README, LICENSE y `package.json` |
| 2 | Funciona sin backend | Cumple | Solo consulta `registry.npmjs.org` y `api.github.com`, con allowlist de hosts probada en `tests/security` |
| 3 | Inspecciona entorno global y proyecto | Cumple | `status --global`, `status --project` y `status` con `scan.paths` sobre paquetes globales y proyectos reales |
| 4 | Identifica pnpm y Git en escenarios soportados | Cumple | Paquetes globales reales (`semver@7.5.0`, `is-number@6.0.0`), un paquete instalado desde tarball, un repo con tag `v1.2.0` enlazado desde un bin, un repo como proyecto |
| 5 | Resuelve versiones estables desde fuentes públicas | Cumple | npm: versiones reales del registry. GitHub respondía 403 desde el primer entorno, así que ahí se probó con respuestas simuladas; el 2026-09-28 se verificó contra `api.github.com` real (ver "Pendiente fuera de este entorno") |
| 6 | Salida humana y JSON | Cumple | JSON válido con `schemaVersion`, sin `null`, con `diagnostics`; aviso solo por stderr y diagnósticos dentro del JSON |
| 7 | Explica evidencia | Cumple | `explain` muestra cada claim con su confianza y evidencia `fact` o `inference`, y lo no determinado con su motivo |
| 8 | No ejecuta operaciones destructivas | Cumple | Foto de tamaño, fecha y permisos de cada archivo del entorno de prueba, más `git status` de cada repo, antes y después de ejecutar todos los comandos: idéntica. Solo cambian los directorios de caché y estado de `actually` |
| 9 | Pasa tests de arquitectura y seguridad | Cumple | `pnpm check` en ese momento: 108 tests, incluido un repo hostil con `core.fsmonitor` y su control |
| 10 | Documentación de la funcionalidad central | Cumple | README, CONTRIBUTING, AGENTS.md, 8 ADRs, páginas de providers, modelo de amenazas, reglas de confianza y referencia de comandos |

Exit codes verificados con el binario instalado: `0` al completar, `1` con `--exit-code` y actualizaciones, `2` con un flag inválido o una herramienta inexistente, `3` con un archivo de config inválido, que igual emite JSON válido con `--json`.

`pnpm audit --prod`: sin vulnerabilidades conocidas.

## Pendiente fuera de este entorno

- ~~Probar el resolver de GitHub contra `api.github.com` real.~~ Hecho el 2026-09-28, desde Windows y sin token: release real y fallback a tags con la confianza esperada (findings.md, sección "Verificaciones").
- Publicar `@actually-cli/cli@0.1.0` en npm desde la organización `actually-cli`, con la verificación en dos pasos activa en la cuenta que publica.
- macOS queda fuera del soporte anunciado para 0.1.0. El código contempla sus directorios, pero no se ejecutó ahí; validar en macOS antes de volver a anunciar esa plataforma.
