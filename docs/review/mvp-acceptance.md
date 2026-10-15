# Verificación de los criterios de aceptación del MVP

Desde el 2026-10-15, el método de instalación documentado es `npm install -g @actually-cli/cli` (MVP §12). La persona responsable confirmó la instalación con npm en su VM Windows. Las verificaciones con pnpm que siguen son evidencia histórica; no verifican el nuevo criterio con npm.

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

## Windows

Verificado del 2026-10-09 al 2026-10-10 para el port a Windows (PR #14), con el paquete de la rama armado con `pnpm pack` en Docker. Entornos: la máquina de la persona responsable, con directorios temporales para todo; una VM Windows con nvm-windows, Node.js 22.23.2 y Git 2.55.0; y la CI en `windows-latest`.

| # | Criterio | Resultado | Cómo se verificó |
|---|---|---|---|
| 1 | Se instala con pnpm | Cumple | En la VM, `pnpm add -g` del paquete con pnpm 12.6.0 (Corepack) deja `actually` en el directorio global de bins |
| 3 | Inspecciona entorno global y proyecto | Cumple | `status --global` en la VM y en la máquina; un proyecto y un repositorio bajo `scan.paths` en la máquina |
| 4 | Identifica pnpm y Git | Cumple | pnpm por cuatro lanzadores reales: el de su instalador (pnpm 11.22.0), Corepack sobre fnm y sobre nvm-windows (pnpm 12.6.0 y 12.10.1) y el de `pnpm/action-setup` en la CI (pnpm 10.33.0). Un repositorio enlazado con `pnpm link --global` sale como herramienta git, con su versión tomada del tag |
| 6 | Salida humana y JSON | Cumple | En la VM: JSON con `diagnostics`, salida humana, `explain` con la evidencia, aviso de red una sola vez |
| 8 | No ejecuta operaciones destructivas | Cumple | En la VM, tamaño y fecha de los 1106 archivos del directorio global y de bins de pnpm, antes y después de correr todos los comandos: idénticos |

Además, en la VM el primer pnpm de `PATH` es un `pnpm.exe` que no arranca (`os error 193`): `actually` informa un `error` con la causa y lista el resto (F-66). Con pnpm 12.10 los globales reciben su `latest` (F-67).

No verificado: los lanzadores de Volta, Scoop y winget, y `npm i -g pnpm` en una máquina real (su forma está en las fixtures). En la VM, `PNPM_HOME\bin` tiene shims `.exe` con un archivo `.pnpm-shim-v1-<nombre>-target` al lado, una forma que `actually` no lee: un `.exe` corre directo, pero un repositorio enlazado con un shim así no se reconoce como herramienta.

## Pendiente fuera de este entorno

- ~~Probar el resolver de GitHub contra `api.github.com` real.~~ Hecho el 2026-09-28, desde Windows y sin token: release real y fallback a tags con la confianza esperada (findings.md, sección "Verificaciones").
- ~~Publicar `@actually-cli/cli@0.1.0` en npm desde la organización `actually-cli`.~~ Hecho el 2026-10-09, desde `9660303`. El registry sirve el mismo tarball que pasó `pnpm check` en Docker (shasum `8320779c5b606759bca459513553ae8032b0eb5f`). `pnpm add -g @actually-cli/cli` en un contenedor limpio instala `actually` 0.1.0, que se reporta al día contra el registry. npm dejó además la versión `0.0.0-stage`, un stub sin código de su publicación en etapas, sin el dist-tag `latest`.
- ~~Publicar `@actually-cli/cli@0.2.0`, con el soporte para Windows.~~ Hecho el 2026-10-10, desde `26ce2d3`, el merge del PR #15, con el tag `v0.2.0`. El registry sirve el mismo tarball que pasó `pnpm check` en Docker (shasum `c069241f0e08922d97e958369381a643c6a1ed25`), y `latest` es 0.2.0. `pnpm add -g @actually-cli/cli` en un contenedor limpio instala `actually` 0.2.0, que se reporta al día contra el registry.
- macOS queda fuera del soporte anunciado para 0.1.0 y 0.2.0. El código contempla sus directorios, pero no se ejecutó ahí; validar en macOS antes de volver a anunciar esa plataforma.
