"""
NISAR L-Band Polarimetric Dual-Date Validation Processor (10m Native Resolution).

Validates Date 1 (t1) and Date 2 (t2) independently—computing Co-Pol (HHHH dB),
Cross-Pol (HVHV dB), Radar Vegetation Index (RVI), UAVSAR-style False-Color RGB
composites, and Parcel-Level Dual-Date Telemetry GeoJSON in memory without heavy
change-classification overhead.
"""

import base64
import io
import numpy as np
from PIL import Image
from pyproj import Transformer


def linear_to_db(arr: np.ndarray) -> np.ndarray:
    """Convert linear gamma0 power (> 0) to decibels (dB)."""
    arr_f = np.asarray(arr, dtype=np.float32)
    valid = np.isfinite(arr_f) & (arr_f > 0)
    out = np.full(arr_f.shape, np.nan, dtype=np.float32)
    out[valid] = 10.0 * np.log10(arr_f[valid])
    return out


def compute_rvi(hh_lin: np.ndarray, hv_lin: np.ndarray) -> np.ndarray:
    """
    Compute Dual-Pol Radar Vegetation Index (RVI) for L-band SAR:
        RVI = (4 * gamma0_HV) / (gamma0_HH + gamma0_HV)
    Clamped to [0.0, 1.0].
    """
    hh = np.asarray(hh_lin, dtype=np.float32)
    hv = np.asarray(hv_lin, dtype=np.float32)
    denom = hh + hv
    valid = np.isfinite(hh) & np.isfinite(hv) & (hh > 0) & (hv >= 0) & (denom > 0)
    rvi = np.full(hh.shape, np.nan, dtype=np.float32)
    rvi[valid] = np.clip((4.0 * hv[valid]) / denom[valid], 0.0, 1.0)
    return rvi


def _norm_u8(arr: np.ndarray, vmin: float, vmax: float) -> np.ndarray:
    norm = (arr - vmin) / max(vmax - vmin, 1e-5)
    norm = np.clip(norm, 0.0, 1.0)
    return (np.nan_to_num(norm, nan=0.0) * 255.0).astype(np.uint8)


def render_uavsar_rgb(hh_db: np.ndarray, hv_db: np.ndarray) -> Image.Image:
    """
    Render UAVSAR-style False-Color Composite (RGBA):
      R: HHHH (dB) - surface/double-bounce scattering
      G: HVHV (dB) - canopy volume scattering
      B: HHHH - HVHV (dB) - polarization difference
    """
    valid = np.isfinite(hh_db) & np.isfinite(hv_db)
    diff_db = hh_db - hv_db

    hh_lo, hh_hi = np.nanpercentile(hh_db, [2, 98]) if np.any(valid) else (-22.0, -3.0)
    hv_lo, hv_hi = np.nanpercentile(hv_db, [2, 98]) if np.any(valid) else (-28.0, -10.0)
    df_lo, df_hi = np.nanpercentile(diff_db, [2, 98]) if np.any(valid) else (2.0, 14.0)

    r = _norm_u8(hh_db, hh_lo, hh_hi)
    g = _norm_u8(hv_db, hv_lo, hv_hi)
    b = _norm_u8(diff_db, df_lo, df_hi)
    a = np.where(valid, 235, 0).astype(np.uint8)

    rgba = np.dstack([r, g, b, a])
    return Image.fromarray(rgba, mode="RGBA")


def render_rvi_overlay(rvi: np.ndarray, hh_db: np.ndarray) -> Image.Image:
    """Render Radar Vegetation Index (RVI) agronomic heatmap with water mask."""
    valid = np.isfinite(rvi) & np.isfinite(hh_db)
    h, w = rvi.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)

    t = np.clip(np.nan_to_num(rvi, nan=0.0) / 0.85, 0.0, 1.0)

    # Smooth agronomic gradient: Bare Soil (Amber/Brown) -> Emergent (Lime) -> Dense Canopy (Emerald)
    r = np.where(t < 0.5, 194 + (132 - 194) * (t * 2.0), 132 + (5 - 132) * ((t - 0.5) * 2.0))
    g = np.where(t < 0.5, 120 + (204 - 120) * (t * 2.0), 204 + (150 - 204) * ((t - 0.5) * 2.0))
    b = np.where(t < 0.5, 56 + (22 - 56) * (t * 2.0), 22 + (105 - 22) * ((t - 0.5) * 2.0))

    # Highlight open water / flooded paddies (HH < -16.2 dB) in deep cyan-blue
    water = valid & (hh_db < -16.2)
    r = np.where(water, 14, r)
    g = np.where(water, 165, g)
    b = np.where(water, 233, b)

    rgba[..., 0] = r.astype(np.uint8)
    rgba[..., 1] = g.astype(np.uint8)
    rgba[..., 2] = b.astype(np.uint8)
    rgba[..., 3] = np.where(valid, 225, 0).astype(np.uint8)
    return Image.fromarray(rgba, mode="RGBA")


def utm_bounds_to_wgs84(x_coords: np.ndarray, y_coords: np.ndarray, epsg: int):
    """Convert UTM grid coordinate vectors to WGS84 [south, west, north, east] bounds."""
    transformer = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    x_min, x_max = float(np.min(x_coords)), float(np.max(x_coords))
    y_min, y_max = float(np.min(y_coords)), float(np.max(y_coords))

    lons, lats = transformer.transform(
        [x_min, x_max, x_min, x_max],
        [y_min, y_min, y_max, y_max],
    )
    south, north = float(min(lats)), float(max(lats))
    west, east = float(min(lons)), float(max(lons))
    return [round(south, 6), round(west, 6), round(north, 6), round(east, 6)]


def generate_dual_date_parcels_geojson(
    sector_id: str,
    bounds_wgs84: list,
    date_t1: str,
    date_t2: str,
    hh_t1_db: np.ndarray,
    hv_t1_db: np.ndarray,
    rvi_t1: np.ndarray,
    hh_t2_db: np.ndarray,
    hv_t2_db: np.ndarray,
    rvi_t2: np.ndarray,
) -> tuple[list, dict]:
    """
    Fast and optimal dual-date agricultural sector partition (3x3 grid).
    Validates Date 1 (t1) and Date 2 (t2) telemetry directly without computing
    change-classification maps or deltas between dates.
    Returns (parcels_features, sector_stats).
    """
    south, west, north, east = bounds_wgs84
    h, w = hh_t1_db.shape
    grid_n = 3
    features = []

    valid_1 = np.isfinite(hh_t1_db) & np.isfinite(hv_t1_db)
    valid_2 = np.isfinite(hh_t2_db) & np.isfinite(hv_t2_db)
    both_valid = valid_1 & valid_2

    total_valid = max(int(np.sum(both_valid)), 1)
    pixel_area_ha = 0.01  # 10m x 10m = 0.01 hectares

    overall_m_hh1 = round(float(np.nanmean(hh_t1_db[valid_1])), 2) if np.any(valid_1) else -12.0
    overall_m_hv1 = round(float(np.nanmean(hv_t1_db[valid_1])), 2) if np.any(valid_1) else -18.0
    overall_m_rvi1 = round(float(np.nanmean(rvi_t1[valid_1])), 3) if np.any(valid_1) else 0.45
    overall_m_hh2 = round(float(np.nanmean(hh_t2_db[valid_2])), 2) if np.any(valid_2) else -12.0
    overall_m_hv2 = round(float(np.nanmean(hv_t2_db[valid_2])), 2) if np.any(valid_2) else -18.0
    overall_m_rvi2 = round(float(np.nanmean(rvi_t2[valid_2])), 3) if np.any(valid_2) else 0.45

    stats = {
        "valid_area_ha": round(total_valid * pixel_area_ha, 1),
        "mean_hh_t1_db": overall_m_hh1,
        "mean_hh_t2_db": overall_m_hh2,
        "mean_hv_t1_db": overall_m_hv1,
        "mean_hv_t2_db": overall_m_hv2,
        "mean_rvi_t1": overall_m_rvi1,
        "mean_rvi_t2": overall_m_rvi2,
    }

    idx = 1
    for r_idx in range(grid_n):
        for c_idx in range(grid_n):
            r0 = int(r_idx * h / grid_n)
            r1 = int((r_idx + 1) * h / grid_n)
            c0 = int(c_idx * w / grid_n)
            c1 = int((c_idx + 1) * w / grid_n)

            pad_r = int((r1 - r0) * 0.08)
            pad_c = int((c1 - c0) * 0.08)
            sr0, sr1 = r0 + pad_r, r1 - pad_r
            sc0, sc1 = c0 + pad_c, c1 - pad_c

            sub_hh1 = hh_t1_db[sr0:sr1, sc0:sc1]
            sub_hv1 = hv_t1_db[sr0:sr1, sc0:sc1]
            sub_rvi1 = rvi_t1[sr0:sr1, sc0:sc1]
            sub_hh2 = hh_t2_db[sr0:sr1, sc0:sc1]
            sub_hv2 = hv_t2_db[sr0:sr1, sc0:sc1]
            sub_rvi2 = rvi_t2[sr0:sr1, sc0:sc1]

            sub_v = np.isfinite(sub_hh1) & np.isfinite(sub_hh2)
            if not np.any(sub_v):
                continue

            m_hh1 = round(float(np.nanmean(sub_hh1[sub_v])), 2)
            m_hv1 = round(float(np.nanmean(sub_hv1[sub_v])), 2)
            m_rvi1 = round(float(np.nanmean(sub_rvi1[sub_v])), 3)
            m_hh2 = round(float(np.nanmean(sub_hh2[sub_v])), 2)
            m_hv2 = round(float(np.nanmean(sub_hv2[sub_v])), 2)
            m_rvi2 = round(float(np.nanmean(sub_rvi2[sub_v])), 3)

            lat_top = north - (sr0 / h) * (north - south)
            lat_bot = north - (sr1 / h) * (north - south)
            lon_left = west + (sc0 / w) * (east - west)
            lon_right = west + (sc1 / w) * (east - west)

            area_ha = round((sr1 - sr0) * (sc1 - sc0) * pixel_area_ha, 1)

            # Classify surface condition on the validated dates based on RVI & Backscatter state
            if m_hh2 < -16.0 or m_hh1 < -16.0:
                status = "Surface Water / Irrigated Field"
                color = "#06b6d4"  # Cyan
            elif m_rvi2 >= 0.65 and m_rvi1 >= 0.65:
                status = "High Canopy Biomass (Both Dates)"
                color = "#10b981"  # Emerald
            elif m_rvi2 >= 0.45 or m_rvi1 >= 0.45:
                status = "Active Vegetated Cropland"
                color = "#38bdf8"  # Sky Blue
            else:
                status = "Low Canopy / Bare Soil Sector"
                color = "#f59e0b"  # Amber

            explanation = (
                f"Date 1 ({date_t1}): HHHH={m_hh1:.1f} dB, HVHV={m_hv1:.1f} dB, RVI={m_rvi1:.3f} • "
                f"Date 2 ({date_t2}): HHHH={m_hh2:.1f} dB, HVHV={m_hv2:.1f} dB, RVI={m_rvi2:.3f}."
            )

            features.append({
                "type": "Feature",
                "properties": {
                    "parcel_id": f"{sector_id.upper()}-B{idx:02d}",
                    "name": f"Validation Block #{idx}",
                    "change_class": status,
                    "color": color,
                    "area_ha": area_ha,
                    "date_t1": date_t1,
                    "date_t2": date_t2,
                    "hh_t1_db": m_hh1,
                    "hh_t2_db": m_hh2,
                    "hv_t1_db": m_hv1,
                    "hv_t2_db": m_hv2,
                    "rvi_t1": m_rvi1,
                    "rvi_t2": m_rvi2,
                    "explanation": explanation,
                    "timeseries": {
                        "labels": [f"Date 1 ({date_t1})", f"Date 2 ({date_t2})"],
                        "hh_db": [m_hh1, m_hh2],
                        "hv_db": [m_hv1, m_hv2],
                        "rvi": [m_rvi1, m_rvi2],
                    },
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [round(lon_left, 6), round(lat_bot, 6)],
                        [round(lon_right, 6), round(lat_bot, 6)],
                        [round(lon_right, 6), round(lat_top, 6)],
                        [round(lon_left, 6), round(lat_top, 6)],
                        [round(lon_left, 6), round(lat_bot, 6)],
                    ]],
                },
            })
            idx += 1

    return features, stats


def encode_webp_base64(img: Image.Image, quality: int = 84) -> tuple[str, float]:
    """
    Encode an RGBA PIL Image purely in RAM as a fast WebP Base64 Data URI (0 disk writes).
    Returns (data_uri, size_kb).
    """
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=quality, method=1)
    raw_bytes = buf.getvalue()
    size_kb = round(len(raw_bytes) / 1024.0, 1)
    b64_str = base64.b64encode(raw_bytes).decode("ascii")
    return f"data:image/webp;base64,{b64_str}", size_kb
