/**
 * Google Maps-Style Global Interactive Canvas with Bounded Sector Box Limit (3–8 km)
 * and Stateless In-Memory Overlay Rendering (0 Saved History).
 */

class AgroGoogleMapController {
  constructor(mapElementId, callbacks = {}) {
    this.mapElementId = mapElementId;
    this.onTargetMoved = callbacks.onTargetMoved || null;
    this.onParcelSelected = callbacks.onParcelSelected || null;
    this.onCleared = callbacks.onCleared || null;

    this.map = null;
    this.targetSelectionRect = null;
    this.targetCenterMarker = null;

    this.selectedLat = 16.815;
    this.selectedLon = 78.705;
    this.selectedBoxKm = 5.0;

    this.activeSector = null;
    this.activeLayerMode = "change";
    this.opacity = 0.88;
    this.splitPercent = 50;
    this.showParcels = true;
    this.dateT1 = "2026-10-17";
    this.dateT2 = "2026-11-10";

    this.primaryOverlay = null;
    this.secondaryOverlay = null;
    this.sectorBoundaryRect = null;
    this.splitCurtainLine = null;
    this.squareDateMarker = null;
    this.parcelsLayer = null;
    this.selectedParcelId = null;

    this._initMap();
  }

  _initMap() {
    this.map = L.map(this.mapElementId, {
      center: [16.815, 78.705],
      zoom: 6,
      minZoom: 2,
      maxZoom: 20,
      worldCopyJump: true,
      zoomControl: true,
      preferCanvas: true,
    });

    const googleHybrid = L.tileLayer(
      "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
      {
        maxZoom: 20,
        attribution: "Map data &copy; Google Satellite Hybrid | NASA-ISRO NISAR L2 GCOV",
      }
    );

    const googleSatellite = L.tileLayer(
      "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      {
        maxZoom: 20,
        attribution: "Map data &copy; Google Satellite | NASA-ISRO NISAR",
      }
    );

    const googleTerrain = L.tileLayer(
      "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
      {
        maxZoom: 20,
        attribution: "Map data &copy; Google Terrain",
      }
    );

    const darkRadarCanvas = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap &copy; CARTO",
      }
    );

    googleHybrid.addTo(this.map);

    L.control
      .layers(
        {
          "Google Satellite Hybrid (Labels)": googleHybrid,
          "Google Satellite (Clean)": googleSatellite,
          "Google Terrain Map": googleTerrain,
          "Dark Orbital Canvas": darkRadarCanvas,
        },
        {},
        { position: "topright" }
      )
      .addTo(this.map);

    // Click ANYWHERE on the world map to place the bounded validation sector box
    this.map.on("click", (e) => {
      const wrapped = e.latlng.wrap();
      this.setTargetPosition(wrapped.lat, wrapped.lng, false);
    });

    this.map.on("move zoom resize", () => {
      this._updateSplitClip();
    });
  }

  initSearchZone(limitsMeta) {
    this.selectedBoxKm = limitsMeta.default_box_km || 5.0;
    const center = limitsMeta.default_center || [16.815, 78.705];
    this.setTargetPosition(center[0], center[1], false);
  }

  _computeBoxBounds(lat, lon, boxKm) {
    const halfDegLat = (boxKm / 111.0) / 2.0;
    const cosLat = Math.max(Math.abs(Math.cos((lat * Math.PI) / 180.0)), 0.1);
    const halfDegLon = (boxKm / (111.0 * cosLat)) / 2.0;
    return [
      [lat - halfDegLat, lon - halfDegLon],
      [lat + halfDegLat, lon + halfDegLon],
    ];
  }

  setTargetPosition(lat, lon, clearPrevious = false) {
    if (clearPrevious && this.activeSector) {
      this.clearActiveValidation();
    }

    const cLat = Math.max(-80.0, Math.min(80.0, lat));
    const cLon = Math.max(-180.0, Math.min(180.0, lon));
    this.selectedLat = Number(cLat.toFixed(4));
    this.selectedLon = Number(cLon.toFixed(4));

    this._drawTargetSelectionBox();

    if (this.onTargetMoved) {
      this.onTargetMoved(this.selectedLat, this.selectedLon, this.selectedBoxKm);
    }
  }

  setBoxSizeKm(boxKm) {
    this.selectedBoxKm = Number(boxKm);
    this.setTargetPosition(this.selectedLat, this.selectedLon, false);
  }

  getSelectedPolygonData() {
    const [[sRaw, wRaw], [nRaw, eRaw]] = this._computeBoxBounds(
      this.selectedLat,
      this.selectedLon,
      this.selectedBoxKm
    );
    const south = Number(sRaw.toFixed(6));
    const west = Number(wRaw.toFixed(6));
    const north = Number(nRaw.toFixed(6));
    const east = Number(eRaw.toFixed(6));

    const polygonWkt = `POLYGON((${west} ${south}, ${east} ${south}, ${east} ${north}, ${west} ${north}, ${west} ${south}))`;
    const polygonCoords = [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ];

    return {
      bounds: [south, west, north, east],
      polygon_wkt: polygonWkt,
      polygon_coordinates: polygonCoords,
    };
  }

  setDates(d1, d2) {
    if (d1) this.dateT1 = d1;
    if (d2) this.dateT2 = d2;
    this._refreshSquareDateTag();
  }

  _refreshSquareDateTag() {
    if (this.activeSector) {
      const [south, west, north, east] = this.activeSector.bounds;
      let text = "";
      if (this.activeLayerMode === "split") {
        text = `<span class="tag-highlight-d1">${this.dateT1}</span> <span class="tag-arrow">⟷</span> <span class="tag-highlight-d2">${this.dateT2}</span>`;
      } else if (this.activeLayerMode === "t1_rgb") {
        text = `<span class="tag-highlight-d1">Date 1: ${this.dateT1}</span>`;
      } else {
        text = `<span class="tag-highlight-d2">Date 2: ${this.dateT2}</span>`;
      }
      this._updateSquareDateTag(north, east, text, false);
    } else {
      const boxBounds = this._computeBoxBounds(
        this.selectedLat,
        this.selectedLon,
        this.selectedBoxKm
      );
      const north = boxBounds[1][0];
      const east = boxBounds[1][1];
      const text = `<span class="tag-highlight-d1">${this.dateT1}</span> <span class="tag-arrow">⟷</span> <span class="tag-highlight-d2">${this.dateT2}</span>`;
      this._updateSquareDateTag(north, east, text, true);
    }
  }

  _updateSquareDateTag(north, east, htmlContent, isSelection = false) {
    if (!this.map) return;
    const modeClass = isSelection ? "selection-mode" : "validated-mode";
    const tagHtml = `
      <div class="map-square-date-tag ${modeClass}">
        <span class="tag-dot"></span>
        <span class="tag-date-label">${htmlContent}</span>
      </div>
    `;

    const icon = L.divIcon({
      className: "square-date-div-icon",
      html: tagHtml,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    if (this.squareDateMarker) {
      this.squareDateMarker.setLatLng([north, east]);
      this.squareDateMarker.setIcon(icon);
    } else {
      this.squareDateMarker = L.marker([north, east], {
        icon: icon,
        interactive: false,
        zIndexOffset: 1200,
      }).addTo(this.map);
    }
  }

  _drawTargetSelectionBox() {
    const boxBounds = this._computeBoxBounds(
      this.selectedLat,
      this.selectedLon,
      this.selectedBoxKm
    );

    if (this.targetSelectionRect) {
      this.targetSelectionRect.setBounds(boxBounds);
    } else {
      this.targetSelectionRect = L.rectangle(boxBounds, {
        color: "#facc15",
        weight: 2.5,
        fillColor: "#facc15",
        fillOpacity: 0.14,
        interactive: false,
      }).addTo(this.map);
    }

    if (this.targetCenterMarker) {
      this.targetCenterMarker.setLatLng([this.selectedLat, this.selectedLon]);
    } else {
      this.targetCenterMarker = L.circleMarker(
        [this.selectedLat, this.selectedLon],
        {
          radius: 6,
          color: "#091020",
          weight: 2,
          fillColor: "#facc15",
          fillOpacity: 1.0,
        }
      )
        .bindTooltip(
          "Selected Bounded Sector (Click anywhere on the map to move)",
          { direction: "top" }
        )
        .addTo(this.map);
    }

    this._refreshSquareDateTag();
  }

  clearActiveValidation() {
    this.activeSector = null;
    this.selectedParcelId = null;

    if (this.primaryOverlay) {
      this.map.removeLayer(this.primaryOverlay);
      this.primaryOverlay = null;
    }
    if (this.secondaryOverlay) {
      this.map.removeLayer(this.secondaryOverlay);
      this.secondaryOverlay = null;
    }
    if (this.sectorBoundaryRect) {
      this.map.removeLayer(this.sectorBoundaryRect);
      this.sectorBoundaryRect = null;
    }
    if (this.splitCurtainLine) {
      this.map.removeLayer(this.splitCurtainLine);
      this.splitCurtainLine = null;
    }
    if (this.parcelsLayer) {
      this.map.removeLayer(this.parcelsLayer);
      this.parcelsLayer = null;
    }

    this._refreshSquareDateTag();

    if (this.onCleared) {
      this.onCleared();
    }
  }

  loadValidatedSector(sector) {
    this.clearActiveValidation();
    this.activeSector = sector;
    if (sector.date_t1) this.dateT1 = sector.date_t1;
    if (sector.date_t2) this.dateT2 = sector.date_t2;

    const [south, west, north, east] = sector.bounds;
    const boundsLatLng = [
      [south, west],
      [north, east],
    ];

    this.map.flyToBounds(boundsLatLng, {
      padding: [50, 50],
      maxZoom: 14,
      duration: 1.0,
    });

    this.sectorBoundaryRect = L.rectangle(boundsLatLng, {
      color: "#10b981",
      weight: 2.5,
      dashArray: "6, 4",
      fill: false,
      interactive: false,
    }).addTo(this.map);

    this._refreshSquareDateTag();
    this._renderActiveOverlay();
    this._renderParcels(sector);
  }

  setLayerMode(mode) {
    this.activeLayerMode = mode;
    this._refreshSquareDateTag();
    this._renderActiveOverlay();
  }

  setOpacity(opacityFraction) {
    this.opacity = opacityFraction;
    if (this.primaryOverlay) {
      this.primaryOverlay.setOpacity(this.opacity);
    }
    if (this.secondaryOverlay) {
      this.secondaryOverlay.setOpacity(this.opacity);
    }
  }

  setSplitPercent(pct) {
    this.splitPercent = pct;
    this._updateSplitClip();
    this._updateSplitCurtainLine();
  }

  setParcelsVisible(visible) {
    this.showParcels = visible;
    if (!this.parcelsLayer) return;
    if (visible) {
      this.parcelsLayer.addTo(this.map);
    } else {
      this.map.removeLayer(this.parcelsLayer);
    }
  }

  _renderActiveOverlay() {
    if (!this.activeSector) return;
    if (this.primaryOverlay) {
      this.map.removeLayer(this.primaryOverlay);
      this.primaryOverlay = null;
    }
    if (this.secondaryOverlay) {
      this.map.removeLayer(this.secondaryOverlay);
      this.secondaryOverlay = null;
    }

    const [south, west, north, east] = this.activeSector.bounds;
    const boundsLatLng = [
      [south, west],
      [north, east],
    ];

    if (this.activeLayerMode === "split") {
      this.secondaryOverlay = L.imageOverlay(
        this.activeSector.overlays.t2_rgb,
        boundsLatLng,
        { opacity: this.opacity, interactive: false }
      ).addTo(this.map);

      this.primaryOverlay = L.imageOverlay(
        this.activeSector.overlays.t1_rgb,
        boundsLatLng,
        { opacity: this.opacity, interactive: false }
      ).addTo(this.map);

      setTimeout(() => {
        this._updateSplitClip();
        this._updateSplitCurtainLine();
      }, 30);
    } else {
      if (this.splitCurtainLine) {
        this.map.removeLayer(this.splitCurtainLine);
        this.splitCurtainLine = null;
      }
      const dataUri =
        this.activeSector.overlays[this.activeLayerMode] ||
        this.activeSector.overlays.change;
      this.primaryOverlay = L.imageOverlay(dataUri, boundsLatLng, {
        opacity: this.opacity,
        interactive: false,
      }).addTo(this.map);
    }
  }

  _updateSplitClip() {
    if (
      this.activeLayerMode !== "split" ||
      !this.primaryOverlay ||
      !this.secondaryOverlay
    ) {
      if (this.primaryOverlay && this.primaryOverlay.getElement()) {
        this.primaryOverlay.getElement().style.clip = "";
        this.primaryOverlay.getElement().style.clipPath = "";
      }
      if (this.secondaryOverlay && this.secondaryOverlay.getElement()) {
        this.secondaryOverlay.getElement().style.clip = "";
        this.secondaryOverlay.getElement().style.clipPath = "";
      }
      if (this.splitCurtainLine) {
        this.map.removeLayer(this.splitCurtainLine);
        this.splitCurtainLine = null;
      }
      return;
    }

    const el1 = this.primaryOverlay.getElement();
    const el2 = this.secondaryOverlay.getElement();
    if (!el1 || !el2) return;

    el1.style.clip = "";
    el2.style.clip = "";
    el1.style.clipPath = `polygon(0% 0%, ${this.splitPercent}% 0%, ${this.splitPercent}% 100%, 0% 100%)`;
    el2.style.clipPath = `polygon(${this.splitPercent}% 0%, 100% 0%, 100% 100%, ${this.splitPercent}% 100%)`;
  }

  _updateSplitCurtainLine() {
    if (this.activeLayerMode !== "split" || !this.activeSector) {
      if (this.splitCurtainLine) {
        this.map.removeLayer(this.splitCurtainLine);
        this.splitCurtainLine = null;
      }
      return;
    }

    const [south, west, north, east] = this.activeSector.bounds;
    const splitLon = west + (this.splitPercent / 100.0) * (east - west);
    const lineCoords = [
      [south, splitLon],
      [north, splitLon],
    ];

    if (this.splitCurtainLine) {
      this.splitCurtainLine.setLatLngs(lineCoords);
    } else {
      this.splitCurtainLine = L.polyline(lineCoords, {
        color: "#ffffff",
        weight: 2.5,
        dashArray: "5, 5",
        interactive: false,
        zIndexOffset: 1100,
      }).addTo(this.map);
    }
  }

  _renderParcels(sector) {
    if (this.parcelsLayer) {
      this.map.removeLayer(this.parcelsLayer);
      this.parcelsLayer = null;
    }

    const features =
      (sector.parcels_geojson && sector.parcels_geojson.features) || [];
    if (!features.length) return;

    this.selectedParcelId = features[0].properties.parcel_id;

    this.parcelsLayer = L.geoJSON(sector.parcels_geojson, {
      style: (feature) => this._parcelStyle(feature),
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        const dHh = p.diff_hh_db !== undefined ? p.diff_hh_db : (p.delta_hh_db !== undefined ? p.delta_hh_db : (p.hh_t2_db - p.hh_t1_db).toFixed(2));
        const dHv = p.diff_hv_db !== undefined ? p.diff_hv_db : (p.delta_hv_db !== undefined ? p.delta_hv_db : (p.hv_t2_db - p.hv_t1_db).toFixed(2));
        const dRvi = p.diff_rvi !== undefined ? p.diff_rvi : (p.delta_rvi !== undefined ? p.delta_rvi : (p.rvi_t2 - p.rvi_t1).toFixed(3));

        layer.bindTooltip(
          `<strong>${p.parcel_id}</strong>: ${p.change_class}<br/>` +
            `ΔHH: ${dHh > 0 ? "+" : ""}${dHh} dB | ` +
            `ΔHV: ${dHv > 0 ? "+" : ""}${dHv} dB | ` +
            `RVI: ${p.rvi_t1} → ${p.rvi_t2}`,
          { sticky: true }
        );

        layer.on("click", (ev) => {
          L.DomEvent.stopPropagation(ev);
          this.selectedParcelId = p.parcel_id;
          this.parcelsLayer.setStyle((f) => this._parcelStyle(f));
          if (this.onParcelSelected) {
            this.onParcelSelected(p);
          }
        });
      },
    });

    if (this.showParcels) {
      this.parcelsLayer.addTo(this.map);
    }

    if (this.onParcelSelected) {
      this.onParcelSelected(features[0].properties);
    }
  }

  _parcelStyle(feature) {
    const p = feature.properties;
    const isSelected = p.parcel_id === this.selectedParcelId;
    return {
      color: isSelected ? "#ffffff" : p.color,
      weight: isSelected ? 3 : 1.6,
      fillColor: p.color,
      fillOpacity: isSelected ? 0.22 : 0.06,
      dashArray: isSelected ? "" : "3, 3",
    };
  }
}

window.AgroGoogleMapController = AgroGoogleMapController;
