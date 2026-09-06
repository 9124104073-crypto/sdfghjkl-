package com.synapse.buildos.web;

import com.synapse.buildos.domain.Enums;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Wire contracts. Kept separate from entities so a schema change does not
 * silently alter what shipped mobile clients receive — an app on a user's phone
 * cannot be redeployed with the server.
 */
public final class Dtos {

    private Dtos() {}

    // ---- requests ---------------------------------------------------------

    public record CreateProjectRequest(
            @NotBlank @Size(max = 160) String name,
            @NotBlank String jurisdiction,
            @Positive BigDecimal plotAreaSqft,
            Enums.PlotType plotType,
            @Min(1) @Max(20) Integer floors
    ) {}

    public record CreateBriefRequest(
            @NotNull Enums.BriefSource source,
            /** BCP-47, e.g. "ta-IN". We keep the user's own language rather than translating on ingest. */
            @NotBlank String language,
            @NotBlank @Size(max = 20000) String rawText,
            String audioUri
    ) {}

    public record RecordOutcomeRequest(
            UUID reportId,
            @NotNull Enums.ApprovalResult result,
            String objections,
            String submittedOn,
            String decidedOn
    ) {}

    // ---- responses --------------------------------------------------------

    public record ProjectResponse(
            UUID id, String name, String jurisdiction,
            BigDecimal plotAreaSqft, Enums.PlotType plotType, Integer floors,
            Enums.ProjectStatus status, Instant createdAt
    ) {}

    public record JobResponse(
            UUID jobId, Enums.JobKind kind, Enums.JobStatus status,
            UUID resultId, String error,
            /** Client-facing hint for poll interval, in seconds. */
            int retryAfterSeconds
    ) {}

    public record EstimateLineResponse(
            int sequence,
            String itemCode,
            String description,
            BigDecimal quantity,
            String unit,
            BigDecimal rate,
            BigDecimal amount,
            String takeoffBasis,
            Enums.Confidence quantityConfidence
    ) {}

    /**
     * Note what travels with the number: the rate source, its effective date,
     * the confidence band, and the reasons. A client cannot render the total
     * without also having the provenance available to show next to it.
     */
    public record EstimateResponse(
            UUID id,
            Enums.EstimateStatus status,
            BigDecimal subtotal,
            BigDecimal overheadAmount,
            BigDecimal contingencyAmount,
            BigDecimal total,
            Enums.Confidence confidence,
            List<String> confidenceReasons,
            RateSourceResponse rateSource,
            List<EstimateLineResponse> lines,
            String failureReason,
            Instant createdAt
    ) {}

    public record RateSourceResponse(
            String authority,
            String documentName,
            String jurisdiction,
            String effectiveFrom,
            String sourceUrl,
            String citation
    ) {}

    public record FindingResponse(
            String ruleCode,
            String ruleTitle,
            Enums.Severity severity,
            Enums.FindingOutcome outcome,
            Enums.Confidence confidence,
            String explanation,
            String citation,
            String ruleVerifiedOn
    ) {}

    public record ComplianceResponse(
            UUID id,
            String jurisdiction,
            String rulesetVersion,
            List<FindingResponse> findings,
            /** Repeated on every compliance response; clients must display it. */
            String disclaimer,
            Instant createdAt
    ) {}
}
