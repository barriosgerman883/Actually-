# Decisiones abiertas

Cada punto remite a la sección correspondiente de `2026-09-cross-review.md`. Las marcas **Decisión pendiente** dentro de los documentos usan esta numeración.

| # | Decisión | Estado | Resolución o recomendación | Ref |
|---|---|---|---|---|
| 1 | Un solo modelo de dominio | Resuelta en `3b5e83b` | architecture.md §5 es la única definición; el JSON es una proyección | §1.1 |
| 2 | Enum de `status` | Parcial en `dbbe185` | Estados y reglas de derivación definidos. Falta decidir si `outdated` se divide en major, minor y patch | §1.2 |
| 3 | `requested / resolved / installed / latest` en el modelo | Resuelta en `dbbe185` | `VersionClaims`, con `not-applicable` cuando no corresponde | §1.3 |
| 4 | `doctor`, `init`, `scan`: cuáles entran al MVP | Pendiente | `status`, `explain` y `--json`. `init` si la config es obligatoria. `doctor` y `scan` fuera hasta que se definan | §1.4 |
| 5 | npm registry en Fase 1, npm CLI en Fase 2 | Resuelta en `9878348` | Nombres distintos en todos los documentos | §1.5 |
| 6 | Confianza por claim o por tool | Resuelta en `dbbe185` | Por claim, con reglas documentadas en architecture.md §6 | D1 |
| 7 | Representación de `unknown` | Resuelta en `dbbe185` | `Claim<T>` con `state` explícito | D2 |
| 8 | Repo Git: proyecto o herramienta | Resuelta en `ce0740d` | Proyecto por defecto; herramienta por config o por un ejecutable en PATH | D3 |
| 9 | Formato de `id` | Pendiente | `scope:ubicación:nombre` | D4 |
| 10 | Caché en el MVP | Resuelta en `d1011b7` | Sí, con TTL, requests condicionales y `--no-cache` | D5 |
| 11 | `GITHUB_TOKEN` para rate limit | Resuelta en `d1011b7` | Sí, solo para límite de requests y con opción para desactivarlo | D5 |
| 12 | Leer `.git/*` directo en vez de lanzar git | Pendiente | Sí | D6 |
| 13 | Allowlist por binario y subcomando | Pendiente | Sí | D6 |
| 14 | Directorios de PATH escaneados | Pendiente | Solo directorios de usuario más los de la config | D7 |
| 15 | Exit codes | Pendiente | `0` ok, `1` updates disponibles, `2` errores de scan, `3` uso inválido | §3 |
| 16 | Nombre del paquete npm | Pendiente | Ver alternativas abajo | §4 |
| 17 | Idioma de los docs | Pendiente | Inglés si el proyecto busca contribuidores externos | §5 |
| 18 | `info` como comando separado | Pendiente | Fusionar en `status <tool>` | §5 |

## #16: alternativas para mantener el nombre `actually`

El comando que el usuario escribe lo define el campo `bin` del `package.json`, no el nombre del paquete. En las tres alternativas el comando sigue siendo `actually` y la marca sigue siendo `actually?`. Solo cambia la línea de instalación.

Datos del paquete que hoy ocupa el nombre, verificados en el registry el 2026-09-26:

- versión `0.0.3`, creado en enero de 2017;
- sin ejecutable y sin dependencias;
- un solo maintainer, con repositorio en `github.com/PrestonR/actually`;
- el propio paquete se describe como una broma.

### A. Pedir el nombre al dueño actual

npm permite que el dueño transfiera un paquete agregando un nuevo owner. El contacto del maintainer está en la metadata pública del paquete (`npm view actually maintainers`).

Si no responde, el soporte de npm puede mediar, pero normalmente no transfiere un nombre con contenido publicado salvo casos de squatting o de marca registrada. El resultado es incierto y puede tardar semanas.

### B. Scope propio: `@actually/cli`

```bash
pnpm add -g @actually/cli
actually status
```

Es el patrón de `@angular/cli` (comando `ng`), `@vue/cli` (comando `vue`) y `@nestjs/cli` (comando `nest`).

Ventaja adicional: la Fase 3 pide que las integraciones de IDE consuman el core, no que lo dupliquen. Con un scope, el core puede publicarse como `@actually/core` junto a la CLI.

No se pudo verificar si la organización `@actually` está libre: hay que intentar crearla en npmjs.com. Si está tomada, el scope personal de la cuenta de npm que publique `actually?` es la alternativa garantizada.

### C. Nombre sin scope: `actually-cli`

```bash
pnpm add -g actually-cli
actually status
```

El nombre estaba libre en el registry el 2026-09-26. Es la opción más simple, pero no agrupa paquetes futuros.

### Recomendación

B de inmediato y A en paralelo. Si la transferencia prospera, `actually` pasa a ser el nombre principal y `@actually/cli` se depreca con un mensaje que apunte al nuevo nombre.
