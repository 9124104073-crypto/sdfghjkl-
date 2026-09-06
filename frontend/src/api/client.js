import axios from "axios";

// In development an empty base URL uses the Vite proxy; in production this is
// the deployed backend origin. The frontend never talks to a database or an
// LLM vendor directly.
const baseURL = import.meta.env.VITE_API_BASE_URL || "";

export const http = axios.create({
  baseURL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

/** Turns any axios failure into a message a planner can act on. */
export function describeError(error) {
  if (!error) return "Unknown error.";
  if (error.code === "ECONNABORTED") return "The request timed out. Is the backend running?";
  const status = error.response?.status;
  const detail = error.response?.data?.detail;
  if (status === 422 && error.response?.data?.error === "invalid_weights") {
    return detail || "Weights must total 100%.";
  }
  if (status === 404) return detail || "Not found.";
  if (status === 422) {
    if (Array.isArray(detail)) return detail.map((d) => d.msg).join("; ");
    return detail || "The request was rejected as invalid.";
  }
  if (status >= 500) return detail || "The server failed to handle the request.";
  if (!error.response) {
    return "Cannot reach the NIRMAN AI backend. Start it with: uvicorn app.main:app --reload";
  }
  return detail || error.message;
}

const api = {
  health: () => http.get("/health").then((r) => r.data),
  dashboard: () => http.get("/api/v1/dashboard").then((r) => r.data),

  sites: (params) => http.get("/api/v1/sites", { params }).then((r) => r.data),
  site: (id) => http.get(`/api/v1/sites/${id}`).then((r) => r.data),
  siteExplain: (id, infrastructureType) =>
    http
      .get(`/api/v1/sites/${id}/explain`, { params: { infrastructure_type: infrastructureType } })
      .then((r) => r.data),
  infrastructureTypes: () => http.get("/api/v1/sites/infrastructure-types").then((r) => r.data),
  mcda: () => http.get("/api/v1/sites/mcda").then((r) => r.data),
  recommend: (body) => http.post("/api/v1/sites/recommended", body).then((r) => r.data),
  siteWeights: () => http.get("/api/v1/dashboard/weights").then((r) => r.data),

  priority: (body) => http.post("/api/v1/priority-projects", body).then((r) => r.data),
  priorityWeights: () => http.get("/api/v1/priority-projects/weights").then((r) => r.data),

  whatIfAreas: () => http.get("/api/v1/what-if/areas").then((r) => r.data),
  whatIfWeights: () => http.get("/api/v1/what-if/weights").then((r) => r.data),
  simulate: (body) => http.post("/api/v1/what-if/simulate", body).then((r) => r.data),

  risk: () => http.get("/api/v1/risk").then((r) => r.data),
  population: () => http.get("/api/v1/population").then((r) => r.data),

  projects: (params) => http.get("/api/v1/projects", { params }).then((r) => r.data),
  project: (id) => http.get(`/api/v1/projects/${id}`).then((r) => r.data),
  estimateCost: (body) => http.post("/api/v1/cost/estimate", body).then((r) => r.data),
  costProjectTypes: () => http.get("/api/v1/cost/project-types").then((r) => r.data),

  schemes: () => http.get("/api/v1/schemes").then((r) => r.data),
  recommendScheme: (params) =>
    http.get("/api/v1/schemes/recommend", { params }).then((r) => r.data),

  gisLayers: () => http.get("/api/v1/gis/layers").then((r) => r.data),

  generateDpr: (id, body) => http.post(`/api/v1/dpr/${id}/generate`, body).then((r) => r.data),
  dprDownloadUrl: (id) => `${baseURL}/api/v1/dpr/${id}/download`,

  iotDevices: () => http.get("/api/v1/iot/devices").then((r) => r.data),
  iotSimulate: (body) => http.post("/api/v1/iot/simulate", body).then((r) => r.data),

  copilot: (body) => http.post("/api/v1/copilot/query", body).then((r) => r.data),
  copilotSuggestions: () => http.get("/api/v1/copilot/suggestions").then((r) => r.data),

  dataSources: () => http.get("/api/v1/data-sources").then((r) => r.data),
  lineage: () => http.get("/api/v1/data-sources/lineage").then((r) => r.data),
  providers: () => http.get("/api/v1/data-sources/providers").then((r) => r.data),
};

export default api;
