# @llm-wiki/skill-llm-memory

Local-only LLM Memory skill for Multica-compatible agent runtimes.

## What this package provides

- `SKILL.md` guide skill derived from the repository wiki skill.
- Runtime-facing instruction set for wiki-assisted memory workflows.
- Coverage of key operations: ingest (`wiki_ingest`), query (`wiki_query`), and lint/maintenance (`wiki_lint`).
- Wiki page templates for entity, concept, index, and log pages.

## Usage

1. Ensure your runtime supports loading packaged skills from the repository.
2. Load `packages/skill/llm-memory/SKILL.md` as an available skill.
3. Use template files in `packages/skill/llm-memory/templates/` when creating or normalizing wiki pages.
4. Use the skill as a guide for invoking wiki tools:
   - `wiki_ingest` for importing new sources.
   - `wiki_query` for retrieving facts.
   - `wiki_lint` for maintenance and health checks.

## Local-only constraints

- No cloud services are required by this skill package.
- Skill content is static markdown and intended for local runtime loading.
- Any external behavior depends only on tools already configured in your local runtime.
