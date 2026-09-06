package com.synapse.buildos.service;

import com.synapse.buildos.domain.Enums.Confidence;
import com.synapse.buildos.domain.EstimateLine;
import com.synapse.buildos.domain.RateSchedule;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * Turns an estimate into a confidence band plus the reasons behind it.
 *
 * The reasons matter more than the band. "Rates last published 14 months ago"
 * tells a homeowner something they can act on; a bare "MEDIUM" does not.
 */
@Service
@RequiredArgsConstructor
public class ConfidenceService {

    /** A line is material if it is at least this share of the subtotal. */
    private static final BigDecimal MATERIAL_SHARE = new BigDecimal("0.05");

    private final EstimateProperties props;

    public record Assessment(Confidence band, List<String> reasons) {
        public String reasonsAsText() {
            return String.join("\n", reasons);
        }
    }

    public Assessment assess(RateSchedule schedule, List<EstimateLine> lines,
                             List<String> gaps, BigDecimal subtotal) {

        List<String> reasons = new ArrayList<>();
        Confidence band = Confidence.HIGH;

        // 1. How old is the rate book?
        long ageDays = ChronoUnit.DAYS.between(schedule.getEffectiveFrom(), LocalDate.now());
        if (ageDays > props.rateStalenessFailDays()) {
            band = band.and(Confidence.LOW);
            reasons.add("The rate schedule in use took effect %d months ago (%s). Market prices have very likely moved since."
                    .formatted(ageDays / 30, schedule.getEffectiveFrom()));
        } else if (ageDays > props.rateStalenessWarnDays()) {
            band = band.and(Confidence.MEDIUM);
            reasons.add("The rate schedule in use took effect %d months ago (%s). Expect some drift from current market prices."
                    .formatted(ageDays / 30, schedule.getEffectiveFrom()));
        }

        // 2. Did the model flag work it could not cost?
        if (!gaps.isEmpty()) {
            band = band.and(Confidence.MEDIUM);
            reasons.add("%d item%s of work could not be priced from the published schedule and are excluded from this total."
                    .formatted(gaps.size(), gaps.size() == 1 ? "" : "s"));
        }

        // 3. Are the big-money lines well grounded? A LOW-confidence quantity on
        //    a trivial line barely matters; on 30% of the total it decides the number.
        if (subtotal != null && subtotal.signum() > 0) {
            BigDecimal shakyValue = BigDecimal.ZERO;
            for (EstimateLine line : lines) {
                if (line.getQuantityConfidence() != Confidence.HIGH) {
                    shakyValue = shakyValue.add(line.getAmount());
                }
            }
            BigDecimal share = shakyValue.divide(subtotal, 4, RoundingMode.HALF_UP);
            if (share.compareTo(new BigDecimal("0.40")) > 0) {
                band = band.and(Confidence.LOW);
                reasons.add("%s%% of the cost rests on quantities we inferred rather than measured from your description."
                        .formatted(share.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP)));
            } else if (share.compareTo(MATERIAL_SHARE) > 0) {
                band = band.and(Confidence.MEDIUM);
                reasons.add("%s%% of the cost rests on assumed rather than stated dimensions — the individual lines say which."
                        .formatted(share.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP)));
            }
        }

        // 4. Nothing to cost at all.
        if (lines.isEmpty()) {
            band = Confidence.LOW;
            reasons.add("No priced items could be derived from the description provided.");
        }

        if (reasons.isEmpty()) {
            reasons.add("Priced against a current published schedule, with dimensions taken from your description.");
        }

        return new Assessment(band, reasons);
    }
}
