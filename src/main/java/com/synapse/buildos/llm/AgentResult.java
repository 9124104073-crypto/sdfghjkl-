package com.synapse.buildos.llm;

import java.util.List;
import java.util.Map;

/**
 * Outcome of an agentic run.
 *
 * @param submission   input of the terminal tool call, or null if the model never submitted
 * @param narrative    the model's final user-facing text, if any
 * @param toolCalls    audit trail of every tool the model invoked, in order
 * @param refused      true when safety classifiers declined the request
 * @param modelId      model that actually served the response
 */
public record AgentResult(
        Map<String, Object> submission,
        String narrative,
        List<String> toolCalls,
        boolean refused,
        String modelId,
        int inputTokens,
        int outputTokens
) {
    public boolean submitted() {
        return submission != null && !submission.isEmpty();
    }
}
