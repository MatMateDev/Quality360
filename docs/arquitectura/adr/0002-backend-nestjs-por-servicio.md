# ADR 0002 · Backend con NestJS 11, un proyecto por servicio

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decisión base:** D2

## Contexto

El informe separa el backend en cuatro microservicios (Organización y seguimiento, Certificaciones, Impedimentos e Integraciones) más un gateway que compone consultas. Cada servicio separa API, aplicación, dominio e infraestructura, y el dominio no puede depender de la infraestructura (informe p. 12). El equipo trabaja en TypeScript.

## Decisión

- NestJS 11 con TypeScript para `apps/gateway` y para cada carpeta de `services/`: cinco proyectos Nest independientes, cada uno con su `package.json`.
- Estructura de cada servicio:
  - `src/api`: controladores, DTO y validación con class-validator.
  - `src/aplicacion`: casos de uso.
  - `src/dominio`: entidades, reglas e interfaces de repositorio. No importa Nest ni Prisma.
  - `src/infraestructura`: Prisma y adaptadores HTTP hacia otros servicios.
- Enfoque contract-first: `contracts/*.yaml` es la fuente de verdad. `@nestjs/swagger` se usa solo para comparar lo implementado con el contrato, nunca para reemplazarlo.
- `packages/auth-nest` concentra la verificación del token y los guards, sin lógica de negocio. Ningún servicio importa código de otro servicio.
- Puertos: gateway `3000`, Organización `3001`, Certificaciones `3002`, Impedimentos `3003` e Integraciones `3004`.

## Consecuencias

- Los módulos de Nest calzan con las capas y hacen natural la inyección de repositorios en el dominio.
- Hay cinco procesos que construir, probar y contenerizar. Se mitiga con un Dockerfile multi-stage común y los scripts `ws:*`.
- Nest pide `experimentalDecorators` y `emitDecoratorMetadata` en cada `tsconfig` de servicio; no van en la base compartida.
- La comunicación entre servicios es REST con contrato, nunca imports ni SQL entre esquemas.

## Alternativas descartadas

- **Express o Fastify sin framework:** menos estructura, así que cada servicio inventaría su propia forma de hacer capas y guards.
- **Un monolito modular en Nest:** más simple de operar, pero contradice la topología del informe y la propiedad de datos por servicio.
- **Spring Boot o .NET:** robustos, pero fuera del stack TypeScript del equipo y del prototipo.
