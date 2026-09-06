package com.synapse.buildos.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One priced line from a government rate book. The model may search these and
 * choose among them; it may never author one or alter a rate.
 */
@Entity
@Table(name = "rate_item")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RateItem {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "schedule_id", nullable = false)
    private UUID scheduleId;

    /** Item number exactly as printed in the SOR, so a user can look it up. */
    @Column(name = "item_code", nullable = false)
    private String itemCode;

    @Column(nullable = false, columnDefinition = "text")
    private String description;

    @Column(nullable = false)
    private String unit;

    @Column(nullable = false)
    private BigDecimal rate;

    @Column(name = "work_category", nullable = false)
    private String workCategory;
}
