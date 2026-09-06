package com.synapse.buildos.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * A single costed line. {@code rate} is snapshotted from the RateItem at costing
 * time so a later SOR revision never silently rewrites a delivered estimate.
 */
@Entity
@Table(name = "estimate_line")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class EstimateLine {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "estimate_id", nullable = false)
    private UUID estimateId;

    @Column(name = "rate_item_id", nullable = false)
    private UUID rateItemId;

    @Column(nullable = false)
    private Integer sequence;

    @Column(nullable = false)
    private BigDecimal quantity;

    @Column(nullable = false)
    private String unit;

    @Column(nullable = false)
    private BigDecimal rate;

    @Column(nullable = false)
    private BigDecimal amount;

    /**
     * How the quantity was derived, in the user's terms — "external walls,
     * 4 sides x 3.0m height x 0.23m thick, less 12% for openings". This is the
     * line a quantity surveyor would write, and it is what makes the number
     * arguable rather than magic.
     */
    @Column(name = "takeoff_basis", nullable = false, columnDefinition = "text")
    private String takeoffBasis;

    @Enumerated(EnumType.STRING)
    @Column(name = "quantity_confidence", nullable = false)
    private Enums.Confidence quantityConfidence;
}
