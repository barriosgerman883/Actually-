# Decisiones de la revisión

Cada punto remite a la sección correspondiente de `2026-09-cross-review.md`. Todas las decisiones están resueltas; la columna Estado indica el commit que la aplicó.

| # | Decisión | Estado | Resolución | Ref |
|---|---|---|---|---|
| 1 | Un solo modelo de dominio | Resuelta en `3b5e83b` | architecture.md §5 es la única definición; el JSON es una proyección | §1.1 |
| 2 | Enum de `status` | Resuelta en `dbbe185` y `fc7c32d` | Estados y reglas de derivación definidos. `outdated` es un solo estado, con el tipo de cambio en `updateType` | §1.2 |
| 3 | `requested / resolved / installed / latest` en el modelo | Resuelta en `dbbe185` | `VersionClaims`, con `not-applicable` cuando no corresponde | §1.3 |
| 4 | Comandos del MVP | Resuelta en `a5fbd53` | Solo `status` y `explain`. `scan`, `doctor` e `init` quedan fuera | §1.4 |
| 5 | npm registry en Fase 1, npm CLI en Fase 2 | Resuelta en `9878348` | Nombres distintos en todos los documentos | §1.5 |
| 6 | Confianza por claim o por tool | Resuelta en `dbbe185` | Por claim, con reglas documentadas en architecture.md §6 | D1 |
| 7 | Representación de `unknown` | Resuelta en `dbbe185` | `Claim<T>` con `state` explícito | D2 |
| 8 | Repo Git: proyecto o herramienta | Resuelta en `ce0740d` | Proyecto por defecto; herramienta por config o por un ejecutable en PATH | D3 |
| 9 | Formato de `id` | Resuelta en `fc1540f` | `global:<provider>:<nombre>` o `project:<raíz>:<nombre>`, documentado como opaco | D4 |
| 10 | Caché en el MVP | Resuelta en `d1011b7` | Sí, con TTL, requests condicionales y `--no-cache` | D5 |
| 11 | `GITHUB_TOKEN` para rate limit | Resuelta en `d1011b7` | Sí, solo para límite de requests y con opción para desactivarlo | D5 |
| 12 | Cómo leer metadata de Git y pnpm | Resuelta en `6ba6673` | Git: archivos para `HEAD` y remotes; git endurecido solo para tags y distancia. pnpm nunca dentro de un proyecto | D6 |
| 13 | Allowlist | Resuelta en `6ba6673` | Comandos completos y exactos, elegidos por identificador | D6 |
| 14 | Directorios de PATH escaneados | Resuelta en `9a6cb3e` | Directorio global de pnpm, `~/.local/bin` y `scan.bin_paths` | D7 |
| 15 | Exit codes | Resuelta en `b8eb98e` | `0` ok, `1` updates solo con `--exit-code`, `2` uso inválido, `3` fatal. Se suma `diagnostics` al JSON | §3 |
| 16 | Nombre del paquete npm | Resuelta en `58559e5` | `@getactually/cli`, con el comando `actually`. Ver abajo | §4 |
| 17 | Idioma de los docs | Resuelta en `ecd4ca8` | Inglés para código y docs de contribuidores; planificación en español hasta el lanzamiento | §5 |
| 18 | `info` como comando separado | Resuelta en `a5fbd53` | Reemplazado por `status <tool>` | §5 |

**Cambio respecto de la revisión en #12.** La revisión recomendaba leer `.git` directamente en vez de lanzar git. Eso alcanza para `HEAD` y los remotes, pero no para los tags anotados ni para la distancia al último tag, que exigen interpretar los packfiles de Git. Por eso se adoptó un enfoque mixto.

## #16: nombre del paquete

Se eligió la alternativa B con el scope `@getactually`, porque `@actually` pertenece a otra cuenta. Las alternativas quedan como registro de la decisión.

### Contexto

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

### Decisión

El scope `@actually` resultó pertenecer a otra cuenta de npm, sin paquetes públicos. Se usó el scope `@getactually`, que estaba libre.

- El paquete se publica como `@getactually/cli` y expone el comando `actually`.
- El scope reserva `@getactually/core` para las integraciones de la Fase 3.
- La organización `getactually` se creó en npmjs.com el 2026-09-26, con verificación en dos pasos activa en la cuenta que publica.

Pedir la transferencia del nombre `actually`, la alternativa A, sigue siendo posible más adelante. Si prospera, `actually` pasaría a ser el nombre principal y `@getactually/cli` se deprecaría con un mensaje que apunte al nuevo nombre.
