import { app, tick } from "./renderer/pixi.js";
import viewport from "./renderer/viewport.js";
import {
  loadSimulation,
  fitSimulation,
  modifySpecification,
  getKeyframesCount,
  drawSimulation,
} from "./simulator/api.js";
import { BlockSize, debounce, sanitizeHtml } from "./helpers.js";
import { initializeDropdowns } from "./dropdown.js";
import { state, resetState, pushChange } from "./state.js";
import { redrawGrid, setGridTheme, setGridVisible } from "./renderer/grid.js";
import Operation from "./operation.js";
import addSystemOperation from "./operations/systemAdd.js";
import setTitleOperation from "./operations/setTitle.js";
import moveOperation from "./operations/move.js";
import setSystemParentOperation from "./operations/systemSetParent.js";
import linkOperation from "./operations/link.js";
import eraseOperation from "./operations/erase.js";
import transferDataOperation from "./operations/flowTransferData.js";
import paintOperation from "./operations/paint.js";
import {
  getJsonEditorValue,
  isJsonEditorOpen,
  openJsonEditor,
  setJsonEditorValue,
} from "./jsonEditor.js";
import {
  getUrlParams,
  setUrlParams,
  load,
  save,
  resetUrlParams,
} from "./persistence.js";
import { getThemeOnLoad } from "./theme.js";
import { setConnectivity, connectivityStatus } from "./connectivity.js";

const canvasContainer = document.getElementById("canvas") as HTMLDivElement;

const saveDataIsLoading = document.getElementById(
  "save-data-is-loading",
) as HTMLElement;

const loadFileFailed = document.getElementById(
  "load-file-failed-dialog",
) as HTMLDialogElement;

//
// Events
//

// The user moves the cursor in the canvas.
canvasContainer.addEventListener("pointermove", event => {
  if (isModalOpen() || isInitialLoad()) {
    return;
  }

  if (viewport.moving) {
    viewport.move(event.pointerId, event.x, event.y);
  }

  updateStatePosition(event.x, event.y);

  if (viewport.moving) {
    redrawGrid();
  } else {
    state.operation.onPointerMove(state);
  }

  tick();
});

// The user press the pointer in the canvas.
canvasContainer.addEventListener("pointerdown", event => {
  if (isModalOpen() || isInitialLoad()) {
    return;
  }

  viewport.startMoving(event.pointerId, event.x, event.y);

  // Only consider left mouse button for operations.
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  updateStatePosition(event.x, event.y);
  state.operation.onPointerDown(state);
  tick();
});

// The user release the pointer in the canvas.
canvasContainer.addEventListener("pointerup", event => {
  if (isModalOpen() || isInitialLoad()) {
    return;
  }

  viewport.stopMoving(event.pointerId);

  if (viewport.moving) {
    return;
  }

  // Only consider left mouse button for operations.
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  updateStatePosition(event.x, event.y);
  state.operation.onPointerUp(state);
  tick();
});

// The user spin the mouse wheel.
canvasContainer.addEventListener("wheel", event => {
  if (event.deltaY > 0) {
    viewport.zoomAt(-0.1, event.x, event.y);

    redrawGrid();
    tick();
  } else if (event.deltaY < 0) {
    viewport.zoomAt(0.1, event.x, event.y);

    redrawGrid();
    tick();
  }
});

// The user cursor enters the canvas.
canvasContainer.addEventListener("pointerenter", () => {
  if (isModalOpen() || isInitialLoad()) {
    return;
  }

  state.operation.onUnmute(state);
  tick();
});

// The user cursor leaves the canvas.
canvasContainer.addEventListener("pointerleave", event => {
  if (isModalOpen() || isInitialLoad()) {
    return;
  }

  viewport.stopMoving(event.pointerId);

  state.operation.onMute(state);
  tick();
});

// Resize the container when the window is resized.
window.addEventListener(
  "resize",
  debounce(() => {
    const canvasContainer = document.getElementById("canvas") as HTMLDivElement;

    app.renderer.resize(
      canvasContainer.clientWidth,
      canvasContainer.clientHeight,
    );

    viewport.resize(canvasContainer.clientWidth, canvasContainer.clientHeight);

    redrawGrid();
    tick();
  }, 30),
);

// The user press a key on the keyboard.
window.addEventListener("keydown", event => {
  if (isModalOpen()) {
    return;
  }

  // The user press "Esc" to cancel any ongoing operation.
  if (event.key === "Escape" || event.key === "1") {
    switchOperation(moveOperation);
  } else if (event.key === "3") {
    switchOperation(addSystemOperation);
  } else if (event.key === "e") {
    switchOperation(setTitleOperation);
  } else if (event.key === "q") {
    switchOperation(linkOperation);
  } else if (event.key === "4") {
    switchOperation(setSystemParentOperation);
  } else if (event.key === "2") {
    switchOperation(eraseOperation);
  } else if (event.key === "a") {
    switchOperation(transferDataOperation);
  } else if (event.key === "r") {
    switchOperation(paintOperation);
  } else if (event.key === " ") {
    if (state.flowPlay) {
      pauseFlow();
    } else {
      playFlow();
    }

    event.preventDefault();
  } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
    goToPreviousKeyframe();
  } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
    goToNextKeyframe();
  } else if (event.key === "[") {
    undo();
  } else if (event.key === "]") {
    redo();
  } else if (event.key === "=") {
    cameraFit();
  } else if (event.key === "+") {
    cameraZoomIn();
  } else if (event.key === "-") {
    cameraZoomOut();
  } else if (event.key === "w") {
    if (!linkPatternPipe.classList.contains("hidden")) {
      setLinkPatternSolid();
    } else if (!linkPatternSolid.classList.contains("hidden")) {
      setLinkPatternDotted();
    } else {
      setLinkPatternPipe();
    }
  }

  tick();
});

// The user modifies the URL manually.
window.addEventListener("hashchange", () => {
  resetState();

  const urlParams = getUrlParams();

  state.flowPlay = urlParams.autoplay;
  state.flowSpeed = urlParams.speed;

  loadSaveData();
});

//
// JSON editor operations
//

document
  .getElementById("operation-json-editor-open")
  ?.addEventListener("click", function () {
    state.operation.onEnd(state);
    openJsonEditor();
  });

document
  .getElementById("operation-json-editor-apply-changes")
  ?.addEventListener("click", async function () {
    const json = getJsonEditorValue();

    if (!json) {
      return;
    }

    try {
      await loadSimulation(json);
    } catch {
      setJsonEditorValue(state.changes[state.changeIndex]);
      loadFileFailed.showModal();

      return;
    }

    state.operation.onEnd(state);
    pushChange(json);

    save(json)
      .then(() => setConnectivity(isLocalFile() ? "local-file" : "ok"))
      .catch(() => setConnectivity("save-failed"));

    updateFlowProgression();
    tick();
  });

//
// Help operations
//

const guide = document.getElementById("guide") as HTMLDialogElement;

document
  .getElementById("operation-help-guide")
  ?.addEventListener("click", function () {
    state.operation.onMute(state);

    guide.inert = true;
    guide.showModal();
    guide.inert = false;
  });

const about = document.getElementById("about") as HTMLDialogElement;

document
  .getElementById("operation-help-about")
  ?.addEventListener("click", function () {
    state.operation.onMute(state);

    about.inert = true;
    about.showModal();
    about.inert = false;
  });

const privacy = document.getElementById("privacy") as HTMLDialogElement;

document
  .getElementById("operation-help-privacy")
  ?.addEventListener("click", function () {
    state.operation.onMute(state);

    privacy.inert = true;
    privacy.showModal();
    privacy.inert = false;
  });

//
// Theme operations
//

const theme = document.getElementById("theme") as HTMLDialogElement;

document
  .getElementById("operation-theme")
  ?.addEventListener("click", function () {
    state.operation.onMute(state);

    theme.inert = true;
    theme.showModal();
    theme.inert = false;
  });

document
  .getElementById("operation-theme-light")
  ?.addEventListener("click", function () {
    state.theme = "light";

    window.localStorage.setItem("theme", state.theme);
    document.documentElement.setAttribute("theme", state.theme);

    setGridTheme(state.theme);

    drawSimulation();

    theme.close();
  });

document
  .getElementById("operation-theme-dark")
  ?.addEventListener("click", function () {
    state.theme = "dark";

    window.localStorage.setItem("theme", state.theme);
    document.documentElement.setAttribute("theme", state.theme);

    setGridTheme(state.theme);

    drawSimulation();

    theme.close();
  });

document
  .getElementById("operation-theme-system")
  ?.addEventListener("click", function () {
    window.localStorage.removeItem("theme");
    document.documentElement.removeAttribute("theme");

    state.theme = getThemeOnLoad();
    setGridTheme(state.theme);

    drawSimulation();

    theme.close();
  });

//
// File operations
//

async function newFile(): Promise<void> {
  resetUrlParams();

  // Local file.
  let json = JSON.stringify(
    {
      specificationVersion: "1.0.0",
      title: "Untitled graph",
    },
    null,
    2,
  );

  // Cloud file.
  if (state.profile.authenticated) {
    if (state.profile.readOnly) {
      // When in read-only, a local file is created.
      setConnectivity("read-only");
    } else {
      try {
        const response = await fetch("/api/graphs", { method: "POST" });

        if (response.ok) {
          const graph = await response.json();

          json = JSON.stringify(graph.data, null, 2);

          const urlParams = getUrlParams();

          urlParams.id = graph.id;

          setUrlParams(urlParams);

          setConnectivity("ok");
        } else {
          // Fallback: a local file is created.
          setConnectivity("local-file");
        }
      } catch {
        // Fallback: a local file is created.
        setConnectivity("local-file");
      }
    }
  }

  resetState();
  setJsonEditorValue(json);

  await loadSimulation(json);

  updateFlowProgression();
  pushChange(json);

  save(json)
    .then(() => setConnectivity(isLocalFile() ? "local-file" : "ok"))
    .catch(() => setConnectivity("save-failed"));

  const canvasContainer = document.getElementById("canvas") as HTMLDivElement;

  const width = canvasContainer.offsetWidth * 1.5;
  const height = canvasContainer.offsetHeight * 1.5;

  viewport.fit(width / 2, height / 2, width, height);

  redrawGrid();
  tick();
}

function isLocalFile(): boolean {
  return !!getUrlParams().file;
}

document
  .getElementById("operation-file-new")
  ?.addEventListener("click", function () {
    // When the user creates a new file, we save the current file in the browser
    // history. That way, we don't need a confirmation dialog that asks
    // "are you sure you want to abandon the current work?" as the current work
    // is not lost.
    window.history.pushState({}, "");

    newFile().then(() => {
      saveDataIsLoading.classList.add("hidden");
    });
  });

document
  .getElementById("operation-file-save-to-disk")
  ?.addEventListener("click", function () {
    const json = getJsonEditorValue();

    // Create a download link.
    const link = document.createElement("a");

    link.setAttribute("href", `data:application/json;base64,${btoa(json)}`);

    link.setAttribute(
      "download",
      `gg.${new Date().toJSON().replaceAll(":", ".")}.json`,
    );

    // Click on the download link.
    link.click();
  });

document
  .getElementById("operation-file-save-to-cloud")
  ?.addEventListener("click", function () {
    save(getJsonEditorValue())
      .then(() => setConnectivity(isLocalFile() ? "local-file" : "ok"))
      .catch(() => setConnectivity("save-failed"));
  });

const fileFromDisk = document.getElementById(
  "file-from-disk",
) as HTMLInputElement;

document
  .getElementById("operation-file-open-from-disk")
  ?.addEventListener("click", function () {
    fileFromDisk.click();
  });

fileFromDisk.addEventListener("change", async function () {
  if (fileFromDisk.files && fileFromDisk.files.length > 0) {
    const reader = new FileReader();

    reader.readAsText(fileFromDisk.files[0]);

    reader.addEventListener("load", function () {
      if (reader.result) {
        resetUrlParams();
        loadSaveData(reader.result?.toString()).then(() => {
          save(getJsonEditorValue())
            .then(() => setConnectivity(isLocalFile() ? "local-file" : "ok"))
            .catch(() => setConnectivity("save-failed"));
        });
      }
    });
  }
});

document
  .getElementById("operation-export-png")
  ?.addEventListener("click", function () {
    // Finish any ongoing operation.
    state.operation.onEnd(state);

    // Stop PixiJS.
    app.stop();

    // Hide the grid.
    setGridVisible(false);

    // Hide flow animations.
    state.flowPlayer?.hide();

    // Set light theme.
    state.theme = "light";

    // Draw the simulation with the right theme.
    drawSimulation();

    // Extract the viewport on an HTML canvas.
    // @ts-ignore
    const viewportCanvas = app.renderer.extract.canvas(viewport);

    // Create a destination canvas that will be exported in PNG.
    const exportCanvas = document.createElement("canvas");

    const margin = 20;

    const backlinkWidth =
      state.profile.authenticated && !state.profile.readOnly ? 0 : 150;

    const backlinkHeight =
      state.profile.authenticated && !state.profile.readOnly ? 0 : 22;

    // Add margin around the graph.
    // Add some space at the bottom of the image for the backlink.
    exportCanvas.width =
      Math.max(backlinkWidth, viewportCanvas.width) + margin * 2;

    exportCanvas.height = viewportCanvas.height + margin * 2 + backlinkHeight;

    // Start drawing.
    const context = exportCanvas.getContext("2d")!;

    // Draw a white background.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Draw the viewport on the canvas.
    context.drawImage(viewportCanvas as HTMLCanvasElement, margin, margin);

    // Draw the backlink.
    context.fillStyle = "#000000";

    context.fillRect(
      0,
      exportCanvas.height - backlinkHeight,
      exportCanvas.width,
      backlinkHeight,
    );

    context.fillStyle = "#ffffff";
    context.font = "16px ibm";
    context.textAlign = "end";

    context.fillText(
      "Made with gg-charts.com",
      exportCanvas.width - 6,
      exportCanvas.height - 6,
    );

    // Export the canvas to a data URL.
    const dataUri = exportCanvas.toDataURL();

    // Create a download link.
    const link = document.createElement("a");

    link.setAttribute("href", dataUri);

    link.setAttribute(
      "download",
      `gg.${new Date().toJSON().replaceAll(":", ".")}.png`,
    );

    // Click on the download link.
    link.click();

    // Show the grid.
    setGridVisible(true);

    // Show the flow animations.
    state.flowPlayer?.draw();

    // Set user theme.
    state.theme = getThemeOnLoad();

    // Draw the simulation with the right theme.
    drawSimulation();

    // Start PixiJS.
    app.start();
  });

//
// View operations
//

document
  .getElementById("operation-goto-viewer")
  ?.addEventListener("click", function () {
    window.location.replace(`/viewer.html${window.location.hash}`);
  });

const fileProperties = document.getElementById(
  "file-properties",
) as HTMLDialogElement;

const graphTitle = document.getElementById(
  "option-graph-title",
) as HTMLInputElement;

const autoplay = document.getElementById("option-autoplay") as HTMLInputElement;
const speed = document.getElementById("option-speed") as HTMLInputElement;

document
  .getElementById("operation-file-properties-open")
  ?.addEventListener("click", function () {
    graphTitle.value = JSON.parse(getJsonEditorValue()).title;

    const params = getUrlParams();

    autoplay.checked = params.autoplay;
    speed.value = params.speed.toString();

    fileProperties.inert = true;
    fileProperties.showModal();
    fileProperties.inert = false;
  });

graphTitle.addEventListener("change", function () {
  const currentSpecification = JSON.parse(getJsonEditorValue());

  const newTitle = graphTitle.value;

  if (newTitle === currentSpecification.title) {
    return;
  }

  currentSpecification.title = newTitle;

  const newSpecification = JSON.stringify(currentSpecification, null, 2);

  setJsonEditorValue(newSpecification);

  pushChange(newSpecification);

  save(newSpecification)
    .then(() => setConnectivity(isLocalFile() ? "local-file" : "ok"))
    .catch(() => setConnectivity("save-failed"));
});

autoplay.addEventListener("change", function () {
  const urlParams = getUrlParams();

  urlParams.autoplay = autoplay.checked;

  setUrlParams(urlParams);
});

speed.addEventListener("change", function () {
  const value = Number(speed.value);

  const urlParams = getUrlParams();

  urlParams.speed = !isNaN(value) ? Math.max(0.1, Math.min(5, value)) : 1;

  setUrlParams(urlParams);

  state.flowSpeed = urlParams.speed;
});

//
// Undo / Redo operations.
//

function undo(): void {
  if (state.changeIndex > 0) {
    state.changeIndex -= 1;

    const json = state.changes[state.changeIndex];

    state.operation.onEnd(state);
    setJsonEditorValue(json);

    loadSimulation(json)
      .then(() => {
        updateFlowProgression();
        tick();

        save(json)
          .then(() => setConnectivity(isLocalFile() ? "local-file" : "ok"))
          .catch(() => setConnectivity("save-failed"));
      })
      .catch(() => {
        /* NOOP */
      });
  }
}

function redo(): void {
  if (state.changeIndex < state.changes.length - 1) {
    state.changeIndex += 1;

    const json = state.changes[state.changeIndex];

    state.operation.onEnd(state);
    setJsonEditorValue(json);

    loadSimulation(json)
      .then(() => {
        updateFlowProgression();
        tick();

        save(json)
          .then(() => setConnectivity(isLocalFile() ? "local-file" : "ok"))
          .catch(() => setConnectivity("save-failed"));
      })
      .catch(() => {
        /* NOOP */
      });
  }
}

document.getElementById("operation-undo")?.addEventListener("click", undo);
document.getElementById("operation-redo")?.addEventListener("click", redo);

//
// Camera operations.
//

function cameraFit(): void {
  fitSimulation();
  redrawGrid();
  tick();
}

function cameraZoomIn(): void {
  viewport.zoomCenter(0.25);

  redrawGrid();
  tick();
}

function cameraZoomOut(): void {
  viewport.zoomCenter(-0.25);

  redrawGrid();
  tick();
}

document
  .getElementById("operation-camera-fit")
  ?.addEventListener("click", cameraFit);

document
  .getElementById("operation-camera-zoom-in")
  ?.addEventListener("click", cameraZoomIn);

document
  .getElementById("operation-camera-zoom-out")
  ?.addEventListener("click", cameraZoomOut);

//
// Flow operations
//

const flowPlay = document.getElementById("operation-flow-play")!;
const flowPause = document.getElementById("operation-flow-pause")!;
const flowRepeatOne = document.getElementById("operation-flow-repeat-one")!;
const flowRepeatAll = document.getElementById("operation-flow-repeat-all")!;

const flowPreviousKeyframe = document.getElementById(
  "operation-flow-previous-keyframe",
)!;

const flowNextKeyframe = document.getElementById(
  "operation-flow-next-keyframe",
)!;

function playFlow(): void {
  state.flowPlay = true;
  app.ticker.start();

  flowPlay.classList.add("hidden");
  flowPause.classList.remove("hidden");
}

function pauseFlow(): void {
  state.flowPlay = false;
  app.ticker.stop();

  flowPlay.classList.remove("hidden");
  flowPause.classList.add("hidden");
}

function goToPreviousKeyframe(): void {
  const keyframe = state.flowKeyframe | 0;
  const keyframeProgress = state.flowKeyframe - keyframe;

  if (keyframeProgress === 0) {
    if (keyframe === 0) {
      state.flowKeyframe = getKeyframesCount();
    } else {
      state.flowKeyframe = Math.max(0, keyframe - 1);
    }
  } else {
    state.flowKeyframe = keyframe;
  }

  updateFlowProgression();

  if (state.flowPlayer) {
    state.flowPlayer.setTargetKeyframe(state.flowKeyframe);
    state.flowPlayer.setKeyframe(state.flowKeyframe);
    state.flowPlayer.draw();
    tick();
  }
}

function goToNextKeyframe(): void {
  state.flowKeyframe = (state.flowKeyframe | 0) + 1;

  updateFlowProgression();

  if (state.flowPlayer) {
    state.flowPlayer.setTargetKeyframe(state.flowKeyframe);
    state.flowPlayer.setKeyframe(state.flowKeyframe);
    state.flowPlayer.draw();
    tick();
  }
}

// Initialization.
if (state.flowPlay) {
  flowPlay.classList.add("hidden");
  flowPause.classList.remove("hidden");
}

flowPlay.addEventListener("click", playFlow);
flowPause.addEventListener("click", pauseFlow);
flowPreviousKeyframe.addEventListener("click", goToPreviousKeyframe);
flowNextKeyframe.addEventListener("click", goToNextKeyframe);

flowRepeatOne.addEventListener("click", function () {
  state.flowPlayMode = "repeatAll";

  flowRepeatOne.classList.add("hidden");
  flowRepeatAll.classList.remove("hidden");
});

flowRepeatAll.addEventListener("click", function () {
  state.flowPlayMode = "repeatOne";

  flowRepeatOne.classList.remove("hidden");
  flowRepeatAll.classList.add("hidden");
});

const flowStepSetTitle = document.getElementById(
  "input-flow-step-set-title-dialog",
) as HTMLDialogElement;

flowStepSetTitle.addEventListener("keydown", event => {
  event.stopPropagation();
});

const flowStepSetTitleTitle = flowStepSetTitle.querySelector(
  "h1",
) as HTMLElement;

const flowStepSetTitleEditor = flowStepSetTitle.querySelector(
  "input",
) as HTMLInputElement;

document
  .getElementById("operation-flow-edit-step-title")
  ?.addEventListener("click", function () {
    state.operation.onMute(state);

    const keyframe = state.flowKeyframe | 0;

    flowStepSetTitleTitle.innerHTML = `Set title for keyframe ${keyframe}`;

    const steps =
      state.simulator
        .getSystem()
        .flows.at(0)
        ?.steps?.filter(step => step.keyframe === keyframe) ?? [];

    const title = steps.find(step => step.description)?.description ?? "";

    flowStepSetTitleEditor.value = title;

    flowStepSetTitle.showModal();
  });

document
  .getElementById("operation-flow-step-set-title-apply")
  ?.addEventListener("click", function () {
    let value: string | undefined = flowStepSetTitleEditor.value.trim();

    if (value === "") {
      value = undefined;
    }

    const keyframe = state.flowKeyframe | 0;

    // Apply operation.
    modifySpecification(() => {
      const steps =
        state.simulator
          .getSystem()
          .flows.at(0)
          ?.steps?.filter(step => step.keyframe === keyframe) ?? [];

      for (const step of steps) {
        step.specification.description = value;
      }
    });

    updateFlowProgression();
  });

const currentKeyframe = document.getElementById("information-flow-keyframe")!;

const currentKeyframeTitle = document.getElementById(
  "information-flow-step-title",
)!;

app.ticker.add<void>(() => {
  if (state.flowPlay && state.flowPlayer) {
    updateFlowProgression();
  }
});

function updateFlowProgression(): void {
  const keyframe = state.flowKeyframe | 0;
  const system = state.simulator.getSystem();

  // Set number.
  currentKeyframe.innerHTML = keyframe.toString();

  // Set title.
  if (system.flows.at(0)?.steps.some(step => step.description)) {
    const steps =
      system.flows.at(0)?.steps?.filter(step => step.keyframe === keyframe) ??
      [];

    const title = steps.find(step => step.description)?.description ?? "";

    currentKeyframeTitle.innerHTML = sanitizeHtml(title);

    currentKeyframeTitle.classList.remove("hidden");
  } else {
    currentKeyframeTitle.classList.add("hidden");
  }
}

//
// Link operations
//

const linkPatternPipe = document.getElementById(
  "operation-set-link-pattern-pipe",
)!;

const linkPatternSolid = document.getElementById(
  "operation-set-link-pattern-solid",
)!;

const linkPatternDotted = document.getElementById(
  "operation-set-link-pattern-dotted",
)!;

function setLinkPatternPipe(): void {
  state.linkPattern = "pipe";

  linkPatternDotted.classList.add("hidden");
  linkPatternPipe.classList.remove("hidden");

  // Timeout used to apply this operation after the "click" event
  // has bubbled up. Without this, the "selected" class is not applied
  // on the link button.
  setTimeout(() => {
    switchOperation(linkOperation);
  }, 0);
}

function setLinkPatternSolid(): void {
  state.linkPattern = "solid-line";

  linkPatternPipe.classList.add("hidden");
  linkPatternSolid.classList.remove("hidden");

  // Timeout used to apply this operation after the "click" event
  // has bubbled up. Without this, the "selected" class is not applied
  // on the link button.
  setTimeout(() => {
    switchOperation(linkOperation);
  }, 0);
}

function setLinkPatternDotted(): void {
  state.linkPattern = "dotted-line";

  linkPatternSolid.classList.add("hidden");
  linkPatternDotted.classList.remove("hidden");

  // Timeout used to apply this operation after the "click" event
  // has bubbled up. Without this, the "selected" class is not applied
  // on the link button.
  setTimeout(() => {
    switchOperation(linkOperation);
  }, 0);
}

linkPatternPipe.addEventListener("click", setLinkPatternSolid);
linkPatternSolid.addEventListener("click", setLinkPatternDotted);
linkPatternDotted.addEventListener("click", setLinkPatternPipe);

//
// Profile operations
//

document
  .getElementById("operation-sign-out")
  ?.addEventListener("click", function () {
    fetch("/api/sign-out", {
      method: "POST",
    })
      .then(async response => {
        if (response.redirected) {
          window.location.replace(response.url);
        } else {
          // TODO: handle error.
        }
      })
      .catch(() => {
        /* TODO: handle error */
      });
  });

//
// Toolbox
//

// Initialize operations.
addSystemOperation.setup(state);
setTitleOperation.setup(state);
moveOperation.setup(state);
setSystemParentOperation.setup(state);
linkOperation.setup(state);
eraseOperation.setup(state);
transferDataOperation.setup(state);
paintOperation.setup(state);

// Initialize buttons.
const singleChoiceButtons = document.querySelectorAll(
  "#toolbox button.single-choice",
);

for (const button of singleChoiceButtons) {
  button.addEventListener("click", function () {
    for (const other of singleChoiceButtons) {
      other.classList.remove("selected");
    }

    state.operation.onEnd(state);

    button.classList.add("selected");

    if (button.id === "operation-link") {
      state.operation = linkOperation;
    } else if (button.id === "operation-system-add") {
      state.operation = addSystemOperation;
    } else if (button.id === "operation-move") {
      state.operation = moveOperation;
    } else if (button.id === "operation-erase") {
      state.operation = eraseOperation;
    } else if (button.id === "operation-system-set-parent") {
      state.operation = setSystemParentOperation;
    } else if (button.id === "operation-set-title") {
      state.operation = setTitleOperation;
    } else if (button.id === "operation-flow-data-transfer") {
      state.operation = transferDataOperation;
    } else if (button.id === "operation-set-color") {
      state.operation = paintOperation;
    }

    state.operation.onBegin(state);
    state.operation.onMute(state);

    tick();
  });
}

const toolboxButtons = document.querySelectorAll(
  "#toolbox button",
) as unknown as HTMLButtonElement[];

for (const button of toolboxButtons) {
  button.addEventListener("click", function () {
    // Remove focus once clicked.
    this.blur();
  });
}

function switchOperation(operation: Operation): void {
  state.operation.onEnd(state);
  state.operation = operation;
  state.operation.onBegin(state);

  for (const button of singleChoiceButtons) {
    if (button.id === operation.id) {
      button.classList.add("selected");
    } else {
      button.classList.remove("selected");
    }
  }
}

// Initialize dropdowns.
initializeDropdowns();

// Load saved data.
loadSaveData();

//
// Load profile.
//

fetch("/api/profile")
  .then(async response => {
    let toShow = "unauthenticated";
    let toHide = "authenticated";

    if (response.ok) {
      toShow = "authenticated";
      toHide = "unauthenticated";

      const profile = await response.json();

      state.profile.authenticated = true;
      state.profile.readOnly = profile.readOnly;

      setConnectivity(
        profile.readOnly ? "read-only" : isLocalFile() ? "local-file" : "ok",
      );
    }

    for (const button of document.querySelectorAll(`#header .${toShow}`)) {
      button.classList.remove("hidden");
    }

    for (const button of document.querySelectorAll(`#header .${toHide}`)) {
      button.classList.add("hidden");
    }
  })
  .catch(() => {
    // TODO: handle error.
  });

//
// Utility functions
//

async function loadSaveData(saveData?: string): Promise<void> {
  saveDataIsLoading.classList.remove("hidden");

  let json: string;

  try {
    json = saveData ?? (await load());
  } catch {
    newFile().then(() => {
      saveDataIsLoading.classList.add("hidden");
    });

    loadFileFailed.showModal();

    return;
  } finally {
    saveDataIsLoading.classList.add("hidden");
  }

  setJsonEditorValue(json);

  try {
    await loadSimulation(json);

    updateFlowProgression();
    pushChange(json);
    fitSimulation();
    redrawGrid();
    state.flowPlayer?.draw();
    tick();
  } catch {
    newFile().then(() => {
      saveDataIsLoading.classList.add("hidden");
    });

    loadFileFailed.showModal();
  } finally {
    saveDataIsLoading.classList.add("hidden");
  }

  setConnectivity(getUrlParams().file ? "local-file" : "ok");
}

function isModalOpen(): boolean {
  return (
    isJsonEditorOpen() ||
    fileProperties.open ||
    theme.open ||
    guide.open ||
    about.open ||
    privacy.open ||
    connectivityStatus.open ||
    flowStepSetTitle.open
  );
}

function isInitialLoad(): boolean {
  return !state.simulatorInitialized;
}

/**
 * Update the state position from the screen position.
 *
 * The screen position is first transformed to the world position.
 * Then, this world position is transformed to the grid position.
 */
function updateStatePosition(x: number, y: number): void {
  const coordinates = viewport.screenToWorld(x, y);

  state.preciseX = coordinates.x / BlockSize;
  state.preciseY = coordinates.y / BlockSize;

  state.x =
    coordinates.x >= 0
      ? Math.floor(coordinates.x / BlockSize)
      : -Math.ceil(Math.abs(coordinates.x / BlockSize));

  state.y =
    coordinates.y >= 0
      ? Math.floor(coordinates.y / BlockSize)
      : -Math.ceil(Math.abs(coordinates.y / BlockSize));
}
