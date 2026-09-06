package com.synapse.buildos.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * A published rate book — "TN PWD Schedule of Rates 2024-25, Chennai".
 * Every estimate names the schedule it was priced against, and that name is
 * shown to the user next to the total.
 */
@Entity
@Table(name = "rate_schedule")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RateSchedule {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(nullable = false)
    private String authority;

    @Column(name = "document_name", nullable = false)
    private String documentName;

    @Column(nullable = false)
    private String jurisdiction;

    @Column(name = "effective_from", nullable = false)
    private LocalDate effectiveFrom;

    @Column(name = "source_url")
    private String sourceUrl;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    /** Human-readable provenance line, e.g. "TN PWD — Schedule of Rates 2024-25 (eff. 2024-04-01)". */
    public String citation() {
        return "%s — %s (eff. %s)".formatted(authority, documentName, effectiveFrom);
    }
}
