package com.synapse.buildos.web;

import com.synapse.buildos.domain.*;
import com.synapse.buildos.repo.Repos;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Component
@RequiredArgsConstructor
public class ResponseMapper {

    /**
     * Shown on every compliance response. This is a legal floor, not the trust
     * mechanism — the per-finding confidence and verification date do that work.
     */
    public static final String COMPLIANCE_DISCLAIMER =
            "This is an automated reading of published building bylaws, not an approval. "
            + "Only your local authority can approve a plan. Each finding shows how confident "
            + "we are and when the underlying rule was last checked against its source.";

    private final Repos.RateItemRepo rateItems;

    public Dtos.ProjectResponse project(Project p) {
        return new Dtos.ProjectResponse(p.getId(), p.getName(), p.getJurisdiction(),
                p.getPlotAreaSqft(), p.getPlotType(), p.getFloors(), p.getStatus(), p.getCreatedAt());
    }

    public Dtos.JobResponse job(LlmJob j) {
        return new Dtos.JobResponse(j.getId(), j.getKind(), j.getStatus(),
                j.getResultId(), j.getError(), 3);
    }

    public Dtos.RateSourceResponse rateSource(RateSchedule s) {
        return new Dtos.RateSourceResponse(
                s.getAuthority(), s.getDocumentName(), s.getJurisdiction(),
                s.getEffectiveFrom().toString(), s.getSourceUrl(), s.citation());
    }

    public Dtos.EstimateResponse estimate(Estimate e, RateSchedule schedule, List<EstimateLine> lines) {
        List<Dtos.EstimateLineResponse> lineDtos = new ArrayList<>();
        for (EstimateLine l : lines) {
            RateItem item = rateItems.findById(l.getRateItemId()).orElse(null);
            lineDtos.add(new Dtos.EstimateLineResponse(
                    l.getSequence(),
                    item != null ? item.getItemCode() : "—",
                    item != null ? item.getDescription() : "Item no longer in schedule",
                    l.getQuantity(), l.getUnit(), l.getRate(), l.getAmount(),
                    l.getTakeoffBasis(), l.getQuantityConfidence()));
        }
        return new Dtos.EstimateResponse(
                e.getId(), e.getStatus(), e.getSubtotal(), e.getOverheadAmount(),
                e.getContingencyAmount(), e.getTotal(), e.getConfidence(),
                splitReasons(e.getConfidenceReasons()),
                rateSource(schedule), lineDtos, e.getFailureReason(), e.getCreatedAt());
    }

    public Dtos.ComplianceResponse compliance(ComplianceReport r, List<ComplianceFinding> findings) {
        List<Dtos.FindingResponse> dtos = findings.stream()
                .map(f -> new Dtos.FindingResponse(
                        f.getRuleCode(), f.getRuleTitle(), f.getSeverity(), f.getOutcome(),
                        f.getConfidence(), f.getExplanation(), f.getCitation(),
                        f.getRuleVerifiedOn() == null ? null : f.getRuleVerifiedOn().toString()))
                .toList();
        return new Dtos.ComplianceResponse(r.getId(), r.getJurisdiction(), r.getRulesetVersion(),
                dtos, COMPLIANCE_DISCLAIMER, r.getCreatedAt());
    }

    private static List<String> splitReasons(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        return List.of(raw.split("\n")).stream().filter(Objects::nonNull)
                .map(String::trim).filter(s -> !s.isEmpty()).toList();
    }
}
