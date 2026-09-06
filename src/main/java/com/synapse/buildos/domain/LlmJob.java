package com.synapse.buildos.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A takeoff run takes tens of seconds. Mobile clients get a job id immediately
 * and poll (or receive a push); nothing blocks on an HTTP request that a
 * backgrounded app would drop anyway.
 */
@Entity
@Table(name = "llm_job")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class LlmJob {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Enums.JobKind kind;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Enums.JobStatus status;

    /** Id of the produced Estimate / ComplianceReport once SUCCEEDED. */
    @Column(name = "result_id")
    private UUID resultId;

    @Column(columnDefinition = "text")
    private String error;

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
