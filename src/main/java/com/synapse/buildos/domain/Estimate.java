package com.synapse.buildos.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One costing run. Treated as immutable once COMPLETED — re-costing a project
 * creates a new Estimate so a user can see how the number moved and why.
 */
@Entity
@Table(name = "estimate")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Estimate {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(name = "brief_id")
    private UUID briefId;

    @Column(name = "schedule_id", nullable = false)
    private UUID scheduleId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Enums.EstimateStatus status;

    private BigDecimal subtotal;

    @Column(name = "overhead_amount")
    private BigDecimal overheadAmount;

    @Column(name = "contingency_amount")
    private BigDecimal contingencyAmount;

    private BigDecimal total;

    @Enumerated(EnumType.STRING)
    private Enums.Confidence confidence;

    /** Newline-separated plain-language reasons, shown to the user verbatim. */
    @Column(name = "confidence_reasons", columnDefinition = "text")
    private String confidenceReasons;

    @Column(name = "model_id")
    private String modelId;

    @Column(name = "input_tokens")
    private Integer inputTokens;

    @Column(name = "output_tokens")
    private Integer outputTokens;

    @Column(name = "failure_reason", columnDefinition = "text")
    private String failureReason;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "completed_at")
    private Instant completedAt;
}
