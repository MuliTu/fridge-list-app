# Decision checkpoint: local chef fallback

Status: approved by the owner in the main conversation (explicit “כן” to both decisions), implemented locally. Related [FR-007](../specs/tasks-flagship-readiness.md#fr-007-bound-and-ground-recipe-generation).

The existing deterministic generator turns any selected purchased products into a
generic meal and says to use the simplest suitable preparation method. Exact
ingredient matching does not establish edibility or adequate cooking instructions.
A shopping list can contain cleaning products, raw meat and other non-ready-to-eat
items. This remains an open product-safety issue; current offline grounding tests
must not be described as a cooking-safety evaluation.

## Recommended milestone behavior

On real-provider failure, show a recoverable unavailable state while retaining the
selected products. Do not invent a fallback cooking procedure. For the isolated
portfolio demo, use explicitly labeled, curated synthetic recipes matching the
seeded tomatoes/lettuce/cucumber inventory. Reject unsupported demo combinations
with a clear message. This preserves a repeatable offline demonstration while its
scope stays visible and small.

Implementation: separate deterministic demo fixtures from production failure
handling; fail closed for unknown fixture selections; keep recipe review/save
explicit; test non-food and raw-meat inputs cannot produce a curated fallback;
retain input on timeout/provider failure. Add bilingual unavailable/unsupported
selection copy and review keyboard behavior when browser testing is restored.
No model API call or paid service is needed for these tests.

## Alternative

Keep a general-purpose local cooking fallback, which needs an explicitly maintained
food taxonomy and reviewed preparation templates for supported ingredient classes.
That materially expands the first milestone and cannot be validated by an
ingredient-string matcher or by renaming generic instructions as safe.

## Review question

Use recoverable errors for real-provider failure and curated synthetic recipes
only for the offline demo, or invest in reviewed general local cooking templates
in the first milestone?
