package com.synapse.buildos.service;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;

@ConfigurationProperties(prefix = "buildos.estimate")
public record EstimateProperties(
        BigDecimal contractorOverheadPct,
        BigDecimal contingencyPct,
        int rateStalenessWarnDays,
        int rateStalenessFailDays
) {}
