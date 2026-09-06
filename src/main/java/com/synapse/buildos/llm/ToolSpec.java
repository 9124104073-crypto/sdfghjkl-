package com.synapse.buildos.llm;

import java.util.Map;
import java.util.function.Function;

/**
 * A provider-neutral tool description. Services define these; only
 * {@link ClaudeClient} knows how to render one into an Anthropic tool.
 *
 * @param name         tool name the model calls
 * @param description  prescriptive — say <em>when</em> to call it, not just what it does
 * @param inputSchema  JSON Schema object (properties/required); strict mode is applied
 * @param handler      executes the call server-side and returns a string result
 * @param terminal     if true, a call to this tool ends the loop and its input is the answer
 */
public record ToolSpec(
        String name,
        String description,
        Map<String, Object> inputSchema,
        Function<Map<String, Object>, String> handler,
        boolean terminal
) {
    public static ToolSpec of(String name, String description,
                              Map<String, Object> schema,
                              Function<Map<String, Object>, String> handler) {
        return new ToolSpec(name, description, schema, handler, false);
    }

    /** A terminal tool is how we get structured output: the model "submits" its answer. */
    public static ToolSpec terminal(String name, String description, Map<String, Object> schema) {
        return new ToolSpec(name, description, schema, args -> "Submitted.", true);
    }
}
