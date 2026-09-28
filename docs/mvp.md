# actually? — MVP

## 1. Propósito

`actually?` es una herramienta local-first, open source y orientada a desarrolladores para inspeccionar el estado de herramientas, repositorios y dependencias presentes en una máquina.

El MVP debe responder, de forma segura y explicable, preguntas como:

- ¿Qué herramientas y repositorios relevantes tengo?
- ¿Qué versión tengo instalada?
- ¿Cuál es la última versión estable conocida?
- ¿Cómo se detectó esa herramienta?
- ¿Qué evidencia existe sobre su origen o método de instalación?
- ¿Está desactualizada?
- ¿Qué tan confiable es esa conclusión?

El MVP no debe modificar el sistema del usuario.

---

## 2. Principios del MVP

### 2.1 Local-first
Toda la detección ocurre en la máquina del usuario.

No existe un backend de `actually?`.

La red solo se utiliza para consultar metadata pública necesaria para resolver versiones. Esas consultas le revelan al servicio consultado el nombre de cada paquete o repositorio verificado. El detalle de qué se envía y a quién está en architecture.md §8.

Esa metadata se guarda en una caché local con vencimiento (architecture.md §14).

### 2.2 Read-only
La versión inicial es estrictamente de observación.

`actually?` no:

- instala paquetes;
- elimina paquetes;
- actualiza paquetes;
- ejecuta `git pull`;
- cambia permisos;
- escribe dentro de proyectos detectados;
- escala privilegios.

Las únicas escrituras que hace `actually?` son en sus propios directorios de caché y de estado local, fuera de los proyectos detectados (architecture.md §3.5).

### 2.3 Explicable
Toda conclusión importante debe poder ser explicada mediante evidencia.

Ejemplo:

```text
gstack 1.0.0

Detected executable:
~/.local/share/pnpm/gstack

Owned by:
pnpm

Latest version (npm dist-tag "latest"):
2.0.0

Confidence:
high
```

### 2.4 Honestidad ante incertidumbre
Si `actually?` no puede determinar con seguridad un dato, debe mostrarlo como desconocido.

Nunca debe inferir información inexistente solo para completar una salida.

### 2.5 Sin telemetría obligatoria
`actually?` no recopila datos de uso, rutas locales, nombres de proyectos ni información del entorno, porque no tiene servidor.

Los servicios externos que se consultan, npm y GitHub, sí ven los nombres de los paquetes y repositorios verificados. Eso se explica en el primer uso y se puede evitar con `--offline`.

---

## 3. Usuario objetivo

El MVP está dirigido principalmente a:

- desarrolladores;
- power users;
- maintainers;
- usuarios de múltiples runtimes;
- personas que trabajan con varios repositorios;
- personas que mantienen herramientas globales;
- usuarios que combinan package managers, repositorios Git y CLIs.

No está diseñado inicialmente como gestor de software para usuarios no técnicos.

---

## 4. Alcance funcional

### 4.1 Comandos iniciales

El MVP tiene dos comandos:

```bash
actually status
actually status --global
actually status --project
actually status <tool>
actually explain <tool>
```

- `status` muestra el estado resumido. Sin configuración, revisa las herramientas globales y el proyecto de la carpeta actual, así que no hace falta configurar nada para empezar. Si `scan.paths` está configurado, también revisa los proyectos bajo esas rutas.
- `status <tool>` muestra el detalle de una herramienta (design.md §8).
- `explain <tool>` muestra la evidencia de cada afirmación (design.md §9).
- Ambos comandos aceptan `--json` y `--offline`.
- `status` acepta `--exit-code` para usarlo en scripts (architecture.md §3.1).

Quedan fuera del MVP:

- `scan`: la caché solo guarda metadata pública y el inventario local se recalcula siempre, así que no tendría una función distinta de `status`.
- `info`: su contenido pasa a `status <tool>`.
- `doctor`: no tiene una función definida.
- `init`: la configuración no es obligatoria (design.md §12).

### 4.2 Salida para humanos

Ejemplo:

```text
actually

GLOBAL

✓ pnpm
  installed  12.0.0
  latest     12.0.0

↑ gstack
  installed  1.0.0
  latest     2.0.0
  provider   pnpm
  confidence high
```

### 4.3 Salida estructurada

Todo comando relevante debe poder ofrecer salida JSON.

```bash
actually status --json
```

El contrato JSON está definido en design.md §14. Es una proyección del modelo de dominio de architecture.md §5.

---

## 5. Ecosistemas soportados inicialmente

### 5.1 pnpm
Debe poder:

- detectar paquetes globales administrados por pnpm;
- obtener versiones instaladas;
- identificar rutas relevantes;
- relacionar paquetes con metadata de npm cuando exista.

### 5.2 npm

Hay dos cosas distintas con el mismo nombre:

- **npm registry** (fuente de versiones): entra en el MVP. Es imprescindible porque los paquetes administrados por pnpm se publican ahí. Resuelve la versión con el dist-tag `latest`, que por convención es la última estable, y el campo `repository` de cada paquete.
- **npm CLI** (install provider): la detección de paquetes instalados con `npm install -g` queda para la Fase 2.

Las dependencias declaradas en el `package.json` de un proyecto se leen en el MVP, sin importar qué package manager las instaló.

### 5.3 Git
Debe poder:

- reconocer repositorios;
- detectar remotes;
- identificar el commit actual;
- detectar tags locales;
- identificar si existe un remote GitHub.

No debe afirmar que un repositorio fue “instalado mediante git clone” solamente por contener `.git`.

#### Proyecto o herramienta

Un repositorio propio y uno clonado para usar una herramienta se ven iguales en disco. La regla del MVP:

- Todo repositorio encontrado bajo `scan.paths` es un **proyecto**. Aparece como sección `PROJECT`, nunca como una fila de herramienta desconocida.
- Un repositorio es una **herramienta** solo con evidencia positiva:
  - el usuario lo declara en la configuración (`[[tools.git]]`, design.md §13), lo que cuenta como `fact`; o
  - un ejecutable de los directorios de PATH escaneados (architecture.md §3.3) resuelve, siguiendo symlinks, a un archivo dentro del repositorio, lo que cuenta como `inference`.

Para un repositorio que es herramienta:

- `versions.installed` es el tag semver más alto que apunta a `HEAD`.
- Si `HEAD` no tiene un tag semver, `versions.installed` es `unknown`. La evidencia registra el commit actual, el último tag alcanzable y la distancia a él.
- `versions.latest` se resuelve con GitHub según §5.4.
- `installation` es `git`, con la ruta del repositorio.

### 5.4 GitHub
Debe poder resolver:

1. última release estable;
2. si no existe, último tag compatible con semver;
3. si no existe ninguno, versión desconocida.

`HEAD` de `main` no debe interpretarse como una nueva versión.

---

## 6. Descubrimiento de proyectos

El MVP no escaneará el sistema de archivos completo.

El usuario podrá definir directorios raíz:

```toml
[scan]

paths = [
  "~/projects",
  "~/dev",
  "~/tools"
]
```

El scanner buscará indicadores como:

- `.git`;
- `package.json`;
- `pnpm-lock.yaml`;
- `package-lock.json`;
- `yarn.lock`;
- `bun.lock`;
- `pyproject.toml`;
- `Cargo.toml`;
- `go.mod`;
- `mise.toml`.

En el MVP, una raíz de proyecto es un directorio con `package.json` o `.git`, y la búsqueda no desciende dentro de ella. El proyecto actual es el directorio más cercano hacia arriba, hasta home, que tenga cualquiera de los dos. Los lockfiles se leen dentro de cada proyecto. Los demás indicadores quedan para los providers de la Fase 2.

---

## 7. Modelo mínimo de datos

El modelo de dominio se define una sola vez, en architecture.md §5. Para el MVP importan estos conceptos:

- `ToolRecord`: una herramienta o dependencia detectada, con su scope, versiones, origen, instalación, estado y evidencia.
- `Claim`: una afirmación con estado explícito (`known`, `unknown` o `not-applicable`), su propia confianza y su evidencia.
- `Evidence`: cada observación que respalda un claim, marcada como hecho o como inferencia.
- `ConfidenceLevel`: `low`, `medium` o `high`, por claim.
- `ToolStatus`: el estado derivado que muestra `status`.

---

## 8. Seguridad del MVP

### 8.1 Sin shell interpolation

Prohibido:

```ts
exec(`pnpm ${input}`);
```

Permitido únicamente mediante un runner controlado:

```ts
commandRunner.run({ command: "pnpm.list.global" });
```

Quien usa el runner elige un comando de una lista cerrada. No pasa binario, argumentos ni entorno (architecture.md §7).

### 8.2 Allowlist de comandos

El `CommandRunner` solo permite comandos explícitamente aprobados.

La lista completa, con el comando exacto y el directorio de trabajo de cada uno, está en architecture.md §7. Agregar un comando requiere un ADR.

`pnpm` nunca se lanza dentro de un proyecto detectado, y `git` se lanza con un entorno endurecido, porque un repositorio ajeno puede definir comandos que esas herramientas ejecutan.

Ejemplos prohibidos:

```text
pnpm add
pnpm remove
git pull
rm
chmod
sudo
```

### 8.3 Sin privilegios elevados

`actually?` nunca debe requerir `sudo` ni modo administrador.

Si no puede leer algo, reporta el límite y continúa.

### 8.4 Aislamiento de infraestructura

Los providers y scanners no pueden importar directamente:

```text
node:child_process
node:fs
fetch
axios
undici
```

Estas capacidades deben pasar por abstracciones controladas.

---

## 9. Guardrails de desarrollo

El repositorio debe incluir:

- lint;
- typecheck;
- unit tests;
- integration tests;
- security tests;
- architecture tests;
- dependency audit;
- hooks locales;
- CI obligatoria.

### Pre-commit

```bash
pnpm lint && pnpm format:check && pnpm test:architecture
```

Sobre todo el repositorio, no solo los archivos modificados: los tres tardan segundos, y así el hook no depende de qué haya en el índice.

### Pre-push

```bash
pnpm check
```

### CI

Debe bloquear merge ante:

- fallos de lint;
- errores de tipos;
- tests fallidos;
- violaciones arquitectónicas;
- uso directo de APIs prohibidas;
- fallos de seguridad.

### Agentes

Los agentes de código que trabajan en el repositorio tienen dos frenos adicionales.

**Hallazgos: se informan, no se corrigen.** Los docs son la fuente de verdad. Si un agente encuentra un error, un check que falla por fuera de su tarea, o una diferencia entre el código y los docs:

1. No modifica código, tests ni docs para corregirlo, y no lo esquiva.
2. Lo anota en `docs/review/findings.md`, con la plantilla de ese archivo.
3. Se lo informa a la persona responsable, con el id, la ubicación, el impacto y una propuesta.

Un hallazgo se corrige solo cuando la persona lo pide por su id. Si decide que el código es el correcto, se actualiza la sección canónica del doc y el hallazgo se cierra así. Un fallo que introduce el propio cambio en curso no es un hallazgo: es parte de ese cambio.

**Comandos peligrosos: se bloquean antes de ejecutarse.** `.claude/settings.json` registra dos hooks `PreToolUse`:

- `.claude/hooks/guard-bash.mjs` revisa cada comando de shell. Bloquea lo destructivo o irreversible: borrados recursivos amplios, `git push --force` o a `main`, saltear hooks con `--no-verify`, reescribir o borrar historia, publicar en npm, privilegios elevados, escribir discos, ejecutar scripts descargados y leer secretos, como la salida de `pnpm config list`. Pide confirmación para lo que descarta trabajo local, cambia la configuración de git, modifica el entorno global que `actually` inspecciona o agrega dependencias. El código pasado por línea de comandos (`node -e`, `python -c` y similares) o por un heredoc a un intérprete pide confirmación siempre, y se bloquea si menciona `.claude`. Mira adentro de subshells, grupos, `if`, `for` y `while`, de `$( )` anidados y de `npx`, `pnpm exec`, `pnpm dlx` y `busybox`; más de cuatro niveles de `$( )`, `bash -c` o `eval` se bloquean. Bloquea ejecutar un archivo que `curl` o `wget` descargó en el mismo comando, y pide confirmación para todo texto que se canaliza a un shell o a un intérprete. Bloquea nombrar los frenos con un glob o guardarlos en una variable, y `cp`, `mv`, `rsync`, `ln`, `cd`, `tar -C`, `git checkout` y `git restore` hacia `.claude/`. Pide confirmación para redirigir a una ruta armada en tiempo de ejecución y para `git apply`, `patch` y extraer un `tar`.
- `.claude/hooks/guard-edit.mjs` revisa cada edición de archivos, con la ruta tal como se escribió y con la ruta que resulta de resolver los symlinks. Bloquea editar todo `.claude/`, `~/.claude/settings*.json`, `~/.claude/hooks/`, `CLAUDE.md`, `AGENTS.md`, `pnpm-lock.yaml`, `.git/` y la foto `docs/review/2026-09-cross-review.md`, e impide introducir `.skip(`, `.only(`, `.todo(`, `@ts-ignore`, `@ts-nocheck` o `eslint-disable`. Pide confirmación para editar `.github/workflows/`, `vitest.config.ts`, `eslint.config.js` y `.prettierignore`, para cambiar `scripts` o `simple-git-hooks` en `package.json`, y para cambiar esta sección o la sección "Cómo se usa" de `docs/review/findings.md`.

Solo la persona responsable cambia estos frenos. `tests/security/agent-guard.test.ts` verifica cada regla.

**Lo protegido no se modifica, ni con autorización.** Un agente nunca modifica lo que los frenos o los controles de permisos de la sesión le impiden modificar, y nunca pide permiso para hacerlo. Una autorización no habilita el cambio. Si hace falta un cambio ahí, el agente notifica el problema o el error, con la ubicación, el impacto y la propuesta, y lo anota como hallazgo cuando puede hacerlo. El cambio lo aplica la persona responsable.

Los hooks son una red de seguridad, no un límite infalible: un comando ofuscado puede evadir un patrón. No reemplazan los controles de CI ni la revisión humana.

---

## 10. Regla para nuevos providers

Ningún provider entra al proyecto sin:

1. tests;
2. documentación;
3. estrategia de detección;
4. fuentes de evidencia;
5. comandos ejecutados;
6. archivos inspeccionados;
7. requests de red;
8. limitaciones conocidas;
9. análisis de seguridad.

---

## 11. Fuera de alcance del MVP

No se implementará inicialmente:

- actualización automática;
- instalación de software;
- desinstalación;
- GUI;
- extensión de VS Code;
- JetBrains plugin;
- login;
- cloud sync;
- backend;
- cuentas;
- telemetry;
- acceso a repositorios privados. El token de GitHub está apagado por defecto y, si se activa, solo se usa para ampliar el límite de requests (architecture.md §14);
- ejecución automática de migraciones;
- corrección automática del entorno.

---

## 12. Criterio de éxito

El MVP es exitoso si un usuario puede instalar `actually?` con pnpm y obtener, de forma segura y explicable, una visión útil del estado de su entorno sin que la herramienta modifique nada.

Un escenario mínimo válido:

```bash
pnpm add -g @getactually/cli
actually status
```

El paquete se publica como `@getactually/cli` porque en npm el nombre `actually` y el scope `@actually` ya pertenecen a otras cuentas. El comando sigue siendo `actually`: lo define el campo `bin`, no el nombre del paquete (design.md §3).

Resultado esperado:

- herramientas relevantes detectadas;
- versión instalada;
- versión estable disponible cuando pueda resolverse;
- origen o provider cuando exista evidencia;
- grado de confianza;
- posibilidad de explicar cómo se llegó a esa conclusión.

---

## 13. Filosofía resumida

```text
detect
compare
explain
```

Antes de:

```text
install
update
remove
```

`actually?` observa primero y actúa después.
