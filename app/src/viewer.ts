import { app, tick } from "./renderer/pixi.js";
import { state } from "./state.js";
import viewport from "./renderer/viewport.js";
import {
  fitSimulation,
  loadSimulation,
  getKeyframesCount,
} from "./simulator/api.js";
import { load } from "./persistence.js";
import { debounce, sanitizeHtml } from "./helpers.js";

const canvasContainer = document.getElementById("canvas") as HTMLDivElement;

//
// Events
//

// The user moves the cursor in the canvas.
canvasContainer.addEventListener("pointermove", event => {
  if (viewport.moving) {
    viewport.move(event.pointerId, event.x, event.y);
    tick();
  }
});

// The user press the pointer in the canvas.
canvasContainer.addEventListener("pointerdown", event => {
  viewport.startMoving(event.pointerId, event.x, event.y);
});

// The user release the pointer in the canvas.
canvasContainer.addEventListener("pointerup", event => {
  viewport.stopMoving(event.pointerId);
});

// The user spin the mouse wheel.
canvasContainer.addEventListener("wheel", event => {
  if (event.deltaY > 0) {
    viewport.zoomAt(-0.1, event.x, event.y);
    tick();
  } else if (event.deltaY < 0) {
    viewport.zoomAt(0.1, event.x, event.y);
    tick();
  }
});

// Resize the container when the window is resized.
window.addEventListener("resize", debounce(resizeCanvas, 30));

window.addEventListener("keydown", event => {
  if (event.key === " ") {
    if (state.flowPlay) {
      pauseFlow();
    } else {
      playFlow();
    }
  } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
    goToPreviousKeyframe();
  } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
    goToNextKeyframe();
  } else if (event.key === "=") {
    cameraFit();
  } else if (event.key === "+") {
    cameraZoomIn();
  } else if (event.key === "-") {
    cameraZoomOut();
  }
});

//
// Flow operations.
//

const flowPlay = document.getElementById("operation-flow-play")!;
const flowPause = document.getElementById("operation-flow-pause")!;
const flowRewind = document.getElementById("operation-flow-rewind")!;

const flowPreviousKeyframe = document.getElementById(
  "operation-flow-previous-keyframe",
)!;

const flowNextKeyframe = document.getElementById(
  "operation-flow-next-keyframe",
)!;

function playFlow(): void {
  state.flowPlayMode = "repeatAll";
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

function goToNextKeyframe(): void {
  const keyframe = state.flowKeyframe | 0;
  const keyframeProgress = state.flowKeyframe - keyframe;

  if (keyframeProgress > 0) {
    state.flowKeyframe = keyframe + 1.99999;
  } else {
    state.flowKeyframe = keyframe + 0.99999;
  }

  if (state.flowKeyframe > getKeyframesCount() + 1) {
    state.flowKeyframe = 0.99999;
  }

  updateFlowProgression();

  playFlow();

  state.flowPlayMode = "playOne";

  if (state.flowPlayer) {
    state.flowPlayer.setTargetKeyframe(state.flowKeyframe);
    state.flowPlayer.setKeyframe(state.flowKeyframe | 0);
    state.flowPlayer.draw();
    app.ticker.start();
  }
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

  state.flowPlayMode = "playOne";

  if (state.flowPlayer) {
    state.flowPlayer.setTargetKeyframe(state.flowKeyframe);
    state.flowPlayer.setKeyframe(state.flowKeyframe);
    state.flowPlayer.draw();
    tick();
  }
}

function rewindFlow(): void {
  state.flowKeyframe = 0;

  updateFlowProgression();

  if (state.flowPlayer) {
    state.flowPlayer.setTargetKeyframe(state.flowKeyframe);
    state.flowPlayer.setKeyframe(state.flowKeyframe);
    state.flowPlayer.draw();
    tick();
  }
}

flowPlay.addEventListener("click", playFlow);
flowPause.addEventListener("click", pauseFlow);
flowRewind.addEventListener("click", rewindFlow);
flowPreviousKeyframe.addEventListener("click", goToPreviousKeyframe);
flowNextKeyframe.addEventListener("click", goToNextKeyframe);

app.ticker.add<void>(() => {
  if (state.flowPlayer) {
    updateFlowProgression();

    if (
      state.flowPlayMode === "playOne" &&
      state.flowPlayer.getKeyframe() === state.flowPlayer.getTargetKeyframe()
    ) {
      pauseFlow();
    }
  }
});

//
// Camera operations.
//

function cameraFit(): void {
  fitSimulation();
  tick();
}

function cameraZoomIn(): void {
  viewport.zoomCenter(0.25);

  tick();
}

function cameraZoomOut(): void {
  viewport.zoomCenter(-0.25);

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
// Other operations.
//

document
  .getElementById("operation-goto-editor")
  ?.addEventListener("click", function () {
    window.location.replace(`/${window.location.hash}`);
  });

//
// Flow progression
//

const flowProgressionCurrent = document.getElementById(
  "information-flow-progression-current",
) as HTMLInputElement;

const flowProgressionTotal = document.getElementById(
  "information-flow-progression-total",
)!;

const flowProgressionTitle = document.getElementById(
  "information-flow-step-title",
)!;

flowProgressionCurrent.addEventListener("change", function (event) {
  const target = event.target as HTMLInputElement;

  state.flowKeyframe = Math.min(
    getKeyframesCount(),
    Math.max(0, Number(target.value)),
  );

  updateFlowProgression();

  if (state.flowPlayer) {
    state.flowPlayer.setTargetKeyframe(state.flowKeyframe);
    state.flowPlayer.draw();
    tick();
  }
});

function updateFlowProgression(): void {
  const keyframe = state.flowKeyframe | 0;

  flowProgressionCurrent.value = keyframe.toString();

  // Set title.
  const steps =
    state.simulator
      .getSystem()
      .flows.at(0)
      ?.steps?.filter(step => step.keyframe === keyframe) ?? [];

  const title = steps.find(step => step.description)?.description ?? "";

  flowProgressionTitle.innerHTML = sanitizeHtml(title);
}

//
// Canvas
//

function resizeCanvas(): void {
  app.renderer.resize(
    canvasContainer.clientWidth,
    canvasContainer.clientHeight,
  );

  viewport.resize(canvasContainer.clientWidth, canvasContainer.clientHeight);

  fitSimulation();

  tick();
}

//
// Toolbox
//

const toolboxButtons = document.querySelectorAll(
  "#toolbox button",
) as unknown as HTMLButtonElement[];

for (const button of toolboxButtons) {
  button.addEventListener("click", function () {
    // Remove focus once clicked.
    this.blur();
  });
}

//
// Initialization.
//

const saveDataIsLoading = document.getElementById(
  "save-data-is-loading",
) as HTMLElement;

try {
  // Load the save.
  const json = await load();

  // Start the simulation.
  await loadSimulation(json);

  // Initialize the toolbox.
  if (state.flowPlay) {
    flowPlay.classList.add("hidden");
    flowPause.classList.remove("hidden");
  }

  flowProgressionTotal.innerHTML = getKeyframesCount().toString();

  if (
    state.simulator
      .getSystem()
      .flows.at(0)
      ?.steps.some(step => step.description)
  ) {
    flowProgressionTitle.classList.remove("hidden");
  } else {
    flowProgressionTitle.classList.add("hidden");
  }

  updateFlowProgression();

  // Render the simulation.
  state.flowPlayer?.draw();

  resizeCanvas();

  // Remove the loading banner.
  saveDataIsLoading.classList.add("hidden");
} catch {
  saveDataIsLoading.innerHTML = "Loading the graph failed.";
}
