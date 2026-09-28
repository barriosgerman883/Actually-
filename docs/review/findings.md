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
| F-01 | crítica | seguridad | Un repositorio hostil ejecuta comandos con git a través de lazy fetch | resuelto: código corregido en `e99c2d8` |
| F-02 | alta | seguridad | Las redirecciones HTTP saltean la allowlist de hosts | resuelto: código corregido en `2bd5301` |
| F-03 | alta | privacidad | Se ignora el `.npmrc` de la raíz de un workspace de pnpm | resuelto: código corregido en `52a81ed` |
| F-04 | media | privacidad | Un `.npmrc` ilegible no impide consultar | resuelto: código corregido en `52a81ed` |
| F-05 | media | seguridad | Secuencias de escape de datos no confiables llegan a la terminal | resuelto: código corregido en `a4b617e` |
| F-06 | media | seguridad | El directorio neutral puede caer en `/tmp` | resuelto: código corregido en `739946e` |
| F-07 | media | corrección | `status --global` no detecta repositorios usados como herramienta | resuelto: código corregido en `c4e5131` |
| F-08 | media | corrección | Un `pnpm-lock.yaml` de un directorio superior le gana al lockfile del proyecto | resuelto: código corregido en `ae11420` |
| F-09 | baja | corrección | Las rutas de configuración no se resuelven con realpath | resuelto: código corregido en `c4e5131` |
| F-10 | baja | evidencia | "no releases" como hecho cuando sí hay una release | resuelto: código corregido en `29b0c13` |
| F-11 | baja | evidencia | Cualquier fallo de `git describe` se registra como "no reachable tag" | resuelto: código corregido en `397c34f` |
| F-12 | baja | desvío de docs | No hay diagnósticos `error` ni `toolId` | resuelto: código corregido en `f853df0` |
| F-13 | baja | robustez | Un 5xx ignora la entrada vencida de la caché | resuelto: código corregido en `021919f` |
| F-14 | baja | robustez | Respuestas sin límite de tamaño y `maxBuffer` informado como timeout | resuelto: código corregido en `1d0207b` |
| F-15 | baja | desvío de docs | Comentario de `version.ts` cita un test que no existe | resuelto: código corregido en `eafeab9` |
| F-16 | baja | desvío de docs | El cliente HTTP no implementa cancelación | resuelto: código corregido en `447c9c9` |
| F-17 | baja | robustez | El guard de Bash bloquea lecturas con `sed -n` de archivos de `.claude/` | abierto |
| F-18 | media | seguridad | `node -e` puede escribir los archivos de los frenos sin que el guard lo bloquee | resuelto: código corregido en `54ec142` |
| F-19 | media | seguridad | `prettier --write` y `eslint --fix` pueden escribir los archivos de los frenos | resuelto: código corregido en `940c5ed` |
| F-20 | alta | seguridad | Bash puede escribir los archivos de los frenos por rutas que el guard no ve | abierto |
| F-21 | alta | seguridad | Un symlink a `.claude/` saltea el guard de edición | abierto |
| F-22 | alta | seguridad | Las reglas que solo cambia la persona responsable no están protegidas | abierto |
| F-23 | media | seguridad | Formas de saltear los hooks de git que el guard no detecta | abierto |
| F-24 | media | seguridad | Una opción con valor antes del subcomando esconde `publish` | abierto |
| F-25 | media | privacidad | Secretos legibles con variables, globs y búsquedas recursivas | abierto |
| F-26 | alta | seguridad | Comandos destructivos dentro de subshells, grupos o `if` pasan el guard | abierto |
| F-27 | media | robustez | Formas de debilitar o borrar tests que el guard no detecta | abierto |
| F-28 | baja | robustez | Falsos positivos del guard de Bash con backticks y con `.npmrc` | abierto |
| F-29 | baja | robustez | El guard de edición revisa archivos fuera del repositorio | abierto |
| F-30 | baja | seguridad | Los hooks fallan abiertos ante una entrada inválida | abierto |
| F-31 | alta | privacidad | Credenciales dentro de la URL del registry llegan a la evidencia y a `explain` | resuelto: código corregido en `55d8461` |
| F-32 | alta | privacidad | En workspaces se consultan en el registry público paquetes que resuelven a uno local | resuelto: código corregido en `93a1807` |
| F-33 | media | privacidad | Specs locales tratados como de registry: tarballs `.tgz` y `optionalDependencies` | abierto |
| F-34 | media | privacidad | El `.npmrc` del proyecto se interpreta distinto que en npm y pnpm | abierto |
| F-35 | media | evidencia | "installed by" con confianza `high` cuando el package manager solo se infiere | abierto |
| F-36 | media | evidencia | Una release de GitHub con tag prerelease queda con confianza `high` | abierto |
| F-37 | media | corrección | Dos herramientas distintas reciben el mismo id | abierto |
| F-38 | media | robustez | Un archivo `.git` ilegible aborta toda la ejecución | abierto |
| F-39 | media | privacidad | `--offline` no impide que Corepack descargue pnpm por la red | abierto |
| F-40 | baja | corrección | Un `package.json` de un directorio superior le gana a un `.git` más cercano | abierto |
| F-41 | baja | robustez | Sin releases en GitHub, los tags en caché no se usan offline y `/releases/latest` se repite | abierto |
| F-42 | baja | desvío de docs | El límite de GitHub alcanzado en `/tags` no emite diagnóstico | abierto |
| F-43 | baja | desvío de docs | Un fallo de `git describe` no produce `error` ni diagnóstico | abierto |
| F-44 | baja | privacidad | Un remote relativo se interpreta como repositorio de GitHub | abierto |
| F-45 | baja | seguridad | `sanitize` no escapa controles bidi ni de ancho cero | abierto |
| F-46 | baja | robustez | `Filesystem` lee sin límite ni chequeo de tipo, y `exists` trata `EACCES` como ausencia | abierto |
| F-47 | baja | corrección | Los sufijos de peers de un lockfile pnpm v5 dejan `resolved` desconocido | abierto |
| F-48 | baja | robustez | El repositorio no se puede verificar en Windows | abierto |
| F-49 | baja | robustez | Ni el composition root ni el aviso de primera ejecución tienen tests | abierto |
| F-50 | alta | corrección | Con pnpm 12, ningún paquete global recibe su `latest` | resuelto: código corregido en `793c369` |
| F-51 | baja | corrección | El mensaje de nombre ambiguo muestra `\x0a` en vez de saltos de línea | abierto |
| F-52 | alta | privacidad | Con yarn berry, un registry privado en `.yarnrc.yml` no impide consultar el público | resuelto: código corregido en `f10a354` |
| F-53 | media | privacidad | Credenciales dentro de un spec que es una URL llegan a `explain` | abierto |
| F-54 | baja | robustez | El guard de Bash bloquea leer `core.hooksPath` | abierto |
| F-55 | alta | robustez | Un fallo real al ejecutar pnpm se reporta igual que "no instalado", sin ningún diagnóstico | resuelto: código corregido en `7a5bfa9` |
| F-56 | media | corrección | En Windows, cualquier archivo en un directorio escaneado cuenta como ejecutable | abierto |
| D-01 | — | desvío de docs | La v0.1 quedó absorbida por el MVP | resuelto: docs actualizados en `5513334` |
| D-02 | — | desvío de docs | `status --json` incluye `projects` | resuelto: docs actualizados en `5513334` |
| D-03 | — | desvío de docs | Estructura de `src/` | resuelto: docs actualizados en `5513334` |
| D-04 | — | desvío de docs | La allowlist de hosts es obligatoria | resuelto: docs actualizados en `5513334` |
| D-05 | — | desvío de docs | Directorio de binarios de pnpm | resuelto: docs actualizados en `5513334` |
| D-06 | — | desvío de docs | Qué marca una raíz de proyecto | resuelto: docs actualizados en `5513334` |

## Revisión del 2026-09-27

Revisión completa de `src/`, los tests, la CI y los docs, hecha por Claude Code a pedido de la persona responsable del repo. Las pruebas de reproducción se hicieron fuera del repositorio, sobre `dist/` y repositorios temporales.

### F-01 · Un repositorio hostil ejecuta comandos con git a través de lazy fetch

- **Estado:** resuelto: código corregido en `e99c2d8`
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

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. git recibe `GIT_NO_LAZY_FETCH=1` y `GIT_ALLOW_PROTOCOL` vacío, documentados en architecture.md §7 y en el modelo de amenazas. `tests/security/security.test.ts` arma el clon parcial hostil: el control sin endurecer crea el marcador, y el runner no.

### F-02 · Las redirecciones HTTP saltean la allowlist de hosts

- **Estado:** resuelto: código corregido en `2bd5301`
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

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. Las redirecciones se siguen a mano, hasta cinco, solo por https y hacia hosts permitidos; el token se recalcula en cada salto. Tests con `MockAgent`: la redirección a `evil.example` se rechaza sin tocar ese host, y un 301 dentro de `api.github.com` se sigue.

### F-03 · Se ignora el `.npmrc` de la raíz de un workspace de pnpm

- **Estado:** resuelto: código corregido en `52a81ed`
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

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. Se aplica el `.npmrc` de la raíz del workspace (`pnpm-workspace.yaml`) antes que el del proyecto, y un `.npmrc` intermedio deja el registry indeterminado. Documentado en architecture.md §8. Tests en `tests/integration/inventory.test.ts`: la reproducción del hallazgo ya no consulta nada.

**Nota del 2026-09-28.** La corrección de F-32 (`93a1807`) reemplazó esta regla. Ahora se leen todos los `.npmrc` desde el proyecto hasta home, incluido el intermedio, y un registry es público solo si ninguno dice otra cosa. La reproducción de este hallazgo sigue sin consultar nada.

### F-04 · Un `.npmrc` ilegible no impide consultar

- **Estado:** resuelto: código corregido en `52a81ed`
- **Severidad:** media
- **Tipo:** privacidad
- **Ubicación:** `src/providers/project/project.ts:273-284`, `src/application/inventory.ts:387-389`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

Si el `.npmrc` del proyecto existe pero no se puede leer, por ejemplo por permisos, se emite un diagnóstico y se sigue con la configuración del usuario. Ese `.npmrc` podía declarar un registry privado.

architecture.md §8: si una condición no se puede determinar, no se consulta.

Propuesta: en ese caso, el registry del proyecto pasa a `unknown`, con ese motivo.

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. Un `.npmrc` que existe y no se puede leer deja el registry `unknown` con ese motivo, además del diagnóstico. Test en `tests/integration/inventory.test.ts`.

### F-05 · Secuencias de escape de datos no confiables llegan a la terminal

- **Estado:** resuelto: código corregido en `a4b617e`
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

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. Todo texto que viene de datos se muestra con sus caracteres de control como `\xNN` antes de darle estilo, también en los mensajes de error. Tests en `tests/security/security.test.ts`, y verificado sobre `dist/` con la dependencia de la reproducción.

### F-06 · El directorio neutral puede caer en `/tmp`

- **Estado:** resuelto: código corregido en `739946e`
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

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. Sin directorio neutral válido, pnpm no se lanza y sus datos quedan `unknown`; git no depende de él. Documentado en architecture.md §7. Tests en `tests/security/security.test.ts`.

### F-07 · `status --global` no detecta repositorios usados como herramienta

- **Estado:** resuelto: código corregido en `c4e5131`
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

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. Los repositorios de `scan.paths` se buscan también con `--global`, sin escanearlos como proyectos. Test en `tests/integration/inventory.test.ts`.

### F-08 · Un `pnpm-lock.yaml` de un directorio superior le gana al lockfile del proyecto

- **Estado:** resuelto: código corregido en `ae11420`
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

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. Primero los lockfiles del propio proyecto; un `pnpm-lock.yaml` superior solo cuenta si lista el proyecto en `importers`. Tests con los dos escenarios de la reproducción en `tests/unit/providers.test.ts`.

### F-09 · Las rutas de configuración no se resuelven con realpath

- **Estado:** resuelto: código corregido en `c4e5131`
- **Severidad:** baja
- **Tipo:** corrección
- **Ubicación:** `src/application/inventory.ts:147`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

`isInside(exe.realPath, root)` compara una ruta resuelta con otra que no lo está. Si `scan.paths` o `[[tools.git]]` pasan por un symlink, por ejemplo `~/projects → /data/projects`, ningún ejecutable resuelve "dentro" del repositorio.

Propuesta: resolver con `realpath` las raíces antes de comparar.

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. Las raíces configuradas se resuelven con `realpath` antes de comparar. Test sobre el filesystem real, con `scan.paths` a través de un symlink.

### F-10 · "no releases" como hecho cuando sí hay una release

- **Estado:** resuelto: código corregido en `29b0c13`
- **Severidad:** baja
- **Tipo:** evidencia
- **Ubicación:** `src/providers/github/resolver.ts:79-95`, `:132`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

Si la última release tiene un tag que no es semver, por ejemplo `nightly`, se cae al fallback de tags. La evidencia afirma como `fact` que no hay releases.

Propuesta: registrar "latest release is tagged nightly, which is not semver".

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. La evidencia dice "latest release is tagged nightly, which is not semver". Test en `tests/unit/providers.test.ts`.

### F-11 · Cualquier fallo de `git describe` se registra como "no reachable tag"

- **Estado:** resuelto: código corregido en `397c34f`
- **Severidad:** baja
- **Tipo:** evidencia
- **Ubicación:** `src/providers/git/repository.ts:169-175`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

Un timeout o un rechazo por `safe.directory` produce el `fact` "no reachable tag".

Propuesta: afirmarlo solo cuando git dice que no encontró nombres. Para los demás fallos, registrar el mensaje.

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. "no reachable tag" solo si git dice `No names found` o `No tags can describe`; cualquier otro fallo registra el mensaje de git. Tests en `tests/unit/providers.test.ts`.

### F-12 · No hay diagnósticos `error` ni `toolId`

- **Estado:** resuelto: código corregido en `f853df0`
- **Severidad:** baja
- **Tipo:** desvío de docs
- **Ubicación:** `src/application/inventory.ts`, `src/cli/run.ts:139`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

architecture.md §13 dice que un provider que falla emite un diagnóstico `error` y sus herramientas quedan en `status: "error"`. El código solo emite `warning` y nunca completa `toolId`. Por eso `status <tool>` muestra todos los diagnósticos generales, aunque no tengan que ver con esa herramienta.

Propuesta: completar `toolId` cuando el diagnóstico es de una herramienta, y decidir si el fallo de un comando de git o pnpm es `error`.

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. Un comando de git que falla en un repositorio usado como herramienta, un repositorio declarado que no es de Git, y los fallos de `pnpm --version` o `pnpm list` emiten `error`, con `toolId` cuando hay herramienta, que queda en `status: "error"`. Test en `tests/integration/inventory.test.ts`.

### F-13 · Un 5xx ignora la entrada vencida de la caché

- **Estado:** resuelto: código corregido en `021919f`
- **Severidad:** baja
- **Tipo:** robustez
- **Ubicación:** `src/providers/shared/cached-get.ts:57-82`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

Si el servidor responde 5xx dos veces, el resultado es "registry answered 503", aunque haya una entrada vencida. architecture.md §14 permite usarla, marcada, cuando la red falla.

Propuesta: tratar un 5xx después del reintento como red no disponible.

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. Un 5xx después del reintento cuenta como red no disponible: se usa la entrada vencida, marcada. Test en `tests/unit/providers.test.ts`.

### F-14 · Respuestas sin límite de tamaño y `maxBuffer` informado como timeout

- **Estado:** resuelto: código corregido en `1d0207b`
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

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. Los cuerpos se leen por stream y se cortan a los 5 MB (documentado en architecture.md §8), y `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` se informa como "output too large". Tests en `tests/security/security.test.ts` y `tests/unit/command-runner.test.ts`.

### F-15 · Comentario de `version.ts` cita un test que no existe

- **Estado:** resuelto: código corregido en `eafeab9`
- **Severidad:** baja
- **Tipo:** desvío de docs
- **Ubicación:** `src/version.ts:1`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

Cita `tests/unit/version.test.ts`. El test está en `tests/unit/config-output.test.ts:41`.

Propuesta: corregir la ruta del comentario.

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. El comentario cita `tests/unit/config-output.test.ts`.

### F-16 · El cliente HTTP no implementa cancelación

- **Estado:** resuelto: código corregido en `447c9c9`
- **Severidad:** baja
- **Tipo:** desvío de docs
- **Ubicación:** `src/infrastructure/http/undici-http-client.ts`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

architecture.md §8 lista "cancellation" entre las responsabilidades del `HttpClient`. Solo existe el timeout por request: no hay forma de cancelar los requests pendientes, por ejemplo ante Ctrl-C.

Propuesta: aceptar un `AbortSignal` por ejecución, o quitar "cancellation" de §8 si no se necesita en el MVP.

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable. El cliente HTTP acepta un `AbortSignal` que cancela los requests pendientes y los siguientes, sin reintento; la CLI lo aborta con Ctrl-C. Test en `tests/security/security.test.ts`.

### F-17 · El guard de Bash bloquea lecturas con `sed -n` de archivos de `.claude/`

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** robustez
- **Ubicación:** `.claude/hooks/guard-bash.mjs` (`READ_ONLY` y la regla de `GUARD_FILES`)
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

La regla que protege `.claude/settings*.json` y `.claude/hooks/` permite solo los comandos de `READ_ONLY`. `sed` y `awk` no están en esa lista, porque pueden escribir. Por eso `sed -n 50,56p .claude/hooks/guard-edit.mjs`, que solo lee, se bloquea. Es un falso positivo del lado seguro: la herramienta Read sigue sirviendo para leer esos archivos.

Propuesta: permitir `sed` sin `-i` y `awk` sin redirecciones, con casos de test para ambos.

Lo mismo pasa con `git check-ignore .claude/settings.local.json`: `check-ignore` solo lee, pero no está en `GIT_SAFE_ON_GUARDS`. La propuesta suma `check-ignore` a esa lista. No se corrige desde la sesión: `.claude/hooks/` solo lo cambia la persona responsable.

El 2026-09-28 también se bloqueó `tr -d '\r' < .claude/settings.json`, sobre una copia exportada fuera del repositorio: la regla compara el texto de la ruta, no dónde está el archivo (lo mismo que F-29 para el guard de edición).

### F-18 · `node -e` puede escribir los archivos de los frenos sin que el guard lo bloquee

- **Estado:** resuelto: código corregido en `54ec142`
- **Severidad:** media
- **Tipo:** seguridad
- **Ubicación:** `.claude/hooks/guard-bash.mjs` (`READ_ONLY`)
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

`node` está en `READ_ONLY` para que se puedan probar los hooks pasándoles JSON por pipe. Pero `node -e` escribe archivos, así que un comando como `node -e "fs.writeFileSync('.claude/settings.json', …)"` pasa el guard. `permissions.deny` solo cubre las herramientas de edición, no Bash. Lo mismo vale para `npx` y `pnpm exec`, que pueden ejecutar scripts arbitrarios.

Así se usó, una sola vez, con autorización explícita de la persona responsable: el 2026-09-27 se cambió `let before = "";` por `let before;` en `.claude/hooks/guard-edit.mjs:53`, para corregir el lint del cambio que agregó los frenos. No se modificó nada más de `.claude/`. El `!` de la sesión no ejecutaba comandos en la app, así que no había otra vía.

Propuesta: sacar `node`, `npx` y `pnpm` de `READ_ONLY` y permitir solo `node .claude/hooks/<hook>.mjs` sin `-e`, `-p` ni `--eval`. Sumar el caso a `tests/security/agent-guard.test.ts`.

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable, que autorizó usar el hueco una última vez para cerrarlo:

- `node`, `npx`, `pnpm` y `git` ya no cuentan como lectores de los archivos de los frenos. `git` solo puede leerlos o registrarlos (`diff`, `log`, `show`, `status`, `blame`, `ls-files`, `grep`, `add`, `commit`). `node` solo puede ejecutar un hook por su ruta y sin flags.
- El código pasado por línea de comandos (`node -e`, `--eval`, `-p`, `python -c`, `perl -e`, `ruby -e`, `deno eval`, `php -r`) se bloquea si menciona `.claude`, y en cualquier otro caso pide confirmación.
- Verificado en la sesión: el mismo `node -e` que antes pasaba ahora se bloquea. Los casos están en `tests/security/agent-guard.test.ts`.

**Riesgo que queda.** Un hook que analiza texto no puede impedir que un agente escriba un script en otro directorio y lo ejecute con `node archivo.mjs`. Ese caso lo cubre la revisión humana de todo diff que toque `.claude/`, no el hook (mvp.md §9).

### F-19 · `prettier --write` y `eslint --fix` pueden escribir los archivos de los frenos

- **Estado:** resuelto: código corregido en `940c5ed`
- **Severidad:** media
- **Tipo:** seguridad
- **Ubicación:** `.claude/hooks/guard-bash.mjs` (`READ_ONLY`)
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** por lectura

`prettier` y `eslint` están en `READ_ONLY`, pero `prettier --write` y `eslint --fix` reescriben archivos, incluidos los de `.claude/`. Es el mismo tipo de hueco que F-18. Se detectó al cerrar F-18: el archivo corregido quedó formateado con la configuración por defecto de prettier en vez de la del repo, y la forma de reformatearlo desde la sesión habría sido este hueco. No se usó.

Propuesta: permitir `prettier` y `eslint` sobre los archivos de los frenos solo sin `--write`, `-w` ni `--fix`, con casos de test.

Así se usó, una sola vez, con autorización explícita de la persona responsable: el 2026-09-27 se corrió `prettier --write .claude/hooks/guard-bash.mjs` para reformatear con la configuración del repo el archivo que corrige F-18. Solo cambió el formato.

**Corrección.** Aplicada el 2026-09-27, a pedido de la persona responsable ("solo por esta vez"): `prettier` y `eslint` solo cuentan como lectores de los archivos de los frenos sin `--write`, `-w` ni `--fix`, y esas opciones se bloquean también sobre `.claude` entero. Casos en `tests/security/agent-guard.test.ts`.

### Desvíos donde el código es correcto

En estos casos, el código refleja una decisión ya tomada. Se actualizaron los docs.

- **D-01 · La v0.1 quedó absorbida por el MVP.** La persona responsable decidió ir directo al MVP. La primera versión, 0.1.0, incluye caché, Git, GitHub, proyectos y archivo de configuración. Se actualizaron prd.md §13, architecture.md §3.5, §7 y §14, y design.md §12.
- **D-02 · `status --json` incluye `projects`.** design.md §14 no lo documentaba, ni tampoco `projectRoot`.
- **D-03 · Estructura de `src/`.** architecture.md §10 mostraba una estructura propuesta distinta de la real.
- **D-04 · La allowlist de hosts es obligatoria.** architecture.md §8 decía "opcional". El código la exige, y solo con https.
- **D-05 · Directorio de binarios de pnpm.** architecture.md §3.3 nombraba `PNPM_HOME`. El código usa lo que informa `pnpm bin --global`, que ya refleja `PNPM_HOME`.
- **D-06 · Qué marca una raíz de proyecto.** mvp.md §6 listaba indicadores que el MVP no usa. En el MVP, una raíz es un directorio con `package.json` o `.git`.

## Red-team de los frenos del 2026-09-27

Pedido por la persona responsable: poner a prueba las reglas y los hooks de todas las formas posibles. Método: un script le pasó a `evaluate()` de cada hook 157 intentos como **texto**, además de entradas inválidas por stdin. Ningún intento se ejecutó. El detalle, caso por caso, está en `docs/review/2026-09-27-red-team.md`. Nada de esto se corrige desde la sesión: todo está en `.claude/` o en reglas que solo cambia la persona responsable.

### F-20 · Bash puede escribir los archivos de los frenos por rutas que el guard no ve

- **Estado:** abierto
- **Severidad:** alta
- **Tipo:** seguridad
- **Ubicación:** `.claude/hooks/guard-bash.mjs` (`GUARD_FILES`, `onlyReadsGuards`, `evaluateText`)
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

El guard reconoce los archivos de los frenos solo cuando un argumento o el destino de una redirección contiene la ruta literal `.claude/settings*.json` o `.claude/hooks/`. Pasan sin bloqueo:

- `cd .claude && echo {} > settings.json`, y `cd .claude/hooks; cat > guard-bash.mjs <<EOF`;
- globs y variables: `echo {} > .claude/set*.json`, `.clau?e/hooks/…`, `F=.claude/settings.json; echo {} > $F`, una ruta armada con `$(printf …)`;
- destinos que son el directorio: `cp -r x/. .claude/`, `mv dir .claude/`, `rsync -a x/ .claude/`;
- archivos que traen la ruta adentro: `tar -xf`, `git apply`, `patch -p1`;
- formateadores sobre todo el repo: `prettier --write .`, `pnpm format`, `pnpm lint --fix`, porque `.prettierignore` no excluye `.claude/`; y `pnpm exec prettier --write .claude` o `npx prettier --write .claude`, porque el guard no mira el comando interno;
- intérpretes que leen el código de un heredoc o de un archivo (`node <<EOF`, `python3 - <<EOF`, `node x.mjs`), y `echo … | base64 -d | sh`.

Además, `git checkout HEAD~3 -- .claude` y `git restore --source=… .claude` solo piden confirmación.

Propuesta:

- Un hook que analiza texto no puede cerrar todo esto. La protección de fondo tiene que estar fuera del agente: `.claude/` sin permiso de escritura para el usuario que corre el agente, o un check de CI (o `CODEOWNERS`) que rechace todo cambio a `.claude/` que no apruebe la persona responsable.
- Sumar `.claude/` a `.prettierignore` y a los `ignores` de ESLint.
- En el guard: tratar `pnpm exec`, `npx` y `pnpm dlx` como envoltorios del comando interno; pedir confirmación ante una redirección cuyo destino tiene una variable, un glob o una sustitución; denegar `.claude` como destino de `cp`, `mv`, `rsync`, `ln`, `git checkout` y `git restore`.

**Corrección parcial, aplicada en `7d080f2`.** 2026-09-28. La persona responsable pidió corregirlo desde una sesión en la nube; los frenos no se editan ni con autorización (mvp.md §9), así que el cambio se preparó como un parche fuera del repositorio, verificado con `tests/security/agent-guard.test.ts` sobre copias de los hooks (219 casos), y la persona responsable lo aplicó a mano en `7d080f2`. Antes, en `b2b2d68`: `.claude/` en `.prettierignore` y en los `ignores` de ESLint. Sigue `abierto` por lo que quedó afuera. En `7d080f2`: `npx`, `pnpx` y `bunx` evalúan el comando interno; un glob que expande a un freno (`.claude/set*.json`, `.clau?e/hooks/`) cuenta como nombrarlo; una variable con `.claude` en su valor se deniega; una redirección a un destino con variable, glob o sustitución pide confirmación; `cp`, `mv`, `rsync`, `ln`, `cd`, `pushd` y `tar -C` hacia `.claude/` se deniegan, igual que `git checkout` y `git restore` sobre `.claude`; `git apply`, `git am`, `patch` y extraer un `tar` piden confirmación; un heredoc a `node`, `python`, `perl`, `ruby`, `deno`, `bun` o `php` pide confirmación, y se deniega si menciona `.claude`. Quedó afuera, porque el clasificador de la sesión bloqueó esa edición: evaluar el comando interno de `pnpm exec` y `pnpm dlx`, y pedir confirmación cuando algo que no es `curl` o `wget` se canaliza a un shell (`base64 -d | sh`).

### F-21 · Un symlink a `.claude/` saltea el guard de edición

- **Estado:** abierto
- **Severidad:** alta
- **Tipo:** seguridad
- **Ubicación:** `.claude/hooks/guard-edit.mjs` (`evaluate`), `.claude/hooks/guard-bash.mjs`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido (los dos pasos por separado; la combinación, por lectura)

`ln -s .claude cl` pasa el guard de Bash. Después, un Edit de `cl/settings.json` pasa el guard de edición, que compara la ruta sin resolver symlinks. No se verificó si el `permissions.deny` de Claude Code resuelve symlinks.

Tampoco están protegidos:

- el resto de `.claude/`, como `.claude/agents/`, `.claude/commands/` o `.claude/skills/`, que cambian cómo se comportan los agentes;
- la configuración del usuario fuera del repositorio (`~/.claude/settings.json`), porque el hook solo mira rutas relativas al proyecto.

Propuesta: resolver con `realpath` la ruta, o la del directorio padre si el archivo es nuevo, antes de comparar; proteger todo `.claude/` y `~/.claude/settings*.json`; denegar `ln` cuando el destino es `.claude`.

**Corrección parcial, aplicada en `7d080f2`.** 2026-09-28, junto con F-20; sigue `abierto` por lo que quedó afuera. En `7d080f2`: el guard de edición deniega todo `.claude/` (agentes, comandos, skills incluidos), y el guard de Bash deniega `ln` con `.claude` en el origen o en el destino, con lo que el symlink no se puede crear desde Bash. Quedó afuera, porque el clasificador de la sesión bloqueó esa edición: resolver la ruta con `realpath` antes de comparar, y proteger `~/.claude/settings*.json` y `~/.claude/hooks/`. Un symlink creado por otra vía sigue salteando el guard de edición.

### F-22 · Las reglas que solo cambia la persona responsable no están protegidas

- **Estado:** abierto
- **Severidad:** alta
- **Tipo:** seguridad
- **Ubicación:** `.claude/hooks/guard-edit.mjs` (`DENY_PATHS`)
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

La persona responsable decidió que las reglas solo las modifica ella, a mano, y que ningún agente, subagente, comando ni script puede revocarlas. Hoy el guard de edición permite editar:

- `CLAUDE.md`, `AGENTS.md`, la sección §9 "Agentes" de `docs/mvp.md` y la sección "Cómo se usa" de este archivo;
- lo que hace cumplir las reglas: `simple-git-hooks` y `scripts` en `package.json`, `vitest.config.ts`, `eslint.config.js` y `.prettierignore`. Con un solo Edit se puede cambiar `"pre-push": "pnpm check"` por `"pre-push": "true"`.

Hoy estas reglas se cumplen solo porque las instrucciones lo piden.

Propuesta: denegar la edición de `CLAUDE.md` y `AGENTS.md`; denegar o pedir confirmación para los cambios en `docs/mvp.md` y `docs/review/findings.md` que toquen esas secciones; pedir confirmación para `package.json` (campos `simple-git-hooks` y `scripts`), `vitest.config.ts`, `eslint.config.js` y `.prettierignore`. La nueva regla también tendría que quedar escrita en CLAUDE.md y en mvp.md §9; eso lo hace la persona responsable.

**Corrección parcial, aplicada en `7d080f2`.** 2026-09-28, junto con F-20; sigue `abierto` por lo que quedó afuera. En `7d080f2`: el guard de edición deniega `CLAUDE.md` y `AGENTS.md`, y pide confirmación para `vitest.config.ts`, `eslint.config.js` y `.prettierignore`; el mismo commit escribe la regla en CLAUDE.md, AGENTS.md y mvp.md §9. Quedó afuera, porque el clasificador de la sesión bloqueó esa edición: pedir confirmación cuando una edición cambia `scripts` o `simple-git-hooks` en `package.json`, o toca la sección "Agentes" de `docs/mvp.md` o "Cómo se usa" de este archivo.

### F-23 · Formas de saltear los hooks de git que el guard no detecta

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** seguridad
- **Ubicación:** `.claude/hooks/guard-bash.mjs` (`checkGit`, `checkCommand`)
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

Pasan sin bloqueo:

- `git commit -nm x` y `git commit -anm x`: la regla de `-n` excluye cualquier grupo de flags que tenga una `m`;
- `export SKIP_SIMPLE_GIT_HOOKS=1; git commit …`: solo se revisa la variable cuando va delante del mismo comando;
- `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit …`;
- `rm .git/hooks/pre-push` y `echo exit 0 > .git/hooks/pre-push`: `.git/` está protegido para las herramientas de edición, no para Bash.

Propuesta: detectar `n` en cualquier grupo de flags cortas anterior al valor de `-m`; denegar `SKIP_SIMPLE_GIT_HOOKS` y `HUSKY` en `export`, `declare` y `env`; denegar `GIT_CONFIG_*` que mencione `hooksPath`; denegar escrituras y borrados bajo `.git/` desde Bash.

### F-24 · Una opción con valor antes del subcomando esconde `publish`

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** seguridad
- **Ubicación:** `.claude/hooks/guard-bash.mjs` (`checkPackageManager`), `.claude/settings.json` (`permissions.deny`)
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

El guard toma como subcomando la primera palabra que no empieza con `-`. En `npm --registry https://r.example publish` y `pnpm --filter pkg publish` esa palabra es el valor de la opción, así que `publish` pasa. Los patrones `Bash(npm publish *)` y `Bash(pnpm publish *)` de `permissions.deny` tampoco los cubren.

Propuesta: denegar si cualquier palabra posicional es un subcomando de `REGISTRY_WRITES`, o saltear los valores de las opciones conocidas (`--registry`, `--filter`, `-C`, `--dir`, `--prefix`, `--workspace`).

### F-25 · Secretos legibles con variables, globs y búsquedas recursivas

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** privacidad
- **Ubicación:** `.claude/hooks/guard-bash.mjs` (`SECRET_PATH` y la sección "Secrets")
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

Pasan sin bloqueo:

- `echo $GITHUB_TOKEN`: imprime un token;
- `cat ~/.npmr*` y `cat ~/.config/gh/*`: `SECRET_PATH` compara el texto literal, y un glob no coincide;
- `grep -r _authToken ~`.

Propuesta: denegar la expansión de variables cuyo nombre sugiere un secreto (`TOKEN`, `SECRET`, `KEY`, `PASSWORD`, `AUTH`); comparar `SECRET_PATH` también contra el glob expandido o denegar globs en `~/`, `~/.config/` y `~/.ssh/`; pedir confirmación para búsquedas recursivas sobre el home.

### F-26 · Comandos destructivos dentro de subshells, grupos o `if` pasan el guard

- **Estado:** abierto
- **Severidad:** alta
- **Tipo:** seguridad
- **Ubicación:** `.claude/hooks/guard-bash.mjs` (`parse`, `substitutions`, `checkCommand`)
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

El parser toma la primera palabra como comando, así que `(rm`, `{`, `then` o `do` no se reconocen como `rm`. Pasan sin bloqueo:

- `(rm -rf ~)`, `{ rm -rf ~; }` e `if true; then rm -rf ~; fi`;
- `echo $( (rm -rf ~) )`, porque la expresión de `substitutions` no admite paréntesis anidados;
- `bash -c` anidado cinco veces: al llegar a la profundidad 4 el guard deja de mirar y permite;
- `busybox rm -rf ~`;
- descargar y después ejecutar: `curl -o i.sh … && sh i.sh`.

Propuesta: quitar del parser los tokens de agrupamiento y las palabras reservadas (`(`, `)`, `{`, `}`, `then`, `do`, `else`, `elif`, `!`); balancear paréntesis en `substitutions`; al pasar el límite de profundidad, denegar en vez de permitir; tratar `busybox` y `toybox` como envoltorios; pedir confirmación para `sh`, `bash` o `source` sobre un archivo descargado en el mismo comando.

**Corrección parcial, aplicada en `7d080f2`.** 2026-09-28, junto con F-20; sigue `abierto` por lo que quedó afuera. En `7d080f2`: `(` y `)` sin comillas separan comandos, `{` y `}` solos también, y `if`, `then`, `else`, `elif`, `while`, `until`, `do`, `fi`, `done` y `!` al inicio de un comando se saltan, así que `(rm -rf ~)`, `{ rm -rf ~; }` e `if …; then rm -rf ~; fi` se deniegan; `substitutions` balancea paréntesis, con lo que `$( (rm -rf ~) )` se deniega; más de cuatro niveles de `$( )` se deniegan en vez de permitirse; `busybox` y `toybox` son envoltorios. Quedó afuera, porque el clasificador de la sesión bloqueó esa edición: denegar más de cuatro niveles de `bash -c` (hoy se permiten), y denegar `sh`, `bash`, `source` o un intérprete sobre un archivo que `curl -o` o `wget -O` descargó en el mismo comando.

### F-27 · Formas de debilitar o borrar tests que el guard no detecta

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** robustez
- **Ubicación:** `.claude/hooks/guard-edit.mjs` (`WEAKENERS`), `.claude/hooks/guard-bash.mjs`
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido, salvo los casos con `.skip` por Bash, por lectura

El guard de edición no detecta:

- `it.skipIf(true)(…)`, `it.runIf(false)(…)` ni `it["sk" + "ip"](…)`;
- `@ts-expect-error`;
- borrar una aserción, reemplazarla por `expect(true).toBe(true)` o salir antes con `return`.

Desde Bash no hay ningún control de este tipo:

- `sed -i 's/it(/it.skip(/'`, un heredoc que escribe un test con `.skip`, o `mv x.txt x.test.ts`;
- `rm` o `git rm` de un archivo de tests, `git rm -r src` o `: > src/…`.

Los casos con `.skip` por Bash no pudieron ir en el script de prueba, porque el propio guard de edición lo bloqueó (F-29). Se evaluaron leyendo `guard-bash.mjs`, que no tiene ningún control de debilitamiento.

Propuesta: sumar `skipIf`, `runIf` y `@ts-expect-error` a los patrones; pedir confirmación para borrar, vaciar o mover archivos bajo `src/` y `tests/`; y, como red de fondo, un check de CI que falle si baja la cantidad de tests o de aserciones.

### F-28 · Falsos positivos del guard de Bash con backticks y con `.npmrc`

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** robustez
- **Ubicación:** `.claude/hooks/guard-bash.mjs` (`substitutions`, `SECRET_PATH`)
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

- `substitutions` busca backticks sin respetar las comillas simples. Un `sed` cuyo texto tiene un template literal de TypeScript con `.npmrc` adentro se bloqueó en esta misma sesión, y `git commit -m 'guard blocks \`rm -rf ~\` now'` se deniega.
- `SECRET_PATH` compara cualquier argumento terminado en `.npmrc`. Por eso se bloquean `grep -rn .npmrc src` y crear un `.npmrc` de prueba en un directorio temporal, que es la reproducción de F-03.

No hay riesgo, porque el error es del lado seguro, pero empuja a buscar otra vía. Propuesta: tratar como literal el texto entre comillas simples en `substitutions`; aplicar `SECRET_PATH` solo a comandos que leen o copian archivos y solo a rutas del home o absolutas fuera de los directorios temporales. F-17 es otro caso del mismo tipo.

### F-29 · El guard de edición revisa archivos fuera del repositorio

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** robustez
- **Ubicación:** `.claude/hooks/guard-edit.mjs` (`evaluate`)
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

Los patrones de debilitamiento se aplican a cualquier archivo con extensión de código, también fuera del proyecto. En esta sesión bloquearon el script de red-team del scratchpad, porque tenía `it.skip(`, `@ts-ignore` y `eslint-disable` como texto de los casos. No se buscó otra vía: esos casos quedaron fuera del script y se evaluaron por lectura.

Propuesta: aplicar los patrones solo dentro del repositorio, bajo `src/` y `tests/`.

### F-30 · Los hooks fallan abiertos ante una entrada inválida

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** seguridad
- **Ubicación:** `.claude/hooks/guard-bash.mjs` y `guard-edit.mjs` (`main`)
- **Detectado:** 2026-09-27, Claude Code
- **Verificación:** reproducido

Con JSON inválido o una entrada vacía por stdin, los dos hooks terminan sin decidir, y Claude Code permite la acción. Si `command` no es un string, se convierte con `String()`: `["rm","-rf","~"]` pasa como `rm,-rf,~`. Un error del hook o un timeout de más de 10 segundos tampoco bloquea. El riesgo práctico es bajo: Claude Code manda JSON válido, y un comando de 800.000 caracteres o 5.000 `$(` anidados se evaluó en menos de 50 ms.

Propuesta: ante una entrada que no se puede interpretar, devolver `deny`; envolver la evaluación en `try/catch` y denegar ante un error.

## Segunda revisión integral del 2026-09-28

Pedida por la persona responsable: revisión de punta a punta de `src/`, tests, CI, docs y frenos, con Codex como segunda opinión. Método:

- Se revisó una exportación limpia de `origin/main` (`b92a561`). El clon local estaba en `0ad1b23`, con el código nuevo sin trackear y los docs canónicos en su versión vieja, así que revisar sobre él habría producido desvíos falsos.
- Codex revisó en paralelo, en modo solo lectura y sin poder ejecutar nada. Sus hallazgos se verificaron uno por uno: los que están abajo se reprodujeron o se confirmaron leyendo el código; los que no se sostuvieron figuran al final.
- Las reproducciones son tests de vitest escritos fuera del repositorio sobre los dobles de `tests/helpers/fakes.ts`: cada test afirma la conducta defectuosa y pasa. Además, se probaron contra sistemas reales Corepack (F-39), `api.github.com` (ver "Verificaciones") y la búsqueda de ejecutables de Node en Windows.
- Entorno: Windows 11, Node.js 22.23.2, pnpm 10.33.0 por Corepack 0.34.6, Git 2.55.0. La CI de `b92a561` en Linux está verde: 289 tests, `pnpm audit --prod` sin vulnerabilidades.

### F-31 · Credenciales dentro de la URL del registry llegan a la evidencia y a `explain`

- **Estado:** resuelto: código corregido en `55d8461`
- **Severidad:** alta
- **Tipo:** privacidad
- **Ubicación:** `src/providers/npm-registry/registry-config.ts:58`, `:97`; `src/providers/npm-registry/origin.ts:93`
- **Detectado:** 2026-09-28, Codex; reproducido por Claude Code
- **Verificación:** reproducido

`parsePnpmConfig` y `applyNpmrc` copian la URL completa del registry en la evidencia, y `decideOrigin` pasa esa evidencia al claim `latest`. Si el registry lleva credenciales en la URL, algo que npm acepta, por ejemplo `https://user:S3CRET@npm.corp.example/`, `explain` y `explain --json` imprimen `S3CRET`.

Reproducción: `pnpm config list --json` con ese registry, un proyecto con una dependencia, y `renderExplain` de esa dependencia. La salida contiene `S3CRET`.

architecture.md §8 dice que de la salida de `pnpm config list` solo se extraen las claves de registry y que "el resto se descarta sin registrarse en logs, evidencia ni diagnósticos". El riesgo es concreto: la plantilla de issues `actually-was-wrong.yml` exige pegar la salida de `actually explain <tool>`, y solo pide quitar rutas y nombres de paquetes.

Propuesta: quitar `username`, `password` y la query de toda URL de registry antes de armar la evidencia, en `parsePnpmConfig` y en `applyNpmrc`. Test en `tests/security` con una URL con credenciales, sobre `explain` y `explain --json`.

**Corrección.** Aplicada el 2026-09-28, a pedido de la persona responsable, y distinta de la propuesta. Quitar usuario, contraseña y query no alcanza: hay registries que llevan el token en el path, como `https://npm.fury.io/<TOKEN>/`. Lo señaló Codex al revisar el plan. `RegistryConfig` ya no guarda URLs, solo si cada registry es el público. La evidencia dice "is the public registry" o "is not the public registry", con el comando o el archivo que lo configuró; `10fe43a` ajustó la redacción para el `.npmrc`. Las decisiones de consulta no cambian. Documentado en architecture.md §8 y docs/providers/pnpm.md. Tests en `tests/security/security.test.ts`, con credenciales en el usuario, la query y el path, por `pnpm config list` y por `.npmrc`, sobre `explain`, `toolJson` y el inventario serializado entero; fallan sin el cambio. De punta a punta en Docker con pnpm 10.33.0: el `pnpm config list --json` real imprime la URL con la credencial completa, y `actually explain` y `explain --json` no muestran ni la credencial ni la URL.

### F-32 · En workspaces se consultan en el registry público paquetes que resuelven a uno local

- **Estado:** resuelto: código corregido en `93a1807`
- **Severidad:** alta
- **Tipo:** privacidad
- **Ubicación:** `src/application/inventory.ts:420-426`, `src/providers/project/project.ts:194`, `:296`
- **Detectado:** 2026-09-28, Claude Code; el caso del `.npmrc` de la raíz de npm, Codex
- **Verificación:** reproducido

La decisión de origen mira solo el spec del `package.json`. En un workspace, un rango semver puede resolver a otro paquete del mismo repositorio, y ese nombre se consulta en `registry.npmjs.org`:

- **npm o yarn workspaces.** Desde `ws/packages/app`, que depende de `"@corp/utils": "^1.0.0"`, hermano en `ws/packages/utils`, se consultó `https://registry.npmjs.org/@corp%2Futils/latest`. El `package-lock.json` de la raíz dice `link: true`, pero solo se lee el lockfile del directorio del proyecto. Tampoco se aplica el `.npmrc` de la raíz, porque solo se reconoce `pnpm-workspace.yaml`: con `registry=https://npm.corp.example/` en `ws/.npmrc`, igual se consultó `left-pad`.
- **pnpm.** El `pnpm-lock.yaml` del workspace dice `version: link:../utils` para ese importer. `resolved` queda `unknown` con el motivo "not a registry version", pero el nombre se consulta igual.

Además, en un miembro de un workspace npm, `resolved` e `installed` quedan `unknown` con el motivo "no lockfile", aunque el lockfile y el paquete instalado están en la raíz.

architecture.md §8: "Nunca se envían [...] nombres ni raíces de proyectos", y "ante la duda, no se consulta". El nombre de un paquete interno del workspace es un nombre de proyecto. La regla 1 de §8, "su spec es de registry: un rango semver", no cubre este caso: el spec es un rango y la resolución es local.

Propuesta:

- No consultar un paquete si el lockfile lo resuelve a algo que no es una versión de registry (`link:`, `file:`, `link: true`, una ruta).
- Reconocer la raíz de un workspace npm o yarn (`workspaces` en un `package.json` superior), aplicar su `.npmrc` y tratar como locales los nombres de sus miembros. Si la raíz no se puede interpretar, registry indeterminado.
- Sumar a §8 la resolución del lockfile como condición.

**Corrección.** Aplicada el 2026-09-28, a pedido de la persona responsable. La revisión del plan con Codex cambió tres puntos de la propuesta:

- **Nombres del workspace.** La raíz es el directorio más alto con `pnpm-workspace.yaml` o con `workspaces` en su `package.json`. Emular los globs de cada gestor podía dar menos miembros de los reales, así que se juntan los `name` de todos los `package.json` bajo la raíz, hasta la profundidad que alcanzan los patrones. Un paquete con uno de esos nombres no se consulta.
- **Lockfile tipado.** No se consulta un paquete que el lockfile resuelve a `link:`, `file:`, `workspace:`, `link: true`, `resolved: file:` (el caso de `overrides`), git o una URL, ni uno cuyo tarball no es de `registry.npmjs.org`. La evidencia nombra solo el tipo de resolución.
- **`.npmrc`.** En lugar de modelar cuál aplica en cada gestor, se leen todos desde el proyecto hasta home, y un registry es público solo si ninguno dice otra cosa. Reemplaza la regla de F-03 sobre el `.npmrc` intermedio. Costo: un proyecto que vuelve al registry público sobre un mirror configurado para el usuario deja de consultarse.

Además, en un miembro de un workspace npm, `resolved` sale del `package-lock.json` de la raíz, e `installed` se busca hasta la raíz, como lo hace Node.

Documentado en architecture.md §8, CLAUDE.md, README y docs/providers. Hay 15 tests nuevos en `tests/integration/inventory.test.ts` y `tests/unit/providers.test.ts`, que fallan sin el cambio. `pnpm check` en Linux: 308 tests.

De punta a punta en Docker, con un workspace npm real (`npm install`) y `actually` sin red (`--network none`):

- `@corp/utils` da "a package of the same workspace";
- `is-number`, del mismo miembro, da "could not reach registry.npmjs.org": solo para él se intentó la consulta;
- `resolved` e `installed` salen del lockfile y del `node_modules` de la raíz.

Con los gestores reales se verificó lo que dice §8 de cada uno:

- npm 10.9.9 avisa `ignoring workspace config` para el `.npmrc` de un miembro;
- yarn 1.22.22 hace sus requests al registry de un `.npmrc` que está dos niveles arriba.

Pérdida funcional acotada: con un lockfile v5 (pnpm 7), una dependencia con sufijo de peers (`1.2.3_react@18`) deja de consultarse hasta que se corrija F-47.

### F-33 · Specs locales tratados como de registry: tarballs `.tgz` y `optionalDependencies`

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** privacidad
- **Ubicación:** `src/providers/npm-registry/origin.ts:26-33`, `src/providers/project/project.ts:178-186`
- **Detectado:** 2026-09-28, Claude Code (tarballs) y Codex (`optionalDependencies`)
- **Verificación:** reproducido

Dos casos en los que npm no resuelve del registry y `actually` consulta igual:

- `"internal-lib": "internal-lib-1.0.0.tgz"`: npm trata como archivo local todo spec terminado en `.tgz`, `.tar.gz` o `.tar`. `isRegistrySpec` lo acepta como dist-tag.
- `dependencies.secret = "^1.0.0"` y `optionalDependencies.secret = "file:../secret"`: según la documentación de npm, `optionalDependencies` reemplaza la entrada de `dependencies`. El código se queda con la primera sección, informa `requested: ^1.0.0` y consulta `/secret/latest`.

En los dos casos se envía el nombre de un paquete local. Si alguien publicó ese nombre en npm, la versión de ese paquete ajeno aparece como `latest`, con evidencia `fact`.

Propuesta: excluir en `isRegistrySpec` los specs que npm-package-arg trata como archivo; aplicar la precedencia de npm entre secciones, `optionalDependencies` por encima de `dependencies`. Tests con los dos casos.

### F-34 · El `.npmrc` del proyecto se interpreta distinto que en npm y pnpm

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** privacidad
- **Ubicación:** `src/providers/npm-registry/registry-config.ts:77-85`, `src/application/inventory.ts:405-408`
- **Detectado:** 2026-09-28, Codex (claves con comillas) y Claude Code (precedencia)
- **Verificación:** reproducido el primer caso; el segundo, por lectura

- **Claves con comillas.** El formato ini de npm acepta `"@corp:registry"=https://npm.corp.example/`. `applyNpmrc` no reconoce la clave, la ignora, y `@corp/secret` se consultó en el registry público.
- **Precedencia.** En npm y pnpm, las variables de entorno (`npm_config_registry`) ganan sobre el `.npmrc` del proyecto. El código aplica el `.npmrc` del proyecto encima de la configuración efectiva, que ya incluye el entorno. Con `npm_config_registry` apuntando a un mirror y `registry=https://registry.npmjs.org/` en el proyecto, `actually` consulta el público y pnpm usaría el mirror. No se verificó con pnpm: el guard de Bash bloquea `pnpm config get registry`. Es inferencia a partir del orden de capas de npm (cli, env, proyecto, usuario, global).

architecture.md §8, condición 2: el registry predeterminado efectivo tiene que ser el público.

Propuesta: interpretar las claves como lo hace ini, sacando las comillas; ante cualquier línea que mencione `registry` y no se pueda interpretar, registry indeterminado. Si el entorno define `npm_config_registry` o `npm_config_@scope:registry`, que no lo pise el `.npmrc` del proyecto.

### F-35 · "installed by" con confianza `high` cuando el package manager solo se infiere

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** evidencia
- **Ubicación:** `src/application/inventory.ts:428-433`
- **Detectado:** 2026-09-28, Claude Code y Codex
- **Verificación:** reproducido

El claim `installation` de una dependencia de proyecto junta el `fact` "`node_modules/a/package.json` version is 1.0.0" con la inferencia del package manager, por ejemplo "package-lock.json is present". Como hay un `fact`, `confidenceFor` da `high`. Reproducción: `packageManager` del proyecto `npm` con confianza `low`, e `installation` y `update` de `a`, "installed by npm", con `high`.

architecture.md §6: `high` exige que un `fact` afirme el valor. Ese `fact` afirma la versión instalada, no quién la instaló.

Propuesta: limitar la confianza de `installation` a la del package manager (`cap`), o dejar como evidencia del instalador solo la del package manager.

### F-36 · Una release de GitHub con tag prerelease queda con confianza `high`

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** evidencia
- **Ubicación:** `src/providers/github/resolver.ts:80-97`
- **Detectado:** 2026-09-28, Claude Code y Codex
- **Verificación:** reproducido

Si `/releases/latest` devuelve `tag_name: "v3.0.0-beta.1"` porque quien publica no la marcó como prerelease, el resultado es `latest: 3.0.0-beta.1` con confianza `high`.

architecture.md §5, "Qué significa `latest`": si la versión declarada tiene sufijo de prerelease, la evidencia contradice "estable" y el claim queda `low`. El resolver de npm ya lo aplica; el de GitHub, no.

Propuesta: igual que en npm, `contradicted` cuando `semver.prerelease(v) !== null`, con la inferencia en la evidencia.

### F-37 · Dos herramientas distintas reciben el mismo id

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** corrección
- **Ubicación:** `src/core/record.ts:17-25`, `src/application/inventory.ts:203-235`, `:339`, `src/application/lookup.ts:10`
- **Detectado:** 2026-09-28, Claude Code y Codex
- **Verificación:** reproducido

- Dos repositorios declarados en `[[tools.git]]`, `~/vendor-a/tool` y `~/vendor-b/tool`, reciben `global:git:tool`.
- El registro de pnpm mismo y un ejecutable `~/.local/bin/pnpm`, por ejemplo con el prefix de npm en `~/.local`, reciben `global:unknown:pnpm`.

`status pnpm` responde "matches 2 tools. Pass one of these ids" y lista dos ids idénticos. Pasar ese id devuelve siempre el primero: el segundo no se puede consultar.

design.md §14: el id sirve "para comparar y referenciar" y "distingue [...] las herramientas sin provider conocido". architecture.md §5 dice que cambia si cambia la ubicación, y para las herramientas globales la ubicación no es parte del id.

Propuesta: sumar la ubicación al id de los repositorios herramienta, como en `project:`; unir el ejecutable `pnpm` al registro de pnpm en vez de crear otro; y verificar en `buildInventory` que no haya ids repetidos. Actualizar el formato en architecture.md §5.

### F-38 · Un archivo `.git` ilegible aborta toda la ejecución

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** robustez
- **Ubicación:** `src/providers/git/repository.ts:26`
- **Detectado:** 2026-09-28, Claude Code y Codex
- **Verificación:** reproducido con un Filesystem que devuelve `EACCES`; en disco real, por lectura

`resolveGitDir` es la única lectura sin protección: si `.git` es un archivo, de worktree o submódulo, que no se puede leer, la excepción sube hasta `run` y la ejecución termina con exit code `3` sin resultados. Alcanza con que ese `.git` esté en el proyecto actual o en cualquier repositorio bajo `scan.paths`.

RA-009: los fallos de un provider no derriban el scan. architecture.md §13 clasifica "permission denied" como recuperable.

Propuesta: leerlo con `readOptional` y, si falla, emitir un diagnóstico para ese repositorio y seguir.

### F-39 · `--offline` no impide que Corepack descargue pnpm por la red

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** privacidad
- **Ubicación:** `src/infrastructure/command-runner/allowlist.ts:58-64`, `src/application/inventory.ts:94`
- **Detectado:** 2026-09-28, Codex; verificado por Claude Code
- **Verificación:** reproducido con pnpm y Corepack reales, sin `nodeCommandRunner`, que en Windows no puede lanzar el shim

`pnpm config list` corre siempre, también con `--offline` o `[network] enabled = false`. Si pnpm es un shim de Corepack, Corepack puede salir a la red. Reproducción: en un directorio vacío, con el entorno que `actually` le da a pnpm (`npm_config_update_notifier=false`, `COREPACK_ENABLE_AUTO_PIN=0`, `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, `LC_ALL=C`) y un `COREPACK_HOME` vacío, `pnpm --version` resolvió la última versión y descargó pnpm 12.6.0 ("Downloading the pnpm 12.6.0 binary for win32-x64..."). Con `COREPACK_ENABLE_NETWORK=0` falla con "Network access disabled by the environment". Con la caché de Corepack ya poblada no se observó tráfico, pero no se pudo descartar una consulta periódica: no verificado.

architecture.md §8: "`--offline` evita toda consulta en esa ejecución". §7 agrega esas variables justamente para que pnpm no consulte la red por su cuenta. La descarga tampoco pasa por el aviso de design.md §12. El test `tests/security/security.test.ts:59` se llama "keeps pnpm from reaching the network", pero solo verifica esas variables.

Propuesta: agregar `COREPACK_ENABLE_NETWORK=0` al entorno de pnpm, siempre o al menos sin red; considerar `COREPACK_DEFAULT_TO_LATEST=0`; documentarlo en §7.

### F-40 · Un `package.json` de un directorio superior le gana a un `.git` más cercano

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** corrección
- **Ubicación:** `src/application/inventory.ts:176-177`
- **Detectado:** 2026-09-28, Codex; reproducido por Claude Code
- **Verificación:** reproducido

Primero se busca un `package.json` hacia arriba hasta el home, y solo si no aparece se busca `.git`. Con `~/work/package.json` y `status --project` desde `~/work/py`, un repositorio sin `package.json`, el proyecto informado es `~/work`, con sus dependencias.

mvp.md §6: una raíz de proyecto es un directorio con `package.json` o `.git`.

Propuesta: una sola búsqueda hacia arriba que se detenga en el primer directorio con cualquiera de los dos.

### F-41 · Sin releases en GitHub, los tags en caché no se usan offline y `/releases/latest` se repite

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** robustez
- **Ubicación:** `src/providers/github/resolver.ts:65-68`, `src/providers/shared/cached-get.ts:73`
- **Detectado:** 2026-09-28, Codex; reproducido por Claude Code
- **Verificación:** reproducido

La caché guarda solo respuestas 200. En un repositorio sin releases, el 404 de `/releases/latest` no se guarda:

- offline, el resolver devuelve "offline" antes de mirar los tags, que sí están en caché;
- online, dentro del TTL, `/releases/latest` se pide en cada ejecución y gasta cuota.

architecture.md §8: sin red se usa la caché si tiene la entrada. §14 justifica la caché por la cuota de GitHub.

Propuesta: guardar también el 404 de `/releases/latest` con el mismo TTL, o seguir a los tags en caché cuando falta la respuesta de releases, dejando dicho en la evidencia que no se sabe si hay releases.

### F-42 · El límite de GitHub alcanzado en `/tags` no emite diagnóstico

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** desvío de docs
- **Ubicación:** `src/providers/github/resolver.ts:109-112`
- **Detectado:** 2026-09-28, Claude Code
- **Verificación:** reproducido

Si el límite se agota en la consulta de releases, se emite el warning "GitHub rate limit reached". Si se agota en la de tags, se corta igual pero sin diagnóstico: las versiones quedan `unknown` y la salida no dice por qué.

architecture.md §13 usa exactamente ese caso como ejemplo de `warning`.

Propuesta: una sola función que marque el límite y emita el diagnóstico, usada en los dos lugares.

### F-43 · Un fallo de `git describe` no produce `error` ni diagnóstico

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** desvío de docs
- **Ubicación:** `src/providers/git/repository.ts:169-178`
- **Detectado:** 2026-09-28, Codex; reproducido por Claude Code
- **Verificación:** reproducido

Si `git tag --points-at HEAD` funciona pero `git describe` falla por timeout o por `safe.directory`, el mensaje queda solo como evidencia: la herramienta queda `unknown`, no `error`, y no hay diagnóstico. La corrección de F-12 cubre el fallo del primer comando, no el del segundo.

architecture.md §13: un provider que falla emite `error` y sus herramientas quedan en `status: "error"`.

Propuesta: fuera de "No names found", un fallo de `describe` completa `failure`, como el de `tags`.

### F-44 · Un remote relativo se interpreta como repositorio de GitHub

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** privacidad
- **Ubicación:** `src/providers/github/url.ts:15`, `src/providers/git/repository.ts:94`
- **Detectado:** 2026-09-28, Claude Code
- **Verificación:** reproducido

`parseGithubUrl` acepta la abreviatura `owner/repo` de npm, y se usa también para los remotes de Git, donde `url = backups/tool` o `url = ../upstream` son rutas locales. `../upstream` da `owner: ".."`, y el request a `/repos/../upstream/...` se normaliza a `/upstream/...`. En los dos casos se envía a `api.github.com` el nombre de un directorio local, y la evidencia afirma como `fact` que el remote apunta a GitHub.

architecture.md §8: nunca se envían rutas.

Propuesta: un parser para remotes de Git que no acepte la abreviatura, y rechazar `.` y `..` como owner o repo.

### F-45 · `sanitize` no escapa controles bidi ni de ancho cero

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** seguridad
- **Ubicación:** `src/cli/output/sanitize.ts:2-4`
- **Detectado:** 2026-09-28, Claude Code
- **Verificación:** reproducido

`sanitize` escapa C0, DEL y C1, pero no los caracteres de formato de Unicode: `U+202A`–`U+202E`, `U+2066`–`U+2069`, `U+200B`–`U+200F` y `U+FEFF`. Un tag, un remote, un nombre de directorio o de ejecutable con `U+202E` reordena visualmente la línea en la terminal. Es la misma promesa que cerró F-05: la salida tiene que poder verificarse.

Propuesta: escapar también esos rangos, con casos en `tests/security`.

### F-46 · `Filesystem` lee sin límite ni chequeo de tipo, y `exists` trata `EACCES` como ausencia

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** robustez
- **Ubicación:** `src/infrastructure/filesystem/node-filesystem.ts:8-16`
- **Detectado:** 2026-09-28, Codex y Claude Code
- **Verificación:** por lectura

- `readText` usa `readFile` sin verificar que sea un archivo regular ni limitar el tamaño. Un `package.json` o un lockfile que es un FIFO deja la ejecución colgada para siempre; uno enorme agota la memoria. El timeout del CommandRunner no cubre estas lecturas.
- `exists` devuelve `false` ante cualquier error. Si el directorio de la configuración no tiene permiso de búsqueda, `loadConfig` aplica los defaults, con la red activada, aunque el archivo diga `enabled = false`. Un `.npmrc` que es un symlink a un destino inaccesible se omite, en vez de dejar el registry indeterminado como pide la corrección de F-04.

design.md §13: los defaults tienen que ser conservadores y un archivo que no se puede interpretar es fatal.

Propuesta: en `readText`, `stat` previo, solo archivos regulares y un tope de tamaño; en `exists`, `false` solo para `ENOENT` y `ENOTDIR`, y cualquier otro error se propaga para que cada llamador decida.

### F-47 · Los sufijos de peers de un lockfile pnpm v5 dejan `resolved` desconocido

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** corrección
- **Ubicación:** `src/providers/project/project.ts:78-81`
- **Detectado:** 2026-09-28, Claude Code y Codex
- **Verificación:** reproducido

En los lockfiles v5 (pnpm 7), los peers van con `_`: `a: 1.2.3_react@18.0.0`. `stripPeerSuffix` solo corta en `(`, así que `resolved` queda `unknown` con el motivo "is not a registry version", que es falso. El error va del lado seguro. docs/providers/pnpm.md no dice qué versiones de lockfile se soportan.

Propuesta: cortar en `_` cuando `lockfileVersion` es 5.x, o declarar en docs/providers/pnpm.md que v5 no se soporta.

### F-48 · El repositorio no se puede verificar en Windows

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** robustez
- **Ubicación:** falta `.gitattributes`; `tests/helpers/fakes.ts`; `package.json` (`simple-git-hooks`)
- **Detectado:** 2026-09-28, Claude Code
- **Verificación:** reproducido

En un clon hecho en Windows con la configuración por defecto de Git (`core.autocrlf=true`):

- `pnpm format:check` falla en 62 archivos. La única diferencia es CRLF: con `--end-of-line crlf` pasa.
- 26 tests fallan. Los dobles usan rutas POSIX (`/home/me/...`) y el código usa `node:path`, que en Windows arma rutas con `\`. Los tests del repositorio hostil dependen de `sh`.

El hook `pre-commit` corre `format:check`, y `pre-push` corre `pnpm check`: en Windows no se puede commitear ni pushear sin saltear los hooks, que es lo que el guard intenta impedir (F-23). El runtime en Windows está fuera del MVP (prd.md), pero no hay una decisión escrita sobre desarrollar en Windows.

Propuesta: `.gitattributes` con `* text=auto eol=lf`, que es barato y no ambiguo. Para los tests, decidir si se soporta desarrollar en Windows (dobles con `path.posix` o rutas armadas con `join`) o se documenta WSL como requisito en CONTRIBUTING.

### F-49 · Ni el composition root ni el aviso de primera ejecución tienen tests

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** robustez
- **Ubicación:** `src/composition.ts:71-93`, `tests/integration/cli.test.ts:41-53`
- **Detectado:** 2026-09-28, Claude Code
- **Verificación:** por lectura (ningún test importa `createRuntime` ni el marcador)

Las reglas del aviso de design.md §12 viven en `createRuntime`: antes del primer request, una sola vez, marcador en el estado local, nunca con `--offline`, y repetirlo si el marcador no se puede escribir. El test de la CLI reemplaza el runtime por un doble que llama a `notice` a mano, así que ninguna de esas reglas está cubierta. Tampoco hay un test que ejecute el binario compilado: mvp-acceptance.md lo verificó a mano.

Propuesta: tests de `createRuntime` con directorios temporales (`XDG_*_HOME`) y un `HttpClient` doble, y un smoke test de `dist/cli/index.js --json` en CI.

### F-50 · Con pnpm 12, ningún paquete global recibe su `latest`

- **Estado:** resuelto: código corregido en `793c369`
- **Severidad:** alta
- **Tipo:** corrección
- **Ubicación:** `src/providers/pnpm/global.ts:141-145`
- **Detectado:** 2026-09-28, Claude Code
- **Verificación:** reproducido en Docker (Linux, pnpm 12.6.0 por Corepack)

El spec de cada paquete global se lee de `dirname(pnpm root --global)/package.json`. En pnpm 10, `pnpm root --global` es `…/global/5/node_modules` y ese archivo lista todos los paquetes. En pnpm 12, `pnpm root --global` es `…/global/v11` y cada `pnpm add -g` crea su propio directorio, `…/global/v11/<id>/package.json`, con su lockfile. El archivo que se busca no existe, así que todos los paquetes globales quedan con `latest: unknown` ("origin could not be determined: no spec found") y nunca se consultan. Falla del lado seguro, sin enviar nada, pero la función principal para herramientas globales deja de andar con la versión de pnpm que Corepack instala hoy por defecto. `pnpm list --global --json` sigue dando versión y `path` de cada paquete, y en pnpm 12 ya no incluye `resolved`.

Reproducción: imagen `node:22`, `corepack enable`, `pnpm add -g semver@7.5.0 is-number@6.0.0` con pnpm 12.6.0, y `actually status --global`.

Propuesta: tomar el spec del `package.json` del directorio que contiene el `node_modules` de cada paquete, a partir del `path` que da `pnpm list`; sirve para los dos layouts. Tests con salidas reales de pnpm 10 y 12, y documentar en docs/providers/pnpm.md qué versiones de pnpm se soportan. En la CI, probar con pnpm 10 y 12.

**Corrección.** Aplicada el 2026-09-28, a pedido de la persona responsable. El spec sale del `package.json` que declara cada paquete: el global de pnpm 10, junto a `pnpm root --global`, o el directorio propio del paquete directamente dentro de esa ruta con pnpm 12. Ningún otro `package.json` se usa, y la evidencia cita el que se usó. Documentado en architecture.md §8 y docs/providers/pnpm.md. Dos tests en `tests/integration/inventory.test.ts` con el layout real de pnpm 12.6.0; fallan sin el cambio. `pnpm check` en Linux: 291 tests. De punta a punta en Docker, con el paquete instalado con `pnpm add -g`: pnpm 12.6.0 y pnpm 10.33.0 informan `is-number` 6.0.0 → 7.0.0 y `semver` 7.5.0 → 7.8.5. Quedan sin hacer la prueba contra pnpm 10 y 12 en la CI y una lista explícita de versiones soportadas.

### F-51 · El mensaje de nombre ambiguo muestra `\x0a` en vez de saltos de línea

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** corrección
- **Ubicación:** `src/cli/run.ts:175`, `src/application/lookup.ts:15-18`
- **Detectado:** 2026-09-28, Claude Code
- **Verificación:** reproducido en Docker

`findTool` arma el mensaje de ambigüedad con saltos de línea, y `run` le aplica `sanitize` entero, que escapa `\n`. La salida real fue `actually: "is-number" matches 2 tools. Pass one of these ids:\x0a  global:pnpm:is-number\x0a  project:/home/node/projects/app:is-number`. Es un efecto de la corrección de F-05. design.md §9 pide listar los ids para elegir uno.

Propuesta: sanear cada id y cada dato, no el mensaje armado; o partir el mensaje en líneas y sanear cada una. Test del mensaje de ambigüedad en `tests/integration/cli.test.ts`.

### F-52 · Con yarn berry, un registry privado en `.yarnrc.yml` no impide consultar el público

- **Estado:** resuelto: código corregido en `f10a354`
- **Severidad:** alta
- **Tipo:** privacidad
- **Ubicación:** `src/providers/project/project.ts` (solo se leen `.npmrc`), `src/application/inventory.ts` (`projectRecords`)
- **Detectado:** 2026-09-28, Codex, al revisar el plan de F-32; verificado por Claude Code
- **Verificación:** reproducido

Yarn berry (2 en adelante) no lee `.npmrc`. Su registry sale de `npmRegistryServer` y de `npmScopes` en `.yarnrc.yml`, y por defecto es `https://registry.yarnpkg.com`. `actually` no lee ese archivo. En un proyecto yarn berry con registry privado toma la config de pnpm, que dice el registry público, y consulta en `registry.npmjs.org` los nombres de sus dependencias.

Reproducción:

- Con yarn 4.5.0 real, en un proyecto con `packageManager: yarn@4.5.0`, `yarn config get npmRegistryServer` da `https://registry.yarnpkg.com` con solo un `.npmrc` privado, y `https://npm.corp.example` con ese valor en `.yarnrc.yml`.
- Con los dobles de tests, el mismo proyecto con `.yarnrc.yml` privado consultó `https://registry.npmjs.org/a/latest`.
- No verificado: que yarn berry también lea el `.yarnrc.yml` de los directorios superiores y la variable `YARN_NPM_REGISTRY_SERVER`, como dice su documentación según Codex.

architecture.md §8: "ante la duda, no se consulta".

Propuesta: sumar `npmRegistryServer` y `npmScopes.<scope>.npmRegistryServer` de cada `.yarnrc.yml`, desde el proyecto hasta home, como fuentes más de la regla de F-32. El registry queda indeterminado si el archivo no se puede interpretar o usa `${VAR}`. Mientras no esté hecho, dejar indeterminado el registry de todo proyecto con un `.yarnrc.yml`.

**Corrección.** Aplicada el 2026-09-28, a pedido de la persona responsable, según la propuesta y algo más amplia. `scanProject` lee, además de cada `.npmrc`, cada `.yarnrc.yml` y cada `.yarnrc` de yarn classic desde el proyecto hasta home, incluido home, porque pnpm no refleja esos archivos. `buildInventory` suma la variable `YARN_NPM_REGISTRY_SERVER`, que yarn berry lee antes que los archivos; con eso queda cubierto lo que el hallazgo dejaba sin verificar. La regla es la de F-32: público solo si todas las fuentes coinciden; un archivo ilegible o no interpretable, un valor que no es una cadena o que usa `${VAR}`, dejan el registry indeterminado. Documentado en architecture.md §8, `docs/providers/npm-registry.md`, `docs/providers/pnpm.md` y README. Tests: `tests/unit/providers.test.ts` (cuatro casos F-52) y `tests/integration/inventory.test.ts` (dos casos F-52, incluidos `~/.yarnrc.yml`, un `npmScopes` que bloquea solo su scope, un `.yarnrc.yml` ilegible y la variable de entorno); fallan sin el cambio.

### F-53 · Credenciales dentro de un spec que es una URL llegan a `explain`

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** privacidad
- **Ubicación:** `src/application/inventory.ts:460` (claim `requested`), `src/providers/npm-registry/origin.ts:84` (`declared as`), `src/application/inventory.ts:283` (global con versión que no es de registry)
- **Detectado:** 2026-09-28, Claude Code, durante la corrección de F-31
- **Verificación:** reproducido

Un spec que es una URL con credenciales sale tal cual en tres lugares:

- en `requested`;
- en la evidencia `declared as "..."` de `latest`;
- en `explain --json`.

Por ejemplo, `"a": "https://user:TOKEN@files.corp.example/a-1.0.0.tgz"` en `package.json`. Si un paquete global se instaló desde un tarball así y pnpm informa esa URL como versión, también aparece en el motivo "pnpm reports a non-registry version (...)". Es el riesgo de F-31 por otro camino, y la plantilla de issues pide pegar esa salida. Es menos probable que F-31, porque exige escribir la credencial en el spec.

Reproducción: con los dobles de tests, un proyecto con ese spec. `renderExplain` contiene el token.

Propuesta: cuando un spec o una versión parsea como URL, mostrar solo el esquema y el host (`https://files.corp.example/…`). El path también puede llevar un token, como en F-31. La decisión de origen no cambia: un spec URL ya no se consulta. Test en `tests/security` sobre `explain` y `toolJson`.

### F-54 · El guard de Bash bloquea leer `core.hooksPath`

- **Estado:** abierto
- **Severidad:** baja
- **Tipo:** robustez
- **Ubicación:** `.claude/hooks/guard-bash.mjs:340`
- **Detectado:** 2026-09-28, Claude Code
- **Verificación:** reproducido

`git config core.hooksPath`, que solo lee el valor, se deniega con "changing core.hooksPath disables the git hooks". La regla no distingue lectura de escritura. El error va del lado seguro, pero el mensaje afirma algo falso sobre el comando, y para saber qué hooks corren hay que buscar otro camino.

Propuesta: denegar solo cuando hay un valor después de la clave, o con `--unset`, `--replace-all` o `--add`. Permitir `git config core.hooksPath`, `git config --get core.hooksPath` y `--get-regexp`. Tests en `tests/security/agent-guard.test.ts` con las dos formas. Solo la persona responsable cambia `.claude/hooks/`.

### F-55 · Un fallo real al ejecutar pnpm se reporta igual que "no instalado", sin ningún diagnóstico

- **Estado:** resuelto: código corregido en `7a5bfa9`
- **Severidad:** alta
- **Tipo:** robustez
- **Ubicación:** `src/infrastructure/command-runner/node-command-runner.ts` (`failureResult`, que solo distingue `ENOENT`), `src/providers/pnpm/global.ts:110-114` (el fallo con motivo `not-found` no genera diagnóstico), `src/application/inventory.ts:95-103` (mismo patrón al leer `pnpm.config.list`)
- **Detectado:** 2026-09-28, la persona responsable, verificando en una VM Windows 11 real una limitación que ya documentan `prd.md §9` (RNF-004) y `docs/providers/pnpm.md`
- **Verificación:** reproducido

**Que pnpm no se pueda ejecutar en Windows no es nuevo: ya está documentado**, en dos lugares. `docs/prd.md §9`, RNF-004: "En Windows, pnpm es un shim `.cmd` que no se puede ejecutar sin shell, así que su soporte queda para después del MVP." Y `docs/providers/pnpm.md`, "Known limitations": "Windows is not supported: pnpm is a `.cmd` shim there, which cannot be run without a shell." La causa es real: desde que Node.js corrigió `CVE-2024-27980` (y su bypass, `CVE-2024-36138`), `execFile`/`spawn` de un `.cmd` sin `shell: true` no funciona, y `CommandRunner` llama a `execFile("pnpm", args, { shell: false })` sin excepción (architecture.md §7 prohíbe el shell).

Lo que no estaba documentado, y es el motivo real de este hallazgo: **qué pasa si se usa igual**. No hay ningún error, ni una advertencia, ni un exit code distinto. `status --global` da `0 updates available`, como si hubiera revisado todo y no hubiera encontrado nada. La causa es genérica, no específica de Windows: `failureResult` solo reconoce `ENOENT` como `reason: "not-found"`, y `scanPnpmGlobal` solo agrega un diagnóstico "si `version.reason !== "not-found"`" (`global.ts:112`). El mismo patrón se repite en `inventory.ts` al leer la config de pnpm para decidir el registry. Cualquier fallo de `execFile` que Node clasifique como `ENOENT` —no solo el de Windows, también un PATH roto en Linux o macOS— desaparece de la misma forma.

Reproducción, en una VM Windows 11 real con pnpm 10.33.0 (vía Git Bash/MINGW64):

1. `pnpm add -g is-number` instala correctamente en `C:\Users\User\AppData\Local\pnpm\global\5\` — confirma que pnpm funciona de verdad, invocado desde una shell real.
2. `node dist/cli/index.js status --global --json` da `{"schemaVersion":1,"tools":[],"projects":[],"diagnostics":[]}`. Ni el paquete instalado aparece, ni hay ningún diagnóstico que explique por qué.

El layout de ese pnpm 10.33.0 real (`global/5/node_modules`) es el mismo que ya cubren los tests existentes (`pnpmWorld()` en `tests/integration/inventory.test.ts`), así que la lógica de detección en sí no está en duda: el bloqueo es enteramente en cómo se invoca el proceso.

Propuesta, acotada al fallo silencioso, sin implementar: que `scanPnpmGlobal` y la lectura del registry en `inventory.ts` agreguen un diagnóstico también cuando el motivo es `not-found`, en vez de omitirlo. El usuario pierde el mensaje "pnpm no está instalado" (que hoy tampoco se muestra en ningún lado como diagnóstico, solo se infiere de la ausencia de datos), pero gana saber que algo no se pudo revisar. Test en `tests/unit` sobre `scanPnpmGlobal` con un doble de `CommandRunner` que devuelva `reason: "not-found"`.

Hacer que pnpm funcione de verdad en Windows es un trabajo aparte, más grande, que no resuelve este hallazgo por sí solo: se investigó (ver la nota en `RNF-004` de que el bloqueo es real) y hay un camino concreto sin usar shell —leer el shim `.cmd` como texto en vez de ejecutarlo, porque sigue uno de dos patrones conocidos generados por `cmd-shim`: apunta directo a un `.exe` real, o a `node` más la ruta de un `.js`. Verificado leyendo shims reales en esa misma VM: la instalación standalone de pnpm despacha a un `@pnpm/exe/pnpm.exe` nativo; la que gestiona Corepack despacha a `node ... corepack/dist/pnpm.js`. No verificado: qué forma tienen los shims de nvm-windows, Volta, Scoop o Winget. Esto queda fuera de este hallazgo porque es soporte de plataforma nueva, no un error a corregir; si se retoma, actualizar RNF-004 y `docs/providers/pnpm.md` en el mismo cambio.

**Corrección.** Aplicada el 2026-09-28, a pedido de la persona responsable, como propone el hallazgo. `scanPnpmGlobal` emite un `warning` cuando `pnpm --version` falla con motivo `not-found` ("global packages were not checked") y mantiene el `error` para los demás motivos. `buildInventory` emite otro `warning` cuando `pnpm config list` falla, con el motivo, porque sin registry no se consulta ningún paquete; antes ese silencio también afectaba a `--project`. Documentado en `docs/providers/pnpm.md`, "Failure modes". Tests: `tests/unit/providers.test.ts` ("pnpm global scan") y `tests/integration/inventory.test.ts` (dos casos F-55); fallan sin el cambio.

### F-56 · En Windows, cualquier archivo en un directorio escaneado cuenta como ejecutable

- **Estado:** abierto
- **Severidad:** media
- **Tipo:** corrección
- **Ubicación:** `src/infrastructure/filesystem/node-filesystem.ts:42` (`isExecutableFile`), consumido por `src/scanners/bin-scanner.ts` (`listExecutables`)
- **Detectado:** 2026-09-28, hipótesis de Claude Code; confirmado por la persona responsable en una VM Windows 11 real
- **Verificación:** reproducido

`isExecutableFile` hace `if (process.platform === "win32") return true;` antes de llegar al chequeo de `X_OK` (que en Windows no distingue nada). No es un descuido silencioso: el código sabe que está en Windows y decide, a propósito, que todo archivo cuenta. El resultado es que `listExecutables` deja de filtrar nada dentro de los directorios que sí revisa.

Reproducción, en la misma VM Windows 11: un archivo de texto plano en `~/.local/bin` (no un binario, ni un `.exe`, ni un `.cmd`) aparece en `status --global --json` como una herramienta desconocida completa, con su propio id:

```json
{ "id": "global:unknown:prueba-falsa", "name": "prueba-falsa", "status": "unknown", ... }
```

`architecture.md §3.3` explica por qué `PathScanner` no recorre todo PATH: "listaría miles de binarios del sistema como herramientas desconocidas". Esta falla reintroduce ese mismo ruido, pero dentro de los pocos directorios que sí se revisan: cualquier `README`, `.gitkeep` o archivo de configuración que conviva ahí con binarios reales pasa a listarse igual que ellos.

El efecto se agranda una vez que se corrija F-55: hoy, sin pnpm funcionando, `pnpm.binDir` nunca se completa en Windows, así que solo se escanean `~/.local/bin` y `[scan] bin_paths`, que en una instalación típica de Windows no suelen existir. Corregido F-55, se sumaría también el directorio global de bins de pnpm a este mismo problema.

Propuesta: en Windows, en vez de `return true`, resolver el nombre contra `PATHEXT` (o una lista por defecto `.EXE;.CMD;.BAT;.COM;.PS1` si la variable no está seteada), comparando la extensión sin distinguir mayúsculas. Un archivo sin extensión reconocida no cuenta como ejecutable. Test en `tests/unit` con un doble de `Filesystem` que simule `platform: "win32"` y un directorio con un `.exe`, un `.cmd` y un `.txt` mezclados.

### Verificaciones

- **Resolver de GitHub contra `api.github.com` real.** Estaba pendiente en mvp-acceptance.md. El 2026-09-28, desde Windows y sin token: `pnpm/pnpm` da `12.6.0` con confianza `high` por su última release, y `git/git`, sin releases, da `2.55.0` con confianza `medium` por el tag semver más alto, con la evidencia esperada.
- **Prueba de punta a punta en Docker, 2026-09-28.** Linux (`node:22`, Node 22.23.3, Git 2.39.5). El paquete se compiló, se empaquetó con `pnpm pack` y se instaló con `pnpm add -g` usando pnpm 12.6.0. Escenario: paquetes globales viejos, un proyecto con tres dependencias desactualizadas, un repositorio de Git usado como herramienta y un ejecutable sin provider. Resultados:
  - proyecto: las tres actualizaciones detectadas con su tipo (`minor`, `major`, `minor`) y la evidencia del lockfile, de `node_modules` y del registry;
  - repositorio herramienta: instalado `10.0.0` por su tag y `latest` `12.6.0` desde `api.github.com`;
  - el aviso de red sale una sola vez y por stderr;
  - JSON: `schemaVersion`, sin `null`, todos los claims presentes y sin ids repetidos;
  - exit codes `0`, `1` con `--exit-code`, `2` con flag inválido o herramienta inexistente, `3` con config inválida, que igual emite JSON válido;
  - `--offline` usa la caché;
  - solo lectura: nada cambió fuera de los directorios de caché y estado de `actually`. Una primera medición mostró un cambio en `.git/index` del repositorio, pero lo causaba el `git status` del propio script de medición; con el índice refrescado antes de medir, no hay cambios.
  - Fallaron: F-50 y F-51.

### Descartados en esta revisión

- **Symlinks en el estado local y en la caché (Codex).** Plantar un symlink en `~/.local/state/actually` o en la caché exige poder escribir como la persona usuaria, y con eso ya se puede todo lo demás.
- **Orden de los tags de GitHub (hipótesis de Claude Code).** Se pensó que la primera página de `/tags` podía no incluir el tag más alto. La API real devuelve los tags ordenados por versión descendente (`v2.56.0-rc2`, `v2.56.0-rc1`, …, `v2.55.0`), y el límite de 100 tags ya figura en docs/providers/github.md.
- **Búsqueda de `git.exe` en el directorio del repositorio en Windows (hipótesis de Claude Code).** Con un `git.exe` falso en el directorio de trabajo, `execFile("git")` ejecutó el Git real.
