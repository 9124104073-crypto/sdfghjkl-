package com.synapse.buildos.service;

import com.synapse.buildos.domain.*;
import com.synapse.buildos.domain.Enums.Confidence;
import com.synapse.buildos.domain.Enums.EstimateStatus;
import com.synapse.buildos.llm.AgentResult;
import com.synapse.buildos.llm.ClaudeClient;
import com.synapse.buildos.llm.Prompts;
import com.synapse.buildos.llm.ToolSpec;
import com.synapse.buildos.repo.Repos;
import com.synapse.buildos.web.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.*;

/**
 * The costing engine.
 *
 * The division of labour is the whole point of this class:
 *
 *   model  → quantities, item selection, and the stated basis for each
 *   engine → every rupee
 *
 * The model's submission is treated as untrusted input. Rates are re-read from
 * the database by id; any price the model may have mentioned is discarded.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EstimateService {

    private final Repos.EstimateRepo estimates;
    private final Repos.EstimateLineRepo estimateLines;
    private final Repos.RateItemRepo rateItems;
    private final Repos.RateScheduleRepo schedules;
    private final Repos.BriefRepo briefs;
    private final Repos.ProjectRepo projects;

    private final ClaudeClient claude;
    private final RateLookupTools rateTools;
    private final ConfidenceService confidence;
    private final EstimateProperties props;

    /** Creates the estimate row up front so the client has something to poll. */
    @Transactional
    public Estimate createPending(UUID projectId, UUID briefId) {
        Project project = projects.findById(projectId)
                .orElseThrow(() -> ApiException.notFound("Project not found"));

        RateSchedule schedule = schedules
                .findFirstByJurisdictionOrderByEffectiveFromDesc(project.getJurisdiction())
                .orElseThrow(() -> ApiException.unprocessable(
                        "No published rate schedule is loaded for " + project.getJurisdiction()
                                + ". We cannot produce a costed estimate for this location yet."));

        return estimates.save(Estimate.builder()
                .projectId(projectId)
                .briefId(briefId)
                .scheduleId(schedule.getId())
                .status(EstimateStatus.PENDING)
                .build());
    }

    /**
     * Runs the takeoff and prices it. Called off the request thread — this takes
     * tens of seconds.
     */
    @Transactional
    public void runTakeoff(UUID estimateId) {
        Estimate estimate = estimates.findById(estimateId)
                .orElseThrow(() -> ApiException.notFound("Estimate not found"));

        estimate.setStatus(EstimateStatus.RUNNING);
        estimates.save(estimate);

        try {
            RateSchedule schedule = schedules.findById(estimate.getScheduleId()).orElseThrow();
            Brief brief = briefs.findById(estimate.getBriefId())
                    .orElseThrow(() -> ApiException.unprocessable("Estimate has no brief to work from"));
            Project project = projects.findById(estimate.getProjectId()).orElseThrow();

            List<ToolSpec> tools = List.of(
                    rateTools.searchTool(schedule.getId()),
                    rateTools.submitTakeoffTool());

            AgentResult result = claude.runAgent(
                    Prompts.TAKEOFF_SYSTEM,
                    buildUserMessage(project, brief, schedule),
                    tools);

            if (result.refused()) {
                fail(estimate, "The request could not be processed. Please rephrase your description.");
                return;
            }
            if (!result.submitted()) {
                fail(estimate, "The takeoff did not complete. Please try again, or add more detail "
                        + "about dimensions and number of rooms.");
                return;
            }

            price(estimate, schedule, result);

        } catch (ApiException e) {
            fail(estimate, e.getMessage());
        } catch (RuntimeException e) {
            log.error("Takeoff failed for estimate {}", estimateId, e);
            fail(estimate, "An internal error occurred while preparing the estimate.");
        }
    }

    // ---- pricing ----------------------------------------------------------

    @SuppressWarnings("unchecked")
    private void price(Estimate estimate, RateSchedule schedule, AgentResult result) {

        List<Map<String, Object>> submitted =
                (List<Map<String, Object>>) result.submission().getOrDefault("lines", List.of());
        List<String> gaps = new ArrayList<>(
                (List<String>) result.submission().getOrDefault("gaps", List.of()));

        List<EstimateLine> lines = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        int sequence = 0;

        for (Map<String, Object> row : submitted) {
            UUID rateItemId;
            try {
                rateItemId = UUID.fromString(String.valueOf(row.get("rate_item_id")));
            } catch (IllegalArgumentException e) {
                // The model fabricated an id rather than using a search result.
                // Drop the line and tell the user, rather than pricing a guess.
                gaps.add("A line was discarded because it did not reference a published rate item.");
                continue;
            }

            Optional<RateItem> maybeItem = rateItems.findById(rateItemId);
            if (maybeItem.isEmpty() || !maybeItem.get().getScheduleId().equals(schedule.getId())) {
                gaps.add("A line referenced an item that is not in this rate schedule and was excluded.");
                continue;
            }
            RateItem item = maybeItem.get();

            BigDecimal quantity = toDecimal(row.get("quantity"));
            if (quantity == null || quantity.signum() <= 0) {
                gaps.add("A line for \"" + item.getDescription() + "\" had no usable quantity and was excluded.");
                continue;
            }

            // The authoritative rate. Read from the database, never from the model.
            BigDecimal rate = item.getRate();
            BigDecimal amount = quantity.multiply(rate).setScale(2, RoundingMode.HALF_UP);

            lines.add(EstimateLine.builder()
                    .estimateId(estimate.getId())
                    .rateItemId(item.getId())
                    .sequence(sequence++)
                    .quantity(quantity.setScale(3, RoundingMode.HALF_UP))
                    .unit(item.getUnit())
                    .rate(rate)
                    .amount(amount)
                    .takeoffBasis(String.valueOf(row.getOrDefault("takeoff_basis", "Not stated.")))
                    .quantityConfidence(parseConfidence(row.get("confidence")))
                    .build());

            subtotal = subtotal.add(amount);
        }

        BigDecimal overhead = pct(subtotal, props.contractorOverheadPct());
        BigDecimal contingency = pct(subtotal, props.contingencyPct());
        BigDecimal total = subtotal.add(overhead).add(contingency);

        ConfidenceService.Assessment assessment =
                confidence.assess(schedule, lines, gaps, subtotal);

        estimateLines.saveAll(lines);

        estimate.setSubtotal(subtotal);
        estimate.setOverheadAmount(overhead);
        estimate.setContingencyAmount(contingency);
        estimate.setTotal(total);
        estimate.setConfidence(assessment.band());
        estimate.setConfidenceReasons(assessment.reasonsAsText());
        estimate.setModelId(result.modelId());
        estimate.setInputTokens(result.inputTokens());
        estimate.setOutputTokens(result.outputTokens());
        estimate.setStatus(EstimateStatus.COMPLETED);
        estimate.setCompletedAt(Instant.now());
        estimates.save(estimate);

        log.info("Estimate {} priced: {} lines, total {}, confidence {}",
                estimate.getId(), lines.size(), total, assessment.band());
    }

    private String buildUserMessage(Project project, Brief brief, RateSchedule schedule) {
        StringBuilder sb = new StringBuilder();
        sb.append("Rate book in use: ").append(schedule.citation()).append("\n");
        sb.append("Location: ").append(project.getJurisdiction()).append("\n");
        if (project.getPlotAreaSqft() != null) {
            sb.append("Plot area: ").append(project.getPlotAreaSqft()).append(" sq ft\n");
        }
        if (project.getFloors() != null) {
            sb.append("Floors: ").append(project.getFloors()).append("\n");
        }
        if (project.getPlotType() != null) {
            sb.append("Plot type: ").append(project.getPlotType()).append("\n");
        }
        sb.append("\nThe homeowner described the project as follows");
        sb.append(" (original language: ").append(brief.getLanguage()).append("):\n\n");
        sb.append(brief.getRawText());
        return sb.toString();
    }

    private void fail(Estimate estimate, String reason) {
        estimate.setStatus(EstimateStatus.FAILED);
        estimate.setFailureReason(reason);
        estimate.setCompletedAt(Instant.now());
        estimates.save(estimate);
    }

    private static BigDecimal pct(BigDecimal base, BigDecimal percentage) {
        if (percentage == null) return BigDecimal.ZERO;
        return base.multiply(percentage)
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }

    private static BigDecimal toDecimal(Object value) {
        if (value == null) return null;
        try {
            return new BigDecimal(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Confidence parseConfidence(Object value) {
        try {
            return Confidence.valueOf(String.valueOf(value).toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            return Confidence.LOW; // unreadable confidence is not high confidence
        }
    }
}
