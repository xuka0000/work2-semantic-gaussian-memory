const DATA_URL = "./data/site.json";
let refreshTimer = null;
let resizeMetricHandler = null;
let pointCloudAnimation = null;
let pointCloudResizeHandler = null;

const $ = (id) => document.getElementById(id);

function value(input, fallback = "") {
  return input === undefined || input === null || input === "" ? fallback : String(input);
}

function make(tag, className = "", content = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== "") node.textContent = content;
  return node;
}

function setSectionVisible(id, visible) {
  const node = $(id);
  if (node) node.hidden = !visible;
}

function setParentSectionVisible(root, visible) {
  const section = root?.closest?.(".section");
  if (section) section.hidden = !visible;
}

function linkNode(label, href) {
  if (!href) return make("span", "muted-link", "not available");
  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

function statusLabel(state = "") {
  const text = value(state, "not recorded");
  let cls = "status-chip";
  if (text.includes("metric_complete") || text.includes("ready")) cls += " status-chip-complete";
  else if (text.includes("pointwise") || text.includes("running")) cls += " status-chip-running";
  else if (text.includes("blocked")) cls += " status-chip-blocked";
  else cls += " status-chip-context";
  return make("span", cls, text);
}

function compactPath(input = "") {
  const text = value(input);
  if (!text) return "";
  const first = text.split(";")[0].trim();
  const parts = first.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return first;
  return parts.slice(-2).join("/");
}

function compactTruth(input = "") {
  const text = value(input);
  if (!text) return "";
  return text
    .replace(/_no_public_sota_claim/g, "")
    .replace(/_no_public_sota/g, "")
    .replace(/panogs_/g, "")
    .replace(/public_/g, "")
    .replace(/_metric_/g, " metric ")
    .replace(/_/g, " ");
}

function mediaElement(item, className = "") {
  if (!item || !item.available) {
    return make("div", `missing-media ${className}`.trim(), value(item?.reason, "media unavailable"));
  }
  const src = value(item.src);
  if (src.match(/\.(mp4|webm|ogg)$/i)) {
    const video = document.createElement("video");
    video.controls = item.controls !== false;
    video.loop = Boolean(item.loop);
    video.muted = Boolean(item.muted);
    video.defaultMuted = Boolean(item.muted);
    video.autoplay = Boolean(item.autoplay);
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("playsinline", "");
    if (item.muted) video.setAttribute("muted", "");
    if (item.autoplay) video.setAttribute("autoplay", "");
    if (item.loop) video.setAttribute("loop", "");
    if (item.poster) video.poster = item.poster;
    if (Array.isArray(item.sources) && item.sources.length) {
      item.sources.forEach((source) => {
        const child = document.createElement("source");
        child.src = source.src;
        if (source.type) child.type = source.type;
        video.append(child);
      });
    } else {
      video.src = src;
    }
    if (item.fallback_gif) {
      video.addEventListener("error", () => {
        const img = document.createElement("img");
        img.src = item.fallback_gif;
        img.alt = value(item.title, "animated research result");
        video.replaceWith(img);
      });
    }
    if (item.autoplay) {
      requestAnimationFrame(() => {
        video.play().catch(() => {});
      });
    }
    return video;
  }
  const img = document.createElement("img");
  img.src = src;
  img.alt = value(item.title, "research result media");
  return img;
}

function renderButtons(buttons = []) {
  const root = $("buttons");
  root.replaceChildren(...buttons.map((button) => {
    const label = value(button.label);
    const icon = label.toLowerCase().includes("code") ? "GH" : label.toLowerCase().includes("data") ? "CSV" : "PDF";
    if (!button.href) {
      const span = make("span", "link-block button is-normal is-rounded is-dark", label);
      span.dataset.icon = icon;
      return span;
    }
    const link = document.createElement("a");
    link.href = button.href;
    link.className = "link-block button is-normal is-rounded is-dark";
    link.dataset.icon = icon;
    link.textContent = label.replace("</", "").replace(">", "");
    return link;
  }));
}

function renderHeroSlider(slider = {}) {
  const items = slider.items || [];
  if (!items.length) return null;
  const shell = make("div", "nerf-result-slider");
  const viewport = make("div", "nerf-slider-viewport");
  const track = make("div", "nerf-slider-track");
  const pages = [];
  for (let i = 0; i < items.length; i += 3) pages.push(items.slice(i, i + 3));
  pages.forEach((page) => {
    const slide = make("div", "nerf-slider-slide");
    page.forEach((item) => {
      const card = make("article", "nerf-video-card");
      card.append(mediaElement(item));
      const label = make("div", "nerf-video-label");
      label.append(make("b", "", value(item.title)));
      label.append(make("span", "", value(item.caption)));
      card.append(label);
      slide.append(card);
    });
    track.append(slide);
  });
  viewport.append(track);
  shell.append(viewport);
  if (pages.length > 1) {
    const dots = make("div", "nerf-slider-dots");
    let active = 0;
    const show = (index) => {
      active = (index + pages.length) % pages.length;
      track.style.transform = `translateX(${-active * 100}%)`;
      dots.querySelectorAll("button").forEach((button, buttonIndex) => {
        button.classList.toggle("active", buttonIndex === active);
      });
    };
    pages.forEach((_page, index) => {
      const button = make("button", "", "");
      button.type = "button";
      button.setAttribute("aria-label", `Show result slide ${index + 1}`);
      button.addEventListener("click", () => show(index));
      dots.append(button);
    });
    shell.append(dots);
    show(0);
    setInterval(() => show(active + 1), Number(slider.interval_ms || 10000));
  }
  return shell;
}

function renderTeaser(teaser = {}, slider = {}) {
  const sliderNode = renderHeroSlider(slider);
  $("teaser").replaceChildren(sliderNode || mediaElement(teaser));
  $("teaser-caption").textContent = value(slider.caption || teaser.caption);
}

function renderAbstract(text = "", points = []) {
  const root = $("abstract");
  const nodes = [];
  if (text) nodes.push(make("p", "abstract-lead", value(text)));
  if (points.length) {
    const grid = make("div", "abstract-points");
    points.forEach((point) => {
      const card = make("article", "abstract-point");
      card.append(make("b", "", value(point.label)));
      card.append(make("p", "", value(point.text)));
      grid.append(card);
    });
    nodes.push(grid);
  }
  root.replaceChildren(...nodes);
}

function renderPipeline(steps = []) {
  if (!steps.length) return null;
  const wrapper = make("div", "method-pipeline");
  steps.forEach((step, index) => {
    const item = make("article", "pipeline-step");
    item.append(make("span", "step-index", String(index + 1).padStart(2, "0")));
    item.append(make("h3", "", value(step.label)));
    item.append(make("p", "", value(step.detail)));
    wrapper.append(item);
  });
  return wrapper;
}

function renderMethodVisualFlow(flow = {}) {
  const nodes = flow.nodes || [];
  if (!nodes.length) return null;
  const wrapper = make("div", "method-visual-flow");
  const rail = make("div", "method-flow-rail");
  nodes.forEach((node, index) => {
    const card = make("article", `method-flow-node method-flow-${value(node.kind, "module")}`);
    card.append(make("span", "method-node-dot", ""));
    card.append(make("b", "", value(node.label)));
    const metric = make("strong", "", value(node.value));
    metric.append(make("small", "", value(node.unit)));
    card.append(metric);
    rail.append(card);
    if (index < nodes.length - 1) {
      const edge = make("span", "method-flow-edge", value((flow.edges || [])[index], "→"));
      rail.append(edge);
    }
  });
  wrapper.append(rail);
  if (flow.source) wrapper.append(make("code", "method-flow-source", value(flow.source)));
  return wrapper;
}

function renderMethod(method = {}) {
  const mediaRoot = $("method-media");
  const media = method.media || {};
  mediaRoot.hidden = !(media && media.available);
  mediaRoot.replaceChildren(mediaRoot.hidden ? "" : mediaElement(media));
  $("method-text").textContent = value(method.text);
  $("method-text").hidden = !value(method.text);
  document.querySelectorAll(".method-pipeline, .method-visual-flow").forEach((node) => node.remove());
  const visualFlow = renderMethodVisualFlow(method.visual_flow || {});
  if (visualFlow) {
    $("method-text").after(visualFlow);
    return;
  }
  const pipeline = renderPipeline(method.steps || []);
  if (pipeline) $("method-text").after(pipeline);
}

function renderAlgorithmDetails(section = {}) {
  $("algorithm-note").textContent = value(section.note);
  const root = $("algorithm-details");
  const items = section.items || [];
  setParentSectionVisible(root, items.length > 0);
  root.replaceChildren(...items.map((item, index) => {
    const card = make("article", "algorithm-card");
    card.append(make("span", "step-index", value(item.stage, String(index + 1).padStart(2, "0"))));
    card.append(make("h3", "", value(item.title, "Algorithm component")));
    card.append(make("p", "", value(item.text)));
    const meta = make("div", "card-meta");
    meta.append(make("small", "", value(item.truth_level)));
    if (item.evidence) {
      const code = document.createElement("code");
      code.textContent = value(item.evidence);
      meta.append(code);
    }
    card.append(meta);
    return card;
  }));
}

function renderDataProtocol(section = {}) {
  $("protocol-note").textContent = value(section.note);
  const root = $("data-protocol");
  const items = section.items || [];
  setParentSectionVisible(root, items.length > 0);
  root.replaceChildren(...items.map((item) => {
    const card = make("article", "protocol-card");
    const heading = make("div", "protocol-heading");
    heading.append(make("h3", "", value(item.name)));
    heading.append(statusLabel(item.status));
    card.append(heading);
    [
      ["Role", item.role],
      ["Scenes", item.scenes],
      ["Metrics", item.metrics],
      ["Platform", item.platform],
      ["Boundary", item.boundary],
    ].forEach(([label, text]) => {
      const row = make("p", "protocol-line");
      row.append(make("b", "", label));
      row.append(document.createTextNode(value(text, "not recorded")));
      card.append(row);
    });
    const evidence = make("p", "protocol-evidence");
    evidence.append(make("b", "", "Evidence"));
    const code = document.createElement("code");
    code.textContent = value(item.evidence);
    evidence.append(code);
    card.append(evidence);
    return card;
  }));
}

function renderPrincipleVisual(section = {}) {
  const root = $("principle-visual");
  const items = section.items || [];
  if (!items.length) {
    root.replaceChildren();
    setParentSectionVisible(root, false);
    return;
  }
  setParentSectionVisible(root, true);
  const wrapper = make("div", "principle-strip");
  items.forEach((item, index) => {
    const card = make("article", "principle-panel");
    card.append(mediaElement(item.media || { available: false, reason: "principle media unavailable" }));
    const copy = make("div", "principle-copy");
    copy.append(make("span", "step-index", value(item.stage, String.fromCharCode(97 + index))));
    copy.append(make("h3", "", value(item.title)));
    copy.append(make("p", "", value(item.text)));
    card.append(copy);
    wrapper.append(card);
    if (index < items.length - 1) wrapper.append(make("div", "principle-arrow", "->"));
  });
  root.replaceChildren(wrapper);
}

async function renderPointCloudViewer(config = {}) {
  const root = $("point-cloud-viewer");
  const scenes = Array.isArray(config.scenes) && config.scenes.length ? config.scenes : [];
  if (scenes.length) {
    const activeScene = scenes.find((scene) => scene.id === config.active_scene) || scenes[0];
    config = { ...config, ...activeScene, scenes, active_scene: activeScene.id };
    if (!Object.prototype.hasOwnProperty.call(activeScene, "context_src")) config.context_src = "";
  }
  if (pointCloudAnimation) {
    cancelAnimationFrame(pointCloudAnimation);
    pointCloudAnimation = null;
  }
  if (pointCloudResizeHandler) {
    window.removeEventListener("resize", pointCloudResizeHandler);
    pointCloudResizeHandler = null;
  }
  if (!config.src) {
    root.replaceChildren();
    setParentSectionVisible(root, false);
    return;
  }
  setParentSectionVisible(root, true);
  const shell = make("div", "point-cloud-shell");
  const visuals = make("div", "point-cloud-visuals");
  const stage = make("div", "point-cloud-stage");
  const linked = make("div", "point-cloud-linked");
  const miniStage = make("div", "point-cloud-mini-stage");
  const miniCopy = make("div", "point-cloud-mini-copy");
  miniCopy.append(make("b", "", value(config.context_title, "RGB reconstruction context")));
  miniCopy.append(make("span", "", "linked camera view"));
  linked.append(miniStage, miniCopy);
  const info = make("aside", "point-cloud-info");
  info.append(make("h3", "", value(config.title, "Real 3D reconstruction")));
  info.append(make("p", "", value(config.caption)));
  const meta = make("div", "point-meta");
  meta.append(make("span", "", value(config.truth_level)));
  meta.append(make("code", "", value(config.source)));
  info.append(meta);
  const metricPanel = make("div", "point-class-metrics");
  const summary = config.metric_summary || {};
  if (summary.mIoU !== undefined && summary.mIoU !== null) {
    metricPanel.append(make("b", "", `${value(summary.scene, config.active_scene)} pointwise eval`));
    [
      ["mIoU", summary.mIoU],
      ["mAcc", summary.mAcc],
      ["classes", summary.classes],
    ].forEach(([label, number]) => {
      const chip = make("span", "metric-chip");
      chip.append(make("small", "", label));
      chip.append(make("strong", "", typeof number === "number" ? Number(number).toFixed(label === "classes" ? 0 : 4) : value(number)));
      metricPanel.append(chip);
    });
    (config.class_metrics || []).slice(0, 6).forEach((row) => {
      const classRow = make("span", "class-metric-row");
      classRow.append(make("em", "", value(row.class)));
      classRow.append(make("small", "", `IoU ${Number(row.iou).toFixed(3)} / Acc ${Number(row.acc).toFixed(3)}`));
      metricPanel.append(classRow);
    });
    if (config.metric_source) metricPanel.append(make("code", "", value(config.metric_source)));
  } else {
    metricPanel.hidden = true;
  }
  const legendPanel = make("div", "point-cluster-legend");
  legendPanel.hidden = true;
  const controls = make("div", "sequence-controls");
  const rotateButton = make("button", "play-button", "Pause rotation");
  rotateButton.type = "button";
  controls.append(rotateButton);
  if (scenes.length) {
    scenes.forEach((scene) => {
      const button = make("button", "", value(scene.label, scene.id));
      button.type = "button";
      button.classList.toggle("active", scene.id === config.active_scene);
      button.addEventListener("click", () => {
        renderPointCloudViewer({ ...config, active_scene: scene.id });
      });
      controls.append(button);
    });
  }
  const resetButton = make("button", "", "Reset view");
  resetButton.type = "button";
  controls.append(resetButton);
  info.append(controls);
  info.append(metricPanel, legendPanel);
  visuals.append(stage, linked);
  shell.append(visuals, info);
  root.replaceChildren(shell);

  if (!window.THREE) {
    stage.replaceChildren(make("div", "missing-media", "Three.js unavailable"));
    return;
  }

  let autoRotate = true;
  rotateButton.addEventListener("click", () => {
    autoRotate = !autoRotate;
    rotateButton.textContent = autoRotate ? "Pause rotation" : "Resume rotation";
  });

  try {
    const response = await fetch(`${config.src}?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    meta.prepend(make("span", "", `${payload.sample_count} / ${payload.vertex_count_source} points`));
    const legend = payload.label_histogram_top12 || [];
    if (legend.length) {
      legendPanel.hidden = false;
      legendPanel.append(make("b", "", "point colors"));
      legend.slice(0, 10).forEach((item) => {
        const row = make("span", "cluster-row");
        const swatch = make("i", "cluster-swatch");
        swatch.style.background = value(item.color, "#999");
        row.append(swatch);
        row.append(make("em", "", value(item.name, `cluster ${value(item.label)}`)));
        const share = payload.sample_count ? Number(item.count) / Number(payload.sample_count) * 100 : 0;
        row.append(make("small", "", `${value(item.count)} pts / ${share.toFixed(1)}%`));
        legendPanel.append(row);
      });
      if (payload.legend_boundary) legendPanel.append(make("code", "", value(payload.legend_boundary)));
    }

    const viewers = [];
    function createViewer(stageNode, cloudPayload, options = {}) {
      const rect = stageNode.getBoundingClientRect();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(options.background || 0x3f3f3f);
      const camera = new THREE.PerspectiveCamera(45, Math.max(1, rect.width) / Math.max(1, rect.height), 0.01, 1000);
      camera.position.set(4.8, -7.2, 4.4);
      camera.lookAt(0, 0, 0);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(Math.max(260, rect.width), Math.max(160, rect.height));
      stageNode.replaceChildren(renderer.domElement);

      const positions = new Float32Array(cloudPayload.positions);
      const colorsRaw = cloudPayload.colors || [];
      const colors = new Float32Array(colorsRaw.length);
      for (let i = 0; i < colorsRaw.length; i += 1) colors[i] = colorsRaw[i] / 255;
      const boxMin = cloudPayload.bbox_min || [-1, -1, -1];
      const boxMax = cloudPayload.bbox_max || [1, 1, 1];
      const center = [
        (boxMin[0] + boxMax[0]) / 2,
        (boxMin[1] + boxMax[1]) / 2,
        (boxMin[2] + boxMax[2]) / 2,
      ];
      const span = Math.max(boxMax[0] - boxMin[0], boxMax[1] - boxMin[1], boxMax[2] - boxMin[2]) || 1;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] = (positions[i] - center[0]) / span * 6;
        positions[i + 1] = (positions[i + 1] - center[1]) / span * 6;
        positions[i + 2] = (positions[i + 2] - center[2]) / span * 6;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      if (colors.length === positions.length) geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.computeBoundingSphere();
      const material = new THREE.PointsMaterial({
        size: options.pointSize || 0.032,
        vertexColors: colors.length === positions.length,
        color: colors.length === positions.length ? 0xffffff : 0xdddddd,
      });
      const points = new THREE.Points(geometry, material);
      scene.add(points);
      scene.add(new THREE.AmbientLight(0xffffff, 1.0));
      return { stageNode, scene, camera, renderer, points };
    }

    const mainViewer = createViewer(stage, payload, { background: 0x3f3f3f, pointSize: 0.034 });
    viewers.push(mainViewer);
    if (config.context_src) {
      try {
        const contextResponse = await fetch(`${config.context_src}?t=${Date.now()}`);
        if (!contextResponse.ok) throw new Error(`HTTP ${contextResponse.status}`);
        const contextPayload = await contextResponse.json();
        const contextViewer = createViewer(miniStage, contextPayload, { background: 0x222222, pointSize: 0.024 });
        viewers.push(contextViewer);
      } catch (contextError) {
        miniStage.replaceChildren(make("div", "missing-media", `RGB context unavailable: ${contextError.message}`));
      }
    } else {
      linked.hidden = true;
    }

    let yaw = 0;
    let pitch = -Math.PI / 2.7;
    let zoom = 1.0;
    function applyView() {
      viewers.forEach((viewer) => {
        viewer.points.rotation.x = pitch;
        viewer.points.rotation.z = yaw;
        viewer.camera.zoom = zoom;
        viewer.camera.updateProjectionMatrix();
      });
    }
    applyView();

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    stage.addEventListener("pointerdown", (event) => {
      dragging = true;
      autoRotate = false;
      rotateButton.textContent = "Resume rotation";
      lastX = event.clientX;
      lastY = event.clientY;
      stage.setPointerCapture?.(event.pointerId);
    });
    stage.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      yaw += dx * 0.006;
      pitch = Math.max(-2.4, Math.min(0.4, pitch + dy * 0.006));
      applyView();
    });
    function stopDrag(event) {
      dragging = false;
      if (event?.pointerId !== undefined) stage.releasePointerCapture?.(event.pointerId);
    }
    stage.addEventListener("pointerup", stopDrag);
    stage.addEventListener("pointerleave", stopDrag);
    stage.addEventListener("wheel", (event) => {
      event.preventDefault();
      zoom = Math.max(0.55, Math.min(2.8, zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
      applyView();
    }, { passive: false });
    resetButton.addEventListener("click", () => {
      yaw = 0;
      pitch = -Math.PI / 2.7;
      zoom = 1.0;
      applyView();
    });

    function onResize() {
      viewers.forEach((viewer) => {
        const next = viewer.stageNode.getBoundingClientRect();
        const width = Math.max(260, next.width);
        const height = Math.max(160, next.height);
        viewer.camera.aspect = width / height;
        viewer.camera.updateProjectionMatrix();
        viewer.renderer.setSize(width, height);
      });
    }
    pointCloudResizeHandler = onResize;
    window.addEventListener("resize", pointCloudResizeHandler, { passive: true });
    function animate() {
      if (autoRotate) {
        yaw += 0.0045;
        applyView();
      }
      viewers.forEach((viewer) => viewer.renderer.render(viewer.scene, viewer.camera));
      pointCloudAnimation = requestAnimationFrame(animate);
    }
    animate();
  } catch (error) {
    stage.replaceChildren(make("div", "missing-media", `Point cloud unavailable: ${error.message}`));
  }
}

function renderSemanticTasks(section = {}) {
  const root = $("semantic-tasks");
  const items = section.items || [];
  const parent = root.closest(".section");
  if (!items.length) {
    root.replaceChildren();
    if (parent) parent.hidden = true;
    return;
  }
  if (parent) parent.hidden = false;
  const wrapper = make("div", "semantic-task-grid");
  items.forEach((item) => {
    const card = make("article", "semantic-task-card");
    card.append(mediaElement(item.media || { available: false, reason: value(item.status) }));
    const copy = make("div", "semantic-task-copy");
    const top = make("div", "semantic-task-top");
    top.append(make("span", "task-status", value(item.status)));
    top.append(make("code", "", value(item.truth_level)));
    copy.append(top);
    copy.append(make("h3", "", value(item.title)));
    copy.append(make("p", "", value(item.text)));
    card.append(copy);
    wrapper.append(card);
  });
  root.replaceChildren(wrapper);
}

function renderCytoscapeGraph(graph = {}) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  if (!nodes.length) return make("div", "missing-media", "architecture graph unavailable");

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const wrapper = make("div", "cyto-architecture");
  const stage = make("div", "cyto-stage");
  const detail = make("aside", "graph-detail");
  const tool = make("div", "tool-badge");
  tool.append(make("span", "", "Rendered with Cytoscape.js"));
  tool.append(linkNode("project", "https://js.cytoscape.org/"));
  const title = make("h3", "", value(nodes[0].label));
  const body = make("p", "", value(nodes[0].detail));
  detail.append(tool, title, body);

  const list = make("div", "graph-node-list");
  nodes.forEach((node) => {
    const button = make("button", "", value(node.label));
    button.type = "button";
    button.addEventListener("click", () => selectNode(node.id));
    list.append(button);
  });

  wrapper.append(stage, detail, list);

  function selectNode(nodeId) {
    const node = byId.get(nodeId) || nodes[0];
    title.textContent = value(node.label);
    body.textContent = value(node.detail);
    if (wrapper.cy) {
      wrapper.cy.nodes().removeClass("selected");
      wrapper.cy.getElementById(node.id).addClass("selected");
      wrapper.cy.center(wrapper.cy.getElementById(node.id));
    }
  }

  requestAnimationFrame(() => {
    if (!window.cytoscape) {
      stage.replaceChildren(make("div", "missing-media", "Cytoscape.js unavailable"));
      return;
    }
    const palette = ["#2563eb", "#2a9d8f", "#bc5090", "#c88719", "#0d8f72", "#6f4e7c", "#a9690f"];
    wrapper.cy = window.cytoscape({
      container: stage,
      elements: [
        ...nodes.map((node, index) => ({
          data: {
            id: node.id,
            label: value(node.short_label, node.label),
            longLabel: value(node.label),
            detail: value(node.detail),
            color: value(node.color, palette[index % palette.length]),
          },
        })),
        ...edges.map(([source, target]) => ({
          data: { id: `${source}-${target}`, source, target },
        })),
      ],
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            "border-width": 3,
            "border-color": "#ffffff",
            "color": "#24272f",
            "font-size": 12,
            "font-weight": 700,
            "height": 54,
            "label": "data(label)",
            "text-background-color": "#ffffff",
            "text-background-opacity": 0.88,
            "text-background-padding": 3,
            "text-margin-y": 10,
            "text-outline-color": "#ffffff",
            "text-outline-width": 2,
            "text-valign": "bottom",
            "width": 54,
          },
        },
        {
          selector: "edge",
          style: {
            "curve-style": "bezier",
            "line-color": "#9aa5b5",
            "target-arrow-color": "#9aa5b5",
            "target-arrow-shape": "triangle",
            "width": 3,
          },
        },
        {
          selector: "node.selected",
          style: {
            "border-color": "#24272f",
            "border-width": 5,
          },
        },
      ],
      layout: {
        name: "breadthfirst",
        directed: true,
        roots: "#rgbd",
        spacingFactor: 1.25,
        padding: 44,
      },
      minZoom: 0.75,
      maxZoom: 2.2,
      wheelSensitivity: 0.18,
    });
    wrapper.cy.on("tap", "node", (event) => selectNode(event.target.id()));
    selectNode(nodes[0].id);
  });

  return wrapper;
}

function renderNetworkGraph(graph = {}) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  if (graph.tool === "cytoscape") return renderCytoscapeGraph(graph);
  if (!nodes.length) return make("div", "missing-media", "architecture graph unavailable");

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const wrapper = make("div", "network-graph");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "local evidence architecture graph");

  edges.forEach(([source, target]) => {
    const a = byId.get(source);
    const b = byId.get(target);
    if (!a || !b) return;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x);
    line.setAttribute("y2", b.y);
    line.setAttribute("class", "graph-edge");
    svg.append(line);
  });

  nodes.forEach((node, index) => {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", `graph-node graph-node-${index % 4}`);
    group.setAttribute("data-id", node.id);
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", node.x);
    circle.setAttribute("cy", node.y);
    circle.setAttribute("r", "4.2");
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", node.x);
    label.setAttribute("y", Number(node.y) + 8);
    label.setAttribute("text-anchor", "middle");
    label.textContent = value(node.label);
    group.append(circle, label);
    svg.append(group);
  });

  const detail = make("aside", "graph-detail");
  const title = make("h3", "", value(nodes[0].label));
  const body = make("p", "", value(nodes[0].detail));
  detail.append(title, body);

  function selectNode(nodeId) {
    const node = byId.get(nodeId) || nodes[0];
    svg.querySelectorAll(".graph-node").forEach((g) => g.classList.toggle("selected", g.dataset.id === node.id));
    title.textContent = value(node.label);
    body.textContent = value(node.detail);
  }

  svg.querySelectorAll(".graph-node").forEach((g) => {
    g.addEventListener("click", () => selectNode(g.dataset.id));
    g.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") selectNode(g.dataset.id);
    });
  });

  const list = make("div", "graph-node-list");
  nodes.forEach((node) => {
    const button = make("button", "", value(node.label));
    button.type = "button";
    button.addEventListener("click", () => selectNode(node.id));
    list.append(button);
  });

  wrapper.append(svg, detail, list);
  selectNode(nodes[0].id);
  return wrapper;
}

function renderArchitecturePipeline(pipeline = []) {
  if (!pipeline.length) return make("div", "missing-media", "architecture pipeline unavailable");
  const wrapper = make("div", "architecture-flow");
  pipeline.forEach((block, index) => {
    const card = make("article", "architecture-block");
    card.append(make("span", "architecture-stage", value(block.stage, String(index + 1).padStart(2, "0"))));
    card.append(make("h3", "", value(block.title, "Module")));
    const stats = make("div", "architecture-stats");
    (block.stats || []).forEach((stat) => stats.append(make("b", "", value(stat))));
    card.append(stats);
    const artifacts = make("div", "architecture-artifacts");
    (block.artifacts || []).forEach((artifact) => artifacts.append(make("code", "", value(artifact))));
    card.append(artifacts);
    wrapper.append(card);
  });
  return wrapper;
}

function renderArchitecture(architecture = {}) {
  if (architecture.pipeline) {
    $("architecture-media").replaceChildren(renderArchitecturePipeline(architecture.pipeline));
  } else if (architecture.graph) {
    $("architecture-media").replaceChildren(renderNetworkGraph(architecture.graph));
  } else {
    $("architecture-media").replaceChildren(mediaElement(architecture.media || { available: false, reason: "architecture visual not selected" }));
  }
  $("architecture-text").textContent = value(architecture.text);
}

function renderTechnicalStack(items = []) {
  const root = $("technical-stack");
  root.replaceChildren(...items.map((item) => {
    const card = make("article", "stack-card");
    card.append(make("h3", "", value(item.name, "Component")));
    if (item.value !== undefined) {
      const valueLine = make("strong", "stack-value", value(item.value));
      valueLine.append(make("small", "", value(item.unit)));
      card.append(valueLine);
      const meter = make("span", "stack-meter");
      const fill = make("i", "");
      fill.style.width = `${Math.max(3, Math.min(100, Number(item.meter || 0) * 100))}%`;
      meter.append(fill);
      card.append(meter);
    } else {
      card.append(make("p", "", value(item.description)));
    }
    card.append(make("code", "stack-evidence", value(item.evidence)));
    return card;
  }));
}

function renderSequence(section) {
  const items = (section.items || []).filter((item) => item.available);
  if (!items.length) return make("div", "missing-media", "sequence unavailable");

  const wrapper = make("div", "sequence-viewer");
  const stage = make("div", "sequence-stage");
  const image = document.createElement("img");
  const title = make("h4", "");
  const caption = make("p", "");
  const truth = make("small", "");
  let active = 0;
  let timer = null;

  function show(index) {
    active = (index + items.length) % items.length;
    const item = items[active];
    image.src = item.src;
    image.alt = value(item.title, "sequence frame");
    title.textContent = value(item.title);
    caption.textContent = value(item.caption);
    truth.textContent = value(item.truth_level);
    controls.querySelectorAll("button[data-index]").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.index) === active);
    });
  }

  stage.append(image);
  const copy = make("div", "sequence-copy");
  copy.append(title, caption, truth);
  const controls = make("div", "sequence-controls");
  items.forEach((item, index) => {
    const button = make("button", "", value(item.title, `Frame ${index + 1}`));
    button.type = "button";
    button.dataset.index = index;
    button.addEventListener("click", () => show(index));
    controls.append(button);
  });
  const play = make("button", "play-button", "Play");
  play.type = "button";
  play.addEventListener("click", () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      play.textContent = "Play";
    } else {
      timer = setInterval(() => show(active + 1), 1400);
      play.textContent = "Pause";
    }
  });
  controls.prepend(play);
  wrapper.append(stage, copy, controls);
  show(0);
  return wrapper;
}

function renderMediaCard(item) {
  const card = make("article", "media-card");
  card.append(mediaElement(item));
  const copy = make("div", "media-copy");
  copy.append(make("h4", "", value(item.title, "Untitled")));
  copy.append(make("p", "", value(item.caption)));
  copy.append(make("p", "truth-line", value(item.truth_level)));
  card.append(copy);
  return card;
}

function renderMediaSections(sections = []) {
  const root = $("media-sections");
  root.replaceChildren(...sections.map((section) => {
    const wrapper = make("section", "media-section");
    wrapper.append(make("h3", "", value(section.title, "Results")));
    if (section.note) wrapper.append(make("p", "media-note", value(section.note)));
    if (section.display === "sequence") {
      wrapper.append(renderSequence(section));
    } else {
      const grid = make("div", "media-grid");
      (section.items || []).forEach((item) => grid.append(renderMediaCard(item)));
      wrapper.append(grid);
    }
    return wrapper;
  }));
}

function renderMetricSpace(metric = {}) {
  const root = $("metric-space");
  if (!metric.points || !metric.points.length) {
    root.replaceChildren();
    return;
  }
  const shell = make("section", "metric-space-shell");
  const text = make("div", "metric-copy");
  text.append(make("h3", "", value(metric.title)));
  text.append(make("p", "", value(metric.caption)));
  text.append(make("small", "", `${value(metric.truth_level)} | ${value(metric.source)}`));
  const chart = make("div", "metric-chart");
  const canvas = document.createElement("canvas");
  const tooltip = make("div", "metric-tooltip");
  chart.append(canvas, tooltip);
  shell.append(text, chart);
  root.replaceChildren(shell);

  const points = metric.points.map((point) => ({
    scene: value(point.scene),
    x: Number(point.miou),
    y: Number(point.macc),
    status: value(point.status),
  }));

  function draw() {
    const rect = chart.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    canvas.height = Math.max(260, Math.floor(rect.height * dpr));
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const pad = 42;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#d8dde6";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const x = pad + (width - pad * 1.5) * (i / 4);
      const y = height - pad - (height - pad * 1.6) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(x, pad * 0.55);
      ctx.lineTo(x, height - pad);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(width - pad * 0.5, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#24272f";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, pad * 0.55);
    ctx.lineTo(pad, height - pad);
    ctx.lineTo(width - pad * 0.5, height - pad);
    ctx.stroke();
    ctx.fillStyle = "#626a78";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(value(metric.x_label, "x"), width - 132, height - 12);
    ctx.save();
    ctx.translate(14, height / 2 + 42);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(value(metric.y_label, "y"), 0, 0);
    ctx.restore();
    points.forEach((point, index) => {
      const x = pad + point.x * (width - pad * 1.5);
      const y = height - pad - point.y * (height - pad * 1.6);
      ctx.beginPath();
      ctx.fillStyle = ["#1f77b4", "#2a9d8f", "#bc5090", "#f28e2b", "#6f4e7c"][index % 5];
      ctx.arc(x, y, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#24272f";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(point.scene, x + 9, y - 7);
    });
  }

  function nearest(event) {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const pad = 42;
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    let best = null;
    points.forEach((point) => {
      const x = pad + point.x * (width - pad * 1.5);
      const y = height - pad - point.y * (height - pad * 1.6);
      const dist = Math.hypot(mx - x, my - y);
      if (!best || dist < best.dist) best = { point, dist, x, y };
    });
    if (best && best.dist < 42) {
      tooltip.style.opacity = "1";
      tooltip.style.left = `${Math.min(width - 150, best.x + 12)}px`;
      tooltip.style.top = `${Math.max(8, best.y - 12)}px`;
      tooltip.textContent = `${best.point.scene}: mIoU ${best.point.x.toFixed(4)}, mAcc ${best.point.y.toFixed(4)}`;
    } else {
      tooltip.style.opacity = "0";
    }
  }

  if (resizeMetricHandler) window.removeEventListener("resize", resizeMetricHandler);
  resizeMetricHandler = draw;
  window.addEventListener("resize", resizeMetricHandler, { passive: true });
  canvas.addEventListener("mousemove", nearest);
  canvas.addEventListener("mouseleave", () => {
    tooltip.style.opacity = "0";
  });
  requestAnimationFrame(draw);
}

function renderHighlights(items = []) {
  const root = $("highlights");
  root.replaceChildren(...items.map((item) => {
    const card = make("article", "highlight");
    card.append(make("b", "", value(item.label)));
    card.append(make("strong", "", value(item.value)));
    card.append(make("small", "", value(item.note)));
    return card;
  }));
}

function renderH4GSummary(items = []) {
  const root = $("h4g-summary");
  if (!items.length) {
    root.replaceChildren();
    return;
  }
  const wrapper = make("div", "scene-summary");
  wrapper.append(make("h3", "", "H4G292 scene summary"));
  const grid = make("div", "scene-summary-grid");
  items.forEach((item) => {
    const row = make("article", "scene-pill");
    row.append(make("b", "", value(item.scene)));
    row.append(make("strong", "", Number(item.mean_top8_miou).toFixed(4)));
    row.append(make("small", "", `${value(item.seed_count)} seeds | top8 mIoU`));
    grid.append(row);
  });
  wrapper.append(grid);
  root.replaceChildren(wrapper);
}

function renderEvidence(rows = []) {
  const root = $("evidence");
  root.replaceChildren(...rows.map((row) => {
    const tr = document.createElement("tr");
    [row.artifact, row.truth_level, row.source, row.boundary].forEach((item, index) => {
      const td = document.createElement("td");
      if (index === 2) {
        const code = document.createElement("code");
        code.textContent = value(item);
        td.append(code);
      } else {
        td.textContent = value(item);
      }
      tr.append(td);
    });
    return tr;
  }));
}

function renderPublicMethods(rows = [], meta = {}) {
  const root = $("public-methods");
  if (!rows.length) {
    root.replaceChildren();
    return;
  }
  const wrapper = make("details", "public-methods evidence-details");
  wrapper.open = true;
  const summary = make("summary", "", value(meta.title, "Seventeen public-method progress rows"));
  wrapper.append(summary);
  const live = make("div", "live-strip");
  live.append(make("strong", "", value(meta.status, "Local data table")));
  live.append(make("span", "", `Updated ${value(meta.updated_at, "unknown")}`));
  live.append(make("span", "", `Refresh ${value(meta.refresh_interval_seconds, "manual")} s`));
  live.append(make("code", "", value(meta.source)));
  if (meta.boundary) live.append(make("p", "", value(meta.boundary)));
  wrapper.append(live);
  const tableWrap = make("div", "table-wrap");
  const table = document.createElement("table");
  table.className = "methods-table";
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  ["ID", "Method", "Links", "Role", "Metric state", "Scenes", "top8 mIoU", "Current gate"].forEach((name) => header.append(make("th", "", name)));
  thead.append(header);
  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const id = make("td", "method-id", value(row.task_id));
    const method = document.createElement("td");
    method.append(make("b", "", value(row.method)));
    method.append(make("small", "", `${value(row.venue)} ${value(row.year)}`));
    const links = make("td", "method-links");
    if (row.paper_url) links.append(linkNode("paper", row.paper_url));
    if (row.code_url) links.append(linkNode("code", row.code_url));
    if (!row.paper_url && !row.code_url) links.append(make("span", "muted-link", "no link"));
    const role = make("td", "", value(row.recommended_role || row.role || row.tier));
    const metric = document.createElement("td");
    metric.append(statusLabel(row.metric_state));
    const scenes = make("td", "", `${value(row.completed_metric_scenes, "0")} / ${value(row.full8_scenes, "8")}`);
    const top8 = make("td", "number-cell", value(row.top8_miou, "not run"));
    const gate = document.createElement("td");
    const code = document.createElement("code");
    code.textContent = value(row.current_gate);
    gate.append(code);
    tr.append(id, method, links, role, metric, scenes, top8, gate);
    tbody.append(tr);
  });
  table.append(thead, tbody);
  tableWrap.append(table);
  wrapper.append(tableWrap);
  root.replaceChildren(wrapper);
}

function renderBenchmarkStatus(status = {}) {
  const root = $("benchmark-status");
  if (!root) return;
  const cards = make("div", "benchmark-status-grid");
  const active = status.active_processes || [];
  const summaryCards = [
    ["Remote", active.length ? `${active.length} active` : "no active process", value(status.status)],
    ["PanoGS scenes", `${(status.completed_scenes || []).length} / ${(status.full8_target || []).length || 8}`, `pending ${value((status.pending_scenes || []).join(", "), "none")}`],
    ["Mean mIoU", status.mean_completed_miou !== undefined && status.mean_completed_miou !== null ? Number(status.mean_completed_miou).toFixed(4) : "n/a", "completed pointwise scenes"],
    ["Mean mAcc", status.mean_completed_macc !== undefined && status.mean_completed_macc !== null ? Number(status.mean_completed_macc).toFixed(4) : "n/a", "completed pointwise scenes"],
  ];
  summaryCards.forEach(([label, valueText, note]) => {
    const card = make("article", "benchmark-card");
    card.append(make("b", "", label));
    card.append(make("strong", "", valueText));
    card.append(make("small", "", note));
    cards.append(card);
  });
  const sceneStrip = make("div", "scene-metric-strip");
  (status.scene_metrics || []).forEach((row) => {
    const chip = make("span", "scene-metric-chip");
    chip.append(make("b", "", value(row.scene)));
    chip.append(make("small", "", `mIoU ${Number(row.mIoU).toFixed(4)} · mAcc ${Number(row.mAcc).toFixed(4)}`));
    sceneStrip.append(chip);
  });
  if (!sceneStrip.children.length) sceneStrip.append(make("span", "muted-link", "no pointwise metrics synced"));
  const experimentRows = status.server_experiments || [];
  const experimentTableWrap = make("div", "table-wrap benchmark-experiment-table");
  const experimentTable = document.createElement("table");
  const experimentHead = document.createElement("thead");
  const experimentHeader = document.createElement("tr");
  ["Current experiment", "Status", "Running", "Metrics", "Next action", "Source"].forEach((name) => experimentHeader.append(make("th", "", name)));
  experimentHead.append(experimentHeader);
  const experimentBody = document.createElement("tbody");
  experimentRows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.append(make("td", "", value(row.experiment)));
    tr.append(make("td", "", value(row.status)));
    tr.append(make("td", "", value(row.running)));
    tr.append(make("td", "", value(row.metrics)));
    tr.append(make("td", "", value(row.next_action)));
    const source = document.createElement("td");
    const code = document.createElement("code");
    code.textContent = value(row.source);
    source.append(code);
    tr.append(source);
    experimentBody.append(tr);
  });
  experimentTable.append(experimentHead, experimentBody);
  experimentTableWrap.append(experimentTable);
  const live = make("div", "live-strip benchmark-live");
  live.append(make("strong", "", `Snapshot ${value(status.generated_at, "not refreshed")}`));
  live.append(make("code", "", value(status.source)));
  if (status.boundary) live.append(make("p", "", value(status.boundary)));
  root.replaceChildren(cards, experimentTableWrap, sceneStrip, live);
}

function evidenceCell(row) {
  const cell = make("td", "evidence-cell");
  cell.append(make("b", "", value(row.evidence, "not recorded")));
  if (row.source) {
    const code = make("code", "", compactPath(row.source));
    code.title = value(row.source);
    cell.append(code);
  }
  if (row.truth_level) {
    const truth = make("small", "", compactTruth(row.truth_level));
    truth.title = value(row.truth_level);
    cell.append(truth);
  }
  return cell;
}

function renderQuantitativeResults(section = {}) {
  const root = $("quantitative-results");
  if (!root) return;
  const cards = section.cards || [];
  const mainRows = section.main_table || [];
  const diagnosticRows = section.diagnostics || [];
  setParentSectionVisible(root, Boolean(cards.length || mainRows.length || diagnosticRows.length));
  if (!cards.length && !mainRows.length && !diagnosticRows.length) {
    root.replaceChildren();
    return;
  }

  const cardGrid = make("div", "quant-card-grid");
  cards.forEach((card) => {
    const item = make("article", "quant-card");
    item.append(make("b", "", value(card.label)));
    item.append(make("strong", "", value(card.value)));
    item.append(make("small", "", value(card.detail)));
    cardGrid.append(item);
  });

  const note = make("p", "quant-note", value(section.note));
  const mainWrap = make("div", "table-wrap quant-table-wrap");
  const mainTable = document.createElement("table");
  mainTable.className = "quant-table";
  const mainHead = document.createElement("thead");
  const mainHeader = document.createElement("tr");
  ["Method", "Evidence", "N", "mIoU", "mAcc", "Top8 mIoU", "Present mIoU", "Completion IoU", "Status"].forEach((name) => mainHeader.append(make("th", "", name)));
  mainHead.append(mainHeader);
  const mainBody = document.createElement("tbody");
  mainRows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.append(make("td", "method-name", value(row.method)));
    tr.append(evidenceCell(row));
    tr.append(make("td", "number-cell", value(row.n)));
    tr.append(make("td", "number-cell", value(row.miou)));
    tr.append(make("td", "number-cell", value(row.macc)));
    tr.append(make("td", "number-cell", value(row.top8_miou)));
    tr.append(make("td", "number-cell", value(row.present_miou)));
    tr.append(make("td", "number-cell", value(row.completion_iou)));
    const status = make("td", "status-cell");
    const chip = statusLabel(row.status);
    if (row.status_detail) chip.title = value(row.status_detail);
    status.append(chip);
    mainBody.append(tr);
    tr.append(status);
  });
  mainTable.append(mainHead, mainBody);
  mainWrap.append(mainTable);

  const diagTitle = make("h3", "quant-subtitle", value(section.diagnostics_title, "Diagnostics"));
  const diagNote = make("p", "quant-note", value(section.diagnostics_note));
  const diagWrap = make("div", "table-wrap quant-table-wrap");
  const diagTable = document.createElement("table");
  diagTable.className = "quant-table diagnostic-table";
  const diagHead = document.createElement("thead");
  const diagHeader = document.createElement("tr");
  ["Scene", "Classes", "mIoU", "mAcc", "Strongest classes", "Evidence", "Decision"].forEach((name) => diagHeader.append(make("th", "", name)));
  diagHead.append(diagHeader);
  const diagBody = document.createElement("tbody");
  diagnosticRows.forEach((row) => {
    const tr = document.createElement("tr");
    if (value(row.decision).includes("next run")) tr.className = "diagnostic-pending";
    else tr.className = "diagnostic-retained";
    tr.append(make("td", "method-name", value(row.scene)));
    tr.append(make("td", "number-cell", value(row.classes)));
    tr.append(make("td", "number-cell", value(row.miou)));
    tr.append(make("td", "number-cell", value(row.macc)));
    tr.append(make("td", "", value(row.strongest_classes)));
    tr.append(evidenceCell(row));
    tr.append(make("td", "", value(row.decision)));
    diagBody.append(tr);
  });
  diagTable.append(diagHead, diagBody);
  diagWrap.append(diagTable);

  root.replaceChildren(cardGrid, note, mainWrap, diagTitle, diagNote, diagWrap);
}

function renderBenchmarkPerformance(section = {}) {
  const root = $("benchmark-performance");
  if (!root) return;
  const rows = section.rows || [];
  if (!rows.length) {
    root.replaceChildren();
    return;
  }
  const wrapper = make("div", "benchmark-performance");
  wrapper.append(make("h3", "", value(section.title, "Benchmark performance")));
  if (section.note) wrapper.append(make("p", "media-note", value(section.note)));
  const tableWrap = make("div", "table-wrap");
  const table = document.createElement("table");
  table.className = "benchmark-table";
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  ["ID", "Method", "Local status", "mIoU / mAcc", "ReplicaOcc metrics", "Paper protocol or reported result", "Links"].forEach((name) => header.append(make("th", "", name)));
  thead.append(header);
  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.append(make("td", "method-id", value(row.task_id)));
    const method = make("td", "");
    method.append(make("b", "", value(row.method)));
    method.append(make("small", "", `${value(row.venue)} · ${value(row.local_status)} · ${value(row.local_scenes)}`));
    const local = make("td", "", value(row.local_performance));
    const localStatus = make("td", "");
    localStatus.append(statusLabel(row.local_status));
    localStatus.append(make("small", "", `${value(row.local_scenes)} scenes`));
    localStatus.append(make("small", "", value(row.local_performance)));
    const miou = make("td", "number-cell", value(row.local_miou || row.local_macc ? `${value(row.local_miou, "n/a")} / ${value(row.local_macc, "n/a")}` : "not run"));
    const replicaMetrics = make("td", "");
    replicaMetrics.append(make("small", "", `top8 ${value(row.top8_miou, "not run")}`));
    replicaMetrics.append(make("small", "", `present ${value(row.present_miou, "not run")}`));
    replicaMetrics.append(make("small", "", `completion ${value(row.completion_iou, "not run")}`));
    const paper = make("td", "");
    paper.append(make("b", "", value(row.paper_protocol)));
    paper.append(make("small", "", value(row.paper_reported_result)));
    const links = make("td", "method-links");
    if (row.paper_url) links.append(linkNode("paper", row.paper_url));
    if (row.code_url) links.append(linkNode("code", row.code_url));
    if (!row.paper_url && !row.code_url) links.append(make("span", "muted-link", "no link"));
    tr.append(method, localStatus, miou, replicaMetrics, paper, links);
    tbody.append(tr);
  });
  table.append(thead, tbody);
  tableWrap.append(table);
  wrapper.append(tableWrap);
  root.replaceChildren(wrapper);
}

function renderFoundationVisual(stage = {}) {
  const visual = stage.visual || {};
  const box = make("div", `research-stage-visual research-stage-visual-${value(visual.kind, "none")}`);

  if (visual.kind === "image" || visual.kind === "video") {
    const media = mediaElement({
      available: visual.available !== false,
      src: visual.src,
      poster: visual.poster,
      sources: visual.sources,
      autoplay: visual.autoplay,
      muted: visual.muted,
      loop: visual.loop,
      controls: visual.controls,
      title: stage.title,
      reason: visual.reason,
    });
    box.append(media);
  } else if (visual.kind === "gallery") {
    const grid = make("div", "research-visual-gallery");
    (visual.items || []).slice(0, 4).forEach((item) => {
      const tile = make("figure", "research-gallery-tile");
      tile.append(mediaElement({ ...item, available: item.available !== false }, ""));
      if (item.label) tile.append(make("figcaption", "", value(item.label)));
      grid.append(tile);
    });
    box.append(grid);
  } else if (visual.kind === "metrics") {
    const rows = make("div", "research-mini-metrics");
    (visual.rows || []).forEach((row) => {
      const line = make("div", "research-mini-metric");
      line.append(make("span", "", value(row.label)));
      line.append(make("strong", "", value(row.value)));
      rows.append(line);
    });
    box.append(rows);
  } else if (visual.kind === "packet") {
    const flow = make("div", "research-packet-flow");
    (visual.items || []).forEach((item) => flow.append(make("span", "", value(item))));
    box.append(flow);
  } else if (visual.kind === "anchor") {
    const link = document.createElement("a");
    link.href = value(visual.href, "#scene-capture");
    link.className = "research-anchor-visual";
    if (visual.poster) {
      link.append(mediaElement({ available: true, src: visual.poster, title: stage.title }, ""));
    }
    link.append(make("span", "", value(visual.label, "Open local view")));
    box.append(link);
  } else {
    box.append(make("div", "missing-media", value(visual.reason, "visual pending local run")));
  }

  if (visual.caption) box.append(make("p", "research-visual-caption", value(visual.caption)));
  return box;
}

function renderResearchEvolution(section = {}) {
  const root = $("research-evolution");
  const note = $("research-evolution-note");
  if (!root) return;
  const stages = section.stages || [];
  if (note) note.textContent = value(section.note);
  setParentSectionVisible(root, Boolean(stages.length));
  if (!stages.length) {
    root.replaceChildren();
    return;
  }

  const grid = make("div", "research-evolution-grid");
  stages.forEach((stage, index) => {
    const card = make("article", "research-stage");
    const head = make("div", "research-stage-head");
    head.append(make("span", "research-stage-index", String(index + 1).padStart(2, "0")));
    head.append(make("h3", "", value(stage.title)));
    head.append(statusLabel(stage.truth_level));
    card.append(head);
    if (stage.state_label) card.append(make("p", "research-state-label", value(stage.state_label)));
    card.append(renderFoundationVisual(stage));
    if (stage.summary) card.append(make("p", "research-stage-summary", value(stage.summary)));

    const benchmarks = make("div", "research-benchmarks");
    (stage.benchmarks || []).forEach((benchmark) => {
      benchmarks.append(make("span", "research-benchmark-chip", value(benchmark)));
    });
    card.append(benchmarks);

    const methods = make("div", "research-methods");
    (stage.methods || []).forEach((method) => {
      const node = linkNode(value(method.name), method.url);
      node.className = node.className ? `${node.className} research-method-link` : "research-method-link";
      methods.append(node);
    });
    card.append(methods);

    const evidence = make("p", "research-local-evidence", value(stage.local_evidence));
    card.append(evidence);
    grid.append(card);
  });
  root.replaceChildren(grid);
}

function renderTimeline(items = []) {
  const root = $("timeline");
  root.replaceChildren(...items.map((item) => {
    const row = make("article", "timeline-item");
    row.append(make("time", "", value(item.time)));
    row.append(make("strong", "", value(item.title)));
    row.append(make("p", "", value(item.detail)));
    return row;
  }));
}

function renderList(id, tag, items = []) {
  const root = $(id);
  root.replaceChildren(...items.map((item) => make(tag, "", value(item))));
}

function render(data) {
  document.title = value(data.title, "Research Project Page");
  $("venue").textContent = value(data.venue, "Local research progress");
  $("title").textContent = value(data.title, "Research Project Page");
  $("subtitle").textContent = value(data.subtitle);
  $("authors").textContent = (data.authors || []).join(", ");
  renderAbstract(data.abstract, data.abstract_points || []);
  renderResearchEvolution(data.research_evolution || {});
  $("video-note").textContent = value(data.video_note);
  renderButtons(data.buttons || []);
  renderTeaser(data.teaser || {}, data.hero_slider || {});
  renderQuantitativeResults(data.quantitative_results || {});
  renderPrincipleVisual(data.principle_visual || {});
  renderMethod(data.method || {});
  renderAlgorithmDetails(data.algorithm_details || {});
  renderDataProtocol(data.data_protocol || {});
  renderArchitecture(data.architecture || {});
  renderTechnicalStack(data.technical_stack || []);
  renderPointCloudViewer(data.point_cloud_viewer || {});
  renderSemanticTasks(data.semantic_tasks || {});
  renderMetricSpace(data.metric_space || {});
  renderMediaSections(data.media_sections || []);
  setSectionVisible("dynamic-results", Boolean((data.metric_space?.points || []).length || (data.media_sections || []).length));
  renderHighlights(data.result_highlights || []);
  renderH4GSummary(data.h4g292_scene_summary || []);
  renderEvidence(data.evidence || []);
  renderBenchmarkStatus(data.benchmark_status || {});
  renderBenchmarkPerformance(data.benchmark_performance || {});
  renderPublicMethods(data.public_methods || [], data.public_methods_meta || {});
  renderTimeline(data.timeline || []);
  renderList("boundaries", "li", data.boundaries || []);
  renderList("next-actions", "li", data.next_actions || []);
  scheduleRefresh(data.refresh_interval_seconds);
}

async function load() {
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
  } catch (error) {
    $("title").textContent = "Unable to load project data";
    $("subtitle").textContent = error.message;
  }
}

function scheduleRefresh(seconds) {
  const interval = Number(seconds);
  if (refreshTimer) clearTimeout(refreshTimer);
  if (!Number.isFinite(interval) || interval < 10) return;
  refreshTimer = setTimeout(load, interval * 1000);
}

load();
