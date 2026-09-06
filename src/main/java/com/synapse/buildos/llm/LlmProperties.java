package com.synapse.buildos.llm;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "buildos.llm")
public record LlmProperties(
        String model,
        String effort,
        int maxTokens,
        long taskBudgetTokens
) {
    public LlmProperties {
        if (model == null || model.isBlank()) model = "claude-opus-5";
        if (effort == null || effort.isBlank()) effort = "high";
        if (maxTokens <= 0) maxTokens = 16000;
        if (taskBudgetTokens < 20000) taskBudgetTokens = 60000; // API minimum is 20k
    }
}
