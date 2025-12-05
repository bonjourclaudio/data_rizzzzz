// Simple wiring for selection filters and timeline controls

document.addEventListener("DOMContentLoaded", () => {
  const selectionItems = Array.from(
    document.querySelectorAll(".selection-item")
  );
  const graphs = Array.from(document.querySelectorAll(".graph"));
  const timeRange = document.getElementById("timeRange");
  const chartInstances = new Map();
  const dataStore = new Map(); // key -> array of {t: Date, v: Number}
  const timeSlider = document.getElementById("timeSlider");
  const panLeft = document.getElementById("panLeft");
  const panRight = document.getElementById("panRight");
  const sliderLabel = document.getElementById("sliderLabel");
  const rangeButtons = Array.from(document.querySelectorAll(".range-button"));
  const timelineTrack = document.getElementById("timelineTrack");
  const timelineInner = document.getElementById("timelineInner");
  const timelineLabels = document.getElementById("timelineLabels");
  const timeCursor = document.getElementById("timeCursor");
  // create or reuse a time indicator element
  let timeIndicator = document.querySelector(".time-indicator");
  if (!timeIndicator) {
    timeIndicator = document.createElement("div");
    timeIndicator.className = "time-indicator";
    timelineTrack.appendChild(timeIndicator);
  }
  // create or reuse a ticks container for vertical tick lines
  let timelineTicks = document.getElementById("timelineTicks");
  if (!timelineTicks) {
    timelineTicks = document.createElement("div");
    timelineTicks.id = "timelineTicks";
    timelineTicks.className = "timeline-ticks";
    timelineTrack.appendChild(timelineTicks);
  }

  // selection overlay: a vertical white line that overlays the selection area and a small label inside the selection box
  const selectionDiv = document.querySelector(".selection-div");
  let selectionTimeLine = document.getElementById("selectionTimeLine");
  if (!selectionTimeLine) {
    selectionTimeLine = document.createElement("div");
    selectionTimeLine.id = "selectionTimeLine";
    selectionTimeLine.className = "selection-time-line";
    document.body.appendChild(selectionTimeLine);
  }
  let selectionTimeLabel = document.querySelector(".selection-time-label");
  if (!selectionTimeLabel && selectionDiv) {
    selectionTimeLabel = document.createElement("div");
    selectionTimeLabel.className = "selection-time-label";
    selectionDiv.appendChild(selectionTimeLabel);
  }

  // timeline state
  let selectedRangeMinutes = 60; // default 1h
  let timelineStart = new Date();
  let timelineEnd = new Date();
  // window size in number of points shown in charts (adjusted by range)
  let windowSize = 20;
  // timeline markers {id, t: timestamp-ms, label}
  let markers = [];

  // map filter keys to graph data-graph values
  const filterToGraphs = {
    essential: ["heart-rate", "spo2"],
    all: graphs.map((g) => g.dataset.graph),
    hr: ["heart-rate"],
    spo2: ["spo2"],
    abp: ["abp"],
    rr: ["rr"],
  };

  // start with all selected
  let activeFilters = new Set(["essential"]);

  function updateGraphs() {
    // determine visible graphs from activeFilters
    const visible = new Set();
    if (activeFilters.has("all")) {
      graphs.forEach((g) => visible.add(g.dataset.graph));
    } else {
      activeFilters.forEach((f) => {
        const list = filterToGraphs[f] || [];
        list.forEach((gk) => visible.add(gk));
      });
    }

    graphs.forEach((g) => {
      if (visible.has(g.dataset.graph)) {
        g.classList.remove("hidden");
        // if chart exists, update it; if not, create
        if (!chartInstances.has(g.dataset.graph)) {
          createExampleChart(g, g.dataset.graph);
        }
      } else {
        g.classList.add("hidden");
      }
    });
  }

  // --- Timeline history / range buttons ---
  function setActiveRange(minutes) {
    selectedRangeMinutes = minutes;
    rangeButtons.forEach((b) =>
      b.classList.toggle("active", Number(b.dataset.minutes) === minutes)
    );
    // timeline end is 'now' for demo, start is end - selectedRange
    timelineEnd = new Date();
    timelineStart = new Date(timelineEnd.getTime() - minutes * 60 * 1000);
    renderTimelineTicks();
    // pick a sensible window size depending on minutes (coarse mapping)
    // behave similarly to 1h and 3h: choose a window that's proportional
    if (minutes <= 5) windowSize = 10;
    else if (minutes <= 15) windowSize = 15;
    else if (minutes <= 60) windowSize = 30;
    else if (minutes <= 180) windowSize = 60;
    else windowSize = 80;
    configureSlider(true);
  }

  function renderTimelineTicks() {
    // produce 6 labels including min and max
    const ticks = 5; // gaps
    const labels = [];
    for (let i = 0; i <= ticks; i++) {
      const frac = i / ticks;
      const t = new Date(
        timelineStart.getTime() + frac * (timelineEnd - timelineStart)
      );
      labels.push(t);
    }
    // render labels
    timelineLabels.innerHTML = "";
    // clear ticks
    if (timelineTicks) timelineTicks.innerHTML = "";
    const trackRect = timelineTrack.getBoundingClientRect();
    labels.forEach((d, idx) => {
      const el = document.createElement("div");
      el.className = "timeline-label";
      // format HH:MM or mm:ss depending on range
      // Use 24-hour format HH:MM consistently
      const label = d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      el.textContent = label;
      // clicking a label will jump the cursor to that time
      el.addEventListener("click", () => {
        updateChartsAtTime(d);
        // move cursor visually
        const trackRect = timelineTrack.getBoundingClientRect();
        const frac =
          (d.getTime() - timelineStart.getTime()) /
          (timelineEnd.getTime() - timelineStart.getTime());
        const newLeft = Math.max(
          0,
          Math.min(trackRect.width, frac * trackRect.width)
        );
        timeCursor.style.transform = `translateX(${newLeft}px)`;
      });
      timelineLabels.appendChild(el);
    });
    // create vertical tick lines positioned under label centers
    if (timelineTicks) {
      // after labels are in the DOM, compute their positions and align ticks to the label centers
      const labelEls = Array.from(timelineLabels.children);
      labelEls.forEach((lblEl) => {
        const lblRect = lblEl.getBoundingClientRect();
        // center x of label relative to the track
        const centerX = lblRect.left + lblRect.width / 2;
        const left = Math.max(
          0,
          Math.min(trackRect.width, centerX - trackRect.left)
        );
        const tick = document.createElement("div");
        tick.className = "timeline-tick";
        tick.style.left = `${left}px`;
        timelineTicks.appendChild(tick);
      });
    }
    // render markers in the inner track
    renderMarkers();
  }

  // marker helpers: persist to localStorage
  function loadMarkers() {
    try {
      const raw = localStorage.getItem("timeline_markers:v1");
      markers = raw ? JSON.parse(raw) : [];
    } catch (e) {
      markers = [];
    }
  }

  function saveMarkers() {
    try {
      localStorage.setItem("timeline_markers:v1", JSON.stringify(markers));
    } catch (e) {
      console.warn("Could not save markers", e);
    }
  }

  function renderMarkers() {
    // Clear existing
    timelineInner.innerHTML = "";
    if (!markers || markers.length === 0) return;
    const trackRect = timelineTrack.getBoundingClientRect();
    const duration = timelineEnd.getTime() - timelineStart.getTime();
    markers.forEach((m) => {
      // only render markers inside current timeline range
      if (m.t < timelineStart.getTime() || m.t > timelineEnd.getTime()) return;
      const frac = (m.t - timelineStart.getTime()) / Math.max(1, duration);
      const x = Math.max(0, Math.min(1, frac)) * trackRect.width;
      const el = document.createElement("div");
      el.className = "timeline-marker";
      if (m.graph) el.classList.add("graph-marker");
      el.style.left = `${x}px`;
      el.title = m.label || new Date(m.t).toLocaleString();
      el.dataset.id = m.id;
      // clicking a marker removes it
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const id = el.dataset.id;
        const idx = markers.findIndex((mm) => String(mm.id) === String(id));
        if (idx >= 0) {
          if (confirm("Delete marker?")) {
            markers.splice(idx, 1);
            saveMarkers();
            renderMarkers();
          }
        }
      });
      timelineInner.appendChild(el);
    });
  }

  // Add marker at a given Date with optional label
  function addMarkerAtTime(time, label) {
    const id = Date.now() + Math.round(Math.random() * 1000);
    markers.push({ id, t: time.getTime(), label: label || "" });
    saveMarkers();
    renderMarkers();
  }

  // allow double-click on track to add marker
  timelineTrack.addEventListener("dblclick", (ev) => {
    const rect = timelineTrack.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const frac = Math.max(0, Math.min(1, x / rect.width));
    const timeAt = new Date(
      timelineStart.getTime() + frac * (timelineEnd - timelineStart)
    );
    const label = prompt("Marker label (optional)", "");
    addMarkerAtTime(timeAt, label || "");
  });

  // allow double-click on a graph to add a marker tied to that graph
  graphs.forEach((g) => {
    g.addEventListener("dblclick", (ev) => {
      // compute a representative time (use current cursor position if available)
      const trackRect = timelineTrack.getBoundingClientRect();
      const cursorLeft = timeCursor.offsetLeft || 0;
      const frac = Math.max(
        0,
        Math.min(1, cursorLeft / Math.max(1, trackRect.width))
      );
      const timeAt = new Date(
        timelineStart.getTime() + frac * (timelineEnd - timelineStart)
      );
      const label = prompt("Marker label (optional)", "");
      const id = Date.now() + Math.round(Math.random() * 1000);
      markers.push({
        id,
        t: timeAt.getTime(),
        label: label || "",
        graph: g.dataset.graph,
      });
      saveMarkers();
      renderMarkers();
    });
    // clicking a graph toggles selection
    g.addEventListener("click", () => {
      g.classList.toggle("selected");
    });
  });

  // re-render ticks and markers on window resize so positions stay aligned
  window.addEventListener("resize", () => {
    // small debounce
    if (typeof window._timelineResizeTimeout !== "undefined") {
      clearTimeout(window._timelineResizeTimeout);
    }
    window._timelineResizeTimeout = setTimeout(() => {
      renderTimelineTicks();
      // reposition cursor/timeIndicator based on current slider or default
      const now = new Date();
      updateChartsAtTime(now);
    }, 120);
  });

  // load markers initially
  loadMarkers();

  // drag cursor
  function initCursorDrag() {
    let dragging = false;
    let startX = 0;
    let startLeft = 0;

    timeCursor.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startLeft = timeCursor.offsetLeft;
      timeCursor.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const trackRect = timelineTrack.getBoundingClientRect();
      let newLeft = startLeft + dx;
      newLeft = Math.max(0, Math.min(newLeft, trackRect.width));
      timeCursor.style.transform = `translateX(${newLeft}px)`;
      // map position to time and update slider/time label
      const frac = newLeft / trackRect.width;
      const timeAtCursor = new Date(
        timelineStart.getTime() + frac * (timelineEnd - timelineStart)
      );
      // Update charts based on this timestamp (map timestamp to nearest index per dataset)
      updateChartsAtTime(timeAtCursor);
    });

    document.addEventListener("mouseup", () => {
      dragging = false;
      timeCursor.style.cursor = "grab";
      document.body.style.userSelect = "";
    });
  }

  // wire range buttons
  rangeButtons.forEach((b) => {
    b.addEventListener("click", () => {
      setActiveRange(Number(b.dataset.minutes));
    });
  });

  // initialize
  setActiveRange(selectedRangeMinutes);
  initCursorDrag();

  // ensure charts are configured after CSVs load: when charts exist they call loadCSVForGraph which triggers configureSlider()
  // but we'll also call configureSlider once on DOM ready to set defaults
  configureSlider();

  function createExampleChart(containerEl, graphKey) {
    // add a canvas inside the container
    containerEl.innerHTML = "";
    const canvas = document.createElement("canvas");
    containerEl.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const cfg = {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: graphKey,
            data: [],
            borderColor: "#ff6384",
            backgroundColor: "rgba(255,99,132,0.1)",
            fill: true,
            tension: 0.2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { type: "time", time: { unit: "minute" } },
          y: { beginAtZero: false },
        },
        plugins: {
          legend: { display: false },
        },
      },
    };

    const chart = new Chart(ctx, cfg);
    chartInstances.set(graphKey, chart);

    // load CSV data for this graph (if available)
    loadCSVForGraph(graphKey).then(() => {
      // initialize slider ranges based on longest dataset
      configureSlider();
      updateChartFromData(graphKey);
    });
  }

  async function loadCSVForGraph(graphKey) {
    if (dataStore.has(graphKey)) return;
    try {
      let url = null;
      if (graphKey === "heart-rate") url = "/data/heart_rate.csv";
      if (graphKey === "spo2") url = "/data/spo2.csv";
      if (!url) {
        dataStore.set(graphKey, []);
        return;
      }
      const res = await fetch(url);
      const text = await res.text();
      const rows = text
        .trim()
        .split("\n")
        .slice(1)
        .map((line) => {
          const [t, v] = line.split(",");
          return { t: new Date(t), v: Number(v) };
        });
      dataStore.set(graphKey, rows);
    } catch (e) {
      console.error("Failed to load CSV for", graphKey, e);
      dataStore.set(graphKey, []);
    }
  }

  function configureSlider() {
    // find the longest dataset length
    let maxLen = 0;
    dataStore.forEach((arr) => {
      if (arr.length > maxLen) maxLen = arr.length;
    });
    if (maxLen === 0) {
      timeSlider.max = 0;
      timeSlider.value = 0;
      sliderLabel.textContent = "no data";
      return;
    }
    // use the global windowSize (may be adjusted by range presets)
    // keep the slider position sticky unless explicitly requested to reset
    timeSlider.max = Math.max(0, maxLen - windowSize);
    timeSlider.value = Math.min(timeSlider.value, timeSlider.max);
    sliderLabel.textContent = `window ${timeSlider.value}..${
      Number(timeSlider.value) + windowSize
    }`;
  }

  function updateChartFromData(graphKey) {
    const chart = chartInstances.get(graphKey);
    const arr = dataStore.get(graphKey) || [];
    if (!chart) return;
    const start = Number(timeSlider.value) || 0;
    const slice = arr.slice(start, start + windowSize);
    chart.data.labels = slice.map((d) => d.t);
    chart.data.datasets[0].data = slice.map((d) => d.v);
    chart.update();
  }

  // binary search helper: find nearest index in sorted array of {t: Date, v}
  function nearestIndexForTime(arr, time) {
    if (!arr || arr.length === 0) return -1;
    let lo = 0;
    let hi = arr.length - 1;
    const ts = time.getTime();
    if (ts <= arr[0].t.getTime()) return 0;
    if (ts >= arr[hi].t.getTime()) return hi;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const mt = arr[mid].t.getTime();
      if (mt === ts) return mid;
      if (mt < ts) lo = mid + 1;
      else hi = mid - 1;
    }
    // lo is the insertion point; pick nearest of lo and lo-1
    const a = lo - 1;
    const b = lo;
    const da = Math.abs(arr[a].t.getTime() - ts);
    const db = Math.abs(arr[b].t.getTime() - ts);
    return da <= db ? a : b;
  }

  // Update all visible charts to show a window centered (as possible) at `time`
  function updateChartsAtTime(time) {
    // for each visible chart, find nearest index and set the slider value
    // We'll choose a representative max length to keep slider mapping stable
    let maxLen = 0;
    dataStore.forEach((arr) => {
      if (arr.length > maxLen) maxLen = arr.length;
    });

    // For each visible graph, compute its nearest index and update chart
    graphs.forEach((g) => {
      if (g.classList.contains("hidden")) return;
      const key = g.dataset.graph;
      const arr = dataStore.get(key) || [];
      if (!arr.length) return;
      const idx = nearestIndexForTime(arr, time);
      // compute start such that idx is roughly centered in the window
      let start = Math.max(
        0,
        Math.min(
          idx - Math.floor(windowSize / 2),
          Math.max(0, arr.length - windowSize)
        )
      );
      // if this dataset is shorter than windowSize, start is 0
      if (arr.length <= windowSize) start = 0;
      // Update the global slider to represent a coarse position relative to the longest dataset
      // Find corresponding fraction of position within this dataset, map to longest
      if (maxLen > 0) {
        const frac = idx / Math.max(1, arr.length - 1);
        const globalIdx = Math.round(
          frac * Math.max(0, maxLen - 1 - windowSize)
        );
        timeSlider.value = Math.max(
          0,
          Math.min(globalIdx, timeSlider.max || 0)
        );
      }
      // Update the specific chart's visible window by slicing its data and calling chart update
      const chart = chartInstances.get(key);
      if (chart) {
        const slice = arr.slice(start, start + windowSize);
        chart.data.labels = slice.map((d) => d.t);
        chart.data.datasets[0].data = slice.map((d) => d.v);
        chart.update();
      }
    });
    // refresh slider label
    sliderLabel.textContent = `window ${timeSlider.value}..${
      Number(timeSlider.value) + windowSize
    }`;
    // update visual cursor and time indicator
    const trackRect = timelineTrack.getBoundingClientRect();
    const fracGlobal =
      (time.getTime() - timelineStart.getTime()) /
      Math.max(1, timelineEnd.getTime() - timelineStart.getTime());
    const newLeft = Math.max(
      0,
      Math.min(trackRect.width, fracGlobal * trackRect.width)
    );
    timeCursor.style.transform = `translateX(${newLeft}px)`;
    timeIndicator.textContent = time.toLocaleTimeString();
    timeIndicator.style.transform = `translateX(${newLeft}px)`;
    // position the global selection overlay line and the label inside the selection area
    updateSelectionOverlay(trackRect.left + newLeft, time);
  }

  function updateSelectionOverlay(pageX, time) {
    // pageX is the absolute x-coordinate (pixels) where the cursor sits
    if (!selectionTimeLine || !selectionTimeLabel || !selectionDiv) return;
    const selRect = selectionDiv.getBoundingClientRect();
    // place the vertical line to cover selection area height and be at pageX
    selectionTimeLine.style.left = `${Math.round(pageX)}px`;
    selectionTimeLine.style.top = `${Math.round(selRect.top)}px`;
    selectionTimeLine.style.height = `${Math.round(selRect.height)}px`;
    // place the label inside selection box, near the right edge, showing formatted time
    selectionTimeLabel.textContent = time.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    // make sure label sits slightly left of the line inside the selection box
    selectionTimeLabel.style.position = "absolute";
    selectionTimeLabel.style.right = "8px";
    selectionTimeLabel.style.top = "8px";
  }

  function regenerateCharts() {
    // refresh data for visible charts
    graphs.forEach((g) => {
      if (g.classList.contains("hidden")) return;
      const key = g.dataset.graph;
      // update from CSV data if present, otherwise regenerate dummy
      const chart = chartInstances.get(key);
      if (chart) {
        if (dataStore.has(key) && dataStore.get(key).length) {
          updateChartFromData(key);
        } else {
          chart.data.labels = generateLabels(timeRange.value);
          chart.data.datasets[0].data = generateHRData(
            chart.data.labels.length,
            key
          );
          chart.update();
        }
      }
    });
  }

  function generateLabels(range) {
    // simple labels: N points depending on range
    let points = 50;
    if (range === "1h") points = 30;
    if (range === "6h") points = 60;
    if (range === "12h") points = 80;
    if (range === "24h") points = 120;
    return Array.from({ length: points }, (_, i) => i.toString());
  }

  function generateHRData(n, key) {
    // generate plausible heart-rate-like data; for other keys return different ranges
    const base =
      key === "heart-rate"
        ? 70
        : key === "spo2"
        ? 98
        : key === "abp"
        ? 120
        : 18;
    const variance =
      key === "heart-rate" ? 10 : key === "spo2" ? 2 : key === "abp" ? 15 : 3;
    return Array.from({ length: n }, () =>
      Math.round(base + (Math.random() - 0.5) * variance)
    );
  }

  selectionItems.forEach((item) => {
    item.addEventListener("click", () => {
      const key = item.dataset.filter;
      if (!key) return;
      if (activeFilters.has(key)) {
        activeFilters.delete(key);
        item.classList.remove("active");
      } else {
        activeFilters.add(key);
        item.classList.add("active");
      }
      updateGraphs();
    });
  });

  timeRange.addEventListener("change", (e) => {
    // placeholder: in a real app you'd reload graph data for the selected range
    console.log("Time range changed to", e.target.value);
    regenerateCharts();
  });

  // pan buttons and slider
  timeSlider.addEventListener("input", () => {
    // do not reset slider position; treat as sticky
    configureSlider();
    sliderLabel.textContent = `window ${timeSlider.value}`;
    // update visible charts
    graphs.forEach((g) => {
      if (!g.classList.contains("hidden")) updateChartFromData(g.dataset.graph);
    });
    // update time indicator based on slider fraction relative to longest dataset
    let maxLen = 0;
    dataStore.forEach((arr) => {
      if (arr.length > maxLen) maxLen = arr.length;
    });
    const frac =
      maxLen > 0
        ? Number(timeSlider.value) / Math.max(1, maxLen - windowSize)
        : 0;
    const timeAt = new Date(
      timelineStart.getTime() +
        frac * (timelineEnd.getTime() - timelineStart.getTime())
    );
    timeIndicator.textContent = timeAt.toLocaleTimeString();
    const trackRect = timelineTrack.getBoundingClientRect();
    const left = Math.max(0, Math.min(trackRect.width, frac * trackRect.width));
    timeCursor.style.transform = `translateX(${left}px)`;
    timeIndicator.style.transform = `translateX(${left}px)`;
  });

  panLeft.addEventListener("click", () => {
    timeSlider.value = Math.max(0, Number(timeSlider.value) - 1);
    timeSlider.dispatchEvent(new Event("input"));
  });

  panRight.addEventListener("click", () => {
    timeSlider.value = Math.min(
      Number(timeSlider.max),
      Number(timeSlider.value) + 1
    );
    timeSlider.dispatchEvent(new Event("input"));
  });

  // initial apply
  updateGraphs();
});
