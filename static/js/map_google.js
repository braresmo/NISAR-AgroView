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
    this.activeLayerMode = "split";
    this.opacity = 0.88;
    this.splitPercent = 50;
    this.showParcels = true;

    this.primaryOverlay = null;
    this.secondaryOverlay = null;
    this.sectorBoundaryRect = null;
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
      this.setTargetPosition(wrapped.lat, wrapped.lng, true);
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

  setTargetPosition(lat, lon, clearPrevious = true) {
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
    this.setTargetPosition(this.selectedLat, this.selectedLon, true);
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
    if (this.parcelsLayer) {
      this.map.removeLayer(this.parcelsLayer);
      this.parcelsLayer = null;
    }

    if (this.onCleared) {
      this.onCleared();
    }
  }

  loadValidatedSector(sector) {
    this.clearActiveValidation();
    this.activeSector = sector;

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

    this._renderActiveOverlay();
    this._renderParcels(sector);
  }

  setLayerMode(mode) {
    this.activeLayerMode = mode;
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

      setTimeout(() => this._updateSplitClip(), 30);
    } else {
      const dataUri =
        this.activeSector.overlays[this.activeLayerMode] ||
        this.activeSector.overlays.t2_rgb;
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
      }
      return;
    }

    const el1 = this.primaryOverlay.getElement();
    const el2 = this.secondaryOverlay.getElement();
    if (!el1 || !el2) return;

    const rect = el1.getBoundingClientRect();
    const splitPx = Math.round((rect.width * this.splitPercent) / 100.0);

    el1.style.clip = `rect(0px, ${splitPx}px, ${Math.ceil(rect.height)}px, 0px)`;
    el2.style.clip = `rect(0px, ${Math.ceil(rect.width)}px, ${Math.ceil(
      rect.height
    )}px, ${splitPx}px)`;
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
        layer.bindTooltip(
          `<strong>${p.parcel_id}</strong>: ${p.change_class}<br/>` +
            `ΔHH: ${p.delta_hh_db > 0 ? "+" : ""}${p.delta_hh_db} dB | ` +
            `ΔHV: ${p.delta_hv_db > 0 ? "+" : ""}${p.delta_hv_db} dB | ` +
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
