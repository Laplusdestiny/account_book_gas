---
name: git-operations
description: Helps the agent perform standard Git operations like branch management, staging, committing, pushing, and pulling changes safely, with support for Conventional Commits and strict rules on destructive actions.
---

# Git Operations Skill

This skill guides the agent through managing Git tasks safely, efficiently, and in alignment with standard project practices.

## Use this skill when
- The user requests Git-related tasks, such as:
  - Creating, switching, or deleting branches.
  - Checking the status, diffs, or logs of the repository.
  - Staging files (`git add`) and committing changes (`git commit`).
  - Pushing changes to remote repositories (`git push`) or pulling updates (`git pull`).
  - Resolving minor merge conflicts.
  - Creating Pull Requests (PRs) using GitHub CLI (`gh`).

## Do not use this skill when
- The task does not involve version control or repository management.

## Instructions

### 1. Verification & Status Check
- Before any Git operation, check the current repository status by running:
  ```bash
  git status
  ```
- Identify the current branch and check for any unstaged or untracked changes.
- Ensure that sensitive files (like `.env`, private keys) are NOT listed in the untracked files. If they are, make sure they are added to `.gitignore`.

### 2. Branch Management with Ticket Numbers
- When creating a new branch for a task:
  - Base it on the default branch (usually `main` or `master`) unless specified otherwise.
  - Fetch the latest changes before branching:
    ```bash
    git checkout main
    git pull origin main
    ```
  - Ask the user if there is an **Issue or Ticket Number** (e.g., `#45`, `PROJ-123`) associated with this task.
  - Create the new branch with a descriptive name, incorporating the ticket number if available:
    - **With Ticket**: `<branch-type>/<ticket-id>-<short-description>` (e.g., `feature/123-add-login`, `bugfix/PROJ-456-fix-header`)
    - **Without Ticket**: `<branch-type>/<short-description>` (e.g., `feature/add-login`)
    *Example branch types: `feature/`, `bugfix/`, `docs/`, `refactor/`, `chore/`*

### 3. Staging and Committing (Conventional Commits)
- Stage files selectively. Avoid staging unrelated changes.
  ```bash
  git add <specific-files>
  ```
- Write high-quality commit messages strictly following the **Conventional Commits** specification.
- **Commit Message Format**:
  - **Structure**:
    ```
    <type>(<optional scope>): <description>

    [optional body]

    [optional footer(s)]
    ```
  - **Types**:
    - `feat`: A new feature
    - `fix`: A bug fix
    - `docs`: Documentation only changes
    - `style`: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
    - `refactor`: A code change that neither fixes a bug nor adds a feature
    - `perf`: A code change that improves performance
    - `test`: Adding missing tests or correcting existing tests
    - `build`: Changes that affect the build system or external dependencies
    - `ci`: Changes to CI configuration files and scripts
    - `chore`: Other changes that don't modify src or test files
  - **Breaking Changes**:
    - Must be indicated by a `!` after the type/scope (e.g., `refactor(api)!: drop support for Node v12`) and/or a `BREAKING CHANGE:` footer.
  - **Ticket Association**:
    - If a ticket number exists, reference it in the description or footer (e.g., `feat(auth): add google provider (#123)` or in the footer `Refs: #123`).
  - Prefer writing commit messages in English unless the user explicitly requests Japanese.

### 4. Pushing and Advanced Pull Request Creation (GitHub CLI)
- Push the local branch to the remote repository:
  ```bash
  git push -u origin <branch-name>
  ```
- If the user wants to create a Pull Request:
  1. **Check GitHub CLI (`gh`) status**:
     ```bash
     gh auth status
     ```
     - If not authenticated, prompt the user to run `gh auth login` or provide the manual PR URL.
  2. **Gather PR details**:
     - **Title**: Use the main Conventional Commit message as the PR title (e.g., `feat(auth): add google provider`).
     - **Body**: Write a comprehensive description containing:
       - **Summary**: What changes were made.
       - **Related Issue**: Close issue syntax (e.g., `Closes #123` or `Fixes #123`).
       - **Testing**: How the changes were tested.
  3. **Create the PR via CLI**:
     - Run `gh pr create` with automated flags. Make sure to assign yourself as the assignee using `--assignee "@me"`.
     - **Draft PR (Recommended for WIP)**:
       ```bash
       gh pr create --title "<PR Title>" --body "<PR Description>" --assignee "@me" --draft
       ```
     - **Ready PR**:
       ```bash
       gh pr create --title "<PR Title>" --body "<PR Description>" --assignee "@me" --web
       ```

### 5. Strict Conflict Resolution
- If a merge conflict occurs during `git pull` or `git merge`:
  1. Identify conflicting files using `git status`.
  2. Examine the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
  3. Carefully resolve the conflicts.
  4. If the conflict is in a critical component or you are unsure of the correct resolution, **stop and ask the user for guidance** with a clear explanation of the conflicting changes.

## Security & Safety Guidelines

### ⚠️ Destructive Operations Check (CRITICAL)
- **NEVER** execute the following destructive or irreversible operations without **explicit, separate user approval**:
  - `git reset --hard` (discarding local uncommitted changes)
  - `git clean -fd` (force deleting untracked files/directories)
  - `git checkout -- <file>` or `git restore <file>` (discarding file changes)
  - `git push --force` or `git push -f` (force pushing, which overwrites history)
  - `git branch -D <branch>` (force deleting local branches)
  - `git push origin --delete <branch>` (deleting remote branches)
- Before proposing any of these commands, you must explain the exact impact to the user and obtain their clear "yes" to proceed.
- If uncommitted changes exist, prefer stashing them (`git stash`) over resetting or discarding them, unless the user explicitly commands a reset.

### Security
- **CRITICAL**: Never commit secrets, passwords, or credentials.
- Always review `git diff --cached` before committing to verify exactly what is being committed.
