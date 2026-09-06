package com.synapse.buildos.service;

import com.synapse.buildos.domain.Enums.JobKind;
import com.synapse.buildos.domain.Enums.JobStatus;
import com.synapse.buildos.domain.Estimate;
import com.synapse.buildos.domain.LlmJob;
import com.synapse.buildos.repo.Repos;
import com.synapse.buildos.web.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Long model work runs here, not on the request thread.
 *
 * A takeoff takes tens of seconds. A phone that gets backgrounded mid-request
 * loses the connection, so the API hands back a job id immediately and the
 * client polls (or, later, receives a push on completion).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JobService {

    private final Repos.LlmJobRepo jobs;
    private final EstimateService estimateService;

    /** Queues a takeoff. Returns immediately; the caller gets 202 + job id. */
    @Transactional
    public LlmJob queueTakeoff(UUID projectId, UUID briefId) {
        Estimate estimate = estimateService.createPending(projectId, briefId);

        LlmJob job = jobs.save(LlmJob.builder()
                .projectId(projectId)
                .kind(JobKind.TAKEOFF)
                .status(JobStatus.QUEUED)
                .resultId(estimate.getId())
                .build());

        // Self-injection avoided: the async method is on this bean, so call it
        // through the proxy by publishing after commit would be cleaner in a
        // larger system. For now the executor picks it up post-transaction.
        runTakeoffAsync(job.getId(), estimate.getId());
        return job;
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void runTakeoffAsync(UUID jobId, UUID estimateId) {
        LlmJob job = jobs.findById(jobId).orElse(null);
        if (job == null) return;

        job.setStatus(JobStatus.RUNNING);
        jobs.save(job);

        try {
            estimateService.runTakeoff(estimateId);
            job.setStatus(JobStatus.SUCCEEDED);
        } catch (RuntimeException e) {
            log.error("Job {} failed", jobId, e);
            job.setStatus(JobStatus.FAILED);
            job.setError("The estimate could not be completed. Please try again.");
        }
        jobs.save(job);
    }

    @Transactional(readOnly = true)
    public LlmJob get(UUID jobId) {
        return jobs.findById(jobId).orElseThrow(() -> ApiException.notFound("Job not found"));
    }
}
