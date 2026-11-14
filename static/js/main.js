/**
 * NISAR AgroView — Stateless Ephemeral Zone Validation Orchestrator.
 *
 * Users click inside the bounded Allowed Search Zone on the Google Map to position
 * their validation box (3–8 km), select two dates, and validate on demand with
 * zero saved history on disk or in browser storage.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const coordReadout = document.getElementById("coordReadout");
  const selBoxKm = document.getElementById("selBoxKm");
  const selDate1 = document.getElementById("selDate1");
  const selDate2 = document.getElementById("selDate2");
  const btnValidate = document.getElementById("btnValidateZone");
  const btnClear = document.getElementById("btnClearZone");
  const loadingBanner = document.getElementById("mapLoadingBanner");
  const loadingText = document.getElementById("mapLoadingText");

  const inspector = new window.FieldInspectorCharts("parcelChart");

  const mapCtrl = new window.AgroGoogleMapController("map", {
    onTargetMoved: (lat, lon, boxKm) => {
      coordReadout.textContent = `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E (${boxKm}×${boxKm} km)`;
    },
    onParcelSelected: (parcelProps) => {
      inspector.updateParcel(parcelProps);
    },
    onCleared: () => {
      inspector.clearInspector();
    },
  });

  // Load Allowed Search Zone metadata from backend
  try {
    const resp = await fetch("/api/search-zone");
    if (resp.ok) {
      const zoneMeta = await resp.json();
      mapCtrl.initSearchZone(zoneMeta);
    }
  } catch (err) {
    console.error("Failed to fetch search zone config:", err);
  }

  // Box Size Limit Selector (3x3 km, 5x5 km, 8x8 km)
  selBoxKm.addEventListener("change", (e) => {
    mapCtrl.setBoxSizeKm(Number(e.target.value));
  });

  // Clear Current Validation Button
  btnClear.addEventListener("click", () => {
    mapCtrl.clearActiveValidation();
  });

  // Validate Selected Zone Submission (Stateless In-Memory Request)
  document
    .getElementById("validationToolbar")
    .addEventListener("submit", async (e) => {
      e.preventDefault();

      const d1 = selDate1.value;
      const d2 = selDate2.value;
      if (d1 === d2) {
        document.getElementById("sectorHeadline").textContent =
          "Select Two Distinct Dates";
        document.getElementById("sectorStoryText").textContent =
          "Date 1 (t1 Baseline) and Date 2 (t2 Validation) must be different to compute agricultural change.";
        return;
      }

      // Immediately clear any previous validation before requesting the new zone
      mapCtrl.clearActiveValidation();

      loadingBanner.classList.remove("hidden");
      loadingText.textContent = `Streaming ${mapCtrl.selectedBoxKm}×${mapCtrl.selectedBoxKm} km @ 10m (${d1} vs ${d2}) via HTTP 206 Range Requests...`;
      btnValidate.disabled = true;

      try {
        const resp = await fetch("/api/validate-zone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: mapCtrl.selectedLat,
            lon: mapCtrl.selectedLon,
            box_km: mapCtrl.selectedBoxKm,
            date_t1: d1,
            date_t2: d2,
          }),
        });

        const data = await resp.json();
        if (!resp.ok || data.status !== "ok") {
          throw new Error(data.message || "Validation request failed.");
        }

        const sector = data.sector;
        mapCtrl.loadValidatedSector(sector);
        inspector.renderSectorSummary(sector);
      } catch (err) {
        document.getElementById("statusBadge").textContent = "Validation Error";
        document.getElementById("sectorHeadline").textContent =
          "Could Not Stream Selected Zone";
        document.getElementById("sectorStoryText").textContent = err.message;
      } finally {
        loadingBanner.classList.add("hidden");
        btnValidate.disabled = false;
      }
    });

  // Layer Switcher Controls
  document.querySelectorAll("#layerButtons .layer-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("#layerButtons .layer-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const mode = btn.getAttribute("data-layer");
      const splitGroup = document.getElementById("splitControlGroup");
      if (mode === "split") {
        splitGroup.classList.remove("hidden");
      } else {
        splitGroup.classList.add("hidden");
      }
      mapCtrl.setLayerMode(mode);
    });
  });

  // Split Swipe Slider
  document.getElementById("splitRange").addEventListener("input", (e) => {
    mapCtrl.setSplitPercent(Number(e.target.value));
  });

  // Opacity Slider
  const opacityRange = document.getElementById("opacityRange");
  const opacityVal = document.getElementById("opacityVal");
  opacityRange.addEventListener("input", (e) => {
    const val = Number(e.target.value);
    opacityVal.textContent = `${val}%`;
    mapCtrl.setOpacity(val / 100.0);
  });

  // Parcel Grid Toggle
  document.getElementById("toggleParcels").addEventListener("change", (e) => {
    mapCtrl.setParcelsVisible(e.target.checked);
  });

  // Chart Tabs (Backscatter dB vs RVI)
  document.querySelectorAll(".chart-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".chart-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      inspector.setChartMode(tab.getAttribute("data-chart"));
    });
  });

  // Modal: NASA Resources Hub
  const nasaModal = document.getElementById("nasaHubModal");
  document.getElementById("btnOpenNasaHub").addEventListener("click", () => {
    nasaModal.classList.remove("hidden");
  });
  document.getElementById("btnCloseNasaHub").addEventListener("click", () => {
    nasaModal.classList.add("hidden");
  });
});
