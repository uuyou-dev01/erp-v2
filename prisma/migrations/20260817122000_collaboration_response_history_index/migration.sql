-- Early installations created a unique responder index. The final protocol
-- intentionally allows a person to decline and later accept after a task is
-- returned or re-offered, so this must be a normal lookup index.
DROP INDEX IF EXISTS "collaboration_responses_requestId_responderScopeType_responderScopeRef_key";

CREATE INDEX IF NOT EXISTS "collaboration_responses_requestId_responderScopeType_responderScopeRef_idx"
ON "collaboration_responses"("requestId", "responderScopeType", "responderScopeRef");
