package com.synapse.buildos.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "compliance_report")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ComplianceReport {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(nullable = false)
    private String jurisdiction;

    /**
     * Which version of the bylaw ruleset produced this report. Pinned so that an
     * approval outcome recorded months later can be attributed to the exact
     * rules that were applied — this is what makes the outcome data useful.
     */
    @Column(name = "ruleset_version", nullable = false)
    private String rulesetVersion;

    @Column(nullable = false)
    private String status;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
