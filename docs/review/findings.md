# Hallazgos

Registro de errores, puntos de falla y desvíos entre código y docs. La regla que lo gobierna está en mvp.md §9.

## Cómo se usa

- Los docs son la fuente de verdad. Si el código hace otra cosa, es un hallazgo.
- Quien encuentra un problema no lo corrige ni lo esquiva: lo anota acá y se lo informa a la persona responsable del repo.
- Un hallazgo se corrige solo cuando esa persona lo pide por su id.
- Si decide que el código es correcto, se actualiza la sección canónica del doc (CLAUDE.md, "Where decisions live") y el hallazgo se cierra así.
- Un fallo que introduce el cambio en curso no es un hallazgo: es parte de ese cambio y se corrige en él.
- Los ids no se reutilizan. Un hallazgo cerrado no se borra: cambia su estado.

Estados: `abierto`, `resuelto: código corregido en <hash>`, `resuelto: docs actualizados en <hash>`, `descartado: <motivo>`.

Verificación:

- `reproducido`: se provocó el fallo con una prueba; se describe cómo.
- `por lectura`: se deduce del código, sin reproducirlo.

Plantilla:

```markdown
### F-NN · Título corto

- **Estado:** abierto
- **Severidad:** crítica | alta | media | baja
- **Tipo:** seguridad | privacidad | corrección | evidencia | robustez | desvío de docs
- **Ubicación:** `ruta:línea`
- **Detectado:** AAAA-MM-DD, por quién
- **Verificación:** reproducido | por lectura

Qué pasa. Escenario de falla concreto. Qué dicen los docs. Propuesta de corrección.
```

## Índice

| Id | Severidad | Tipo | Título | Estado |
|---|---|---|---|---|
| F-01 | crítica | seguridad | Un repositorio hostil ejecuta comandos con git a través de lazy fetch | abierto |
| F-02 | alta | seguridad | Las redirecciones HTTP saltean la allowlist de hosts | abierto |
| F-03 | alta | privacidad | Se ignora el `.npmrc` de la raíz de un workspace de pnpm | abierto |
| F-04 | media | privacidad | Un `.npmrc` ilegible no impide consultar | abierto |
| F-05 | media | seguridad | Secuencias de escape de datos no confiables llegan a la terminal | abierto |
| F-06 | media | seguridad | El directorio neutral puede caer en `/tmp` | abierto |
| F-07 | media | corrección | `status --global` no detecta repositorios usados como herramienta | abierto |
| F-08 | media | corrección | Un `pnpm-lock.yaml` de un directorio superior le gana al lockfile del proyecto | abierto |
| F-09 | baja | corrección | Las rutas de configuración no se resuelven con realpath | abierto |
| F-10 | baja | evidencia | "no releases" como hecho cuando sí hay una release | abierto |
| F-11 | baja | evidencia | Cualquier fallo de `git describe` se registra como "no reachable tag" | abierto |
| F-12 | baja | desvío de docs | No hay diagnósticos `error` ni `toolId` | abierto |
| F-13 | baja | robustez | Un 5xx ignora la entrada vencida de la caché | abierto |
| F-14 | baja | robustez | Respuestas sin límite de tamaño y `maxBuffer` informado como timeout | abierto |
| F-15 | baja | desvío de docs | Comentario de `version.ts` cita un test que no existe | abierto |
| F-16 | baja | desvío de docs | El cliente HTTP no implementa cancelación | abierto |
| F-17 | baja | robustez | El guard de Bash bloquea lecturas con `sed -n` de archivos de `.claude/` | abierto |
| F-18 | media | seguridad | `node -e` puede escribir los archivos de los frenos sin que el guard lo bloquee | abierto |
| D-01 | — | desvío de docs | La v0.1 quedó absorbida por el MVP | resuelto: docs actualizados en `5513334` |
| D-02 | — | desvío de docs | `status --json` incluye `projects` | resuelto: docs actualizados en `5513334` |
| D-03 | — | desvío de docs | Estructura de `src/` | resuelto: docs actualizados en `5513334` |
| D-04 | — | desvío de docs | La allowlist de hosts es obligatoria | resuelto: docs actualizados en `5513334` |
| D-05 | — | desvío de docs | Directorio de binarios de pnpm | resuelto: docs actualizados en `5513334` |
| D-06 | — | desvío de docs | Qué marca una raíz de proyecto | resuelto: docs actualizados en `5513334` |

## Revisión del 2026-09-27

Revisión completa de `src/`, los tests, la CI y los docs, hecha por Claude Code a pedido de la persona responsable del repo. Las pruebas de reproducción se hicieron fuera del repositorio, sobre `dist/` y repositorios temporales.

### F-01 · Un repositorio hostil ejecuta comandos con git a través de lazy fetch

- **Estado:** abierto
- **Severidad:** crítica
- **Tipo:** seguridad
- **Ubicación:** `src/infrastructure/command-runner/allowlist.ts:38-46`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

Un repositorio puede declararse como clon parcial (`extensions.partialClone`, `remote.origin.promisor = true`) y tener un ref a un objeto que no existe. Al leer ese ref, `git tag --points-at HEAD` y `git describe` intentan traer el objeto del remote. Para eso, git usa la configuración del propio repositorio, incluido `core.sshCommand`, que se ejecuta con una shell.

Reproducción:

1. Un repositorio con esa configuración y `core.sshCommand = "touch PWNED; false"`.
2. `.git/refs/tags/v9.9.9` apunta a un id inexistente.
3. Se ejecutan los dos comandos con la invocación exacta de `buildInvocation`.
4. Se crea `PWNED`.

Los docs dicen lo contrario. architecture.md §7 y docs/security/threat-model.md afirman que un repositorio hostil no puede ejecutar código, y el endurecimiento de §7 solo cubre `core.fsmonitor`, los paginadores y las credenciales.

Propuesta:

- Agregar `GIT_NO_LAZY_FETCH=1` y `GIT_ALLOW_PROTOCOL=` (vacío) al entorno de git. Probado con Git 2.43: con cualquiera de los dos, git falla sin ejecutar nada.
- Documentar ambos en architecture.md §7.
- Sumar este repositorio hostil a `tests/security`, con su control.

### F-02 · Las redirecciones HTTP saltean la allowlist de hosts

- **Estado:** abierto
- **Severidad:** alta
- **Tipo:** seguridad
- **Ubicación:** `src/infrastructure/http/undici-http-client.ts:50`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

El cliente valida el host solo en la primera URL y usa `redirect: "follow"`. Reproducción con `MockAgent`: un 302 de `registry.npmjs.org` hacia `https://evil.example/` fue seguido, y la respuesta de ese host se usó como versión.

architecture.md §8 dice que los únicos destinos son `registry.npmjs.org` y `api.github.com`.

Propuesta:

- Usar `redirect: "manual"` y seguir a mano solo las redirecciones a un host permitido, con un máximo de saltos.
- GitHub usa 301 dentro de `api.github.com` para los repositorios renombrados, así que conviene no rechazar todas las redirecciones.
- Agregar el caso a `tests/security`.

### F-03 · Se ignora el `.npmrc` de la raíz de un workspace de pnpm

- **Estado:** abierto
- **Severidad:** alta
- **Tipo:** privacidad
- **Ubicación:** `src/providers/project/project.ts:273`, `src/application/inventory.ts:387`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

Solo se lee `<raíz del proyecto>/.npmrc`. En un workspace de pnpm, pnpm usa el `.npmrc` de la raíz del workspace. Si `actually` se ejecuta dentro de un subpaquete, el registry privado declarado en la raíz no se aplica, y los nombres de sus dependencias se consultan en `registry.npmjs.org`.

Reproducción:

1. `ws/.npmrc` con `registry=https://npm.mycorp.example/`.
2. `ws/app/package.json` con una dependencia.
3. `status --project` desde `ws/app`.
4. Se consultó `https://registry.npmjs.org/a/latest`.

architecture.md §8 dice: "ante la duda, no se consulta".

Propuesta:

- Buscar hacia arriba `pnpm-workspace.yaml`, como ya se hace con `pnpm-lock.yaml`, y aplicar el `.npmrc` de esa raíz antes que el del proyecto.
- Si hay un `.npmrc` en un directorio intermedio que no se sabe interpretar, dejar el registry como indeterminado.

### F-04 · Un `.npmrc` ilegible no impide consultar

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** privacidad
- **Ubicación:** `src/providers/project/project.ts:273-284`, `src/application/inventory.ts:387-389`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

Si el `.npmrc` del proyecto existe pero no se puede leer, por ejemplo por permisos, se emite un diagnóstico y se sigue con la configuración del usuario. Ese `.npmrc` podía declarar un registry privado.

architecture.md §8: si una condición no se puede determinar, no se consulta.

Propuesta: en ese caso, el registry del proyecto pasa a `unknown`, con ese motivo.

### F-05 · Secuencias de escape de datos no confiables llegan a la terminal

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** seguridad
- **Ubicación:** `src/cli/output/human.ts`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

Varios datos se imprimen sin sanear:

- nombres de dependencias, specs, tags y campos `repository`, que vienen de archivos de repositorios clonados o de respuestas de red;
- mensajes de diagnóstico que incluyen stderr de pnpm.

Reproducción: un `package.json` con la dependencia `"\u001b]0;pwned\u0007x"`. La salida de `renderStatus` contiene la secuencia OSC tal cual.

Según la terminal, estas secuencias pueden:

- ocultar o reescribir líneas del resultado;
- cambiar el título de la ventana;
- escribir en el portapapeles (OSC 52).

Eso contradice la promesa de que cada conclusión se puede verificar con su evidencia.

Propuesta: reemplazar los caracteres de control (C0 salvo `\n`, C1 y DEL) por una forma visible, por ejemplo `\x1b`, en todo texto que venga de datos antes de imprimirlo. La salida JSON ya los escapa.

### F-06 · El directorio neutral puede caer en `/tmp`

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** seguridad
- **Ubicación:** `src/infrastructure/local-state/file-local-state.ts:21-30`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

Si `empty` no se puede crear o no está vacío, el código usa `mkdtemp(os.tmpdir())`. Eso tiene tres problemas:

- Escribe fuera del directorio de estado, lo que viola RA-010.
- Ejecuta pnpm con el directorio de trabajo dentro de `/tmp`, que es compartido. Corepack y pnpm buscan `package.json` y `.npmrc` hacia arriba, así que otro usuario de la máquina puede plantar `/tmp/package.json` con un `packageManager` que corepack descarga y ejecuta. `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` evita incluso la pregunta.
- Deja un directorio nuevo en cada ejecución.

architecture.md §7: el directorio neutral está dentro del estado local de `actually`.

Propuesta: sin un directorio neutral válido, los comandos de pnpm fallan con un diagnóstico, y los datos quedan `unknown`.

### F-07 · `status --global` no detecta repositorios usados como herramienta

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** corrección
- **Ubicación:** `src/application/inventory.ts:107-110`, `:139`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

Con `--global`, `scannedRoots` queda vacío. Un ejecutable de `~/.local/bin` que resuelve dentro de un repositorio bajo `scan.paths` aparece entonces como ejecutable desconocido.

Reproducción:

- `status` informa `global:git:mytool installed=1.0.0`.
- `status --global` informa `global:unknown:mytool installed=unknown`.

mvp.md §5.3 define que ese repositorio es una herramienta, sin depender del flag.

Propuesta: buscar los repositorios de `scan.paths` también con `--global`, sin escanear sus dependencias como proyectos.

### F-08 · Un `pnpm-lock.yaml` de un directorio superior le gana al lockfile del proyecto

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** corrección
- **Ubicación:** `src/providers/project/project.ts:184-201`, `:87`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

El `pnpm-lock.yaml` se busca hacia arriba y se prefiere al `package-lock.json` del propio proyecto. Reproducción con `ws/pnpm-lock.yaml` y `ws/app/package-lock.json`:

- Con un lockfile v9, `app` se informa como proyecto pnpm (inferencia falsa) y cada dependencia como "not found in the lockfile".
- Con un lockfile v5 sin `importers`, se toman las dependencias de la raíz como si fueran de `app`. `a` queda con `resolved: 1.9.9` como `fact`, cuando su `package-lock.json` dice `1.2.0`.

architecture.md §6: un `fact` lo afirma una fuente autoritativa. Acá la fuente es de otro proyecto.

Propuesta:

- Priorizar los lockfiles del directorio del proyecto.
- Usar un `pnpm-lock.yaml` superior solo si tiene `importers` con la ruta de este proyecto.

### F-09 · Las rutas de configuración no se resuelven con realpath

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** corrección
- **Ubicación:** `src/application/inventory.ts:147`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

`isInside(exe.realPath, root)` compara una ruta resuelta con otra que no lo está. Si `scan.paths` o `[[tools.git]]` pasan por un symlink, por ejemplo `~/projects → /data/projects`, ningún ejecutable resuelve "dentro" del repositorio.

Propuesta: resolver con `realpath` las raíces antes de comparar.

### F-10 · "no releases" como hecho cuando sí hay una release

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** evidencia
- **Ubicación:** `src/providers/github/resolver.ts:79-95`, `:132`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

Si la última release tiene un tag que no es semver, por ejemplo `nightly`, se cae al fallback de tags. La evidencia afirma como `fact` que no hay releases.

Propuesta: registrar "latest release is tagged nightly, which is not semver".

### F-11 · Cualquier fallo de `git describe` se registra como "no reachable tag"

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** evidencia
- **Ubicación:** `src/providers/git/repository.ts:169-175`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

Un timeout o un rechazo por `safe.directory` produce el `fact` "no reachable tag".

Propuesta: afirmarlo solo cuando git dice que no encontró nombres. Para los demás fallos, registrar el mensaje.

### F-12 · No hay diagnósticos `error` ni `toolId`

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** desvío de docs
- **Ubicación:** `src/application/inventory.ts`, `src/cli/run.ts:139`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

architecture.md §13 dice que un provider que falla emite un diagnóstico `error` y sus herramientas quedan en `status: "error"`. El código solo emite `warning` y nunca completa `toolId`. Por eso `status <tool>` muestra todos los diagnósticos generales, aunque no tengan que ver con esa herramienta.

Propuesta: completar `toolId` cuando el diagnóstico es de una herramienta, y decidir si el fallo de un comando de git o pnpm es `error`.

### F-13 · Un 5xx ignora la entrada vencida de la caché

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** robustez
- **Ubicación:** `src/providers/shared/cached-get.ts:57-82`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

Si el servidor responde 5xx dos veces, el resultado es "registry answered 503", aunque haya una entrada vencida. architecture.md §14 permite usarla, marcada, cuando la red falla.

Propuesta: tratar un 5xx después del reintento como red no disponible.

### F-14 · Respuestas sin límite de tamaño y `maxBuffer` informado como timeout

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** robustez
- **Ubicación:** `src/infrastructure/http/undici-http-client.ts:65`, `src/infrastructure/command-runner/node-command-runner.ts:47`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

- `response.text()` lee el cuerpo completo, sin límite.
- Un `maxBuffer` excedido mata el proceso con `killed = true` y se informa como "timed out".

Propuesta:

- Cortar las respuestas que superen un tamaño razonable, por ejemplo 5 MB.
- Distinguir `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`.

### F-15 · Comentario de `version.ts` cita un test que no existe

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** desvío de docs
- **Ubicación:** `src/version.ts:1`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

Cita `tests/unit/version.test.ts`. El test está en `tests/unit/config-output.test.ts:41`.

Propuesta: corregir la ruta del comentario.

### F-16 · El cliente HTTP no implementa cancelación

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** desvío de docs
- **Ubicación:** `src/infrastructure/http/undici-http-client.ts`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

architecture.md §8 lista "cancellation" entre las responsabilidades del `HttpClient`. Solo existe el timeout por request: no hay forma de cancelar los requests pendientes, por ejemplo ante Ctrl-C.

Propuesta: aceptar un `AbortSignal` por ejecución, o quitar "cancellation" de §8 si no se necesita en el MVP.

### F-17 · El guard de Bash bloquea lecturas con `sed -n` de archivos de `.claude/`

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** robustez
- **Ubicación:** `.claude/hooks/guard-bash.mjs` (`READ_ONLY` y la regla de `GUARD_FILES`)
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

La regla que protege `.claude/settings*.json` y `.claude/hooks/` permite solo los comandos de `READ_ONLY`. `sed` y `awk` no están en esa lista, porque pueden escribir. Por eso `sed -n 50,56p .claude/hooks/guard-edit.mjs`, que solo lee, se bloquea. Es un falso positivo del lado seguro: la herramienta Read sigue sirviendo para leer esos archivos.

Propuesta: permitir `sed` sin `-i` y `awk` sin redirecciones, con casos de test para ambos.

### F-18 · `node -e` puede escribir los archivos de los frenos sin que el guard lo bloquee

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** seguridad
- **Ubicación:** `.claude/hooks/guard-bash.mjs` (`READ_ONLY`)
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

`node` está en `READ_ONLY` para que se puedan probar los hooks pasándoles JSON por pipe. Pero `node -e` escribe archivos, así que un comando como `node -e "fs.writeFileSync('.claude/settings.json', …)"` pasa el guard. `permissions.deny` solo cubre las herramientas de edición, no Bash. Lo mismo vale para `npx` y `pnpm exec`, que pueden ejecutar scripts arbitrarios.

Así se usó, una sola vez, con autorización explícita de la persona responsable: el 2026-09-27 se cambió `let before = "";` por `let before;` en `.claude/hooks/guard-edit.mjs:53`, para corregir el lint del cambio que agregó los frenos. No se modificó nada más de `.claude/`. El `!` de la sesión no ejecutaba comandos en la app, así que no había otra vía.

Propuesta: sacar `node`, `npx` y `pnpm` de `READ_ONLY` y permitir solo `node .claude/hooks/<hook>.mjs` sin `-e`, `-p` ni `--eval`. Sumar el caso a `tests/security/agent-guard.test.ts`.

### Desvíos donde el código es correcto

En estos casos, el código refleja una decisión ya tomada. Se actualizaron los docs.

- **D-01 · La v0.1 quedó absorbida por el MVP.** La persona responsable decidió ir directo al MVP. La primera versión, 0.1.0, incluye caché, Git, GitHub, proyectos y archivo de configuración. Se actualizaron prd.md §13, architecture.md §3.5, §7 y §14, y design.md §12.
- **D-02 · `status --json` incluye `projects`.** design.md §14 no lo documentaba, ni tampoco `projectRoot`.
- **D-03 · Estructura de `src/`.** architecture.md §10 mostraba una estructura propuesta distinta de la real.
- **D-04 · La allowlist de hosts es obligatoria.** architecture.md §8 decía "opcional". El código la exige, y solo con https.
- **D-05 · Directorio de binarios de pnpm.** architecture.md §3.3 nombraba `PNPM_HOME`. El código usa lo que informa `pnpm bin --global`, que ya refleja `PNPM_HOME`.
- **D-06 · Qué marca una raíz de proyecto.** mvp.md §6 listaba indicadores que el MVP no usa. En el MVP, una raíz es un directorio con `package.json` o `.git`.
