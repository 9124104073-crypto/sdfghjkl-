package com.synapse.buildos.llm;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.core.JsonValue;
import com.anthropic.models.messages.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * The only class in this codebase that touches the Anthropic SDK.
 *
 * Everything above it works in terms of {@link ToolSpec} and {@link AgentResult},
 * so swapping providers, or absorbing an SDK change, is a single-file edit.
 *
 * Two deliberate choices:
 *
 * 1. Structured output comes from a <em>terminal tool call</em> rather than a
 *    response format. The takeoff run is agentic anyway (the model searches the
 *    rate book before it can answer), so a "submit" tool fits the loop and gives
 *    us strict schema validation on the way in.
 *
 * 2. The loop is hand-written rather than using the SDK tool runner, because we
 *    need per-turn control: an iteration cap, a full audit trail of tool calls,
 *    and the ability to reject a submission and let the model retry.
 */
@Slf4j
@Component
public class ClaudeClient {

    /** Hard stop on agentic turns. A takeoff that needs more than this has gone wrong. */
    private static final int MAX_TURNS = 12;

    private final AnthropicClient client;
    private final LlmProperties props;

    public ClaudeClient(LlmProperties props) {
        this.props = props;
        // Resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login`
        // profile — in that order. Never hardcode a key.
        this.client = AnthropicOkHttpClient.fromEnv();
    }

    /**
     * Runs an agentic loop until the model calls the terminal tool, stops on its
     * own, or hits the turn cap.
     */
    public AgentResult runAgent(String systemPrompt, String userMessage, List<ToolSpec> tools) {

        Map<String, ToolSpec> byName = new HashMap<>();
        tools.forEach(t -> byName.put(t.name(), t));

        List<MessageParam> conversation = new ArrayList<>();
        conversation.add(MessageParam.builder()
                .role(MessageParam.Role.USER)
                .content(userMessage)
                .build());

        List<String> auditTrail = new ArrayList<>();
        int inputTokens = 0;
        int outputTokens = 0;
        String modelId = props.model();

        for (int turn = 0; turn < MAX_TURNS; turn++) {

            MessageCreateParams.Builder params = MessageCreateParams.builder()
                    .model(props.model())
                    .maxTokens(props.maxTokens())
                    .system(systemPrompt)
                    .messages(conversation)
                    // Adaptive thinking: the model decides depth per turn. Do not
                    // disable it — with thinking off, tool calls can arrive as plain
                    // text and silently never execute.
                    .thinking(ThinkingConfigAdaptive.builder().build())
                    .outputConfig(OutputConfig.builder().effort(effort()).build());

            tools.forEach(t -> params.addTool(toAnthropicTool(t)));

            Message response = client.messages().create(params.build());

            modelId = response.model().toString();
            inputTokens += (int) response.usage().inputTokens();
            outputTokens += (int) response.usage().outputTokens();

            // Safety classifiers can decline before any content is produced.
            // Check this before reading content — a refusal has an empty list.
            if (response.stopReason().map(Object::toString).orElse("").equalsIgnoreCase("refusal")) {
                log.warn("Model declined the request; returning refusal to caller.");
                return new AgentResult(null, null, auditTrail, true, modelId, inputTokens, outputTokens);
            }

            // Echo the assistant turn back verbatim — including thinking blocks,
            // which must be replayed unmodified on the same model.
            conversation.add(MessageParam.builder()
                    .role(MessageParam.Role.ASSISTANT)
                    .content(MessageParam.Content.ofBlockParams(
                            response.content().stream().map(this::echo).toList()))
                    .build());

            List<ToolUseBlock> calls = response.content().stream()
                    .map(ContentBlock::toolUse)
                    .flatMap(Optional::stream)
                    .toList();

            if (calls.isEmpty()) {
                // No tool calls: the model answered in prose without submitting.
                String text = response.content().stream()
                        .map(ContentBlock::text)
                        .flatMap(Optional::stream)
                        .map(TextBlock::text)
                        .reduce("", (a, b) -> a + b);
                return new AgentResult(null, text, auditTrail, false, modelId, inputTokens, outputTokens);
            }

            List<ContentBlockParam> results = new ArrayList<>();

            for (ToolUseBlock call : calls) {
                ToolSpec spec = byName.get(call.name());
                Map<String, Object> args = asMap(call._input());
                auditTrail.add(call.name() + " " + args);

                if (spec == null) {
                    results.add(errorResult(call.id(), "Unknown tool: " + call.name()));
                    continue;
                }

                if (spec.terminal()) {
                    // The model has submitted its answer. Stop here.
                    return new AgentResult(args, null, auditTrail, false, modelId, inputTokens, outputTokens);
                }

                try {
                    results.add(okResult(call.id(), spec.handler().apply(args)));
                } catch (RuntimeException e) {
                    // Hand the failure back rather than aborting — the model can
                    // adjust its query and try again.
                    log.warn("Tool {} failed: {}", call.name(), e.getMessage());
                    results.add(errorResult(call.id(), "Tool failed: " + e.getMessage()));
                }
            }

            // All results go back in ONE user message. Splitting them across
            // messages trains the model out of making parallel calls.
            conversation.add(MessageParam.builder()
                    .role(MessageParam.Role.USER)
                    .content(MessageParam.Content.ofBlockParams(results))
                    .build());
        }

        log.warn("Agent hit the {}-turn cap without submitting.", MAX_TURNS);
        return new AgentResult(null, null, auditTrail, false, modelId, inputTokens, outputTokens);
    }

    // ---- SDK plumbing -----------------------------------------------------

    private OutputConfig.Effort effort() {
        return OutputConfig.Effort.of(props.effort());
    }

    private Tool toAnthropicTool(ToolSpec spec) {
        Map<String, Object> schema = spec.inputSchema();
        return Tool.builder()
                .name(spec.name())
                .description(spec.description())
                .inputSchema(Tool.InputSchema.builder()
                        .properties(JsonValue.from(schema.get("properties")))
                        .putAdditionalProperty("required", JsonValue.from(schema.get("required")))
                        // Required for strict mode; guarantees inputs validate exactly.
                        .putAdditionalProperty("additionalProperties", JsonValue.from(false))
                        .build())
                .strict(true)
                .build();
    }

    private ContentBlockParam echo(ContentBlock block) {
        return block.accept(new ContentBlock.Visitor<>() {
            @Override public ContentBlockParam visitText(TextBlock b) {
                return ContentBlockParam.ofText(TextBlockParam.builder().text(b.text()).build());
            }
            @Override public ContentBlockParam visitToolUse(ToolUseBlock b) {
                return ContentBlockParam.ofToolUse(ToolUseBlockParam.builder()
                        .id(b.id()).name(b.name()).input(b._input()).build());
            }
            @Override public ContentBlockParam visitThinking(ThinkingBlock b) {
                // Replayed unmodified — editing a thinking block is rejected.
                return ContentBlockParam.ofThinking(ThinkingBlockParam.builder()
                        .thinking(b.thinking()).signature(b.signature()).build());
            }
            @Override public ContentBlockParam visitRedactedThinking(RedactedThinkingBlock b) {
                return ContentBlockParam.ofRedactedThinking(
                        RedactedThinkingBlockParam.builder().data(b.data()).build());
            }
        });
    }

    private ContentBlockParam okResult(String toolUseId, String content) {
        return ContentBlockParam.ofToolResult(ToolResultBlockParam.builder()
                .toolUseId(toolUseId)
                .content(content)
                .build());
    }

    private ContentBlockParam errorResult(String toolUseId, String message) {
        return ContentBlockParam.ofToolResult(ToolResultBlockParam.builder()
                .toolUseId(toolUseId)
                .content(message)
                .isError(true)
                .build());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(JsonValue value) {
        Object converted = value.convert(Object.class);
        return converted instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }
}
