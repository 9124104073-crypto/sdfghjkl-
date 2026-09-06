package com.synapse.buildos.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/** The user's own words — voice transcript or typed text, in their own language. */
@Entity
@Table(name = "brief")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Brief {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Enums.BriefSource source;

    /** BCP-47 tag as spoken, e.g. {@code ta-IN}. We keep the original, not a translation. */
    @Column(nullable = false)
    private String language;

    @Column(name = "raw_text", nullable = false, columnDefinition = "text")
    private String rawText;

    @Column(name = "audio_uri")
    private String audioUri;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
