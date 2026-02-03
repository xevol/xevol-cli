# XEVol CLI: The Road to 10/10

This document outlines the specific, actionable steps required to elevate the `xevol-cli` from its current 9.0/10 score to a perfect 10/10. The plan addresses remaining issues from code reviews, adds robustness, polish, and missing features, and defines a clear testing strategy.

---

## 1. Remaining Issues from Reviews

These are all non-critical issues identified in the v1 and v2 reviews that have not yet been addressed.

### Issue M3: No AbortController / Timeout on SSE Streams

-   **Description**: The `sse.ts` library can accept an `AbortSignal`, but the `stream`, `resume`, and `add` commands do not provide one. A hung network connection during an SSE stream will cause the CLI to hang indefinitely.
-   **File**: `~/stack/xevol-cli/src/commands/stream.ts`, `~/stack/xevol-cli/src/commands/resume.ts`, `~/stack/xevol-cli/src/commands/add.ts`
-   **The Fix**:
    1.  Create an `AbortController` in each command that calls `streamSSE`.
    2.  Set a timeout (e.g., 30 seconds) using `setTimeout` that calls `controller.abort()`.
    3.  Pass `signal: controller.signal` to `streamSSE`.
    4.  Reset the timeout whenever a new SSE event is received to prevent premature abortion on active streams.
-   **Effort**: M (1-2h)

### Issue M4: CSV output doesn't escape newlines properly

-   **Description**: The custom `csvQuote` function in `list.ts` does not handle newlines within a field correctly, which can break the CSV structure.
-   **File**: `~/stack/xevol-cli/src/commands/list.ts` (line ~90), `~/stack/xevol-cli/src/commands/prompts.ts` (line ~40)
-   **The Fix**: Instead of wrapping in quotes, newlines inside a quoted field should be preserved. The current implementation is simple; a better fix is to replace the manual quoting with a small, reliable CSV stringifying library or improve the `csvQuote` function to handle `\n` by replacing it with a space or removing it.
    ```typescript
    // In list.ts and prompts.ts
    const csvQuote = (v: string) => {
      // Also remove newlines to prevent corrupting CSV rows
      const sanitized = v.replace(/\n/g, ' ');
      return sanitized.includes(',') || sanitized.includes('"')
        ? `"${sanitized.replace(/"/g, '""')}"`
        : sanitized;
    };
    ```
-   **Effort**: S (< 30 min)

### Issue L1: Hardcoded output language "en" in resume.ts

-   **Description**: When resuming a job, the `resume` command hardcodes the `outputLang` to "en" instead of using the language from the original job.
-   **File**: `~/stack/xevol-cli/src/commands/resume.ts` (lines ~55, ~133)
-   **The Fix**:
    1.  Add `lang` or `outputLang` to the `JobState` interface in `~/stack/xevol-cli/src/lib/jobs.ts`.
    2.  When creating the job state in `add.ts`, save the `options.lang` value.
    3.  In `resume.ts`, read `jobState.lang` and use it in the `apiFetch` calls instead of the hardcoded "en".
-   **Effort**: S (< 30 min)

### Issue: `any` Type Used in Frontend (from v2 Review)

-   **Description**: The React state for the session user is typed as `any` in the web frontend. While not a CLI issue, it was noted in the review.
-   **File**: `~/stack/xevol.com/src/pages/cli-auth.tsx`
-   **The Fix**: Define a specific type for the user session and use it in the `useState` hook.
    ```typescript
    type SessionUser = { email: string; name?: string } | null;
    const [sessionUser, setSessionUser] = React.useState<SessionUser>(null);
    ```
-   **Effort**: S (< 30 min)

---

## 2. Missing Robustness

### Error Handling & Timeouts

-   **API Down**: Currently, `apiFetch` will throw a generic `fetch failed` error. This should be caught in each command and presented to the user with a more helpful message like "The API at `apiUrl` seems to be down. Please check your connection or the API status."
-   **Global Timeouts**: The `fetch` call in `lib/api.ts` has no timeout. A global timeout should be implemented for all API calls using `AbortController` to prevent indefinite hangs.
    ```typescript
    // In lib/api.ts
    const response = await fetch(url, {
      ...
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });
    ```
-   **Token Expiry Mid-Stream**: `streamSSE` does not handle a 401 error occurring after the connection is established. The underlying `fetch` will just terminate. The command should catch this and inform the user they need to `xevol login`.

### Input Validation

-   **URL Validation**: The `add` command accepts any string as a URL. It should perform basic validation to check if it looks like a YouTube URL before sending it to the API. A simple regex check is sufficient.
-   **Corrupt Config**: `readConfig` in `lib/config.ts` will throw an unhandled exception if `config.json` is corrupt (invalid JSON). This should be caught, and the user should be prompted to run `xevol login` again to fix it.

---

## 3. Missing Polish

### Help Text

-   **Examples**: Commands like `add` and `spikes` would benefit from concrete examples in their description.
    -   e.g., `program.command('add').description(...).addHelpText('after', '\nExamples:\n  $ xevol add "https://www.youtube.com/watch?v=..." --wait --spikes review,summary')`
-   **Option Consistency**: Ensure option aliases are consistent (e.g., `-l` for `--lang`).

### Output Formatting

-   **`whoami`**: The output is functional but plain. It could be formatted more nicely, perhaps with chalk and labels.
    -   Current: `kukabynd@gmail.com (Pro plan, 123 transcriptions this month)`
    -   Improved:
        ```
        Email:    kukabynd@gmail.com
        Plan:     Pro
        Usage:    123 transcriptions this month
        ```
-   **Progress Indicators**: For `add --wait --spikes`, there are multiple stages (transcribing, generating spike 1, generating spike 2). A more granular progress indicator (e.g., `[1/3] Transcribing...`, `[2/3] Generating spike: review...`) would improve user experience.

### Color & Emoji Usage

-   **Error Messages**: Standardize on `chalk.red("Error:")` followed by the message.
-   **Success Messages**: Use a consistent emoji/color pattern, like `chalk.green("✔ Success:")`.
-   **Informational Messages**: Use `chalk.blue("ℹ")` for tips or secondary info.

---

## 4. Missing Tests

### Unit Tests

-   **`lib/utils.ts`**: All `pick*` and `extract*` functions should have tests with various mock API response shapes to ensure they are resilient.
-   **`lib/output.ts`**: Test `formatDuration` with zero, seconds, minutes, and hours. Test `formatStatus` with all expected statuses.
-   **`lib/config.ts`**: Test `resolveToken` logic for precedence (override > env > config) and expiry.
-   **`lib/jobs.ts`**: Test saving and loading job state to a temporary directory.

### Integration Tests

-   **Mock API**: Set up a mock server (e.g., with `msw` or `hono`) that simulates the XEVol API.
-   **Auth Flow**: Test the full `xevol login` device flow, mocking the API responses for `/device-code` and `/device-token`.
-   **Command Tests**: Write tests for each command (`list`, `add`, `view`, etc.) that execute the command as a child process and assert against its stdout, stderr, and exit code when run against the mock API.
-   **Error States**: Test for expected behavior on API errors (401, 404, 500), network errors, and invalid inputs.

### Minimum Coverage

-   Aim for **80%+ unit test coverage** on the `lib/` directory.
-   Aim for **at least one successful and one failing integration test** for each command.

---

## 5. Missing Features for Completeness

### Commands

-   **`xevol config <get|set> <key> [value]`**: A command to manage local configuration like `apiUrl`, `default.lang`, `default.limit`.
-   **`xevol delete <id>`**: A command to delete a transcription. This would require a new API endpoint.
-   **`xevol cancel <id>`**: A command to cancel a pending or processing transcription. This requires a new API endpoint.

### Flags

-   **`xevol list --status <status>`**: Filter the list of transcriptions by status (e.g., `complete`, `pending`).
-   **`xevol list --sort-by <field>`**: Sort the list by fields like `createdAt` or `duration`.
-   **Global `--no-color` flag**: To disable chalk output for scripting.

### Configuration

-   **Request Timeout**: The global request timeout should be configurable via `xevol config set api.timeout 60000`.
-   **Default Language**: `xevol config set default.lang kk` to avoid passing `--lang` every time.

---

## 6. Implementation Plan

### Phase 1: Robustness & Bug Fixes (Effort: L)

1.  **[M] Implement Timeouts**: Add `AbortSignal.timeout` to `apiFetch` and implement the idle timeout for `streamSSE` as described in (1.1).
2.  **[S] Fix CSV Newlines**: Correct the `csvQuote` function (1.2).
3.  **[S] Fix Resume Language**: Store and use `lang` in the job state file (1.3).
4.  **[M] Improve Error Handling**: Add `try/catch` around `fetch` in `apiFetch` for network errors and handle corrupt `config.json`.
5.  **[S] Add URL Validation**: Add a basic YouTube URL regex check in the `add` command.

### Phase 2: Polish & UX (Effort: M)

1.  **[S] Improve Help Text**: Add examples to key commands.
2.  **[S] Refine Output Formatting**: Prettify `whoami` output and standardize success/error message formats.
3.  **[M] Enhance Progress Indicators**: Implement multi-step progress for `add --wait --spikes`.

### Phase 3: Testing (Effort: L)

1.  **[M] Write Unit Tests**: Create unit tests for all functions in `lib/` to reach ~80% coverage.
2.  **[L] Build Integration Test Suite**: Set up a mock API server and write integration tests for the core command flows (`login`, `list`, `add --wait`).

### Phase 4: Feature Expansion (Effort: L)

1.  **[M] Implement `xevol config`**: Create the command to get/set local config values.
2.  **[S] Add New Flags**: Implement `--status` and `--sort-by` for the `list` command (requires API support).
3.  **[L] Design & Implement `delete`/`cancel`**: Scope out the API changes needed for `xevol delete` and `xevol cancel` and implement the CLI commands.

By following this roadmap, the `xevol-cli` can achieve a 10/10 score, becoming a robust, polished, and feature-complete tool.
