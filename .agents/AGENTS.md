# KanelFlow – Agent Rules

## Efficiency Rules (MUST FOLLOW)

These rules exist because the USER has a daily agent step limit. Violating these wastes quota.

### 1. Read Only What You Need
- Use `grep_search` FIRST to find the exact lines to change before reading a file
- NEVER read a full file (800+ lines) when you only need to change 5-10 lines
- Use `StartLine` and `EndLine` in `view_file` to read only the relevant section

### 2. Trust the Session Summary
- The checkpoint summary at the start of each session already describes what was done
- Do NOT re-read files just to "verify" what the summary already confirms
- Start acting immediately based on the summary — don't re-research

### 3. Batch File Reads in Parallel
- When you need to read multiple files, call `view_file` for ALL of them simultaneously in one tool block
- Never read files one at a time sequentially when they are independent

### 4. Minimal Artifact Updates
- Only update `task.md` and `walkthrough.md` ONCE at the end of all changes — not after every small edit
- Skip mid-task artifact updates entirely

### 5. Be Surgical with Edits
- Prefer `replace_file_content` or `multi_replace_file_content` with tight line ranges
- Never rewrite an entire file when only a few lines need changing
- Use `grep_search` to find exact line numbers before editing

### 6. No Redundant Planning
- Simple, clearly scoped changes (e.g. "replace hardcoded value with dynamic one") do NOT need a full implementation plan
- Skip the planning phase for straightforward fixes — just do them

### 7. Avoid Re-importing the Whole Codebase
- Don't list entire directories or read `package.json`, `app.json` etc. unless directly relevant to the task
