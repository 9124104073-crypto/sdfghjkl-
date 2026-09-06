-- Synapse BuildOS — initial schema.
--
-- Design note: rate_item is the backbone of every cost figure. It is populated
-- from published government Schedule of Rates documents (PWD SOR / SSR) and is
-- never written by the model. estimate_line references a rate_item by id, so
-- every rupee in an estimate traces back to a citable source row.

CREATE TABLE app_user (
    id              UUID PRIMARY KEY,
    phone           VARCHAR(20)  NOT NULL UNIQUE,
    display_name    VARCHAR(120),
    locale          VARCHAR(16)  NOT NULL DEFAULT 'en-IN',
    role            VARCHAR(24)  NOT NULL DEFAULT 'HOMEOWNER',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE project (
    id              UUID PRIMARY KEY,
    owner_id        UUID         NOT NULL REFERENCES app_user(id),
    name            VARCHAR(160) NOT NULL,
    jurisdiction    VARCHAR(64)  NOT NULL,   -- e.g. 'IN-TN-CHENNAI'
    plot_area_sqft  NUMERIC(12,2),
    plot_type       VARCHAR(24),             -- REGULAR | CORNER | IRREGULAR
    floors          INT,
    status          VARCHAR(24)  NOT NULL DEFAULT 'DRAFT',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_owner ON project(owner_id);

-- Raw input from the user: voice transcript or typed text, in any language.
CREATE TABLE brief (
    id              UUID PRIMARY KEY,
    project_id      UUID         NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    source          VARCHAR(16)  NOT NULL,   -- VOICE | TEXT
    language        VARCHAR(16)  NOT NULL,
    raw_text        TEXT         NOT NULL,
    audio_uri       TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_brief_project ON brief(project_id);

-- A published rate book: "TN PWD SOR 2024-25, Chennai region".
CREATE TABLE rate_schedule (
    id              UUID PRIMARY KEY,
    authority       VARCHAR(80)  NOT NULL,   -- 'TN PWD'
    document_name   VARCHAR(160) NOT NULL,   -- 'Schedule of Rates 2024-25'
    jurisdiction    VARCHAR(64)  NOT NULL,
    effective_from  DATE         NOT NULL,
    source_url      TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (authority, document_name, jurisdiction)
);

CREATE TABLE rate_item (
    id              UUID PRIMARY KEY,
    schedule_id     UUID         NOT NULL REFERENCES rate_schedule(id) ON DELETE CASCADE,
    item_code       VARCHAR(48)  NOT NULL,   -- SOR item number, as printed
    description     TEXT         NOT NULL,
    unit            VARCHAR(16)  NOT NULL,   -- SQM | CUM | KG | NOS | RMT
    rate            NUMERIC(14,2) NOT NULL,
    work_category   VARCHAR(48)  NOT NULL,   -- EARTHWORK | CONCRETE | MASONRY | ...
    UNIQUE (schedule_id, item_code)
);
CREATE INDEX idx_rate_item_lookup ON rate_item(schedule_id, work_category);
CREATE INDEX idx_rate_item_desc ON rate_item USING gin (to_tsvector('english', description));

-- One costing run. Immutable once COMPLETED; a re-run creates a new row.
CREATE TABLE estimate (
    id                  UUID PRIMARY KEY,
    project_id          UUID         NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    brief_id            UUID         REFERENCES brief(id),
    schedule_id         UUID         NOT NULL REFERENCES rate_schedule(id),
    status              VARCHAR(24)  NOT NULL,     -- PENDING | RUNNING | COMPLETED | FAILED
    subtotal            NUMERIC(16,2),
    overhead_amount     NUMERIC(16,2),
    contingency_amount  NUMERIC(16,2),
    total               NUMERIC(16,2),
    confidence          VARCHAR(12),               -- HIGH | MEDIUM | LOW
    confidence_reasons  TEXT,                      -- newline-separated, shown verbatim to the user
    model_id            VARCHAR(64),
    input_tokens        INT,
    output_tokens       INT,
    failure_reason      TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ
);
CREATE INDEX idx_estimate_project ON estimate(project_id, created_at DESC);

CREATE TABLE estimate_line (
    id              UUID PRIMARY KEY,
    estimate_id     UUID          NOT NULL REFERENCES estimate(id) ON DELETE CASCADE,
    rate_item_id    UUID          NOT NULL REFERENCES rate_item(id),
    sequence        INT           NOT NULL,
    quantity        NUMERIC(14,3) NOT NULL,
    unit            VARCHAR(16)   NOT NULL,
    rate            NUMERIC(14,2) NOT NULL,   -- snapshotted; SOR may be revised later
    amount          NUMERIC(16,2) NOT NULL,
    -- How the quantity was arrived at, in plain language. Surfaced in the app.
    takeoff_basis   TEXT          NOT NULL,
    quantity_confidence VARCHAR(12) NOT NULL,
    UNIQUE (estimate_id, sequence)
);

-- Compliance is advisory. Findings carry confidence and a rule-verification date;
-- nothing here is presented as an approval decision.
CREATE TABLE compliance_report (
    id              UUID PRIMARY KEY,
    project_id      UUID         NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    jurisdiction    VARCHAR(64)  NOT NULL,
    ruleset_version VARCHAR(48)  NOT NULL,
    status          VARCHAR(24)  NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE compliance_finding (
    id              UUID PRIMARY KEY,
    report_id       UUID         NOT NULL REFERENCES compliance_report(id) ON DELETE CASCADE,
    rule_code       VARCHAR(64)  NOT NULL,   -- 'TN-DR-2019.S23.SETBACK.FRONT'
    rule_title      VARCHAR(200) NOT NULL,
    severity        VARCHAR(16)  NOT NULL,   -- BLOCKER | WARNING | INFO
    outcome         VARCHAR(16)  NOT NULL,   -- LIKELY_PASS | LIKELY_FAIL | UNDETERMINED
    confidence      VARCHAR(12)  NOT NULL,
    explanation     TEXT         NOT NULL,
    citation        TEXT,
    rule_verified_on DATE
);

-- The data moat: did the plan actually clear the municipality?
CREATE TABLE approval_outcome (
    id              UUID PRIMARY KEY,
    project_id      UUID         NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    report_id       UUID         REFERENCES compliance_report(id),
    jurisdiction    VARCHAR(64)  NOT NULL,
    ruleset_version VARCHAR(48)  NOT NULL,
    submitted_on    DATE,
    decided_on      DATE,
    result          VARCHAR(24)  NOT NULL,   -- APPROVED | REJECTED | APPROVED_WITH_CHANGES | WITHDRAWN
    objections      TEXT,
    reported_by     UUID         REFERENCES app_user(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_outcome_jurisdiction ON approval_outcome(jurisdiction, ruleset_version);

-- Long LLM work runs off the request thread; mobile clients poll this.
CREATE TABLE llm_job (
    id              UUID PRIMARY KEY,
    project_id      UUID         NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    kind            VARCHAR(32)  NOT NULL,   -- TAKEOFF | COMPLIANCE | QUOTE_CHECK
    status          VARCHAR(16)  NOT NULL,   -- QUEUED | RUNNING | SUCCEEDED | FAILED
    result_id       UUID,
    error           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_project ON llm_job(project_id, created_at DESC);
