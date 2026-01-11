# Phase 2 Remaining Tasks (Future Enhancement)

This document tracks the remaining Phase 2 tasks that require more complex backend implementation.

## Contextual Variables Backend Regeneration

**Status**: UI Complete, Backend TODO

**What's Done**:
- ✅ Editable variables UI in ArtifactRenderer
- ✅ onVariableChange callback handler
- ✅ Visual editing interface (click to edit, Enter/Escape handling)

**What's Needed**:
- Backend endpoint to regenerate artifact with new variables
- Store original message context for regeneration
- Update artifact in chat_messages table
- Frontend integration to call endpoint and update artifact

**Implementation Approach**:
1. Create `/api/chat/refine-artifact` endpoint
2. Accept `message_id`, `variables` (updated dict)
3. Retrieve original artifact and message context
4. Regenerate artifact with new variables using Path D logic
5. Update artifact in database
6. Return updated artifact to frontend

## Selection-Based Refinement (Diff Loop)

**Status**: UI Structure Ready, Backend TODO

**What's Done**:
- ✅ onStepRefine callback in ArtifactRenderer
- ✅ Step selection UI
- ✅ Refine button on selected steps

**What's Needed**:
- Backend endpoint for step refinement
- UI for refinement instruction input (could be chat input)
- Logic to swap specific step in artifact JSON
- Visual feedback (green flash animations)
- Frontend integration

**Implementation Approach**:
1. Create `/api/chat/refine-artifact-step` endpoint
2. Accept `message_id`, `step_id`, `refinement_instruction`
3. Retrieve original artifact
4. Use LLM to refine specific step based on instruction
5. Update artifact JSON with refined step
6. Update artifact in database
7. Return updated artifact to frontend
8. Add visual feedback (green flash on changed items)

**Note**: For MVP, both features could trigger a new chat message to regenerate, but for full Phase 2, proper in-place refinement is needed.
