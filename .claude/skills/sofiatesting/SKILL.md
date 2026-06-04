```markdown
# sofiatesting Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill introduces the core development patterns and conventions used in the `sofiatesting` TypeScript repository. You'll learn how to structure files, write imports and exports, follow commit message standards, and implement and run tests according to the project's established practices.

## Coding Conventions

### File Naming
- Use **kebab-case** for all file names.
  - **Example:**  
    `user-service.ts`  
    `api-handler.test.ts`

### Import Style
- Use **alias imports** rather than relative or absolute paths.
  - **Example:**
    ```typescript
    import { fetchData } from '@utils/network';
    ```

### Export Style
- Use **named exports** for all modules.
  - **Example:**
    ```typescript
    // In user-service.ts
    export function getUser(id: string) { ... }
    export const USER_ROLE = 'admin';
    ```

### Commit Messages
- Use prefixes such as `feat` and `report`.
- Keep commit messages concise (average length: ~53 characters).
  - **Example:**  
    `feat: add user authentication middleware`  
    `report: fix typo in error message`

## Workflows

### Commit Changes
**Trigger:** When you have made code changes and are ready to commit.
**Command:** `/commit-changes`

1. Stage your changes:
    ```bash
    git add .
    ```
2. Write a commit message using the appropriate prefix (`feat`, `report`, etc.):
    ```bash
    git commit -m "feat: add new API endpoint"
    ```
3. Push your changes:
    ```bash
    git push
    ```

### Add a New Module
**Trigger:** When creating a new feature or utility module.
**Command:** `/add-module`

1. Create a new file using kebab-case:
    ```bash
    touch new-feature.ts
    ```
2. Use named exports in your module:
    ```typescript
    export function newFeature() { ... }
    ```
3. Import using alias in other files:
    ```typescript
    import { newFeature } from '@features/new-feature';
    ```

### Write and Run Tests
**Trigger:** When adding or updating functionality.
**Command:** `/run-tests`

1. Create a test file with the `.test.` pattern:
    ```bash
    touch user-service.test.ts
    ```
2. Write your test cases:
    ```typescript
    import { getUser } from '@services/user-service';

    test('should fetch user by ID', () => {
      // test implementation
    });
    ```
3. Run tests using your project's test runner (framework unknown; typically one of `npm test`, `yarn test`, or a direct invocation).

## Testing Patterns

- **Test files** use the `*.test.*` naming convention (e.g., `api-handler.test.ts`).
- The specific testing framework is unknown, but tests are typically written in TypeScript and follow standard patterns (e.g., using `test()` or `describe()` blocks).
- Place test files alongside or near the modules they test for clarity and maintainability.

## Commands
| Command         | Purpose                                      |
|-----------------|----------------------------------------------|
| /commit-changes | Guide for committing code changes            |
| /add-module     | Steps to create and export a new module      |
| /run-tests      | Instructions for writing and running tests   |
```