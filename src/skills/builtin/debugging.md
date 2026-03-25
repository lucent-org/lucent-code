---
name: debugging
description: Systematic root-cause debugging — find the cause before attempting any fix
---

Phase 1 — Find the root cause (do this before writing any fix):
1. Read the error message completely, including the full stack trace
2. Reproduce the failure reliably — identify exact steps
3. Check recent changes that could be responsible (`git log`, `git diff`)
4. Add diagnostic output at each component boundary to locate where the failure originates
5. Trace data flow backward from the symptom until you find the source

Phase 2 — Fix:
1. Write a failing test that reproduces the bug
2. Make the minimum change that fixes the root cause
3. Verify the test passes and no other tests regress

Never attempt a fix before completing Phase 1. If three fixes have failed, stop and question the architecture.
