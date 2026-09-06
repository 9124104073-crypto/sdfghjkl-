package com.synapse.buildos.web;

import com.synapse.buildos.domain.Brief;
import com.synapse.buildos.domain.Project;
import com.synapse.buildos.repo.Repos;
import com.synapse.buildos.security.CurrentUser;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final Repos.ProjectRepo projects;
    private final Repos.BriefRepo briefs;
    private final ResponseMapper mapper;
    private final CurrentUser currentUser;

    @PostMapping
    public ResponseEntity<Dtos.ProjectResponse> create(@Valid @RequestBody Dtos.CreateProjectRequest req) {
        Project project = projects.save(Project.builder()
                .ownerId(currentUser.id())
                .name(req.name())
                .jurisdiction(req.jurisdiction())
                .plotAreaSqft(req.plotAreaSqft())
                .plotType(req.plotType())
                .floors(req.floors())
                .build());
        return ResponseEntity.created(URI.create("/api/v1/projects/" + project.getId()))
                .body(mapper.project(project));
    }

    @GetMapping
    public List<Dtos.ProjectResponse> list() {
        return projects.findByOwnerIdOrderByCreatedAtDesc(currentUser.id())
                .stream().map(mapper::project).toList();
    }

    @GetMapping("/{projectId}")
    public Dtos.ProjectResponse get(@PathVariable UUID projectId) {
        return mapper.project(owned(projectId));
    }

    /**
     * Ingests a voice transcript or typed description. We store the user's own
     * words in their own language — translation happens downstream, if at all,
     * so we never lose the original phrasing that a later review might need.
     */
    @PostMapping("/{projectId}/briefs")
    @ResponseStatus(HttpStatus.CREATED)
    public UUID addBrief(@PathVariable UUID projectId,
                         @Valid @RequestBody Dtos.CreateBriefRequest req) {
        owned(projectId);
        Brief brief = briefs.save(Brief.builder()
                .projectId(projectId)
                .source(req.source())
                .language(req.language())
                .rawText(req.rawText())
                .audioUri(req.audioUri())
                .build());
        return brief.getId();
    }

    private Project owned(UUID projectId) {
        return projects.findByIdAndOwnerId(projectId, currentUser.id())
                .orElseThrow(() -> ApiException.notFound("Project not found"));
    }
}
