package com.synapse.buildos.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * What the municipality actually decided.
 *
 * This table is the long-term asset. Tied to {@code jurisdiction} +
 * {@code rulesetVersion}, it lets us measure which rules we get right and which
 * we do not — and to recalibrate confidence from evidence rather than intuition.
 */
@Entity
@Table(name = "approval_outcome")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ApprovalOutcome {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(name = "report_id")
    private UUID reportId;

    @Column(nullable = false)
    private String jurisdiction;

    @Column(name = "ruleset_version", nullable = false)
    private String rulesetVersion;

    @Column(name = "submitted_on")
    private LocalDate submittedOn;

    @Column(name = "decided_on")
    private LocalDate decidedOn;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Enums.ApprovalResult result;

    /** Free text: what the authority actually objected to. The most valuable field here. */
    @Column(columnDefinition = "text")
    private String objections;

    @Column(name = "reported_by")
    private UUID reportedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
