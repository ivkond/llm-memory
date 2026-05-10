# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Final verification before merge — create PR and confirm all checks pass.

**Input:** A green PR — spec compliance review passed, implementation is complete and tested.

**Expected output:** PR is merged or confirmed ready to merge with all checks green.

```
Task tool (general-purpose):
  description: "Create PR and verify all checks pass for Task N"
  prompt: |
    You are the final reviewer. The implementation passed spec compliance review.
    Your job: create a PR and confirm it's ready to merge.

    ## What Was Implemented

    WHAT_WAS_IMPLEMENTED: [from implementer's report]
    PLAN_OR_REQUIREMENTS: Task N from [plan-file]
    BASE_SHA: [commit before task]
    HEAD_SHA: [current commit]
    DESCRIPTION: [task summary]

    ## Your Job

    1. **Create a PR** via `gh pr create` with:
       - Title: "[Task N] [brief description]"
       - Body: Summary of changes and what was implemented

    2. **Wait for all checks to pass:**
       - Monitor PR status checks
       - If any check fails, report which one failed and why
       - If checks are still running, wait for them

    3. **Verify checks are green** before declaring success

    ## Code Quality Checks

    While waiting for CI, verify:
    - Each file has one clear responsibility
    - Units are decomposed for independent testing
    - Implementation follows plan file structure
    - No newly created large files or significant growth to existing files
    - Code is clean and maintainable

    ## Report Format

    - **Status:** READY_TO_MERGE | CHECKS_FAILED | REVIEW_FAILED
    - PR URL if created
    - Check results summary
    - Any issues found
```
