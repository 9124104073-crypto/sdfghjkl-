package com.synapse.buildos.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_user")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AppUser {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    /** Phone is the identity in this market; email is not. */
    @Column(nullable = false, unique = true)
    private String phone;

    @Column(name = "display_name")
    private String displayName;

    /** Drives response language end to end, including LLM output. */
    @Column(nullable = false)
    @Builder.Default
    private String locale = "en-IN";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private Enums.Role role = Enums.Role.HOMEOWNER;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
