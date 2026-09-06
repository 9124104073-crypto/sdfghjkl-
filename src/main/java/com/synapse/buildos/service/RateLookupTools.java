package com.synapse.buildos.service;

import com.synapse.buildos.domain.RateItem;
import com.synapse.buildos.llm.ToolSpec;
import com.synapse.buildos.repo.Repos;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Server-side tools that let the model read the rate book without being able to
 * write to it. This is the enforcement point for "the model never invents a
 * price": search returns published items and their ids, and the costing engine
 * later re-reads the rate from the database by id, ignoring anything the model
 * might have said about price.
 */
@Component
@RequiredArgsConstructor
public class RateLookupTools {

    private static final int MAX_RESULTS = 8;

    private final Repos.RateItemRepo rateItems;

    public ToolSpec searchTool(UUID scheduleId) {
        return ToolSpec.of(
                "search_rate_items",
                """
                Search the published Schedule of Rates for items matching a
                description of work. Call this before adding any line to the
                takeoff — you need a real `rate_item_id` for every line, and this
                is the only way to get one. Search with the words a rate book
                would use ("brick masonry in cement mortar", "PCC 1:4:8"), not
                the homeowner's words.
                """,
                Map.of(
                        "type", "object",
                        "properties", Map.of(
                                "query", Map.of(
                                        "type", "string",
                                        "description", "Work description in Schedule-of-Rates terminology."
                                )
                        ),
                        "required", List.of("query")
                ),
                args -> {
                    String q = String.valueOf(args.getOrDefault("query", "")).trim();
                    if (q.isEmpty()) {
                        return "Empty query. Provide a work description.";
                    }
                    List<RateItem> hits = rateItems.search(scheduleId, q, MAX_RESULTS);
                    if (hits.isEmpty()) {
                        return "No published item matches \"" + q + "\" in this rate book. "
                                + "Try different terminology, or record this as a gap.";
                    }
                    StringBuilder sb = new StringBuilder("Matching published items:\n");
                    for (RateItem it : hits) {
                        // Rate is shown so the model can sanity-check unit consistency,
                        // but it is re-read from the database at costing time regardless.
                        sb.append("- rate_item_id=").append(it.getId())
                          .append(" | code=").append(it.getItemCode())
                          .append(" | unit=").append(it.getUnit())
                          .append(" | rate=").append(it.getRate())
                          .append(" | ").append(it.getDescription())
                          .append('\n');
                    }
                    return sb.toString();
                }
        );
    }

    /** Terminal tool: the model's structured answer. */
    public ToolSpec submitTakeoffTool() {
        return ToolSpec.terminal(
                "submit_takeoff",
                "Submit the completed bill of quantities. Call exactly once, when every line is done.",
                Map.of(
                        "type", "object",
                        "properties", Map.of(
                                "lines", Map.of(
                                        "type", "array",
                                        "description", "One entry per item of work.",
                                        "items", Map.of(
                                                "type", "object",
                                                "properties", Map.of(
                                                        "rate_item_id", Map.of("type", "string",
                                                                "description", "Exactly as returned by search_rate_items."),
                                                        "quantity", Map.of("type", "number"),
                                                        "takeoff_basis", Map.of("type", "string",
                                                                "description", "How the quantity was derived, in plain language."),
                                                        "confidence", Map.of("type", "string",
                                                                "enum", List.of("HIGH", "MEDIUM", "LOW"))
                                                ),
                                                "required", List.of("rate_item_id", "quantity", "takeoff_basis", "confidence"),
                                                "additionalProperties", false
                                        )
                                ),
                                "gaps", Map.of(
                                        "type", "array",
                                        "description", "Work you could not cost, and why. Do not leave this empty just to look complete.",
                                        "items", Map.of("type", "string")
                                )
                        ),
                        "required", List.of("lines", "gaps")
                )
        );
    }
}
