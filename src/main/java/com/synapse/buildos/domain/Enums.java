package com.synapse.buildos.domain;

/**
 * All domain enums in one place. These strings are persisted and appear in the
 * mobile API, so renaming a constant is a breaking change — add, don't rename.
 */
public final class Enums {

    private Enums() {}

    public enum Role { HOMEOWNER, ARCHITECT, CONTRACTOR, ADMIN }

    public enum BriefSource { VOICE, TEXT }

    public enum PlotType { REGULAR, CORNER, IRREGULAR }

    public enum ProjectStatus { DRAFT, ESTIMATING, ESTIMATED, ARCHIVED }

    public enum JobKind { TAKEOFF, COMPLIANCE, QUOTE_CHECK }

    public enum JobStatus { QUEUED, RUNNING, SUCCEEDED, FAILED }

    public enum EstimateStatus { PENDING, RUNNING, COMPLETED, FAILED }

    /**
     * Deliberately three-valued and never numeric. A percentage implies a
     * calibration we do not have; a band the user can reason about is honest.
     */
    public enum Confidence {
        HIGH, MEDIUM, LOW;

        /** Confidence of a composite is the weakest of its parts. */
        public Confidence and(Confidence other) {
            return this.ordinal() >= other.ordinal() ? this : other;
        }
    }

    public enum Severity { BLOCKER, WARNING, INFO }

    /**
     * Never PASS / FAIL. We are not the municipality and the API should not
     * read as though we are.
     */
    public enum FindingOutcome { LIKELY_PASS, LIKELY_FAIL, UNDETERMINED }

    public enum ApprovalResult { APPROVED, REJECTED, APPROVED_WITH_CHANGES, WITHDRAWN }
}
