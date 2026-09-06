package com.synapse.buildos.web;

import com.synapse.buildos.domain.Estimate;
import com.synapse.buildos.domain.LlmJob;
import com.synapse.buildos.domain.RateSchedule;
import com.synapse.buildos.repo.Repos;
import com.synapse.buildos.security.CurrentUser;
import com.synapse.buildos.service.JobService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class EstimateController {

    private final JobService jobs;
    private final Repos.EstimateRepo estimates;
    private final Repos.EstimateLineRepo lines;
    private final Repos.RateScheduleRepo schedules;
    private final Repos.ProjectRepo projects;
    private final ResponseMapper mapper;
    private final CurrentUser currentUser;

    /**
     * Starts a takeoff. Returns 202 with a job id — the run takes tens of
     * seconds and a mobile client must not be holding a socket open for it.
     */
    @PostMapping("/projects/{projectId}/estimates")
    public ResponseEntity<Dtos.JobResponse> start(@PathVariable UUID projectId,
                                                  @RequestParam UUID briefId) {
        assertOwned(projectId);
        LlmJob job = jobs.queueTakeoff(projectId, briefId);
        return ResponseEntity.accepted()
                .header("Location", "/api/v1/jobs/" + job.getId())
                .body(mapper.job(job));
    }

    @GetMapping("/jobs/{jobId}")
    public Dtos.JobResponse job(@PathVariable UUID jobId) {
        LlmJob job = jobs.get(jobId);
        assertOwned(job.getProjectId());
        return mapper.job(job);
    }

    @GetMapping("/estimates/{estimateId}")
    public Dtos.EstimateResponse get(@PathVariable UUID estimateId) {
        Estimate estimate = estimates.findById(estimateId)
                .orElseThrow(() -> ApiException.notFound("Estimate not found"));
        assertOwned(estimate.getProjectId());

        RateSchedule schedule = schedules.findById(estimate.getScheduleId())
                .orElseThrow(() -> ApiException.notFound("Rate schedule missing"));

        return mapper.estimate(estimate, schedule,
                lines.findByEstimateIdOrderBySequenceAsc(estimateId));
    }

    @GetMapping("/projects/{projectId}/estimates")
    public List<Dtos.EstimateResponse> history(@PathVariable UUID projectId) {
        assertOwned(projectId);
        return estimates.findByProjectIdOrderByCreatedAtDesc(projectId).stream()
                .map(e -> mapper.estimate(
                        e,
                        schedules.findById(e.getScheduleId()).orElseThrow(),
                        lines.findByEstimateIdOrderBySequenceAsc(e.getId())))
                .toList();
    }

    private void assertOwned(UUID projectId) {
        projects.findByIdAndOwnerId(projectId, currentUser.id())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Project not found"));
    }
}
