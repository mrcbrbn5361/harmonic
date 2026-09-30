---
id: typescript-strictness
title: TypeScript Strict Mode & Types
description: Enforce strict TypeScript compiler options and clean type definitions
alwaysApply: false
globs:
  - '**/*.ts'
  - '**/*.tsx'
tags:
  - typescript
  - typing
---
## TypeScript Guidelines
- Enable and adhere to `strict: true` in tsconfig.
- Avoid using `any`; prefer `unknown`, generic type parameters, or explicit interfaces.
- Define explicit return types for public exported functions and API boundaries.
- Leverage Discriminated Unions for state management and error returns.
