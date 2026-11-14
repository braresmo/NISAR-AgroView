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

  // Story Card Closable Controls
  const mapStoryCard = document.getElementById("mapStoryCard");
  const btnCloseStoryCard = document.getElementById("btnCloseStoryCard");
  const btnOpenStoryCard = document.getElementById("btnOpenStoryCard");

  if (btnCloseStoryCard && mapStoryCard) {
    btnCloseStoryCard.addEventListener("click", () => {
      mapStoryCard.classList.add("hidden");
      if (btnOpenStoryCard) btnOpenStoryCard.classList.remove("hidden");
    });
  }

  if (btnOpenStoryCard && mapStoryCard) {
    btnOpenStoryCard.addEventListener("click", () => {
      mapStoryCard.classList.remove("hidden");
      btnOpenStoryCard.classList.add("hidden");
    });
  }

  // Exact Dates & Photo Previews in Split Control Group & Dashboard
  const splitRatioBadge = document.getElementById("splitRatioBadge");
  const splitThumbImg1 = document.getElementById("splitThumbImg1");
  const splitThumbImg2 = document.getElementById("splitThumbImg2");
  const splitThumbLoading1 = document.getElementById("splitThumbLoading1");
  const splitThumbLoading2 = document.getElementById("splitThumbLoading2");
  const dashPhotoImg1 = document.getElementById("dashPhotoImg1");
  const dashPhotoImg2 = document.getElementById("dashPhotoImg2");
  const dashPhotoPlaceholder1 = document.getElementById("dashPhotoPlaceholder1");
  const dashPhotoPlaceholder2 = document.getElementById("dashPhotoPlaceholder2");
  const curtainDate1 = document.getElementById("curtainDate1");
  const curtainDate2 = document.getElementById("curtainDate2");
  const splitThumbDate1 = document.getElementById("splitThumbDate1");
  const splitThumbDate2 = document.getElementById("splitThumbDate2");
  const labelSplitLeft = document.getElementById("labelSplitLeft");
  const labelSplitRight = document.getElementById("labelSplitRight");

  // Lightbox elements
  const photoLightbox = document.getElementById("photoLightboxModal");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxTitle = document.getElementById("lightboxTitle");
  const lightboxKicker = document.getElementById("lightboxKicker");
  const lightboxMetaBar = document.getElementById("lightboxMetaBar");
  const btnCloseLightbox = document.getElementById("btnClosePhotoLightbox");

  let photoCache = {
    t1: null,
    t2: null,
    meta1: null,
    meta2: null,
  };

  function updateDateLabels(d1, d2) {
    if (labelSplitLeft) labelSplitLeft.textContent = d1;
    if (labelSplitRight) labelSplitRight.textContent = d2;
    if (curtainDate1) curtainDate1.textContent = d1;
    if (curtainDate2) curtainDate2.textContent = d2;
    if (splitThumbDate1) splitThumbDate1.textContent = d1;
    if (splitThumbDate2) splitThumbDate2.textContent = d2;
    const d1Text = document.getElementById("dateT1Text");
    if (d1Text) d1Text.textContent = d1;
    const d2Text = document.getElementById("dateT2Text");
    if (d2Text) d2Text.textContent = d2;
    mapCtrl.setDates(d1, d2);
  }

  async function fetchDatePhotoPreview(dateStr, slotIndex) {
    const lat = mapCtrl.selectedLat;
    const lon = mapCtrl.selectedLon;
    const boxKm = mapCtrl.selectedBoxKm;

    try {
      const resp = await fetch(
        `/api/preview-date?lat=${lat}&lon=${lon}&date=${encodeURIComponent(
          dateStr
        )}&box_km=${boxKm}`
      );
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.status === "ok" && data.photo_url) {
        if (slotIndex === 1) {
          photoCache.t1 = data.photo_url;
          photoCache.meta1 = data;
          if (splitThumbImg1) {
            splitThumbImg1.src = data.photo_url;
            splitThumbImg1.classList.remove("hidden");
          }
          if (splitThumbLoading1) splitThumbLoading1.classList.add("hidden");
          if (dashPhotoImg1) {
            dashPhotoImg1.src = data.photo_url;
            dashPhotoImg1.classList.remove("hidden");
          }
          if (dashPhotoPlaceholder1) dashPhotoPlaceholder1.classList.add("hidden");
        } else {
          photoCache.t2 = data.photo_url;
          photoCache.meta2 = data;
          if (splitThumbImg2) {
            splitThumbImg2.src = data.photo_url;
            splitThumbImg2.classList.remove("hidden");
          }
          if (splitThumbLoading2) splitThumbLoading2.classList.add("hidden");
          if (dashPhotoImg2) {
            dashPhotoImg2.src = data.photo_url;
            dashPhotoImg2.classList.remove("hidden");
          }
          if (dashPhotoPlaceholder2) dashPhotoPlaceholder2.classList.add("hidden");
        }
      }
    } catch (err) {
      console.warn(`Could not fetch preview photo for ${dateStr}:`, err);
    }
  }

  function refreshAllPreviews() {
    const d1 = selDate1.value;
    const d2 = selDate2.value;
    updateDateLabels(d1, d2);
    fetchDatePhotoPreview(d1, 1);
    fetchDatePhotoPreview(d2, 2);
  }

  function openPhotoLightbox(slotIndex) {
    const isT1 = slotIndex === 1;
    const imgUrl = isT1 ? photoCache.t1 : photoCache.t2;
    const dateStr = isT1 ? selDate1.value : selDate2.value;
    const meta = isT1 ? photoCache.meta1 : photoCache.meta2;

    if (!imgUrl) return;

    lightboxImg.src = imgUrl;
    lightboxTitle.textContent = `${isT1 ? "Date 1 (t1 Baseline)" : "Date 2 (t2 Validation)"} Photo — ${dateStr}`;
    lightboxKicker.textContent = `10m Polarimetric SAR UAVSAR False-Color RGB (${dateStr})`;

    if (lightboxMetaBar && meta) {
      lightboxMetaBar.innerHTML = `
        <span><strong>Acquisition:</strong> ${meta.date || dateStr}</span>
        <span><strong>Coordinates:</strong> ${meta.lat?.toFixed?.(4) || mapCtrl.selectedLat}°N, ${meta.lon?.toFixed?.(4) || mapCtrl.selectedLon}°E</span>
        <span><strong>Polarization:</strong> ${meta.channels || "Dual-Pol (HHHH + HVHV)"}</span>
        <span><strong>Native Resolution:</strong> ${meta.resolution || "10m"}</span>
      `;
    }

    photoLightbox.classList.remove("hidden");
  }

  const mapCtrl = new window.AgroGoogleMapController("map", {
    onTargetMoved: (lat, lon, boxKm) => {
      coordReadout.textContent = `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E (${boxKm}×${boxKm} km)`;
      // Keep existing validated sector data & photos completely intact until user validates the new zone
      if (!mapCtrl.activeSector) {
        refreshAllPreviews();
      } else {
        // Real-time in-system guidance: current data stays locked until Validate Zone is clicked
        const statusBanner = document.getElementById("dataStatusBanner");
        const statusText = document.getElementById("dataStatusText");
        const btnVal = document.getElementById("btnValidateZone");
        if (statusBanner) statusBanner.classList.add("target-pending");
        if (statusText) {
          statusText.innerHTML = `⚡ Target moved: <strong>${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E</strong>. Current data remains locked until you click <strong>Validate Zone</strong>.`;
        }
        if (btnVal) btnVal.classList.add("btn-validate-pulse");
      }
    },
    onParcelSelected: (parcelProps) => {
      inspector.updateParcel(parcelProps);
    },
    onCleared: () => {
      inspector.clearInspector();
      const statusBanner = document.getElementById("dataStatusBanner");
      const statusText = document.getElementById("dataStatusText");
      const btnVal = document.getElementById("btnValidateZone");
      if (statusBanner) statusBanner.classList.remove("target-pending");
      if (statusText) {
        statusText.innerHTML = `Target selection won't overwrite data. Click <strong>Validate Zone</strong> to update.`;
      }
      if (btnVal) btnVal.classList.remove("btn-validate-pulse");
    },
  });

  // Initial date synchronization & preview load
  updateDateLabels(selDate1.value, selDate2.value);
  refreshAllPreviews();

  selDate1.addEventListener("change", () => {
    if (!mapCtrl.activeSector) {
      updateDateLabels(selDate1.value, selDate2.value);
      fetchDatePhotoPreview(selDate1.value, 1);
    }
  });

  selDate2.addEventListener("change", () => {
    if (!mapCtrl.activeSector) {
      updateDateLabels(selDate1.value, selDate2.value);
      fetchDatePhotoPreview(selDate2.value, 2);
    }
  });

  // Wire photo preview clicks to Lightbox
  document.getElementById("splitCardT1")?.addEventListener("click", () => {
    openPhotoLightbox(1);
  });
  document.getElementById("splitCardT2")?.addEventListener("click", () => {
    openPhotoLightbox(2);
  });
  document.getElementById("dashPhotoBox1")?.addEventListener("click", () => {
    openPhotoLightbox(1);
  });
  document.getElementById("dashPhotoBox2")?.addEventListener("click", () => {
    openPhotoLightbox(2);
  });

  if (btnCloseLightbox && photoLightbox) {
    btnCloseLightbox.addEventListener("click", () => {
      photoLightbox.classList.add("hidden");
    });
    photoLightbox.addEventListener("click", (e) => {
      if (e.target === photoLightbox) {
        photoLightbox.classList.add("hidden");
      }
    });
  }

  // Collapsible sidebar panel cards
  document.querySelectorAll(".btn-card-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".panel-card") || btn.closest(".sidebar-description-card");
      if (card) {
        card.classList.toggle("collapsed");
      }
    });
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

      const statusBanner = document.getElementById("dataStatusBanner");
      const statusText = document.getElementById("dataStatusText");
      if (statusBanner) statusBanner.classList.remove("target-pending");
      btnValidate.classList.remove("btn-validate-pulse");
      if (statusText) {
        statusText.innerHTML = `🔄 Streaming 10m polarimetric chunks for new zone...`;
      }

      loadingBanner.classList.remove("hidden");
      loadingText.textContent = `Streaming ${mapCtrl.selectedBoxKm}×${mapCtrl.selectedBoxKm} km @ 10m (${d1} vs ${d2}) via HTTP 206 Range Requests...`;
      btnValidate.disabled = true;

      try {
        const polyData = mapCtrl.getSelectedPolygonData();
        const reqPayload = {
          lat: mapCtrl.selectedLat,
          lon: mapCtrl.selectedLon,
          box_km: mapCtrl.selectedBoxKm,
          bounds: polyData.bounds,
          polygon_wkt: polyData.polygon_wkt,
          polygon_coordinates: polyData.polygon_coordinates,
          date_t1: d1,
          date_t2: d2,
        };
        console.log("[NISAR AgroView] >>> Sending POST /api/validate-zone:", reqPayload);

        const resp = await fetch("/api/validate-zone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqPayload),
        });

        const data = await resp.json();
        console.log("[NISAR AgroView] <<< Received /api/validate-zone response:", data);
        if (!resp.ok || data.status !== "ok") {
          throw new Error(data.message || "Validation request failed.");
        }

        const sector = data.sector;

        if (sector.overlays && sector.overlays.t1_rgb && sector.overlays.t2_rgb) {
          photoCache.t1 = sector.overlays.t1_rgb;
          photoCache.t2 = sector.overlays.t2_rgb;
          if (splitThumbImg1) {
            splitThumbImg1.src = sector.overlays.t1_rgb;
            splitThumbImg1.classList.remove("hidden");
          }
          if (splitThumbLoading1) splitThumbLoading1.classList.add("hidden");
          if (splitThumbImg2) {
            splitThumbImg2.src = sector.overlays.t2_rgb;
            splitThumbImg2.classList.remove("hidden");
          }
          if (splitThumbLoading2) splitThumbLoading2.classList.add("hidden");
          if (dashPhotoImg1) {
            dashPhotoImg1.src = sector.overlays.t1_rgb;
            dashPhotoImg1.classList.remove("hidden");
          }
          if (dashPhotoPlaceholder1) dashPhotoPlaceholder1.classList.add("hidden");
          if (dashPhotoImg2) {
            dashPhotoImg2.src = sector.overlays.t2_rgb;
            dashPhotoImg2.classList.remove("hidden");
          }
          if (dashPhotoPlaceholder2) dashPhotoPlaceholder2.classList.add("hidden");
        }

        updateDateLabels(d1, d2);
        mapCtrl.loadValidatedSector(sector);
        inspector.renderSectorSummary(sector);
        if (statusText) {
          statusText.innerHTML = `🔒 Active analysis: <strong>${sector.name}</strong> (${sector.box_km}×${sector.box_km} km). Select a new target anytime.`;
        }
      } catch (err) {
        document.getElementById("statusBadge").textContent = "Validation Error";
        document.getElementById("sectorHeadline").textContent =
          "Could Not Stream Selected Zone";
        document.getElementById("sectorStoryText").textContent = err.message;
        if (statusText) {
          statusText.innerHTML = `⚠️ Validation error. Select target and click <strong>Validate Zone</strong> to retry.`;
        }
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
    const val = Number(e.target.value);
    if (splitRatioBadge) {
      splitRatioBadge.textContent = `${val}% ⟷ ${100 - val}%`;
    }
    mapCtrl.setSplitPercent(val);
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
