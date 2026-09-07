/**
 * Geopatok V3 - By AR
 * Accurate smartphone land mapping → GeoJSON
 * All data stays local (localStorage). No backend required.
 */
(function () {
  "use strict";

  // ---------- Constants & state ----------
  const STORAGE_KEY = "geopatok_parcels_v1";
  const SETTINGS_KEY = "geopatok_settings_v1";
  const MARKED_IDS_KEY = "geopatok_marked_ids_v1";
  const APP_NAME = "Geopatok V3 - By AR";
  const APP_SHORT = "Geopatok V3";
  /** Saat Tutup: sederhanakan poligon ke N titik paling mewakili (jika lebih banyak) */
  const CLOSE_TARGET_POINTS = 8;
  const MARK_STYLE = {
    color: "#7f1d1d",
    fillColor: "#991b1b",
    weight: 2,
    opacity: 0.95,
    fillOpacity: 0.45,
  };
  const BSRE_STYLE = {
    color: "#f59e0b",
    fillColor: "#f59e0b",
    weight: 1,
    opacity: 0.85,
    fillOpacity: 0.14,
  };

  const state = {
    points: [], // [{lat, lng, accuracy, altitude, timestamp}]
    closed: false,
    tapMode: false,
    walkMode: false,
    walkTimer: null,
    watchId: null,
    lastPosition: null, // GeolocationPosition
    parcels: [],
    meta: {
      name: "",
      owner: "",
      type: "pertanian",
      notes: "",
    },
    settings: {
      accuracyThreshold: 15,
      walkInterval: 5,
      highAccuracy: true,
      basemap: "osm",
    },
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const els = {
    statusText: $("statusText"),
    gpsBadge: $("gpsBadge"),
    gpsDot: $("gpsDot"),
    gpsLabel: $("gpsLabel"),
    statsCard: $("statsCard"),
    statPoints: $("statPoints"),
    statPerimeter: $("statPerimeter"),
    statAreaHa: $("statAreaHa"),
    statAreaM2: $("statAreaM2"),
    btnLocate: $("btnLocate"),
    btnAddPoint: $("btnAddPoint"),
    btnUndo: $("btnUndo"),
    btnClose: $("btnClose"),
    btnMore: $("btnMore"),
    btnLayers: $("btnLayers"),
    btnHelp: $("btnHelp"),
    moreSheet: $("moreSheet"),
    layersSheet: $("layersSheet"),
    metaSheet: $("metaSheet"),
    parcelsSheet: $("parcelsSheet"),
    exportSheet: $("exportSheet"),
    importSheet: $("importSheet"),
    helpSheet: $("helpSheet"),
    toast: $("toast"),
    fileImport: $("fileImport"),
    dropZone: $("dropZone"),
    importResult: $("importResult"),
    accuracyThreshold: $("accuracyThreshold"),
    walkInterval: $("walkInterval"),
    highAccuracy: $("highAccuracy"),
    metaName: $("metaName"),
    metaOwner: $("metaOwner"),
    metaType: $("metaType"),
    metaNotes: $("metaNotes"),
    parcelsList: $("parcelsList"),
    parcelCountLabel: $("parcelCountLabel"),
    tapModeLabel: $("tapModeLabel"),
    walkModeLabel: $("walkModeLabel"),
    geojsonPreview: $("geojsonPreview"),
    routeBar: $("routeBar"),
    routeDestName: $("routeDestName"),
    routeMeta: $("routeMeta"),
    btnRouteMode: $("btnRouteMode"),
    btnOpenMaps: $("btnOpenMaps"),
    btnClearRoute: $("btnClearRoute"),
    bsreSearchBar: $("bsreSearchBar"),
    bsreSearchForm: $("bsreSearchForm"),
    bsreSearchInput: $("bsreSearchInput"),
    bsreSearchResults: $("bsreSearchResults"),
    btnBsreSearchClear: $("btnBsreSearchClear"),
    btnBsreSearch: $("btnBsreSearch"),
    btnSearchBsre: $("btnSearchBsre"),
    bsreSearchMenuLabel: $("bsreSearchMenuLabel"),
    btnMarkIds: $("btnMarkIds"),
    markIdsMenuLabel: $("markIdsMenuLabel"),
    markSheet: $("markSheet"),
    markIdsInput: $("markIdsInput"),
    btnMarkToggle: $("btnMarkToggle"),
    btnMarkOnly: $("btnMarkOnly"),
    btnUnmarkOnly: $("btnUnmarkOnly"),
    btnClearAllMarks: $("btnClearAllMarks"),
    markedIdsList: $("markedIdsList"),
    markCount: $("markCount"),
    markActionResult: $("markActionResult"),
    btnLocateRed: $("btnLocateRed"),
    btnLocateRedSheet: $("btnLocateRedSheet"),
    locateRedCount: $("locateRedCount"),
    btnInstallApp: $("btnInstallApp"),
    installAppLabel: $("installAppLabel"),
    installBanner: $("installBanner"),
    btnInstallNow: $("btnInstallNow"),
    btnInstallLater: $("btnInstallLater"),
  };

  // ---------- PWA install ----------
  let deferredInstallPrompt = null;
  const INSTALL_DISMISS_KEY = "geopatok_install_dismissed_v1";

  function isStandalonePwa() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function updateInstallUI() {
    const canInstall = !!deferredInstallPrompt && !isStandalonePwa();
    if (els.btnInstallApp) {
      // Keep menu entry visible with guidance even if prompt not ready
      els.btnInstallApp.hidden = isStandalonePwa();
      if (els.installAppLabel) {
        if (isStandalonePwa()) {
          els.installAppLabel.textContent = "Sudah terpasang sebagai aplikasi";
        } else if (canInstall) {
          els.installAppLabel.textContent = "Ketuk untuk memasang ke layar utama";
        } else {
          els.installAppLabel.textContent =
            "Chrome → ⋮ → Install app / Tambahkan ke layar utama";
        }
      }
    }
  }

  function showInstallBannerIfNeeded() {
    if (!els.installBanner) return;
    const appEl = document.getElementById("app");
    if (isStandalonePwa()) {
      els.installBanner.hidden = true;
      if (appEl) appEl.classList.remove("install-on");
      return;
    }
    if (!deferredInstallPrompt) return;
    try {
      if (localStorage.getItem(INSTALL_DISMISS_KEY) === "1") return;
    } catch (_) {}
    els.installBanner.hidden = false;
    if (appEl) appEl.classList.add("install-on");
  }

  async function triggerInstall() {
    if (isStandalonePwa()) {
      toast("Geopatok sudah berjalan sebagai aplikasi");
      return;
    }
    if (!deferredInstallPrompt) {
      toast(
        "Di Chrome Android: menu ⋮ → Install app / Tambahkan ke layar utama",
        false
      );
      // open help as guidance
      openSheet("helpSheet");
      return;
    }
    try {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice && choice.outcome === "accepted") {
        toast("Geopatok V3 dipasang");
        if (els.installBanner) els.installBanner.hidden = true;
      } else {
        toast("Pemasangan dibatalkan");
      }
    } catch (e) {
      console.warn(e);
      toast("Gagal memunculkan dialog install", true);
    } finally {
      deferredInstallPrompt = null;
      updateInstallUI();
    }
  }

  function bindInstallEvents() {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      updateInstallUI();
      showInstallBannerIfNeeded();
    });

    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      if (els.installBanner) els.installBanner.hidden = true;
      const appEl = document.getElementById("app");
      if (appEl) appEl.classList.remove("install-on");
      updateInstallUI();
      toast("Berhasil dipasang di perangkat");
      setStatus("Geopatok V3 terpasang");
    });

    if (els.btnInstallApp) {
      els.btnInstallApp.addEventListener("click", () => {
        closeSheet("moreSheet");
        triggerInstall();
      });
    }
    if (els.btnInstallNow) {
      els.btnInstallNow.addEventListener("click", () => triggerInstall());
    }
    if (els.btnInstallLater) {
      els.btnInstallLater.addEventListener("click", () => {
        if (els.installBanner) els.installBanner.hidden = true;
        const appEl = document.getElementById("app");
        if (appEl) appEl.classList.remove("install-on");
        try {
          localStorage.setItem(INSTALL_DISMISS_KEY, "1");
        } catch (_) {}
      });
    }

    updateInstallUI();
  }

  // ---------- Map setup ----------
  const map = L.map("map", {
    zoomControl: true,
    attributionControl: true,
    maxZoom: 22,
  }).setView([3.5952, 98.6722], 15); // default Medan

  const basemaps = {
    osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }),
    satellite: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri",
      }
    ),
    topo: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: "&copy; OpenTopoMap",
    }),
  };

  basemaps.osm.addTo(map);

  // Canvas renderer is much faster for 1000+ polygons on mobile
  const canvasRenderer = L.canvas({ padding: 0.5 });
  const drawLayer = L.layerGroup().addTo(map);
  const parcelsLayer = L.layerGroup().addTo(map);
  const datasetLayer = L.layerGroup().addTo(map); // external / BSRE datasets
  const routeLayer = L.layerGroup().addTo(map);
  let userMarker = null;
  let accuracyCircle = null;
  let polyline = null;
  let polygon = null;
  let destMarker = null;
  let routeLine = null;
  let bsreLoaded = false;
  let bsreLoading = false;
  let bsreFeatureCount = 0;
  /** Full BSRE feature list kept in memory for ID search */
  let bsreFeatures = [];
  /** featureIndex -> array of Leaflet polygon layers */
  let bsreLayerIndex = {};
  /** normalizedId(lower) -> [featureIndex, ...] */
  let bsreIdIndex = {};
  /** Set of canonical marked IDs (as stored / original case preferred) */
  let markedIds = new Set();
  let bsreHighlightLayer = null;
  let bsreSearchTimer = null;
  /** Radar ping layer over marked polygons */
  const radarLayer = L.layerGroup().addTo(map);
  let radarActive = false;
  let radarTimer = null;
  let routeState = {
    active: false,
    loading: false,
    name: "",
    dest: null, // {lat,lng}
    mode: "driving", // driving | walking
    distance_m: null,
    duration_s: null,
    provider: null, // osrm | straight
  };
  let routeAbort = null;

  /** Bundled dataset from Google Drive share */
  const BSRE_DATASET = {
    id: "polsh_bsre_1119",
    title: "POLSH BSRE 1119",
    url: "./data/POLSH_BSRE_1119.geojson",
    sourceLabel: "Data BSRE (bundled)",
  };

  // ---------- Utilities ----------
  function toast(msg, isError = false) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    els.toast.classList.toggle("error", !!isError);
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      els.toast.hidden = true;
    }, 2800);
  }

  function openSheet(id) {
    const el = $(id);
    if (el) el.hidden = false;
  }

  function closeSheet(id) {
    const el = $(id);
    if (el) el.hidden = true;
  }

  function closeAllSheets() {
    document.querySelectorAll(".sheet").forEach((s) => {
      s.hidden = true;
    });
  }

  function uid() {
    return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(state.settings, JSON.parse(raw));
    } catch (_) {}
    els.accuracyThreshold.value = state.settings.accuracyThreshold;
    els.walkInterval.value = state.settings.walkInterval;
    els.highAccuracy.checked = state.settings.highAccuracy;
    const radio = document.querySelector(
      `input[name="basemap"][value="${state.settings.basemap}"]`
    );
    if (radio) radio.checked = true;
    setBasemap(state.settings.basemap, false);
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (_) {}
  }

  function loadParcels() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state.parcels = raw ? JSON.parse(raw) : [];
    } catch (_) {
      state.parcels = [];
    }
    renderParcelsOnMap();
    updateParcelCount();
  }

  function saveParcels() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.parcels));
    } catch (e) {
      toast("Gagal menyimpan ke perangkat", true);
    }
    updateParcelCount();
  }

  function updateParcelCount() {
    const n = state.parcels.length;
    els.parcelCountLabel.textContent = n + " lahan tersimpan";
  }

  function setStatus(text) {
    els.statusText.textContent = text;
  }

  // ---------- Geodesy (haversine + spherical excess area) ----------
  const R = 6371008.8; // mean earth radius (m)

  function toRad(d) {
    return (d * Math.PI) / 180;
  }

  function haversine(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** Spherical polygon area (m²) using L'Huilier / spherical excess */
  function polygonArea(points) {
    if (points.length < 3) return 0;
    const pts = points.slice();
    // ensure closed for calculation
    if (
      pts[0].lat !== pts[pts.length - 1].lat ||
      pts[0].lng !== pts[pts.length - 1].lng
    ) {
      pts.push(pts[0]);
    }
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      total +=
        toRad(p2.lng - p1.lng) *
        (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)));
    }
    return Math.abs((total * R * R) / 2);
  }

  function perimeter(points, closed) {
    if (points.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < points.length; i++) {
      sum += haversine(points[i - 1], points[i]);
    }
    if (closed && points.length >= 3) {
      sum += haversine(points[points.length - 1], points[0]);
    }
    return sum;
  }

  function formatDistance(m) {
    if (m >= 1000) return (m / 1000).toFixed(2) + " km";
    if (m >= 100) return Math.round(m) + " m";
    return m.toFixed(1) + " m";
  }

  /** Route distances always in kilometers */
  function formatKm(m) {
    if (m == null || !isFinite(m) || m < 0) return "— km";
    const km = m / 1000;
    if (km >= 100) return km.toFixed(1) + " km";
    if (km >= 10) return km.toFixed(2) + " km";
    if (km >= 1) return km.toFixed(2) + " km";
    // short legs still shown as km, e.g. 0.35 km
    return km.toFixed(2) + " km";
  }

  /** Convert m² → hectares (1 Ha = 10.000 m²) */
  function toHectares(m2) {
    return m2 / 10000;
  }

  /** Always format as hectares, e.g. 0.1523 Ha / 12.45 Ha */
  function formatHa(m2) {
    if (!isFinite(m2) || m2 <= 0) return "0 Ha";
    const ha = toHectares(m2);
    if (ha >= 100) return ha.toFixed(2) + " Ha";
    if (ha >= 1) return ha.toFixed(3) + " Ha";
    if (ha >= 0.01) return ha.toFixed(4) + " Ha";
    return ha.toFixed(6) + " Ha";
  }

  /** Square meters, compact */
  function formatM2(m2) {
    if (!isFinite(m2) || m2 <= 0) return "0 m²";
    if (m2 >= 100) return Math.round(m2).toLocaleString("id-ID") + " m²";
    if (m2 >= 1) return (Math.round(m2 * 10) / 10).toLocaleString("id-ID") + " m²";
    return m2.toFixed(2) + " m²";
  }

  /** Combined label for lists/popups: "0,1523 Ha (1.523 m²)" */
  function formatArea(m2) {
    if (!isFinite(m2) || m2 <= 0) return "0 Ha";
    return formatHa(m2) + " (" + formatM2(m2) + ")";
  }

  function roundHa(m2) {
    const ha = toHectares(m2);
    // keep useful precision for small parcels
    if (ha >= 10) return Math.round(ha * 1000) / 1000;
    if (ha >= 1) return Math.round(ha * 10000) / 10000;
    return Math.round(ha * 1000000) / 1000000;
  }

  function centroid(points) {
    if (!points.length) return null;
    let lat = 0,
      lng = 0;
    points.forEach((p) => {
      lat += p.lat;
      lng += p.lng;
    });
    return { lat: lat / points.length, lng: lng / points.length };
  }

  // ---------- Drawing ----------
  function redraw() {
    drawLayer.clearLayers();
    polyline = null;
    polygon = null;

    const pts = state.points;
    if (!pts.length) {
      updateStats();
      updateButtons();
      return;
    }

    // vertices
    pts.forEach((p, i) => {
      const icon = L.divIcon({
        className: "vertex-marker" + (i === 0 ? " first" : ""),
        iconSize: [i === 0 ? 16 : 14, i === 0 ? 16 : 14],
      });
      const m = L.marker([p.lat, p.lng], {
        icon,
        draggable: !state.closed,
        title: `Titik ${i + 1}` + (p.accuracy != null ? ` (±${Math.round(p.accuracy)} m)` : ""),
      });
      m.on("dragend", (e) => {
        const ll = e.target.getLatLng();
        state.points[i] = {
          ...state.points[i],
          lat: ll.lat,
          lng: ll.lng,
          accuracy: null,
          source: "drag",
        };
        redraw();
      });
      m.bindTooltip(
        `#${i + 1}` +
          (p.accuracy != null ? `<br>±${Math.round(p.accuracy)} m` : "") +
          (p.source ? `<br>${p.source}` : ""),
        { direction: "top", opacity: 0.9 }
      );
      m.addTo(drawLayer);
    });

    const latlngs = pts.map((p) => [p.lat, p.lng]);

    if (state.closed && pts.length >= 3) {
      polygon = L.polygon(latlngs, {
        color: "#14b8a6",
        weight: 3,
        fillColor: "#14b8a6",
        fillOpacity: 0.22,
      }).addTo(drawLayer);

      // Area label (Ha) at centroid of active polygon
      const c = centroid(pts);
      if (c) {
        const area = polygonArea(pts);
        L.marker([c.lat, c.lng], {
          icon: L.divIcon({
            className: "area-label active",
            html:
              '<div class="area-label-inner">' +
              '<span class="area-ha">' +
              escapeHtml(formatHa(area)) +
              "</span>" +
              '<span class="area-m2">' +
              escapeHtml(formatM2(area)) +
              "</span></div>",
            iconSize: null,
          }),
          interactive: false,
          zIndexOffset: 600,
        }).addTo(drawLayer);
      }
    } else if (pts.length >= 2) {
      polyline = L.polyline(latlngs, {
        color: "#14b8a6",
        weight: 3,
        dashArray: state.closed ? null : "6 8",
      }).addTo(drawLayer);
      // preview close line
      if (pts.length >= 3) {
        L.polyline([latlngs[latlngs.length - 1], latlngs[0]], {
          color: "#fbbf24",
          weight: 2,
          dashArray: "4 6",
          opacity: 0.7,
        }).addTo(drawLayer);
      }
    }

    updateStats();
    updateButtons();
  }

  function updateStats() {
    const n = state.points.length;
    els.statPoints.textContent = String(n);
    const perim = perimeter(state.points, state.closed);
    els.statPerimeter.textContent = formatDistance(perim);
    const area = n >= 3 ? polygonArea(state.points) : 0;
    if (n >= 3) {
      els.statAreaHa.textContent = formatHa(area);
      els.statAreaM2.textContent = formatM2(area);
    } else {
      els.statAreaHa.textContent = "—";
      els.statAreaM2.textContent = "min. 3 titik";
    }
    els.statsCard.hidden = n === 0;
  }

  function updateButtons() {
    els.btnUndo.disabled = state.points.length === 0;
    els.btnClose.disabled = state.points.length < 3 || state.closed;
    els.btnAddPoint.classList.toggle("recording", state.walkMode);
  }

  function renderParcelsOnMap() {
    parcelsLayer.clearLayers();
    state.parcels.forEach((parcel) => {
      const ring = parcel.geometry.coordinates[0] || [];
      const coords = ring.map((c) => [c[1], c[0]]);
      const pts = ring.slice(0, -1).map((c) => ({ lat: c[1], lng: c[0] }));
      // Prefer stored area; recompute if missing
      let areaM2 = parcel.properties.area_m2;
      if (areaM2 == null && pts.length >= 3) {
        areaM2 = polygonArea(pts);
        parcel.properties.area_m2 = Math.round(areaM2 * 100) / 100;
        parcel.properties.area_ha = roundHa(areaM2);
      }
      const areaHa =
        parcel.properties.area_ha != null
          ? parcel.properties.area_ha
          : areaM2 != null
            ? roundHa(areaM2)
            : null;

      const poly = L.polygon(coords, {
        color: "#6366f1",
        weight: 2,
        fillColor: "#6366f1",
        fillOpacity: 0.12,
      });
      const name = parcel.properties.name || "Tanpa nama";
      const areaText =
        areaM2 != null ? formatArea(areaM2) : areaHa != null ? areaHa + " Ha" : "—";
      const destId = "dest_p_" + (parcel.properties.id || idx);
      poly.bindPopup(
        `<div class="ds-popup"><strong>${escapeHtml(name)}</strong><br>Luas: ${escapeHtml(areaText)}` +
          (parcel.properties.owner
            ? `<br>${escapeHtml(parcel.properties.owner)}`
            : "") +
          `<div class="popup-actions">` +
          `<button type="button" class="popup-dest-btn" data-dest-id="${destId}">Set as destination</button>` +
          `</div></div>`
      );
      poly.on("popupopen", () => {
        const btn = document.querySelector(
          `.popup-dest-btn[data-dest-id="${destId}"]`
        );
        if (btn) {
          btn.onclick = () => destinationFromPolygonLatLngs(coords, name);
        }
      });
      poly.addTo(parcelsLayer);

      const c = centroid(pts.length ? pts : coords.map((ll) => ({ lat: ll[0], lng: ll[1] })));
      if (c) {
        const haLabel = areaM2 != null ? formatHa(areaM2) : areaHa != null ? areaHa + " Ha" : "";
        L.marker([c.lat, c.lng], {
          icon: L.divIcon({
            className: "area-label saved",
            html:
              '<div class="area-label-inner">' +
              '<span class="area-name">' +
              escapeHtml(name) +
              "</span>" +
              (haLabel
                ? '<span class="area-ha">' + escapeHtml(haLabel) + "</span>"
                : "") +
              "</div>",
            iconSize: null,
          }),
          interactive: false,
        }).addTo(parcelsLayer);
      }
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- GPS ----------
  function setBasemap(key, persist = true) {
    Object.values(basemaps).forEach((l) => {
      if (map.hasLayer(l)) map.removeLayer(l);
    });
    const layer = basemaps[key] || basemaps.osm;
    layer.addTo(map);
    state.settings.basemap = key;
    if (persist) saveSettings();
  }

  function updateGpsUi(pos) {
    els.gpsBadge.hidden = false;
    const acc = pos.coords.accuracy;
    els.gpsLabel.textContent = `GPS ±${Math.round(acc)} m`;
    els.gpsDot.classList.remove("good", "ok", "bad");
    if (acc <= 8) els.gpsDot.classList.add("good");
    else if (acc <= state.settings.accuracyThreshold) els.gpsDot.classList.add("ok");
    else els.gpsDot.classList.add("bad");
  }

  function showUserPosition(pos) {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    const ll = [lat, lng];
    if (!userMarker) {
      userMarker = L.marker(ll, {
        icon: L.divIcon({ className: "user-marker", iconSize: [18, 18] }),
        zIndexOffset: 1000,
        interactive: false,
      }).addTo(map);
    } else {
      userMarker.setLatLng(ll);
    }
    if (!accuracyCircle) {
      accuracyCircle = L.circle(ll, {
        radius: accuracy,
        className: "accuracy-circle",
        interactive: false,
      }).addTo(map);
    } else {
      accuracyCircle.setLatLng(ll);
      accuracyCircle.setRadius(accuracy);
    }
    updateGpsUi(pos);
  }

  function geoOptions() {
    return {
      enableHighAccuracy: !!state.settings.highAccuracy,
      maximumAge: 1000,
      timeout: 20000,
    };
  }

  function startWatch() {
    if (!navigator.geolocation) {
      toast("Perangkat tidak mendukung GPS", true);
      setStatus("GPS tidak tersedia");
      return;
    }
    if (state.watchId != null) return;
    setStatus("Mencari sinyal GPS…");
    state.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        state.lastPosition = pos;
        showUserPosition(pos);
        const acc = pos.coords.accuracy;
        if (acc <= 8) setStatus("GPS sangat akurat");
        else if (acc <= state.settings.accuracyThreshold) setStatus("GPS siap");
        else setStatus("Akurasi GPS lemah — tunggu dulu");
      },
      (err) => {
        let msg = "Gagal mendapatkan lokasi";
        if (err.code === 1) msg = "Izin lokasi ditolak";
        else if (err.code === 2) msg = "Lokasi tidak tersedia";
        else if (err.code === 3) msg = "Timeout GPS";
        setStatus(msg);
        toast(msg, true);
      },
      geoOptions()
    );
  }

  function locateOnce(fly = true) {
    if (!navigator.geolocation) {
      toast("GPS tidak didukung", true);
      return;
    }
    setStatus("Memusatkan lokasi…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.lastPosition = pos;
        showUserPosition(pos);
        if (fly) {
          map.setView([pos.coords.latitude, pos.coords.longitude], Math.max(map.getZoom(), 18), {
            animate: true,
          });
        }
        setStatus("Lokasi ditemukan");
      },
      () => toast("Gagal membaca lokasi", true),
      geoOptions()
    );
  }

  // ---------- Point operations ----------
  function addPointFromGps(force = false) {
    if (state.closed) {
      toast("Poligon sudah ditutup. Hapus dulu untuk menggambar ulang.");
      return;
    }
    if (!state.lastPosition) {
      toast("GPS belum siap. Tekan Lokasi dulu.", true);
      locateOnce(false);
      return;
    }
    const c = state.lastPosition.coords;
    const acc = c.accuracy;
    if (!force && acc > state.settings.accuracyThreshold) {
      const ok = confirm(
        `Akurasi GPS saat ini ±${Math.round(acc)} m (ambang ${state.settings.accuracyThreshold} m).\n\nTetap tambahkan titik?`
      );
      if (!ok) return;
    }
    pushPoint({
      lat: c.latitude,
      lng: c.longitude,
      accuracy: acc,
      altitude: c.altitude,
      timestamp: state.lastPosition.timestamp || Date.now(),
      source: "gps",
    });
  }

  function addPointFromTap(latlng) {
    if (state.closed) {
      toast("Poligon sudah ditutup.");
      return;
    }
    pushPoint({
      lat: latlng.lat,
      lng: latlng.lng,
      accuracy: null,
      altitude: null,
      timestamp: Date.now(),
      source: "tap",
    });
  }

  function pushPoint(p) {
    // avoid near-duplicate consecutive points (< 0.5 m)
    if (state.points.length) {
      const last = state.points[state.points.length - 1];
      if (haversine(last, p) < 0.5) {
        toast("Titik terlalu dekat dengan sebelumnya");
        return false;
      }
    }
    state.points.push(p);
    redraw();
    const n = state.points.length;
    toast(
      `Titik ${n} ditambahkan` +
        (p.accuracy != null ? ` (±${Math.round(p.accuracy)} m)` : "") +
        (state.walkMode ? " · mode jalan" : "")
    );
    if (state.walkMode) {
      setStatus(`Mode jalan · ${n} titik`);
    }
    // keep map roughly centered on last point if far
    const z = map.getZoom();
    if (z >= 16) {
      map.panTo([p.lat, p.lng], { animate: true });
    }
    return true;
  }

  function undoPoint() {
    if (!state.points.length) return;
    if (state.closed) {
      state.closed = false;
      setStatus("Poligon dibuka kembali");
    } else {
      state.points.pop();
      toast("Titik terakhir dihapus");
    }
    redraw();
  }

  function closePolygon() {
    if (state.points.length < 3) {
      toast("Minimal 3 titik untuk menutup poligon", true);
      return;
    }
    if (state.walkMode) stopWalkMode();

    const before = state.points.length;
    // Sederhanakan ke 8 titik paling mewakili (Visvalingam–Whyatt)
    if (before > CLOSE_TARGET_POINTS) {
      state.points = simplifyClosedRing(state.points, CLOSE_TARGET_POINTS);
      toast(
        `Disederhanakan: ${before} → ${state.points.length} titik paling mewakili`
      );
    }

    state.closed = true;
    redraw();
    const area = polygonArea(state.points);
    setStatus(
      "Poligon ditutup — " +
        formatHa(area) +
        (before > CLOSE_TARGET_POINTS
          ? ` · ${state.points.length} titik`
          : "")
    );
    toast(
      "Poligon ditutup. Luas: " +
        formatHa(area) +
        " · " +
        formatM2(area) +
        (before > CLOSE_TARGET_POINTS
          ? ` · ${before}→${state.points.length} titik`
          : "")
    );
  }

  /**
   * Reduce a closed polygon ring to exactly `target` vertices that best
   * preserve shape (Visvalingam–Whyatt: drop least-significant vertices).
   * Importance = area of triangle (prev, vertex, next) in local meters.
   */
  function simplifyClosedRing(points, target) {
    if (points.length <= target) return points.slice();
    if (target < 3) target = 3;

    // Working copy with stable ids for debugging
    let pts = points.map((p, i) => ({
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      altitude: p.altitude,
      timestamp: p.timestamp,
      source: p.source || "gps",
      _i: i,
    }));

    // Origin for local ENU projection (meters) — better than raw lat/lng areas
    const origin = centroid(pts);

    function localXY(p) {
      const lat0 = toRad(origin.lat);
      return {
        x: R * toRad(p.lng - origin.lng) * Math.cos(lat0),
        y: R * toRad(p.lat - origin.lat),
      };
    }

    function effectiveArea(prev, curr, next) {
      const a = localXY(prev);
      const b = localXY(curr);
      const c = localXY(next);
      // triangle area (m²)
      return Math.abs(
        (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2
      );
    }

    while (pts.length > target) {
      let minArea = Infinity;
      let minIdx = 0;
      for (let i = 0; i < pts.length; i++) {
        const prev = pts[(i - 1 + pts.length) % pts.length];
        const curr = pts[i];
        const next = pts[(i + 1) % pts.length];
        const area = effectiveArea(prev, curr, next);
        if (area < minArea) {
          minArea = area;
          minIdx = i;
        }
      }
      pts.splice(minIdx, 1);
    }

    // Preserve ring order; mark simplified source
    return pts.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      altitude: p.altitude,
      timestamp: p.timestamp,
      source: p.source === "tap" || p.source === "drag" ? p.source : "simplified",
    }));
  }

  function clearActive() {
    if (!state.points.length) return;
    if (!confirm("Hapus semua titik poligon aktif?")) return;
    state.points = [];
    state.closed = false;
    if (state.walkMode) stopWalkMode();
    redraw();
    setStatus("Siap memetakan");
    toast("Gambar aktif dihapus");
  }

  // ---------- Walk mode ----------
  function toggleWalkMode() {
    if (state.walkMode) stopWalkMode();
    else startWalkMode();
    updateWalkLabel();
  }

  function startWalkMode() {
    if (state.closed) {
      toast("Poligon sudah ditutup", true);
      return;
    }
    state.walkMode = true;
    els.btnAddPoint.classList.add("recording");
    const n0 = state.points.length;
    setStatus(`Mode jalan · ${n0} titik — kelilingi lahan`);
    toast("Mode jalan ON. Ikuti batas lahan. Tekan Tutup → jadi 8 titik kunci.");
    // take immediate point
    addPointFromGps(false);
    const ms = Math.max(2, state.settings.walkInterval) * 1000;
    state.walkTimer = setInterval(() => {
      if (!state.walkMode || state.closed) return;
      if (!state.lastPosition) return;
      const acc = state.lastPosition.coords.accuracy;
      if (acc > state.settings.accuracyThreshold * 1.5) return; // skip bad fixes silently
      addPointFromGps(true);
    }, ms);
    updateButtons();
    updateWalkLabel();
  }

  function stopWalkMode() {
    state.walkMode = false;
    if (state.walkTimer) {
      clearInterval(state.walkTimer);
      state.walkTimer = null;
    }
    els.btnAddPoint.classList.remove("recording");
    if (!state.closed) {
      const n = state.points.length;
      setStatus(
        n > 0 ? `Mode jalan berhenti · ${n} titik` : "Mode jalan berhenti"
      );
    } else {
      setStatus("Poligon ditutup");
    }
    updateButtons();
  }

  function updateWalkLabel() {
    els.walkModeLabel.textContent = state.walkMode
      ? `AKTIF · ${state.points.length} titik — tekan lagi untuk berhenti`
      : "Nonaktif — rekam banyak titik; Tutup = sederhanakan ke 8";
  }

  function updateTapLabel() {
    els.tapModeLabel.textContent = state.tapMode
      ? "AKTIF — ketuk peta untuk menambah titik"
      : "Nonaktif — ketuk peta untuk menambah titik";
  }

  // ---------- Meta & save ----------
  function openMeta() {
    els.metaName.value = state.meta.name;
    els.metaOwner.value = state.meta.owner;
    els.metaType.value = state.meta.type;
    els.metaNotes.value = state.meta.notes;
    openSheet("metaSheet");
  }

  function saveMetaFromForm() {
    state.meta = {
      name: els.metaName.value.trim(),
      owner: els.metaOwner.value.trim(),
      type: els.metaType.value,
      notes: els.metaNotes.value.trim(),
    };
    closeSheet("metaSheet");
    toast("Info lahan disimpan");
  }

  function buildFeatureFromActive() {
    if (state.points.length < 3) return null;
    const ring = state.points.map((p) => [p.lng, p.lat]);
    // close ring
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }
    const area = polygonArea(state.points);
    const perim = perimeter(state.points, true);
    const vertices = state.points.map((p, i) => ({
      index: i + 1,
      lat: p.lat,
      lng: p.lng,
      accuracy_m: p.accuracy,
      altitude_m: p.altitude,
      timestamp: p.timestamp,
      source: p.source,
    }));
    return {
      type: "Feature",
      properties: {
        id: uid(),
        name: state.meta.name || "Lahan tanpa nama",
        owner: state.meta.owner || "",
        land_type: state.meta.type,
        notes: state.meta.notes || "",
        area_m2: Math.round(area * 100) / 100,
        area_ha: roundHa(area),
        area_unit: "Ha",
        perimeter_m: Math.round(perim * 100) / 100,
        vertex_count: state.points.length,
        vertices,
        created_at: new Date().toISOString(),
        app: APP_NAME,
        crs_note: "WGS84 (EPSG:4326)",
      },
      geometry: {
        type: "Polygon",
        coordinates: [ring],
      },
    };
  }

  function saveActiveParcel() {
    if (state.points.length < 3) {
      toast("Butuh minimal 3 titik", true);
      return;
    }
    if (!state.closed) {
      state.closed = true;
      redraw();
    }
    if (!state.meta.name) {
      closeAllSheets();
      openMeta();
      toast("Isi nama lahan dulu, lalu simpan lagi");
      return;
    }
    const feature = buildFeatureFromActive();
    if (!feature) return;
    state.parcels.push(feature);
    saveParcels();
    renderParcelsOnMap();
    // reset active drawing
    state.points = [];
    state.closed = false;
    state.meta = { name: "", owner: "", type: "pertanian", notes: "" };
    redraw();
    setStatus("Lahan disimpan");
    toast("Lahan disimpan ke daftar");
    closeAllSheets();
  }

  // ---------- GeoJSON export / import ----------
  function featureCollection(features) {
    return {
      type: "FeatureCollection",
      name: APP_NAME,
      crs: {
        type: "name",
        properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" },
      },
      features,
    };
  }

  function downloadGeoJSON(obj, filename) {
    const text = JSON.stringify(obj, null, 2);
    const blob = new Blob([text], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("File diunduh: " + filename);
  }

  /** Sanitize land name for filenames: polygon_<nama_lahan>.geojson */
  function slugLandName(name) {
    let s = String(name || "lahan")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, ""); // strip accents
    s = s
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    if (!s) s = "lahan";
    return s.slice(0, 60);
  }

  function polygonFilename(landName) {
    return "polygon_" + slugLandName(landName) + ".geojson";
  }

  function exportActive() {
    const f = buildFeatureFromActive();
    if (!f) {
      toast("Belum ada poligon aktif (min. 3 titik)", true);
      return;
    }
    const fname = polygonFilename(f.properties.name || state.meta.name || "lahan");
    downloadGeoJSON(featureCollection([f]), fname);
  }

  function exportAll() {
    if (!state.parcels.length) {
      toast("Belum ada lahan tersimpan", true);
      return;
    }
    // Single parcel → polygon_<nama>.geojson; many → polygon_semua_<tanggal>.geojson
    if (state.parcels.length === 1) {
      const n = state.parcels[0].properties && state.parcels[0].properties.name;
      downloadGeoJSON(featureCollection(state.parcels), polygonFilename(n || "lahan"));
      return;
    }
    downloadGeoJSON(
      featureCollection(state.parcels),
      "polygon_semua_" + dateStamp() + ".geojson"
    );
  }

  function dateStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() +
      p(d.getMonth() + 1) +
      p(d.getDate()) +
      "_" +
      p(d.getHours()) +
      p(d.getMinutes())
    );
  }

  async function copyActiveGeoJSON() {
    let obj;
    const f = buildFeatureFromActive();
    if (f) obj = featureCollection([f]);
    else if (state.parcels.length) obj = featureCollection(state.parcels);
    else {
      toast("Tidak ada data untuk disalin", true);
      return;
    }
    const text = JSON.stringify(obj, null, 2);
    els.geojsonPreview.hidden = false;
    els.geojsonPreview.textContent = text.slice(0, 2000) + (text.length > 2000 ? "\n…" : "");
    try {
      await navigator.clipboard.writeText(text);
      toast("GeoJSON disalin ke clipboard");
    } catch (_) {
      toast("Gagal salin otomatis — salin manual dari pratinjau", true);
    }
  }

  function getImportMode() {
    const el = document.querySelector('input[name="importMode"]:checked');
    return (el && el.value) || "append";
  }

  function showImportResult(html, isError) {
    if (!els.importResult) return;
    els.importResult.hidden = false;
    els.importResult.classList.toggle("error", !!isError);
    els.importResult.innerHTML = html;
  }

  function openImportSheet() {
    if (els.importResult) {
      els.importResult.hidden = true;
      els.importResult.innerHTML = "";
    }
    openSheet("importSheet");
  }

  function enrichFeature(f) {
    if (!f.properties) f.properties = {};
    const p = f.properties;
    // Normalize common field aliases (BSRE / shapefile exports)
    if (!p.id) p.id = uid();
    if (!p.name) {
      p.name =
        p.NAME ||
        p.Name ||
        p.nama ||
        p.ID ||
        p.id ||
        p.FID ||
        "Impor lahan";
    }
    // HA property often already in hectares
    if (p.area_ha == null && p.HA != null && p.HA !== "") {
      const ha = Number(p.HA);
      if (isFinite(ha)) {
        p.area_ha = ha;
        p.area_m2 = Math.round(ha * 10000 * 100) / 100;
        p.area_unit = "Ha";
      }
    }
    if (p.area_ha == null && p.ha != null && p.ha !== "") {
      const ha = Number(p.ha);
      if (isFinite(ha)) {
        p.area_ha = ha;
        p.area_m2 = Math.round(ha * 10000 * 100) / 100;
        p.area_unit = "Ha";
      }
    }

    if (f.geometry && f.geometry.type === "Polygon") {
      const ring = f.geometry.coordinates[0] || [];
      const pts = [];
      for (let i = 0; i < ring.length; i++) {
        const c = ring[i];
        if (
          i === ring.length - 1 &&
          ring.length > 1 &&
          c[0] === ring[0][0] &&
          c[1] === ring[0][1]
        ) {
          break;
        }
        pts.push({ lat: c[1], lng: c[0] });
      }
      if (pts.length >= 3) {
        if (p.area_m2 == null || p.area_ha == null) {
          const area = polygonArea(pts);
          p.area_m2 = Math.round(area * 100) / 100;
          p.area_ha = roundHa(area);
          p.area_unit = "Ha";
        }
        p.perimeter_m = Math.round(perimeter(pts, true) * 100) / 100;
        p.vertex_count = pts.length;
      }
    }
    return f;
  }

  function clearDatasetLayer() {
    datasetLayer.clearLayers();
    bsreLoaded = false;
    bsreFeatureCount = 0;
    bsreFeatures = [];
    bsreLayerIndex = {};
    bsreIdIndex = {};
    clearBsreHighlight();
    clearRadar();
    hideBsreSearchUI();
    updateBsreLabel();
    updateBsreSearchMenu();
    updateMarkMenuLabel();
  }

  // ---------- Permanent ID marks (dark red) ----------
  function loadMarkedIds() {
    try {
      const raw = localStorage.getItem(MARKED_IDS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      markedIds = new Set(
        (Array.isArray(arr) ? arr : [])
          .map((x) => String(x || "").trim())
          .filter(Boolean)
      );
    } catch (_) {
      markedIds = new Set();
    }
    updateMarkMenuLabel();
  }

  function saveMarkedIds() {
    try {
      localStorage.setItem(MARKED_IDS_KEY, JSON.stringify(Array.from(markedIds)));
    } catch (_) {
      toast("Gagal menyimpan tanda ke perangkat", true);
    }
    updateMarkMenuLabel();
  }

  function normalizeIdKey(id) {
    return String(id || "").trim().toLowerCase();
  }

  function isIdMarked(id) {
    const key = normalizeIdKey(id);
    if (!key) return false;
    for (const m of markedIds) {
      if (normalizeIdKey(m) === key) return true;
    }
    return false;
  }

  function getMarkedCanonical(id) {
    const key = normalizeIdKey(id);
    for (const m of markedIds) {
      if (normalizeIdKey(m) === key) return m;
    }
    return null;
  }

  function parseIdList(text) {
    return String(text || "")
      .split(/[\s,;|]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function buildBsreIdIndex(features) {
    bsreIdIndex = {};
    features.forEach((f, idx) => {
      const id = featureIdOf(f);
      if (!id) return;
      const key = normalizeIdKey(id);
      if (!bsreIdIndex[key]) bsreIdIndex[key] = [];
      bsreIdIndex[key].push(idx);
    });
  }

  function updateMarkMenuLabel() {
    const n = markedIds.size;
    if (els.markIdsMenuLabel) {
      els.markIdsMenuLabel.textContent =
        n > 0
          ? `${n.toLocaleString("id-ID")} ID tertandai (merah gelap)`
          : "Tanda merah gelap permanen (multi-ID)";
    }
    if (els.markCount) els.markCount.textContent = String(n);
    updateLocateRedButton();
  }

  function updateLocateRedButton() {
    const n = markedIds.size;
    if (els.locateRedCount) els.locateRedCount.textContent = String(n);
    if (els.btnLocateRed) {
      // Show when there is at least one mark (works even before BSRE load)
      els.btnLocateRed.hidden = n === 0;
      els.btnLocateRed.classList.toggle("active", radarActive);
    }
  }

  function clearRadar() {
    radarLayer.clearLayers();
    radarActive = false;
    if (radarTimer) {
      clearTimeout(radarTimer);
      radarTimer = null;
    }
    if (els.btnLocateRed) els.btnLocateRed.classList.remove("active");
  }

  function getMarkedFeatureEntries() {
    const entries = [];
    markedIds.forEach((id) => {
      const key = normalizeIdKey(id);
      const idxs = bsreIdIndex[key] || [];
      if (!idxs.length) return;
      idxs.forEach((idx) => {
        const f = bsreFeatures[idx];
        if (f) entries.push({ id, idx, f });
      });
    });
    return entries;
  }

  function addRadarAt(latlng, idLabel) {
    // Animated CSS blip (visible at any zoom)
    const icon = L.divIcon({
      className: "radar-blip",
      html:
        '<div class="radar-blip-inner">' +
        '<span class="radar-blip-wave"></span>' +
        '<span class="radar-blip-wave delay"></span>' +
        '<span class="radar-blip-core"></span>' +
        (idLabel
          ? '<span class="radar-blip-label">' +
            escapeHtml(String(idLabel)) +
            "</span>"
          : "") +
        "</div>",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    L.marker(latlng, {
      icon,
      interactive: false,
      zIndexOffset: 1200,
      keyboard: false,
    }).addTo(radarLayer);

    // Expanding geographic rings (helps when zoomed out — scales with map)
    const baseRadius = 40; // meters
    [1, 2.4, 4.2].forEach((mult, i) => {
      const c = L.circle(latlng, {
        radius: baseRadius * mult,
        className: "radar-circle-wave",
        color: "#ef4444",
        weight: 2,
        fillColor: "#ef4444",
        fillOpacity: 0.06,
        opacity: 0.55 - i * 0.12,
        interactive: false,
      }).addTo(radarLayer);
      // pulse radius a few times
      let step = 0;
      const maxSteps = 8;
      const iv = setInterval(() => {
        step++;
        try {
          c.setRadius(baseRadius * mult * (1 + step * 0.35));
          c.setStyle({
            opacity: Math.max(0.05, 0.55 - i * 0.12 - step * 0.06),
            fillOpacity: Math.max(0.01, 0.08 - step * 0.008),
          });
        } catch (_) {}
        if (step >= maxSteps) clearInterval(iv);
      }, 280);
    });
  }

  /**
   * Locate Red: fit map to all dark-red marked parcels and show radar pings.
   */
  function locateRedMarks() {
    if (!markedIds.size) {
      toast("Belum ada ID tertandai merah", true);
      openMarkSheet();
      return;
    }

    if (!bsreLoaded) {
      toast("Muat data BSRE dulu agar tanda merah tampil di peta", true);
      return;
    }

    const entries = getMarkedFeatureEntries();
    if (!entries.length) {
      toast(
        "ID tertandai tidak ada di data BSRE yang dimuat (" +
          markedIds.size +
          " tersimpan)",
        true
      );
      openMarkSheet();
      return;
    }

    clearRadar();
    radarActive = true;
    if (els.btnLocateRed) els.btnLocateRed.classList.add("active");

    const boundsPts = [];
    const seenIdx = new Set();

    entries.forEach(({ id, idx, f }) => {
      if (seenIdx.has(idx)) return;
      seenIdx.add(idx);

      // Ensure polygon style is marked + on top
      applyMarkStyleToLayers(id, true);

      const b = getFeatureBounds(f);
      if (b && b.isValid()) {
        boundsPts.push(b.getSouthWest(), b.getNorthEast());
        const center = b.getCenter();
        addRadarAt([center.lat, center.lng], id);
      } else {
        // fallback centroid from ring
        const g = f.geometry;
        const ring =
          g.type === "Polygon"
            ? g.coordinates[0]
            : g.type === "MultiPolygon"
              ? g.coordinates[0][0]
              : null;
        if (ring && ring.length) {
          const pts = ringToLatLngs(ring);
          const c = centroid(pts);
          if (c) {
            boundsPts.push([c.lat, c.lng]);
            addRadarAt([c.lat, c.lng], id);
          }
        }
      }
    });

    if (boundsPts.length) {
      try {
        const b = L.latLngBounds(boundsPts);
        map.fitBounds(b, {
          padding: [50, 50],
          maxZoom: entries.length === 1 ? 17 : 15,
          animate: true,
        });
      } catch (_) {}
    }

    const n = seenIdx.size;
    setStatus("Locate Red · " + n + " tanda");
    toast(
      "Radar aktif: " +
        n +
        " bidang merah" +
        (markedIds.size > n ? " (" + markedIds.size + " ID tersimpan)" : "")
    );

    // Auto-stop radar animation after 20s (marks stay red)
    if (radarTimer) clearTimeout(radarTimer);
    radarTimer = setTimeout(() => {
      clearRadar();
      setStatus(
        bsreLoaded
          ? "BSRE · " + bsreFeatureCount.toLocaleString("id-ID") + " bidang"
          : "Siap memetakan"
      );
    }, 20000);
  }

  function styleForId(id) {
    return isIdMarked(id) ? MARK_STYLE : BSRE_STYLE;
  }

  function applyMarkStyleToLayers(id, marked) {
    const key = normalizeIdKey(id);
    const idxs = bsreIdIndex[key] || [];
    const style = marked ? MARK_STYLE : BSRE_STYLE;
    idxs.forEach((idx) => {
      const layers = bsreLayerIndex[idx] || [];
      layers.forEach((poly) => {
        poly.setStyle({
          color: style.color,
          fillColor: style.fillColor,
          weight: style.weight,
          opacity: style.opacity,
          fillOpacity: style.fillOpacity,
        });
        if (marked && poly.bringToFront) {
          try {
            poly.bringToFront();
          } catch (_) {}
        }
      });
    });
    return idxs.length;
  }

  function applyAllMarkStyles() {
    if (!bsreLoaded) return;
    // Reset all to default then paint marks (safer with large sets: paint only marks)
    Object.keys(bsreLayerIndex).forEach((idx) => {
      const f = bsreFeatures[idx];
      const id = featureIdOf(f);
      const style = styleForId(id);
      (bsreLayerIndex[idx] || []).forEach((poly) => {
        poly.setStyle({
          color: style.color,
          fillColor: style.fillColor,
          weight: style.weight,
          opacity: style.opacity,
          fillOpacity: style.fillOpacity,
        });
      });
    });
    // Bring marked to front
    markedIds.forEach((id) => applyMarkStyleToLayers(id, true));
  }

  function openMarkSheet() {
    renderMarkedIdsList();
    if (els.markActionResult) {
      els.markActionResult.hidden = true;
      els.markActionResult.innerHTML = "";
    }
    openSheet("markSheet");
    if (els.markIdsInput) {
      setTimeout(() => els.markIdsInput.focus(), 200);
    }
  }

  function renderMarkedIdsList() {
    const box = els.markedIdsList;
    if (!box) return;
    updateMarkMenuLabel();
    const ids = Array.from(markedIds).sort((a, b) =>
      a.localeCompare(b, "id", { sensitivity: "base" })
    );
    if (!ids.length) {
      box.innerHTML =
        '<div class="empty-state" style="padding:16px 8px">Belum ada ID tertandai.</div>';
      return;
    }
    box.innerHTML = ids
      .map((id) => {
        const onMap = bsreLoaded && (bsreIdIndex[normalizeIdKey(id)] || []).length > 0;
        return (
          `<div class="marked-id-row">` +
          `<div class="marked-id-main">` +
          `<span class="marked-id-dot"></span>` +
          `<span class="marked-id-text">${escapeHtml(id)}</span>` +
          (onMap
            ? '<span class="marked-id-badge">di peta</span>'
            : bsreLoaded
              ? '<span class="marked-id-badge muted">tidak di BSRE</span>'
              : "") +
          `</div>` +
          `<div class="marked-id-actions">` +
          `<button type="button" data-focus-mark="${escapeHtml(id)}" ${
            onMap ? "" : "disabled"
          }>Lihat</button>` +
          `<button type="button" class="danger" data-unmark="${escapeHtml(
            id
          )}">Hapus</button>` +
          `</div></div>`
        );
      })
      .join("");

    box.querySelectorAll("[data-unmark]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-unmark");
        unmarkIds([id]);
        renderMarkedIdsList();
        toast("Tanda dihapus: " + id);
      });
    });
    box.querySelectorAll("[data-focus-mark]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-focus-mark");
        focusMarkedId(id);
      });
    });
  }

  function focusMarkedId(id) {
    const key = normalizeIdKey(id);
    const idxs = bsreIdIndex[key] || [];
    if (!idxs.length) {
      toast("ID belum ada di data BSRE yang dimuat", true);
      return;
    }
    focusBsreFeature(idxs[0], { silent: false });
    closeSheet("markSheet");
  }

  /**
   * mode: 'toggle' | 'mark' | 'unmark'
   */
  function processMarkInput(mode) {
    const raw = (els.markIdsInput && els.markIdsInput.value) || "";
    const list = parseIdList(raw);
    if (!list.length) {
      toast("Masukkan minimal 1 ID", true);
      return;
    }

    // unique by normalized key, keep first casing
    const seen = new Map();
    list.forEach((id) => {
      const k = normalizeIdKey(id);
      if (!seen.has(k)) seen.set(k, id);
    });

    let marked = 0;
    let unmarked = 0;
    let missing = 0;
    const actions = [];

    seen.forEach((id, key) => {
      const already = isIdMarked(id);
      // Prefer canonical ID from dataset if available
      let canonical = id;
      const idxs = bsreIdIndex[key] || [];
      if (idxs.length) {
        const fromData = featureIdOf(bsreFeatures[idxs[0]]);
        if (fromData) canonical = fromData;
      } else if (bsreLoaded) {
        missing++;
      }

      if (mode === "mark") {
        if (!already) {
          markedIds.add(canonical);
          applyMarkStyleToLayers(canonical, true);
          marked++;
          actions.push("+" + canonical);
        }
      } else if (mode === "unmark") {
        if (already) {
          const prev = getMarkedCanonical(id);
          markedIds.delete(prev);
          applyMarkStyleToLayers(prev || canonical, false);
          unmarked++;
          actions.push("-" + (prev || canonical));
        }
      } else {
        // toggle
        if (already) {
          const prev = getMarkedCanonical(id);
          markedIds.delete(prev);
          applyMarkStyleToLayers(prev || canonical, false);
          unmarked++;
          actions.push("-" + (prev || canonical));
        } else {
          markedIds.add(canonical);
          applyMarkStyleToLayers(canonical, true);
          marked++;
          actions.push("+" + canonical);
        }
      }
    });

    saveMarkedIds();
    renderMarkedIdsList();

    if (els.markIdsInput) els.markIdsInput.value = "";

    const parts = [];
    if (marked) parts.push(marked + " ditandai");
    if (unmarked) parts.push(unmarked + " dihapus");
    if (missing) parts.push(missing + " tidak ada di BSRE (tetap disimpan)");
    if (!parts.length) parts.push("Tidak ada perubahan");

    const msg = parts.join(" · ");
    toast(msg);
    if (els.markActionResult) {
      els.markActionResult.hidden = false;
      els.markActionResult.classList.remove("error");
      els.markActionResult.innerHTML =
        `<strong>${escapeHtml(msg)}</strong>` +
        (actions.length
          ? `<br><small>${escapeHtml(actions.slice(0, 12).join(", "))}${
              actions.length > 12 ? "…" : ""
            }</small>`
          : "");
    }

    // If BSRE loaded and we marked something, fit to those polygons
    if (bsreLoaded && marked > 0) {
      const bpts = [];
      seen.forEach((id, key) => {
        if (!isIdMarked(id)) return;
        (bsreIdIndex[key] || []).forEach((idx) => {
          const f = bsreFeatures[idx];
          const b = getFeatureBounds(f);
          if (b) {
            bpts.push(b.getSouthWest(), b.getNorthEast());
          }
        });
      });
      if (bpts.length) {
        try {
          map.fitBounds(bpts, { padding: [40, 40], maxZoom: 17 });
        } catch (_) {}
      }
    }
  }

  function unmarkIds(ids) {
    ids.forEach((id) => {
      const prev = getMarkedCanonical(id);
      if (!prev) return;
      markedIds.delete(prev);
      applyMarkStyleToLayers(prev, false);
    });
    saveMarkedIds();
    updateMarkMenuLabel();
  }

  function clearAllMarks() {
    if (!markedIds.size) return;
    if (!confirm("Hapus semua tanda merah (" + markedIds.size + " ID)?")) return;
    const all = Array.from(markedIds);
    markedIds.clear();
    all.forEach((id) => applyMarkStyleToLayers(id, false));
    clearRadar();
    saveMarkedIds();
    renderMarkedIdsList();
    toast("Semua tanda dihapus");
  }

  function clearBsreHighlight() {
    if (bsreHighlightLayer) {
      try {
        map.removeLayer(bsreHighlightLayer);
      } catch (_) {}
      bsreHighlightLayer = null;
    }
  }

  function hideBsreSearchUI() {
    if (els.bsreSearchBar) els.bsreSearchBar.hidden = true;
    if (els.bsreSearchResults) {
      els.bsreSearchResults.hidden = true;
      els.bsreSearchResults.innerHTML = "";
    }
    if (els.bsreSearchInput) els.bsreSearchInput.value = "";
    if (els.btnBsreSearchClear) els.btnBsreSearchClear.hidden = true;
    document.getElementById("app")?.classList.remove("bsre-search-on");
  }

  function showBsreSearchUI() {
    if (els.bsreSearchBar) els.bsreSearchBar.hidden = false;
    document.getElementById("app")?.classList.add("bsre-search-on");
    updateBsreSearchMenu();
  }

  function updateBsreSearchMenu() {
    if (els.btnSearchBsre) {
      els.btnSearchBsre.disabled = !bsreLoaded;
    }
    if (els.bsreSearchMenuLabel) {
      els.bsreSearchMenuLabel.textContent = bsreLoaded
        ? `${bsreFeatureCount.toLocaleString("id-ID")} bidang siap dicari by ID`
        : "Muat data BSRE dulu, lalu cari by ID";
    }
  }

  function featureIdOf(f) {
    const p = (f && f.properties) || {};
    return String(p.id || p.ID || p.Id || p.name || "").trim();
  }

  function featureHaText(f) {
    const p = (f && f.properties) || {};
    const ha =
      p.area_ha != null
        ? Number(p.area_ha)
        : p.HA != null
          ? Number(p.HA)
          : null;
    if (ha != null && isFinite(ha)) return formatHa(ha * 10000);
    return "—";
  }

  /** Search BSRE features by ID (exact first, then substring). Max 30 hits. */
  function searchBsreById(query) {
    const q = String(query || "")
      .trim()
      .toLowerCase();
    if (!q || !bsreFeatures.length) return [];

    const exact = [];
    const starts = [];
    const contains = [];

    bsreFeatures.forEach((f, idx) => {
      const id = featureIdOf(f).toLowerCase();
      if (!id) return;
      if (id === q) exact.push({ f, idx, id: featureIdOf(f) });
      else if (id.startsWith(q)) starts.push({ f, idx, id: featureIdOf(f) });
      else if (id.includes(q)) contains.push({ f, idx, id: featureIdOf(f) });
    });

    return exact.concat(starts, contains).slice(0, 30);
  }

  function getFeatureBounds(f) {
    const g = f && f.geometry;
    if (!g) return null;
    const pts = [];
    const walk = (coords) => {
      if (!coords || !coords.length) return;
      if (typeof coords[0] === "number") {
        pts.push([coords[1], coords[0]]);
        return;
      }
      coords.forEach(walk);
    };
    walk(g.coordinates);
    if (pts.length < 2) return null;
    try {
      return L.latLngBounds(pts);
    } catch (_) {
      return null;
    }
  }

  function focusBsreFeature(idx, opts) {
    opts = opts || {};
    const f = bsreFeatures[idx];
    if (!f) {
      toast("Bidang tidak ditemukan", true);
      return;
    }
    const id = featureIdOf(f) || "Bidang";
    const bounds = getFeatureBounds(f);
    clearBsreHighlight();

    // Draw highlight outline on top
    try {
      const g = f.geometry;
      const rings =
        g.type === "Polygon"
          ? [g.coordinates]
          : g.type === "MultiPolygon"
            ? g.coordinates
            : [];
      const layers = [];
      rings.forEach((polyCoords) => {
        const latlngs = (polyCoords[0] || []).map((c) => [c[1], c[0]]);
        if (latlngs.length < 3) return;
        layers.push(
          L.polygon(latlngs, {
            color: "#22d3ee",
            weight: 4,
            opacity: 1,
            fillColor: "#22d3ee",
            fillOpacity: 0.28,
            interactive: true,
          })
        );
      });
      if (layers.length) {
        bsreHighlightLayer = L.featureGroup(layers).addTo(map);
        const destId = "dest_hit_" + idx;
        bsreHighlightLayer.bindPopup(
          `<div class="ds-popup">` +
            `<strong>${escapeHtml(id)}</strong><br>` +
            `Luas: <strong>${escapeHtml(featureHaText(f))}</strong>` +
            `<div class="popup-actions">` +
            `<button type="button" class="popup-dest-btn" data-dest-id="${destId}">Set as destination</button>` +
            `<button type="button" class="popup-edit-btn" data-dest-id="${destId}">Edit di Geopatok</button>` +
            `</div></div>`
        );
        bsreHighlightLayer.on("popupopen", () => {
          const destBtn = document.querySelector(
            `.popup-dest-btn[data-dest-id="${destId}"]`
          );
          if (destBtn) {
            destBtn.onclick = () => {
              const ring =
                f.geometry.type === "Polygon"
                  ? f.geometry.coordinates[0]
                  : f.geometry.coordinates[0][0];
              const latlngs = (ring || []).map((c) => [c[1], c[0]]);
              destinationFromPolygonLatLngs(latlngs, id);
            };
          }
          const editBtn = document.querySelector(
            `.popup-edit-btn[data-dest-id="${destId}"]`
          );
          if (editBtn) {
            editBtn.onclick = () => {
              const polyCoords =
                f.geometry.type === "Polygon"
                  ? f.geometry.coordinates
                  : f.geometry.coordinates[0];
              const asFeature = {
                type: "Feature",
                properties: { ...(f.properties || {}), name: id },
                geometry: { type: "Polygon", coordinates: polyCoords },
              };
              enrichFeature(asFeature);
              loadFeatureAsActive(asFeature);
              map.closePopup();
              toast("Bidang dibuka sebagai gambar aktif");
            };
          }
        });
      }
    } catch (e) {
      console.warn(e);
    }

    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
    }

    // Open popup after pan
    setTimeout(() => {
      if (bsreHighlightLayer) bsreHighlightLayer.openPopup();
    }, 280);

    if (els.bsreSearchResults) {
      els.bsreSearchResults.hidden = true;
    }
    setStatus("BSRE · " + id);
    if (!opts.silent) toast("Ditemukan: " + id);
  }

  function renderBsreSearchResults(hits, query) {
    const box = els.bsreSearchResults;
    if (!box) return;
    if (!query) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    if (!hits.length) {
      box.hidden = false;
      box.innerHTML =
        '<div class="bsre-empty">Tidak ada ID yang cocok dengan <strong>' +
        escapeHtml(query) +
        "</strong></div>";
      return;
    }
    box.hidden = false;
    box.innerHTML = hits
      .map((h) => {
        const ha = featureHaText(h.f);
        return (
          `<button type="button" class="bsre-hit" data-bsre-idx="${h.idx}">` +
          `<span class="bsre-hit-id">${escapeHtml(h.id)}</span>` +
          `<span class="bsre-hit-ha">${escapeHtml(ha)}</span>` +
          `</button>`
        );
      })
      .join("");

    box.querySelectorAll(".bsre-hit").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-bsre-idx"), 10);
        focusBsreFeature(idx);
      });
    });
  }

  function runBsreSearch(fromSubmit) {
    if (!bsreLoaded) {
      toast("Muat data BSRE dulu", true);
      return;
    }
    const q = (els.bsreSearchInput && els.bsreSearchInput.value) || "";
    if (els.btnBsreSearchClear) {
      els.btnBsreSearchClear.hidden = !String(q).trim();
    }
    const hits = searchBsreById(q);
    renderBsreSearchResults(hits, String(q).trim());

    // On submit / Enter: jump to best match if any
    if (fromSubmit && hits.length) {
      focusBsreFeature(hits[0].idx);
    } else if (fromSubmit && String(q).trim() && !hits.length) {
      toast("ID tidak ditemukan", true);
    }
  }

  // ---------- Navigation / routing ----------
  function formatDuration(sec) {
    if (sec == null || !isFinite(sec)) return "—";
    sec = Math.round(sec);
    if (sec < 60) return sec + " dtk";
    const m = Math.round(sec / 60);
    if (m < 60) return m + " mnt";
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return h + " jam " + rm + " mnt";
  }

  function ringToLatLngs(ring) {
    const pts = [];
    for (let i = 0; i < ring.length; i++) {
      const c = ring[i];
      if (
        i === ring.length - 1 &&
        ring.length > 1 &&
        c[0] === ring[0][0] &&
        c[1] === ring[0][1]
      ) {
        break;
      }
      pts.push({ lat: c[1], lng: c[0] });
    }
    return pts;
  }

  /** Nearest point on polygon ring to origin (for destination pin) */
  function nearestPointOnRing(origin, ringPts) {
    if (!ringPts.length) return null;
    let best = ringPts[0];
    let bestD = Infinity;
    ringPts.forEach((p) => {
      const d = haversine(origin, p);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    });
    // also consider centroid if closer (inside parcel approach)
    const c = centroid(ringPts);
    if (c) {
      const dC = haversine(origin, c);
      // prefer edge if user is outside; centroid ok if roughly closer / inside-ish
      if (dC + 8 < bestD) return c;
    }
    return best;
  }

  function getUserLatLng() {
    if (!state.lastPosition) return null;
    return {
      lat: state.lastPosition.coords.latitude,
      lng: state.lastPosition.coords.longitude,
    };
  }

  function ensureUserPosition() {
    return new Promise((resolve, reject) => {
      const cur = getUserLatLng();
      if (cur) {
        resolve(cur);
        return;
      }
      if (!navigator.geolocation) {
        reject(new Error("GPS tidak didukung"));
        return;
      }
      setStatus("Mencari lokasi untuk rute…");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          state.lastPosition = pos;
          showUserPosition(pos);
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => reject(new Error("Lokasi tidak tersedia")),
        geoOptions()
      );
    });
  }

  function updateRouteBar() {
    if (!els.routeBar) return;
    const appEl = document.getElementById("app");
    if (!routeState.active) {
      els.routeBar.hidden = true;
      if (appEl) appEl.classList.remove("route-on");
      return;
    }
    els.routeBar.hidden = false;
    if (appEl) appEl.classList.add("route-on");
    els.routeDestName.textContent = routeState.name || "Tujuan lahan";
    if (routeState.loading) {
      els.routeMeta.textContent = "Menghitung rute…";
    } else if (routeState.distance_m != null) {
      const via =
        routeState.provider === "osrm"
          ? routeState.mode === "walking"
            ? "jalan kaki"
            : "kendaraan"
          : "garis lurus";
      els.routeMeta.textContent =
        formatKm(routeState.distance_m) +
        " · " +
        formatDuration(routeState.duration_s) +
        " · " +
        via;
    } else {
      els.routeMeta.textContent = "Rute siap";
    }
    if (els.btnRouteMode) {
      els.btnRouteMode.textContent =
        routeState.mode === "walking" ? "Kaki" : "Mobil";
    }
  }

  function clearRoute() {
    if (routeAbort) {
      try {
        routeAbort.abort();
      } catch (_) {}
      routeAbort = null;
    }
    routeLayer.clearLayers();
    routeLine = null;
    destMarker = null;
    routeState = {
      active: false,
      loading: false,
      name: "",
      dest: null,
      mode: routeState.mode || "driving",
      distance_m: null,
      duration_s: null,
      provider: null,
    };
    const appEl = document.getElementById("app");
    if (appEl) appEl.classList.remove("route-on");
    updateRouteBar();
  }

  function showDestinationMarker(dest, name) {
    if (destMarker) {
      destMarker.setLatLng([dest.lat, dest.lng]);
    } else {
      destMarker = L.marker([dest.lat, dest.lng], {
        icon: L.divIcon({
          className: "dest-marker",
          iconSize: [22, 22],
          iconAnchor: [11, 22],
        }),
        zIndexOffset: 900,
        title: name || "Tujuan",
      }).addTo(routeLayer);
    }
    destMarker.bindTooltip(name || "Tujuan", {
      permanent: false,
      direction: "top",
    });
  }

  function drawRouteLatLngs(latlngs, style) {
    if (routeLine) {
      routeLayer.removeLayer(routeLine);
      routeLine = null;
    }
    routeLine = L.polyline(latlngs, {
      color: (style && style.color) || "#3b82f6",
      weight: 5,
      opacity: 0.9,
      lineJoin: "round",
      lineCap: "round",
      dashArray: style && style.dash ? "8 10" : null,
    }).addTo(routeLayer);
  }

  async function fetchOsrmRoute(from, to, mode) {
    const profile = mode === "walking" ? "foot" : "driving";
    // Public OSRM demo — fine for MVP; production should self-host / paid router
    const url =
      "https://router.project-osrm.org/route/v1/" +
      profile +
      "/" +
      from.lng +
      "," +
      from.lat +
      ";" +
      to.lng +
      "," +
      to.lat +
      "?overview=full&geometries=geojson&steps=false";

    if (routeAbort) {
      try {
        routeAbort.abort();
      } catch (_) {}
    }
    routeAbort = new AbortController();
    const timer = setTimeout(() => routeAbort.abort(), 15000);
    try {
      const res = await fetch(url, { signal: routeAbort.signal });
      if (!res.ok) throw new Error("OSRM HTTP " + res.status);
      const data = await res.json();
      if (data.code !== "Ok" || !data.routes || !data.routes[0]) {
        throw new Error(data.message || "Tidak ada rute");
      }
      const r = data.routes[0];
      const coords = (r.geometry.coordinates || []).map((c) => [c[1], c[0]]);
      return {
        latlngs: coords,
        distance_m: r.distance,
        duration_s: r.duration,
        provider: "osrm",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function straightRoute(from, to) {
    const d = haversine(from, to);
    // rough walking 5 km/h, driving 30 km/h rural
    const speed =
      routeState.mode === "walking" ? 5000 / 3600 : 30000 / 3600; // m/s
    return {
      latlngs: [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ],
      distance_m: d,
      duration_s: d / speed,
      provider: "straight",
    };
  }

  async function computeAndDrawRoute() {
    if (!routeState.dest) return;
    const from = await ensureUserPosition();
    const to = routeState.dest;
    routeState.loading = true;
    updateRouteBar();
    setStatus("Menghitung rute…");

    let result;
    try {
      result = await fetchOsrmRoute(from, to, routeState.mode);
    } catch (e) {
      console.warn("OSRM failed, straight line", e);
      result = straightRoute(from, to);
      toast(
        "Rute jalan tidak tersedia — menampilkan jarak garis lurus",
        true
      );
    }

    routeState.distance_m = result.distance_m;
    routeState.duration_s = result.duration_s;
    routeState.provider = result.provider;
    routeState.loading = false;

    drawRouteLatLngs(result.latlngs, {
      dash: result.provider === "straight",
      color: result.provider === "straight" ? "#f59e0b" : "#3b82f6",
    });
    showDestinationMarker(to, routeState.name);

    try {
      const b = L.latLngBounds(
        result.latlngs.map((ll) => L.latLng(ll[0], ll[1]))
      );
      b.extend([from.lat, from.lng]);
      b.extend([to.lat, to.lng]);
      map.fitBounds(b, { padding: [60, 60], maxZoom: 17 });
    } catch (_) {}

    updateRouteBar();
    setStatus(
      "Rute · " +
        formatKm(result.distance_m) +
        " · " +
        (routeState.name || "tujuan")
    );
  }

  async function setAsDestination(opts) {
    // opts: { name, latlngs: [[lat,lng],...] or ring [[lng,lat],...] , dest?: {lat,lng} }
    try {
      const from = await ensureUserPosition();
      let dest = opts.dest;
      if (!dest && opts.ringPts && opts.ringPts.length) {
        dest = nearestPointOnRing(from, opts.ringPts);
      }
      if (!dest && opts.latlngs && opts.latlngs.length) {
        const ringPts = opts.latlngs.map((ll) =>
          Array.isArray(ll)
            ? { lat: ll[0], lng: ll[1] }
            : { lat: ll.lat, lng: ll.lng }
        );
        dest = nearestPointOnRing(from, ringPts);
      }
      if (!dest) {
        toast("Titik tujuan tidak valid", true);
        return;
      }

      routeState.active = true;
      routeState.name = opts.name || "Tujuan lahan";
      routeState.dest = { lat: dest.lat, lng: dest.lng };
      routeState.distance_m = null;
      routeState.duration_s = null;
      routeState.provider = null;
      map.closePopup();
      showDestinationMarker(routeState.dest, routeState.name);
      updateRouteBar();
      toast("Tujuan diset: " + routeState.name);
      await computeAndDrawRoute();
    } catch (e) {
      toast(e.message || "Gagal set tujuan", true);
    }
  }

  function openInGoogleMaps() {
    if (!routeState.dest) return;
    const d = routeState.dest;
    const travel = routeState.mode === "walking" ? "walking" : "driving";
    let url =
      "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(d.lat + "," + d.lng) +
      "&travelmode=" +
      travel;
    const from = getUserLatLng();
    if (from) {
      url +=
        "&origin=" + encodeURIComponent(from.lat + "," + from.lng);
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function destinationFromPolygonLatLngs(latlngs, name) {
    const ringPts = latlngs.map((ll) =>
      Array.isArray(ll)
        ? { lat: ll[0], lng: ll[1] }
        : { lat: ll.lat, lng: ll.lng }
    );
    setAsDestination({ name: name, ringPts: ringPts });
  }

  function updateBsreLabel() {
    const el = $("bsreLoadLabel");
    if (!el) return;
    if (bsreLoading) el.textContent = "Memuat data BSRE…";
    else if (bsreLoaded)
      el.textContent = `Aktif · ${bsreFeatureCount.toLocaleString("id-ID")} bidang — ketuk lagi untuk lepas`;
    else el.textContent = "POLSH BSRE 1119 — 1.212 bidang lahan";
  }

  /**
   * Render a large FeatureCollection on the dedicated dataset layer.
   * Uses canvas + light styling; labels only when zoomed in & few on screen.
   */
  function renderDatasetFeatures(features, opts) {
    opts = opts || {};
    datasetLayer.clearLayers();
    clearBsreHighlight();
    bsreLayerIndex = {};
    buildBsreIdIndex(features);
    const boundsPts = [];

    features.forEach((f, idx) => {
      const g = f.geometry;
      if (!g) return;
      const props = f.properties || {};
      const name = props.name || props.id || "Bidang";
      const fid = featureIdOf(f) || String(name);
      const marked = isIdMarked(fid);
      const style = marked ? MARK_STYLE : BSRE_STYLE;
      const ha =
        props.area_ha != null
          ? props.area_ha
          : props.HA != null
            ? Number(props.HA)
            : null;
      const haText =
        ha != null && isFinite(ha)
          ? formatHa(Number(ha) * 10000)
          : "—";

      const rings =
        g.type === "Polygon"
          ? [g.coordinates]
          : g.type === "MultiPolygon"
            ? g.coordinates
            : [];

      bsreLayerIndex[idx] = [];

      rings.forEach((polyCoords) => {
        const latlngs = (polyCoords[0] || []).map((c) => {
          boundsPts.push([c[1], c[0]]);
          return [c[1], c[0]];
        });
        if (latlngs.length < 3) return;

        const poly = L.polygon(latlngs, {
          color: style.color,
          weight: style.weight,
          opacity: style.opacity,
          fillColor: style.fillColor,
          fillOpacity: style.fillOpacity,
          renderer: canvasRenderer,
          smoothFactor: 1.5,
        });
        const destId = "dest_ds_" + idx + "_" + Math.random().toString(36).slice(2, 7);
        const markBtnId = "mark_ds_" + destId;
        poly.bindPopup(
          `<div class="ds-popup">` +
            `<strong>${escapeHtml(String(name))}</strong><br>` +
            `Luas: <strong>${escapeHtml(haText)}</strong>` +
            (props.id && String(props.id) !== String(name)
              ? `<br>ID: ${escapeHtml(String(props.id))}`
              : "") +
            (marked
              ? `<br><span style="color:#fca5a5;font-weight:700">● Tertandai</span>`
              : "") +
            `<div class="popup-actions">` +
            `<button type="button" class="popup-dest-btn" data-dest-id="${destId}">Set as destination</button>` +
            `<button type="button" class="popup-mark-btn" data-mark-id="${markBtnId}" data-fid="${escapeHtml(
              fid
            )}">${marked ? "Hapus tanda merah" : "Tandai merah"}</button>` +
            `<button type="button" class="popup-edit-btn" data-ds-idx="${idx}" data-dest-id="${destId}">Edit di Geopatok</button>` +
            `</div></div>`
        );
        poly.on("popupopen", () => {
          const destBtn = document.querySelector(
            `.popup-dest-btn[data-dest-id="${destId}"]`
          );
          if (destBtn) {
            destBtn.onclick = () => {
              destinationFromPolygonLatLngs(latlngs, String(name));
            };
          }
          const markBtn = document.querySelector(
            `.popup-mark-btn[data-mark-id="${markBtnId}"]`
          );
          if (markBtn) {
            markBtn.onclick = () => {
              const id = markBtn.getAttribute("data-fid") || fid;
              if (isIdMarked(id)) {
                unmarkIds([id]);
                toast("Tanda dihapus: " + id);
              } else {
                const canonical = featureIdOf(f) || id;
                markedIds.add(canonical);
                applyMarkStyleToLayers(canonical, true);
                saveMarkedIds();
                toast("Ditandai: " + canonical);
              }
              map.closePopup();
            };
          }
          const btn = document.querySelector(
            `.popup-edit-btn[data-dest-id="${destId}"]`
          );
          if (btn) {
            btn.onclick = () => {
              const asFeature = {
                type: "Feature",
                properties: { ...props, name: String(name) },
                geometry: {
                  type: "Polygon",
                  coordinates: polyCoords,
                },
              };
              enrichFeature(asFeature);
              loadFeatureAsActive(asFeature);
              map.closePopup();
              toast("Bidang dibuka sebagai gambar aktif");
            };
          }
        });
        poly.addTo(datasetLayer);
        bsreLayerIndex[idx].push(poly);
      });
    });

    // Ensure marked polygons are visually on top
    markedIds.forEach((id) => applyMarkStyleToLayers(id, true));

    if (boundsPts.length && opts.fitBounds !== false) {
      try {
        map.fitBounds(boundsPts, { padding: [30, 30], maxZoom: 14 });
      } catch (_) {}
    }
    return features.length;
  }

  async function loadBsreDataset() {
    // Toggle off if already loaded
    if (bsreLoaded) {
      clearDatasetLayer();
      toast("Data BSRE dilepas dari peta");
      setStatus(routeState.active ? "Rute aktif" : "Siap memetakan");
      return;
    }
    if (bsreLoading) return;

    bsreLoading = true;
    updateBsreLabel();
    setStatus("Memuat data BSRE…");
    closeSheet("moreSheet");
    toast("Memuat POLSH BSRE 1119…");

    try {
      const res = await fetch(BSRE_DATASET.url, { cache: "force-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const features = normalizeImported(data).map(enrichFeature);
      if (!features.length) throw new Error("Tidak ada poligon");

      bsreFeatures = features;
      bsreFeatureCount = renderDatasetFeatures(features, {
        color: "#f59e0b",
      });
      bsreLoaded = true;
      showBsreSearchUI();
      setStatus(
        `BSRE · ${bsreFeatureCount.toLocaleString("id-ID")} bidang`
      );
      toast(
        `Data BSRE dimuat: ${bsreFeatureCount.toLocaleString("id-ID")} bidang — cari by ID di atas`
      );
    } catch (e) {
      console.error(e);
      bsreLoaded = false;
      bsreFeatures = [];
      hideBsreSearchUI();
      toast("Gagal memuat data BSRE", true);
      setStatus("Gagal muat BSRE");
    } finally {
      bsreLoading = false;
      updateBsreLabel();
      updateBsreSearchMenu();
    }
  }

  function fitFeatures(features) {
    const all = [];
    features.forEach((p) => {
      const g = p.geometry;
      if (!g) return;
      if (g.type === "Polygon") {
        (g.coordinates[0] || []).forEach((c) => all.push([c[1], c[0]]));
      }
    });
    if (all.length) {
      try {
        map.fitBounds(all, { padding: [48, 48], maxZoom: 19 });
      } catch (_) {}
    }
  }

  /** Load first polygon into the active drawing editor */
  function loadFeatureAsActive(feature) {
    if (state.walkMode) stopWalkMode();
    const ring = feature.geometry.coordinates[0] || [];
    const pts = [];
    for (let i = 0; i < ring.length; i++) {
      const c = ring[i];
      if (
        i === ring.length - 1 &&
        ring.length > 1 &&
        c[0] === ring[0][0] &&
        c[1] === ring[0][1]
      ) {
        break;
      }
      pts.push({
        lat: c[1],
        lng: c[0],
        accuracy: null,
        altitude: null,
        timestamp: Date.now(),
        source: "import",
      });
    }
    if (pts.length < 3) {
      toast("Poligon di file kurang dari 3 titik", true);
      return false;
    }
    state.points = pts;
    state.closed = true;
    const props = feature.properties || {};
    state.meta = {
      name: props.name || "",
      owner: props.owner || "",
      type: props.land_type || props.type || "lainnya",
      notes: props.notes || "",
    };
    // Ensure land type exists in select
    if (els.metaType) {
      const opt = Array.from(els.metaType.options).some(
        (o) => o.value === state.meta.type
      );
      if (!opt) state.meta.type = "lainnya";
    }
    redraw();
    fitFeatures([feature]);
    const area = polygonArea(pts);
    setStatus("Dimuat: " + (state.meta.name || "poligon") + " · " + formatHa(area));
    return true;
  }

  function importGeoJSONFile(file) {
    if (!file) return;
    const name = (file.name || "").toLowerCase();
    if (name && !name.endsWith(".geojson") && !name.endsWith(".json")) {
      toast("Pilih file .geojson atau .json", true);
      showImportResult("Format tidak didukung. Gunakan <strong>.geojson</strong> atau <strong>.json</strong>.", true);
      return;
    }

    const mode = getImportMode();
    const reader = new FileReader();
    reader.onerror = () => {
      toast("Gagal membaca file", true);
      showImportResult("Gagal membaca file dari perangkat.", true);
    };
    reader.onload = () => {
      try {
        const text = String(reader.result || "").trim();
        if (!text) {
          toast("File kosong", true);
          showImportResult("File kosong.", true);
          return;
        }
        const data = JSON.parse(text);
        const features = normalizeImported(data).map(enrichFeature);
        if (!features.length) {
          toast("Tidak ada poligon di file", true);
          showImportResult(
            "Tidak ditemukan geometri <strong>Polygon</strong> di file ini.<br>Pastikan isinya Feature / FeatureCollection GeoJSON.",
            true
          );
          return;
        }

        if (mode === "active") {
          const ok = loadFeatureAsActive(features[0]);
          if (!ok) return;
          const extra =
            features.length > 1
              ? `<br><small>${features.length - 1} poligon lain tidak dimuat (mode gambar aktif hanya 1).</small>`
              : "";
          showImportResult(
            `<strong>Berhasil dimuat sebagai gambar aktif</strong><br>` +
              escapeHtml(features[0].properties.name || "Poligon") +
              ` · ${features[0].properties.vertex_count || "?"} titik · ` +
              escapeHtml(formatHa(features[0].properties.area_m2 || 0)) +
              extra
          );
          toast("GeoJSON dibuka sebagai gambar aktif");
          // keep sheet open briefly so user sees result, then close
          setTimeout(() => closeSheet("importSheet"), 900);
          return;
        }

        if (mode === "replace") {
          if (
            state.parcels.length &&
            !confirm(
              `Ganti ${state.parcels.length} lahan tersimpan dengan ${features.length} poligon dari file?`
            )
          ) {
            return;
          }
          state.parcels = features.slice();
        } else {
          // append
          features.forEach((f) => state.parcels.push(f));
        }

        saveParcels();
        renderParcelsOnMap();
        fitFeatures(features);

        const totalHa = features.reduce(
          (s, f) => s + (Number(f.properties.area_ha) || 0),
          0
        );
        const modeLabel =
          mode === "replace" ? "Diganti dengan" : "Ditambahkan";
        showImportResult(
          `<strong>${modeLabel} ${features.length} poligon</strong><br>` +
            `File: ${escapeHtml(file.name || "geojson")}<br>` +
            `Total luas ≈ <strong>${escapeHtml(
              formatHa(totalHa * 10000)
            )}</strong><br>` +
            `Daftar sekarang: ${state.parcels.length} lahan`
        );
        toast(`${features.length} lahan dimuat dari GeoJSON`);
        updateParcelCount();
      } catch (e) {
        console.error(e);
        toast("File GeoJSON tidak valid", true);
        showImportResult(
          "Gagal mem-parsing JSON.<br>Pastikan file adalah GeoJSON yang valid.",
          true
        );
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  function normalizeImported(data) {
    const out = [];
    if (!data) return out;

    const pushPoly = (featureLike) => {
      if (!featureLike) return;
      const g = featureLike.geometry || featureLike;
      const props = featureLike.properties || {};
      if (!g || !g.type) return;
      if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
        out.push({
          type: "Feature",
          properties: { ...props },
          geometry: { type: "Polygon", coordinates: g.coordinates },
        });
      } else if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
        g.coordinates.forEach((poly, i) => {
          out.push({
            type: "Feature",
            properties: {
              ...props,
              name:
                props.name
                  ? props.name + " #" + (i + 1)
                  : "Multi " + (i + 1),
            },
            geometry: { type: "Polygon", coordinates: poly },
          });
        });
      }
    };

    if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
      data.features.forEach((f) => {
        if (!f) return;
        if (f.geometry && f.geometry.type === "Polygon") {
          out.push({
            type: "Feature",
            properties: { ...(f.properties || {}) },
            geometry: f.geometry,
          });
        } else if (f.geometry && f.geometry.type === "MultiPolygon") {
          pushPoly(f);
        } else if (f.type === "Polygon") {
          pushPoly({ properties: f.properties || {}, geometry: f });
        }
      });
    } else if (data.type === "Feature") {
      pushPoly(data);
    } else if (data.type === "Polygon" || data.type === "MultiPolygon") {
      pushPoly({ properties: {}, geometry: data });
    } else if (Array.isArray(data.features)) {
      // lenient: collection without type
      data.features.forEach((f) => pushPoly(f));
    }
    return out;
  }

  function bindDropZone() {
    const zone = els.dropZone;
    if (!zone) return;

    const pick = () => els.fileImport && els.fileImport.click();
    zone.addEventListener("click", pick);
    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick();
      }
    });

    ["dragenter", "dragover"].forEach((ev) => {
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (ev === "dragleave") zone.classList.remove("dragover");
      });
    });
    zone.addEventListener("drop", (e) => {
      zone.classList.remove("dragover");
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) importGeoJSONFile(files[0]);
    });

    // Also allow drop on whole import sheet panel
    const sheet = els.importSheet;
    if (sheet) {
      sheet.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
      sheet.addEventListener("drop", (e) => {
        if (e.target.closest && e.target.closest("#dropZone")) return;
        e.preventDefault();
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files[0]) importGeoJSONFile(files[0]);
      });
    }
  }

  // ---------- Parcels list UI ----------
  function renderParcelsList() {
    const list = els.parcelsList;
    list.innerHTML = "";
    if (!state.parcels.length) {
      list.innerHTML = '<div class="empty-state">Belum ada lahan tersimpan.<br>Gambar poligon lalu simpan.</div>';
      return;
    }
    state.parcels.forEach((p, idx) => {
      const item = document.createElement("div");
      item.className = "parcel-item";
      let areaM2 = p.properties.area_m2;
      if (areaM2 == null && p.geometry && p.geometry.coordinates) {
        const ring = p.geometry.coordinates[0] || [];
        const pts = ring.slice(0, -1).map((c) => ({ lat: c[1], lng: c[0] }));
        if (pts.length >= 3) areaM2 = polygonArea(pts);
      }
      const areaMain = areaM2 != null ? formatHa(areaM2) : "—";
      const areaSub = areaM2 != null ? formatM2(areaM2) : "";
      const left = document.createElement("div");
      left.innerHTML = `<h3>${escapeHtml(p.properties.name || "Tanpa nama")}</h3>
        <p class="parcel-area"><strong>${escapeHtml(areaMain)}</strong>${
          areaSub ? " · " + escapeHtml(areaSub) : ""
        }</p>
        <p>${escapeHtml(p.properties.land_type || "")}
        ${p.properties.owner ? " · " + escapeHtml(p.properties.owner) : ""}</p>`;
      const actions = document.createElement("div");
      actions.className = "parcel-actions";
      const btnFocus = document.createElement("button");
      btnFocus.type = "button";
      btnFocus.textContent = "Lihat";
      btnFocus.onclick = () => {
        const coords = p.geometry.coordinates[0].map((c) => [c[1], c[0]]);
        map.fitBounds(coords, { padding: [50, 50], maxZoom: 19 });
        closeAllSheets();
      };
      const btnDl = document.createElement("button");
      btnDl.type = "button";
      btnDl.textContent = "GeoJSON";
      btnDl.onclick = () => {
        downloadGeoJSON(
          featureCollection([p]),
          polygonFilename(p.properties.name || "lahan")
        );
      };
      const btnEdit = document.createElement("button");
      btnEdit.type = "button";
      btnEdit.textContent = "Edit";
      btnEdit.onclick = () => {
        if (state.points.length && !state.closed) {
          if (!confirm("Ganti gambar aktif yang belum selesai dengan lahan ini?")) return;
        }
        loadFeatureAsActive(p);
        closeAllSheets();
        toast("Lahan dibuka untuk diedit");
      };
      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "danger";
      btnDel.textContent = "Hapus";
      btnDel.onclick = () => {
        if (!confirm("Hapus lahan ini?")) return;
        state.parcels.splice(idx, 1);
        saveParcels();
        renderParcelsOnMap();
        renderParcelsList();
        toast("Lahan dihapus");
      };
      actions.append(btnFocus, btnEdit, btnDl, btnDel);
      item.append(left, actions);
      list.appendChild(item);
    });
  }

  // ---------- Event wiring ----------
  function bindEvents() {
    els.btnLocate.addEventListener("click", () => locateOnce(true));
    if (els.btnClearRoute) {
      els.btnClearRoute.addEventListener("click", () => {
        clearRoute();
        toast("Rute dihapus");
        setStatus("Siap memetakan");
      });
    }
    if (els.btnRouteMode) {
      els.btnRouteMode.addEventListener("click", async () => {
        if (!routeState.active || !routeState.dest) return;
        routeState.mode =
          routeState.mode === "driving" ? "walking" : "driving";
        updateRouteBar();
        toast(
          routeState.mode === "walking"
            ? "Mode rute: jalan kaki"
            : "Mode rute: kendaraan"
        );
        try {
          await computeAndDrawRoute();
        } catch (e) {
          toast("Gagal hitung ulang rute", true);
        }
      });
    }
    if (els.btnOpenMaps) {
      els.btnOpenMaps.addEventListener("click", openInGoogleMaps);
    }
    els.btnAddPoint.addEventListener("click", () => {
      if (state.walkMode) {
        stopWalkMode();
        updateWalkLabel();
        toast("Mode jalan dihentikan");
        return;
      }
      addPointFromGps(false);
    });
    els.btnUndo.addEventListener("click", undoPoint);
    els.btnClose.addEventListener("click", closePolygon);
    els.btnMore.addEventListener("click", () => openSheet("moreSheet"));
    els.btnLayers.addEventListener("click", () => openSheet("layersSheet"));
    els.btnHelp.addEventListener("click", () => openSheet("helpSheet"));

    document.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", () => closeSheet(el.getAttribute("data-close")));
    });

    $("btnTapMode").addEventListener("click", () => {
      state.tapMode = !state.tapMode;
      updateTapLabel();
      toast(state.tapMode ? "Mode ketuk AKTIF" : "Mode ketuk nonaktif");
      map.getContainer().style.cursor = state.tapMode ? "crosshair" : "";
    });

    $("btnWalkMode").addEventListener("click", () => {
      toggleWalkMode();
      closeSheet("moreSheet");
    });

    $("btnEditMeta").addEventListener("click", () => {
      closeSheet("moreSheet");
      openMeta();
    });
    $("btnSaveMeta").addEventListener("click", saveMetaFromForm);

    $("btnSaveParcel").addEventListener("click", () => {
      closeSheet("moreSheet");
      saveActiveParcel();
    });

    $("btnParcels").addEventListener("click", () => {
      closeSheet("moreSheet");
      renderParcelsList();
      openSheet("parcelsSheet");
    });

    $("btnExport").addEventListener("click", () => {
      closeSheet("moreSheet");
      els.geojsonPreview.hidden = true;
      openSheet("exportSheet");
    });

    $("btnExportActive").addEventListener("click", exportActive);
    $("btnExportSaved").addEventListener("click", exportAll);
    $("btnExportAll").addEventListener("click", exportAll);
    $("btnCopyGeoJSON").addEventListener("click", copyActiveGeoJSON);

    const btnLoadBsre = $("btnLoadBsre");
    if (btnLoadBsre) {
      btnLoadBsre.addEventListener("click", () => {
        loadBsreDataset();
      });
    }

    if (els.btnSearchBsre) {
      els.btnSearchBsre.addEventListener("click", () => {
        if (!bsreLoaded) {
          toast("Muat data BSRE dulu", true);
          return;
        }
        closeSheet("moreSheet");
        showBsreSearchUI();
        if (els.bsreSearchInput) {
          els.bsreSearchInput.focus();
          els.bsreSearchInput.select();
        }
      });
    }

    if (els.btnMarkIds) {
      els.btnMarkIds.addEventListener("click", () => {
        closeSheet("moreSheet");
        openMarkSheet();
      });
    }
    if (els.btnMarkToggle) {
      els.btnMarkToggle.addEventListener("click", () => processMarkInput("toggle"));
    }
    if (els.btnMarkOnly) {
      els.btnMarkOnly.addEventListener("click", () => processMarkInput("mark"));
    }
    if (els.btnUnmarkOnly) {
      els.btnUnmarkOnly.addEventListener("click", () => processMarkInput("unmark"));
    }
    if (els.btnClearAllMarks) {
      els.btnClearAllMarks.addEventListener("click", () => clearAllMarks());
    }
    if (els.btnLocateRed) {
      els.btnLocateRed.addEventListener("click", () => {
        if (radarActive) {
          clearRadar();
          toast("Radar dimatikan");
          return;
        }
        locateRedMarks();
      });
    }
    if (els.btnLocateRedSheet) {
      els.btnLocateRedSheet.addEventListener("click", () => {
        closeSheet("markSheet");
        locateRedMarks();
      });
    }

    if (els.bsreSearchForm) {
      els.bsreSearchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        runBsreSearch(true);
      });
    }
    if (els.bsreSearchInput) {
      els.bsreSearchInput.addEventListener("input", () => {
        const has = !!String(els.bsreSearchInput.value || "").trim();
        if (els.btnBsreSearchClear) els.btnBsreSearchClear.hidden = !has;
        clearTimeout(bsreSearchTimer);
        bsreSearchTimer = setTimeout(() => runBsreSearch(false), 220);
      });
    }
    if (els.btnBsreSearchClear) {
      els.btnBsreSearchClear.addEventListener("click", () => {
        if (els.bsreSearchInput) els.bsreSearchInput.value = "";
        els.btnBsreSearchClear.hidden = true;
        clearBsreHighlight();
        renderBsreSearchResults([], "");
        if (els.bsreSearchInput) els.bsreSearchInput.focus();
      });
    }

    // Tap map background closes search dropdown (not when typing)
    map.on("click", () => {
      if (els.bsreSearchResults && !els.bsreSearchResults.hidden) {
        // keep results if user is interacting with search bar
        const ae = document.activeElement;
        if (ae && els.bsreSearchBar && els.bsreSearchBar.contains(ae)) return;
        els.bsreSearchResults.hidden = true;
      }
    });

    $("btnImport").addEventListener("click", () => {
      closeSheet("moreSheet");
      openImportSheet();
    });
    const btnImportFromList = $("btnImportFromList");
    if (btnImportFromList) {
      btnImportFromList.addEventListener("click", () => {
        closeSheet("parcelsSheet");
        openImportSheet();
      });
    }
    els.fileImport.addEventListener("change", () => {
      const f = els.fileImport.files && els.fileImport.files[0];
      if (f) importGeoJSONFile(f);
      els.fileImport.value = "";
    });
    bindDropZone();

    $("btnClear").addEventListener("click", () => {
      closeSheet("moreSheet");
      clearActive();
    });

    $("btnClearAll").addEventListener("click", () => {
      if (!state.parcels.length) return;
      if (!confirm("Hapus SEMUA lahan tersimpan?")) return;
      state.parcels = [];
      saveParcels();
      renderParcelsOnMap();
      renderParcelsList();
      toast("Semua lahan dihapus");
    });

    document.querySelectorAll('input[name="basemap"]').forEach((r) => {
      r.addEventListener("change", () => {
        if (r.checked) setBasemap(r.value);
      });
    });

    els.accuracyThreshold.addEventListener("change", () => {
      let v = parseInt(els.accuracyThreshold.value, 10);
      if (isNaN(v)) v = 15;
      v = Math.min(100, Math.max(3, v));
      els.accuracyThreshold.value = v;
      state.settings.accuracyThreshold = v;
      saveSettings();
    });
    els.walkInterval.addEventListener("change", () => {
      let v = parseInt(els.walkInterval.value, 10);
      if (isNaN(v)) v = 5;
      v = Math.min(60, Math.max(2, v));
      els.walkInterval.value = v;
      state.settings.walkInterval = v;
      saveSettings();
      if (state.walkMode) {
        stopWalkMode();
        startWalkMode();
      }
    });
    els.highAccuracy.addEventListener("change", () => {
      state.settings.highAccuracy = els.highAccuracy.checked;
      saveSettings();
      // restart watch with new options
      if (state.watchId != null) {
        navigator.geolocation.clearWatch(state.watchId);
        state.watchId = null;
        startWatch();
      }
    });

    map.on("click", (e) => {
      if (!state.tapMode) return;
      addPointFromTap(e.latlng);
    });

    // prevent double-tap zoom delay feel on buttons
    document.querySelectorAll("button").forEach((b) => {
      b.addEventListener(
        "touchend",
        (e) => {
          // let click fire; just stop ghost clicks on map under sheets
          if (b.closest(".sheet-panel") || b.closest(".toolbar") || b.closest(".topbar")) {
            e.stopPropagation();
          }
        },
        { passive: true }
      );
    });

    // keyboard helpers (desktop)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllSheets();
      if (e.target.matches("input, textarea, select")) return;
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undoPoint();
      }
    });

    // PWA-ish: register empty SW skip — optional none

    window.addEventListener("beforeunload", () => {
      if (state.points.length && !state.closed) {
        // browsers may ignore custom msg
        return "Gambar belum disimpan";
      }
    });
  }

  // ---------- Boot ----------
  function init() {
    loadSettings();
    loadMarkedIds();
    loadParcels();
    bindEvents();
    updateTapLabel();
    updateWalkLabel();
    redraw();
    startWatch();
    // try initial center
    locateOnce(true);

    bindInstallEvents();

    if ("serviceWorker" in navigator) {
      // Register SW and force-check for updates on each load (important after Vercel deploys)
      navigator.serviceWorker
        .register("./sw.js", { scope: "./" })
        .then((reg) => {
          reg.update().catch(() => {});
          // If a new worker is waiting, activate it
          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          reg.addEventListener("updatefound", () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener("statechange", () => {
              if (nw.state === "installed" && navigator.serviceWorker.controller) {
                // New version ready — activate immediately
                nw.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch(() => {});

      // Reload once when the new SW takes control so UI matches latest deploy
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
