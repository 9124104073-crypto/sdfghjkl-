package com.synapse.buildos.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "project")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Project {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(nullable = false)
    private String name;

    /** Stable jurisdiction key, e.g. {@code IN-TN-CHENNAI}. Drives ruleset and rate-book selection. */
    @Column(nullable = false)
    private String jurisdiction;

    @Column(name = "plot_area_sqft")
    private BigDecimal plotAreaSqft;

    @Enumerated(EnumType.STRING)
    @Column(name = "plot_type")
    private Enums.PlotType plotType;

    private Integer floors;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private Enums.ProjectStatus status = Enums.ProjectStatus.DRAFT;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        this.updatedAt = Instant.now();
    }
}
