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

    document.getElementById("sectorKpiBars").innerHTML = `
      <p style="font-size:0.76rem; color:#94a3b8;">
        Select a zone on the map and click <strong>Validate Selected Zone</strong> to compute live agricultural change metrics.
      </p>
    `;

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

    ["tdHh1", "tdHh2", "tdHhDelta", "tdHv1", "tdHv2", "tdHvDelta", "tdRvi1", "tdRvi2", "tdRviDelta"].forEach(
      (id) => {
        document.getElementById(id).textContent = "—";
      }
    );
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
    document.getElementById(
      "bandwidthBadge"
    ).textContent = `Streamed ${sector.streamed_mb} MB / ${sector.full_granule_gb} GB • 0 Saved Files`;

    document.getElementById("labelSplitLeft").textContent = sector.date_t1;
    document.getElementById("labelSplitRight").textContent = sector.date_t2;
    document.getElementById("thDate1").textContent = sector.date_t1;
    document.getElementById("thDate2").textContent = sector.date_t2;

    document.getElementById("linkAsfVertex").href = sector.vertex_url;
    document.getElementById("linkEarthdata").href = sector.earthdata_url;

    const kpiContainer = document.getElementById("sectorKpiBars");
    const st = sector.stats;
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

    const fmtDelta = (v, unit = "") => `${v > 0 ? "+" : ""}${v}${unit}`;

    document.getElementById("tdHh1").textContent = `${parcelProps.hh_t1_db} dB`;
    document.getElementById("tdHh2").textContent = `${parcelProps.hh_t2_db} dB`;
    document.getElementById("tdHhDelta").textContent = fmtDelta(
      parcelProps.delta_hh_db,
      " dB"
    );

    document.getElementById("tdHv1").textContent = `${parcelProps.hv_t1_db} dB`;
    document.getElementById("tdHv2").textContent = `${parcelProps.hv_t2_db} dB`;
    document.getElementById("tdHvDelta").textContent = fmtDelta(
      parcelProps.delta_hv_db,
      " dB"
    );

    document.getElementById("tdRvi1").textContent = parcelProps.rvi_t1;
    document.getElementById("tdRvi2").textContent = parcelProps.rvi_t2;
    document.getElementById("tdRviDelta").textContent = fmtDelta(
      parcelProps.delta_rvi
    );

    this._renderChart();
  }

  setChartMode(mode) {
    this.activeChartMode = mode;
    this._renderChart();
  }

  _renderChart() {
    if (!this.currentParcel) return;
    const ctx = document.getElementById(this.canvasId).getContext("2d");
    const ts = this.currentParcel.timeseries;

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    let datasets = [];
    let yTitle = "";

    if (this.activeChartMode === "backscatter") {
      yTitle = "Backscatter γ⁰ (dB)";
      datasets = [
        {
          label: "Co-Pol HHHH (dB) — Water / Moisture",
          data: ts.hh_db,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.15)",
          borderWidth: 2.5,
          tension: 0.3,
          pointRadius: 4,
        },
        {
          label: "Cross-Pol HVHV (dB) — Crop Volume",
          data: ts.hv_db,
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.15)",
          borderWidth: 2.5,
          tension: 0.3,
          pointRadius: 4,
        },
      ];
    } else {
      yTitle = "Radar Vegetation Index (0–1)";
      datasets = [
        {
          label: "Dual-Pol Radar Vegetation Index (RVI)",
          data: ts.rvi,
          borderColor: "#34d399",
          backgroundColor: "rgba(52, 211, 153, 0.22)",
          fill: true,
          borderWidth: 2.5,
          tension: 0.3,
          pointRadius: 4,
        },
      ];
    }

    this.chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: ts.labels,
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
