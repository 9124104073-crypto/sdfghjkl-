"""Real geospatial analysis with GeoPandas and Shapely.

Coordinates are stored as portable latitude/longitude so the project runs on
SQLite, but the spatial *reasoning* is done properly here: projected CRS for
metric distances, real buffers for catchments, and nearest-neighbour joins
against existing facilities.

Chennai sits in UTM zone 44N (EPSG:32644). Distances are computed there rather
than in degrees, so a "5 km catchment" is genuinely 5 km.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app import repositories as repo
from app.core.constants import DataStatus

log = logging.getLogger(__name__)

WGS84 = "EPSG:4326"
UTM44N = "EPSG:32644"  # metric CRS covering Chennai
DEFAULT_CATCHMENT_KM = 5.0


def _sites_gdf(db: Session):
    import geopandas as gpd
    import pandas as pd

    sites = repo.all_sites(db)
    frame = pd.DataFrame(
        [
            {
                "site_id": s.id,
                "site_code": s.site_code,
                "name": s.name,
                "zone": s.zone,
                "population": s.population_catchment_5km or 0,
                "latitude": s.latitude,
                "longitude": s.longitude,
            }
            for s in sites
        ]
    )
    return gpd.GeoDataFrame(
        frame,
        geometry=gpd.points_from_xy(frame.longitude, frame.latitude),
        crs=WGS84,
    )


def _assets_gdf(db: Session, asset_type: str | None = None, region: str = "Chennai"):
    import geopandas as gpd
    import pandas as pd

    assets = [
        a
        for a in repo.assets(db, asset_type=asset_type)
        if a.latitude is not None and a.longitude is not None and (a.region or "") == region
    ]
    if not assets:
        return gpd.GeoDataFrame(
            pd.DataFrame(columns=["asset_code", "name", "latitude", "longitude"]),
            geometry=[],
            crs=WGS84,
        )
    frame = pd.DataFrame(
        [
            {
                "asset_code": a.asset_code,
                "name": a.name,
                "asset_type": a.asset_type,
                "latitude": a.latitude,
                "longitude": a.longitude,
            }
            for a in assets
        ]
    )
    return gpd.GeoDataFrame(
        frame, geometry=gpd.points_from_xy(frame.longitude, frame.latitude), crs=WGS84
    )


def nearest_neighbours(db: Session, limit: int = 3) -> dict[str, Any]:
    """For each site, the closest other candidate sites, in real kilometres."""
    gdf = _sites_gdf(db).to_crs(UTM44N)
    results = []
    for _, row in gdf.iterrows():
        distances = gdf.geometry.distance(row.geometry)
        order = distances.sort_values().index[1 : limit + 1]  # skip self
        results.append(
            {
                "site_id": int(row.site_id),
                "name": row["name"],
                "neighbours": [
                    {
                        "site_id": int(gdf.loc[i, "site_id"]),
                        "name": gdf.loc[i, "name"],
                        "distance_km": round(float(distances[i]) / 1000, 2),
                    }
                    for i in order
                ],
            }
        )
    return {
        "results": results,
        "crs": UTM44N,
        "data_status": DataStatus.DERIVED,
        "notes": [
            "Distances computed in EPSG:32644 (UTM 44N), not in degrees.",
            "Positions are approximate locality centroids — distances are indicative.",
        ],
    }


def catchment_analysis(db: Session, radius_km: float = DEFAULT_CATCHMENT_KM) -> dict[str, Any]:
    """Buffer each site and count the facilities and neighbours it captures."""
    import geopandas as gpd

    sites = _sites_gdf(db).to_crs(UTM44N)
    buffers = sites.copy()
    buffers["geometry"] = sites.geometry.buffer(radius_km * 1000)

    hospitals = _assets_gdf(db, "hospital").to_crs(UTM44N)
    schools = _assets_gdf(db, "school").to_crs(UTM44N)

    def count_within(points) -> list[int]:
        if points.empty:
            return [0] * len(buffers)
        joined = gpd.sjoin(points, buffers[["site_id", "geometry"]], predicate="within")
        counts = joined.groupby("site_id").size().to_dict()
        return [int(counts.get(sid, 0)) for sid in buffers.site_id]

    overlaps = []
    for _, row in buffers.iterrows():
        hits = buffers[buffers.geometry.intersects(row.geometry) & (buffers.site_id != row.site_id)]
        overlaps.append(int(len(hits)))

    results = []
    hosp_counts, sch_counts = count_within(hospitals), count_within(schools)
    for i, (_, row) in enumerate(buffers.iterrows()):
        results.append(
            {
                "site_id": int(row.site_id),
                "name": row["name"],
                "catchment_km": radius_km,
                "catchment_area_km2": round(float(row.geometry.area) / 1e6, 1),
                "population": int(row.population),
                "mapped_hospitals_in_catchment": hosp_counts[i],
                "mapped_schools_in_catchment": sch_counts[i],
                "overlapping_site_catchments": overlaps[i],
            }
        )
    results.sort(key=lambda r: r["overlapping_site_catchments"], reverse=True)

    return {
        "radius_km": radius_km,
        "results": results,
        "summary": {
            "sites": len(results),
            "mean_overlaps": round(sum(r["overlapping_site_catchments"] for r in results) / max(len(results), 1), 1),
            "isolated_sites": [r["name"] for r in results if r["overlapping_site_catchments"] == 0],
        },
        "data_status": DataStatus.DERIVED,
        "notes": [
            f"{radius_km} km buffers computed in a metric CRS with Shapely, then joined with GeoPandas.",
            "Heavily overlapping catchments indicate candidate sites competing for the same "
            "population — useful when sequencing a programme.",
            "Mapped facility counts cover only the Chennai-region assets held in the database.",
        ],
    }


def coverage_gaps(db: Session, radius_km: float = DEFAULT_CATCHMENT_KM) -> dict[str, Any]:
    """Which localities fall outside every candidate site's catchment."""
    import geopandas as gpd
    import pandas as pd

    sites = _sites_gdf(db).to_crs(UTM44N)
    served = sites.copy()
    served["geometry"] = sites.geometry.buffer(radius_km * 1000)
    union = served.geometry.union_all()

    centroids = [
        a
        for a in repo.assets(db, asset_type="locality_centroid")
        if a.latitude is not None and a.longitude is not None
    ]
    if not centroids:
        return {"uncovered": [], "data_status": DataStatus.DERIVED, "notes": ["No locality centroids loaded."]}

    frame = pd.DataFrame([{"name": a.name, "lat": a.latitude, "lon": a.longitude} for a in centroids])
    gdf = gpd.GeoDataFrame(
        frame, geometry=gpd.points_from_xy(frame.lon, frame.lat), crs=WGS84
    ).to_crs(UTM44N)

    uncovered = []
    for _, row in gdf.iterrows():
        if not union.contains(row.geometry):
            nearest = sites.geometry.distance(row.geometry).min() / 1000
            uncovered.append(
                {"locality": row["name"], "km_to_nearest_candidate_site": round(float(nearest), 2)}
            )
    uncovered.sort(key=lambda r: r["km_to_nearest_candidate_site"], reverse=True)

    return {
        "radius_km": radius_km,
        "uncovered": uncovered,
        "covered_count": len(gdf) - len(uncovered),
        "total_localities": len(gdf),
        "data_status": DataStatus.DERIVED,
        "notes": [
            "Localities from other datasets that no candidate site covers within the buffer.",
            "A genuine planning signal: these areas appear in the risk, priority and population "
            "datasets but have no assessed candidate site nearby.",
        ],
    }


def spatial_summary(db: Session) -> dict[str, Any]:
    """Extent, centroid and spread of the assessed candidate sites."""
    gdf = _sites_gdf(db)
    metric = gdf.to_crs(UTM44N)
    bounds = gdf.total_bounds  # minx, miny, maxx, maxy
    hull = metric.geometry.union_all().convex_hull
    centroid = metric.geometry.union_all().centroid
    centroid_wgs = (
        __import__("geopandas")
        .GeoSeries([centroid], crs=UTM44N)
        .to_crs(WGS84)
        .iloc[0]
    )
    return {
        "site_count": len(gdf),
        "bounds": {
            "min_longitude": round(float(bounds[0]), 4),
            "min_latitude": round(float(bounds[1]), 4),
            "max_longitude": round(float(bounds[2]), 4),
            "max_latitude": round(float(bounds[3]), 4),
        },
        "centroid": {
            "latitude": round(float(centroid_wgs.y), 4),
            "longitude": round(float(centroid_wgs.x), 4),
        },
        "convex_hull_area_km2": round(float(hull.area) / 1e6, 1),
        "crs": {"storage": WGS84, "analysis": UTM44N},
        "data_status": DataStatus.DERIVED,
        "notes": ["Computed with GeoPandas and Shapely; areas in a metric CRS."],
    }
