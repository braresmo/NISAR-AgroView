/**
 * Interactive Field Inspector & Chart.js Time-Series Controller.
 *
 * Updates and clears the parcel telemetry table, agronomic explanation,
 * sector KPI bars, and multi-cycle NISAR polarimetric charts (0 saved state).
 */

class FieldInspectorCharts {
  constructor(canvasId) {
    this.canvasId = canvasId;
    this.chartInstance = null;
    this.activeChartMode = "backscatter";
    this.currentParcel = null;
  }

  clearInspector() {
    this.currentParcel = null;
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }

    document.getElementById("sectorRegion").textContent =
      "Stateless Ephemeral Validation";
    document.getElementById("sectorTitle").textContent =
      "No Zone Validated Yet";
    document.getElementById("sectorValidHa").textContent =
      'Click "Validate Selected Zone"';

    document.getElementById("statusBadge").textContent =
      "Ready: Click Map to Place Box";
    document.getElementById("bandwidthBadge").textContent =
      "Stateless Mode • 0 Bytes Stored on Disk";
    document.getElementById("sectorHeadline").textContent =
      "Click Anywhere on the Map to Place Your Validation Sector";
    document.getElementById("sectorStoryText").textContent =
      "Click any agricultural location on the Google Satellite world map to position your bounded validation sector (3–8 km limit). Previous data has been cleared from memory.";

    // Update side dashboard description
    const sidebarHeadline = document.getElementById("sidebarHeadline");
    if (sidebarHeadline) {
      sidebarHeadline.textContent = "Click Anywhere on Map to Place Validation Sector";
    }
    const sidebarStoryText = document.getElementById("sidebarStoryText");
    if (sidebarStoryText) {
      sidebarStoryText.textContent = "Navigate anywhere on the Google Satellite world map and click to place your bounded validation sector (limited to 3×3 km, 5×5 km, or 8×8 km). Select two dates and click Validate Selected Zone to compare both dates in memory with zero saved data.";
    }
    const sidebarDescBadge = document.getElementById("sidebarDescBadge");
    if (sidebarDescBadge) {
      sidebarDescBadge.textContent = "Standby";
    }

    const sectorColumns = document.getElementById("sectorColumnsSummary");
    if (sectorColumns) {
      sectorColumns.innerHTML = `
        <p style="font-size:0.76rem; color:#94a3b8; margin: 8px 0 4px 0;">
          Pick any two dates, click on the map, and press <strong>Validate Selected Zone</strong> to compare both dates side-by-side in columns.
        </p>
      `;
    }

    document.getElementById("sectorKpiBars").innerHTML = "";

    document.getElementById("parcelTitle").textContent =
      "Awaiting Zone Validation";
    const badge = document.getElementById("parcelBadge");
    badge.textContent = "Standby";
    badge.style.color = "#34d399";
    badge.style.borderColor = "rgba(16, 185, 129, 0.45)";
    badge.style.background = "rgba(16, 185, 129, 0.2)";

    const expl = document.getElementById("parcelExplanation");
    expl.textContent =
      "Click any agricultural monitoring block inside the validated sector to inspect its polarimetric backscatter and RVI phenology. Choosing a new zone automatically wipes all previous data.";
    expl.style.borderLeftColor = "#10b981";

    [
      "tdHh1", "tdHh2", "tdHhDiff", "tdHhTrend",
      "tdHv1", "tdHv2", "tdHvDiff", "tdHvTrend",
      "tdRvi1", "tdRvi2", "tdRviDiff", "tdRviTrend"
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = "—";
    });
  }

  renderSectorSummary(sector) {
    document.getElementById("sectorRegion").textContent = sector.region;
    document.getElementById("sectorTitle").textContent = sector.name;
    document.getElementById(
      "sectorOrbitPill"
    ).textContent = `Track ${sector.track} • Frame ${sector.frame}`;
    document.getElementById("dateT1Text").textContent = sector.date_t1;
    document.getElementById("dateT2Text").textContent = sector.date_t2;
    document.getElementById("sectorCrops").textContent =
      "In-Memory Ephemeral Stream (0 Disk Files)";
    document.getElementById(
      "sectorValidHa"
    ).textContent = `${sector.stats.valid_area_ha.toLocaleString()} ha (${
      sector.box_km
    }×${sector.box_km} km @ 10m)`;

    document.getElementById("statusBadge").textContent =
      "Validated @ 10m Native Resolution";
    document.getElementById("sectorHeadline").textContent =
      sector.story_headline;
    document.getElementById("sectorStoryText").textContent =
      sector.story_description;

    // Synchronize side dashboard description
    const sidebarHeadline = document.getElementById("sidebarHeadline");
    if (sidebarHeadline) {
      sidebarHeadline.textContent = sector.story_headline;
    }
    const sidebarStoryText = document.getElementById("sidebarStoryText");
    if (sidebarStoryText) {
      sidebarStoryText.textContent = sector.story_description;
    }
    const sidebarDescBadge = document.getElementById("sidebarDescBadge");
    if (sidebarDescBadge) {
      sidebarDescBadge.textContent = "Live 10m Dual-Date";
    }

    document.getElementById(
      "bandwidthBadge"
    ).textContent = `Streamed ${sector.streamed_mb} MB / ${sector.full_granule_gb} GB • 0 Saved Files`;

    document.getElementById("labelSplitLeft").textContent = sector.date_t1;
    document.getElementById("labelSplitRight").textContent = sector.date_t2;
    const curtainD1 = document.getElementById("curtainDate1");
    if (curtainD1) curtainD1.textContent = sector.date_t1;
    const curtainD2 = document.getElementById("curtainDate2");
    if (curtainD2) curtainD2.textContent = sector.date_t2;
    const thumbD1 = document.getElementById("splitThumbDate1");
    if (thumbD1) thumbD1.textContent = sector.date_t1;
    const thumbD2 = document.getElementById("splitThumbDate2");
    if (thumbD2) thumbD2.textContent = sector.date_t2;
    document.getElementById("thDate1").textContent = sector.date_t1;
    document.getElementById("thDate2").textContent = sector.date_t2;

    document.getElementById("linkAsfVertex").href = sector.vertex_url;
    document.getElementById("linkEarthdata").href = sector.earthdata_url;

    // Render Comparative Columns for Sector Summary
    const st = sector.stats;
    const dHh = Number((st.mean_hh_t2_db - st.mean_hh_t1_db).toFixed(2));
    const dHv = Number((st.mean_hv_t2_db - st.mean_hv_t1_db).toFixed(2));
    const dRvi = Number((st.mean_rvi_t2 - st.mean_rvi_t1).toFixed(3));

    const hhClass = dHh > 0 ? "pos" : dHh < 0 ? "neg" : "";
    const hvClass = dHv > 0 ? "pos" : dHv < 0 ? "neg" : "";
    const rviClass = dRvi > 0 ? "pos" : dRvi < 0 ? "neg" : "";

    const sectorColumns = document.getElementById("sectorColumnsSummary");
    if (sectorColumns) {
      sectorColumns.innerHTML = `
        <div class="summary-columns-grid">
          <div class="summary-col">
            <div class="col-head">DATE 1 (${sector.date_t1})</div>
            <div class="col-metric"><span>RVI Biomass:</span> <strong>${st.mean_rvi_t1}</strong></div>
            <div class="col-metric"><span>Co-Pol HHHH:</span> <strong>${st.mean_hh_t1_db} dB</strong></div>
            <div class="col-metric"><span>Cross-Pol HVHV:</span> <strong>${st.mean_hv_t1_db} dB</strong></div>
          </div>
          <div class="summary-col">
            <div class="col-head">DATE 2 (${sector.date_t2})</div>
            <div class="col-metric"><span>RVI Biomass:</span> <strong>${st.mean_rvi_t2}</strong></div>
            <div class="col-metric"><span>Co-Pol HHHH:</span> <strong>${st.mean_hh_t2_db} dB</strong></div>
            <div class="col-metric"><span>Cross-Pol HVHV:</span> <strong>${st.mean_hv_t2_db} dB</strong></div>
          </div>
          <div class="summary-col summary-col-delta">
            <div class="col-head">NET CHANGE (Δ)</div>
            <div class="col-metric"><span>Δ Biomass (RVI):</span> <strong class="${rviClass}">${dRvi > 0 ? '+' : ''}${dRvi}</strong></div>
            <div class="col-metric"><span>Δ Moisture (HH):</span> <strong class="${hhClass}">${dHh > 0 ? '+' : ''}${dHh} dB</strong></div>
            <div class="col-metric"><span>Δ Canopy (HV):</span> <strong class="${hvClass}">${dHv > 0 ? '+' : ''}${dHv} dB</strong></div>
          </div>
        </div>
      `;
    }

    const kpiContainer = document.getElementById("sectorKpiBars");
    const items = [
      {
        label: "Vigorous Crop Growth (+HV / +RVI)",
        pct: st.crop_growth_pct,
        ha: st.crop_growth_ha,
        color: "#10b981",
      },
      {
        label: "Harvest / Canopy Clearance (-HV)",
        pct: st.harvest_pct,
        ha: st.harvest_ha,
        color: "#f59e0b",
      },
      {
        label: "Irrigation / Flooded Paddy (Specular HH)",
        pct: st.irrigation_water_pct,
        ha: st.irrigation_water_ha,
        color: "#06b6d4",
      },
      {
        label: "Soil Moisture / Tillage Increase (+HH)",
        pct: st.soil_moisture_pct,
        ha: st.soil_moisture_ha,
        color: "#a855f7",
      },
    ];

    kpiContainer.innerHTML = items
      .map(
        (it) => `
      <div class="kpi-row">
        <div class="kpi-top">
          <span>${it.label}</span>
          <strong>${it.pct}% (${it.ha.toLocaleString()} ha)</strong>
        </div>
        <div class="kpi-bar-bg">
          <div class="kpi-bar-fill" style="width:${Math.min(
            100,
            it.pct * 1.8
          )}%; background:${it.color};"></div>
        </div>
      </div>
    `
      )
      .join("");
  }

  updateParcel(parcelProps) {
    this.currentParcel = parcelProps;
    document.getElementById(
      "parcelTitle"
    ).textContent = `${parcelProps.parcel_id} (${parcelProps.area_ha} ha)`;

    const badge = document.getElementById("parcelBadge");
    badge.textContent = parcelProps.change_class;
    badge.style.color = parcelProps.color;
    badge.style.borderColor = parcelProps.color;
    badge.style.background = `${parcelProps.color}26`;

    const expl = document.getElementById("parcelExplanation");
    expl.textContent = parcelProps.explanation;
    expl.style.borderLeftColor = parcelProps.color;

    // Calculate parameter differences between Date 2 and Date 1
    const dHh = Number((parcelProps.hh_t2_db - parcelProps.hh_t1_db).toFixed(2));
    const dHv = Number((parcelProps.hv_t2_db - parcelProps.hv_t1_db).toFixed(2));
    const dRvi = Number((parcelProps.rvi_t2 - parcelProps.rvi_t1).toFixed(3));

    // Formatted delta badges
    const hhBadge = `<span class="delta-badge ${dHh > 0.4 ? 'pos' : dHh < -0.4 ? 'neg' : 'neutral'}">${dHh > 0 ? '+' : ''}${dHh} dB</span>`;
    const hvBadge = `<span class="delta-badge ${dHv > 0.4 ? 'pos' : dHv < -0.4 ? 'neg' : 'neutral'}">${dHv > 0 ? '+' : ''}${dHv} dB</span>`;
    const rviBadge = `<span class="delta-badge ${dRvi > 0.025 ? 'pos' : dRvi < -0.025 ? 'neg' : 'neutral'}">${dRvi > 0 ? '+' : ''}${dRvi}</span>`;

    // Trend dynamics interpretation
    let hhTrend = `<span class="trend-cell">↔ Moisture Stable</span>`;
    if (dHh >= 1.5) {
      hhTrend = `<span class="trend-cell cyan">↑ Influx / Flood (+${dHh} dB)</span>`;
    } else if (dHh <= -1.5) {
      hhTrend = `<span class="trend-cell neg">↓ Soil Drying (${dHh} dB)</span>`;
    }

    let hvTrend = `<span class="trend-cell">↔ Canopy Stable</span>`;
    if (dHv >= 0.9) {
      hvTrend = `<span class="trend-cell pos">↑ Canopy Growth (+${dHv} dB)</span>`;
    } else if (dHv <= -0.9) {
      hvTrend = `<span class="trend-cell neg">↓ Harvest / Thinning (${dHv} dB)</span>`;
    }

    let rviTrend = `<span class="trend-cell">↔ Steady Biomass</span>`;
    if (dRvi >= 0.04) {
      rviTrend = `<span class="trend-cell pos">↑ Biomass Acc. (+${dRvi})</span>`;
    } else if (dRvi <= -0.04) {
      rviTrend = `<span class="trend-cell neg">↓ Biomass Decline (${dRvi})</span>`;
    }

    document.getElementById("tdHh1").textContent = `${parcelProps.hh_t1_db} dB`;
    document.getElementById("tdHh2").textContent = `${parcelProps.hh_t2_db} dB`;
    const tdHhDiff = document.getElementById("tdHhDiff");
    if (tdHhDiff) tdHhDiff.innerHTML = hhBadge;
    const tdHhTrend = document.getElementById("tdHhTrend");
    if (tdHhTrend) tdHhTrend.innerHTML = hhTrend;

    document.getElementById("tdHv1").textContent = `${parcelProps.hv_t1_db} dB`;
    document.getElementById("tdHv2").textContent = `${parcelProps.hv_t2_db} dB`;
    const tdHvDiff = document.getElementById("tdHvDiff");
    if (tdHvDiff) tdHvDiff.innerHTML = hvBadge;
    const tdHvTrend = document.getElementById("tdHvTrend");
    if (tdHvTrend) tdHvTrend.innerHTML = hvTrend;

    document.getElementById("tdRvi1").textContent = parcelProps.rvi_t1;
    document.getElementById("tdRvi2").textContent = parcelProps.rvi_t2;
    const tdRviDiff = document.getElementById("tdRviDiff");
    if (tdRviDiff) tdRviDiff.innerHTML = rviBadge;
    const tdRviTrend = document.getElementById("tdRviTrend");
    if (tdRviTrend) tdRviTrend.innerHTML = rviTrend;

    this._renderChart();
  }

  setChartMode(mode) {
    this.activeChartMode = mode;
    this._renderChart();
  }

  _renderChart() {
    if (!this.currentParcel) return;
    const ctx = document.getElementById(this.canvasId).getContext("2d");
    const p = this.currentParcel;
    const ts = p.timeseries || p.time_series || {
      labels: [p.date_t1 || "Date 1", p.date_t2 || "Date 2"],
      hh_db: [p.hh_t1_db, p.hh_t2_db],
      hv_db: [p.hv_t1_db, p.hv_t2_db],
      rvi: [p.rvi_t1, p.rvi_t2],
    };

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    let datasets = [];
    let yTitle = "";
    let labels = ts.labels;

    if (this.activeChartMode === "backscatter") {
      yTitle = "Backscatter γ⁰ (dB)";
      datasets = [
        {
          label: "Co-Pol HHHH (dB) — Water / Moisture",
          data: ts.hh_db,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.55)",
          borderWidth: 1.5,
          borderRadius: 4,
        },
        {
          label: "Cross-Pol HVHV (dB) — Crop Volume",
          data: ts.hv_db,
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.55)",
          borderWidth: 1.5,
          borderRadius: 4,
        },
      ];
    } else if (this.activeChartMode === "rvi") {
      yTitle = "Radar Vegetation Index (0–1)";
      datasets = [
        {
          label: "Dual-Pol Radar Vegetation Index (RVI)",
          data: ts.rvi,
          borderColor: "#34d399",
          backgroundColor: ["rgba(56, 189, 248, 0.55)", "rgba(16, 185, 129, 0.55)"],
          borderWidth: 1.5,
          borderRadius: 4,
        },
      ];
    } else if (this.activeChartMode === "delta") {
      yTitle = "Parameter Net Change (Δ)";
      const dHh = Number((this.currentParcel.hh_t2_db - this.currentParcel.hh_t1_db).toFixed(2));
      const dHv = Number((this.currentParcel.hv_t2_db - this.currentParcel.hv_t1_db).toFixed(2));
      const dRviRaw = Number((this.currentParcel.rvi_t2 - this.currentParcel.rvi_t1).toFixed(3));
      const dRviScaled = Number((dRviRaw * 10).toFixed(2));

      labels = [
        `Δ HHHH (${dHh > 0 ? '+' : ''}${dHh} dB)`,
        `Δ HVHV (${dHv > 0 ? '+' : ''}${dHv} dB)`,
        `Δ RVI (${dRviRaw > 0 ? '+' : ''}${dRviRaw}) [×10]`,
      ];

      datasets = [
        {
          label: "Net Change Column (Date 2 - Date 1)",
          data: [dHh, dHv, dRviScaled],
          backgroundColor: [
            dHh >= 0 ? "rgba(56, 189, 248, 0.65)" : "rgba(245, 158, 11, 0.65)",
            dHv >= 0 ? "rgba(16, 185, 129, 0.65)" : "rgba(239, 68, 68, 0.65)",
            dRviRaw >= 0 ? "rgba(52, 211, 153, 0.65)" : "rgba(251, 146, 60, 0.65)",
          ],
          borderColor: [
            dHh >= 0 ? "#38bdf8" : "#f59e0b",
            dHv >= 0 ? "#10b981" : "#ef4444",
            dRviRaw >= 0 ? "#34d399" : "#fb923c",
          ],
          borderWidth: 1.5,
          borderRadius: 4,
        },
      ];
    }

    this.chartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: "#cbd5e1",
              font: { size: 11 },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "#94a3b8", font: { size: 10 } },
            grid: { color: "rgba(148, 163, 184, 0.1)" },
          },
          y: {
            title: {
              display: true,
              text: yTitle,
              color: "#94a3b8",
              font: { size: 10 },
            },
            ticks: { color: "#94a3b8", font: { size: 10 } },
            grid: { color: "rgba(148, 163, 184, 0.1)" },
          },
        },
      },
    });
  }
}

window.FieldInspectorCharts = FieldInspectorCharts;
