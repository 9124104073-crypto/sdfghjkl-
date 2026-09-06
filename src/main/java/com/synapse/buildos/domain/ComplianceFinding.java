package com.synapse.buildos.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "compliance_finding")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ComplianceFinding {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "report_id", nullable = false)
    private UUID reportId;

    @Column(name = "rule_code", nullable = false)
    private String ruleCode;

    @Column(name = "rule_title", nullable = false)
    private String ruleTitle;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Enums.Severity severity;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Enums.FindingOutcome outcome;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Enums.Confidence confidence;

    @Column(nullable = false, columnDefinition = "text")
    private String explanation;

    /** Section reference in the bylaw, so the user can check us. */
    @Column(columnDefinition = "text")
    private String citation;

    /** When a human last confirmed this rule against the source document. */
    @Column(name = "rule_verified_on")
    private LocalDate ruleVerifiedOn;
}
