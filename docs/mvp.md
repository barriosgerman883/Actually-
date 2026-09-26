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

La red solo se utiliza para consultar metadata pública necesaria para resolver versiones.

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

### 2.3 Explicable
Toda conclusión importante debe poder ser explicada mediante evidencia.

Ejemplo:

```text
gstack 1.0.0

Detected executable:
~/.local/share/pnpm/gstack

Owned by:
pnpm

Latest stable version:
2.0.0

Confidence:
high
```

### 2.4 Honestidad ante incertidumbre
Si `actually?` no puede determinar con seguridad un dato, debe mostrarlo como desconocido.

Nunca debe inferir información inexistente solo para completar una salida.

### 2.5 Sin telemetría obligatoria
No se recopilan datos de uso, rutas locales, nombres de proyectos, repositorios privados ni información del entorno.

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

```bash
actually scan
actually status
actually status --global
actually status --project
actually info <tool>
actually explain <tool>
actually doctor
```

> **Decisión pendiente (open-questions #4, #18):** `doctor` no aparece en ningún otro documento, `init` solo existe en design.md §12 y `scan` se solapa con `status`. Tampoco está decidido si `info` se mantiene separado de `explain`.

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

- **npm registry** (fuente de versiones): entra en el MVP. Es imprescindible porque los paquetes administrados por pnpm se publican ahí. Resuelve la última versión estable y el campo `repository` de cada paquete.
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
  - un ejecutable de los directorios de PATH escaneados resuelve, siguiendo symlinks, a un archivo dentro del repositorio, lo que cuenta como `inference`.

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

No todos estos formatos necesitan soporte funcional completo en el MVP; algunos pueden utilizarse únicamente como señales de contexto.

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
commandRunner.run({
  binary: "pnpm",
  args: ["list", "--global", "--json"],
  intent: "read"
});
```

### 8.2 Allowlist de comandos

El `CommandRunner` solo permite comandos explícitamente aprobados.

Ejemplos válidos:

```text
pnpm list
pnpm root
git remote
git rev-parse
git describe
node --version
```

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

- lint de archivos modificados;
- checks rápidos.

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
- acceso a repositorios privados autenticados;
- ejecución automática de migraciones;
- corrección automática del entorno.

---

## 12. Criterio de éxito

El MVP es exitoso si un usuario puede instalar `actually?` con pnpm y obtener, de forma segura y explicable, una visión útil del estado de su entorno sin que la herramienta modifique nada.

Un escenario mínimo válido:

```bash
pnpm add -g actually
actually status
```

> **Decisión pendiente (open-questions #16):** el nombre `actually` en npm pertenece a otro paquete, así que el comando de instalación de arriba no funciona tal cual. El comando `actually` no cambia en ninguna de las alternativas.

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
