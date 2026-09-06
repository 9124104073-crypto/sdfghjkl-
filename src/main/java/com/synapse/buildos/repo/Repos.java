package com.synapse.buildos.repo;

import com.synapse.buildos.domain.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Repository interfaces, grouped. Spring Data picks up nested interfaces during scanning. */
public interface Repos {

    interface UserRepo extends JpaRepository<AppUser, UUID> {
        Optional<AppUser> findByPhone(String phone);
    }

    interface ProjectRepo extends JpaRepository<Project, UUID> {
        List<Project> findByOwnerIdOrderByCreatedAtDesc(UUID ownerId);
        Optional<Project> findByIdAndOwnerId(UUID id, UUID ownerId);
    }

    interface BriefRepo extends JpaRepository<Brief, UUID> {
        List<Brief> findByProjectIdOrderByCreatedAtDesc(UUID projectId);
    }

    interface RateScheduleRepo extends JpaRepository<RateSchedule, UUID> {
        /** Most recent rate book in force for a jurisdiction. */
        Optional<RateSchedule> findFirstByJurisdictionOrderByEffectiveFromDesc(String jurisdiction);
    }

    interface RateItemRepo extends JpaRepository<RateItem, UUID> {

        Optional<RateItem> findByScheduleIdAndItemCode(UUID scheduleId, String itemCode);

        List<RateItem> findByScheduleIdAndWorkCategory(UUID scheduleId, String workCategory);

        /**
         * Full-text search over item descriptions, scoped to one rate book.
         * This is what the model's {@code search_rate_items} tool calls — it can
         * find and select a published item, but it can never author one.
         */
        @Query(value = """
                SELECT * FROM rate_item
                WHERE schedule_id = :scheduleId
                  AND to_tsvector('english', description) @@ plainto_tsquery('english', :q)
                ORDER BY ts_rank(to_tsvector('english', description),
                                 plainto_tsquery('english', :q)) DESC
                LIMIT :limit
                """, nativeQuery = true)
        List<RateItem> search(@Param("scheduleId") UUID scheduleId,
                              @Param("q") String query,
                              @Param("limit") int limit);
    }

    interface EstimateRepo extends JpaRepository<Estimate, UUID> {
        List<Estimate> findByProjectIdOrderByCreatedAtDesc(UUID projectId);
    }

    interface EstimateLineRepo extends JpaRepository<EstimateLine, UUID> {
        List<EstimateLine> findByEstimateIdOrderBySequenceAsc(UUID estimateId);
    }

    interface ComplianceReportRepo extends JpaRepository<ComplianceReport, UUID> {
        List<ComplianceReport> findByProjectIdOrderByCreatedAtDesc(UUID projectId);
    }

    interface ComplianceFindingRepo extends JpaRepository<ComplianceFinding, UUID> {
        List<ComplianceFinding> findByReportId(UUID reportId);
    }

    interface ApprovalOutcomeRepo extends JpaRepository<ApprovalOutcome, UUID> {
        List<ApprovalOutcome> findByJurisdictionAndRulesetVersion(String jurisdiction, String rulesetVersion);
        List<ApprovalOutcome> findByProjectId(UUID projectId);
    }

    interface LlmJobRepo extends JpaRepository<LlmJob, UUID> {
        List<LlmJob> findByProjectIdOrderByCreatedAtDesc(UUID projectId);
    }
}
