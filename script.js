const colorContainer = document.getElementById('color-container');
const runButton = document.getElementById('run-button');
const stopButton = document.getElementById('stop-button');
const resetButton = document.getElementById('reset-button');
const counterSpan = document.getElementById('counter');
const isRunning = document.getElementById('is-running');
const placeholder = document.getElementById('placeholder');
const startFromSelect = document.getElementById('start-from');
const colNumberInput = document.getElementById('cols'); // Determines the size of the grid.
const coherenceInput = document.getElementById('coherence'); // Determines how "close" a color is to the next computed random color.
const opacityInput = document.getElementById('opacity'); // Determines the used opacity for the colors.
const delayInput = document.getElementById('delay'); // Determines the delay after each drawing step in seconds.
const bgColor = document.getElementById('bg-color');

runButton.addEventListener('click', runColorAnimation);
stopButton.addEventListener('click', stopOrContinueAnimation);
resetButton.addEventListener('click', reset);

let animationPaused = false;
let cancelAnimation = false;
let isAnimating = 0;

async function stopOrContinueAnimation() {
    // console.log(`isRunning: ${isRunning.value}, isAnimating: ${isAnimating}, animationPaused: ${animationPaused}`);
    if (isAnimating < 1) return; // No animation, do nothing

    animationPaused = !animationPaused;
    isRunning.value = animationPaused ? "0" : "1";
    stopButton.textContent = animationPaused ? "Continue" : "Stop";
}

async function runColorAnimation() {
    isAnimating++;
    counterSpan.textContent = isAnimating;
    animationPaused = false;
    cancelAnimation = false;
    isRunning.value = "1";
    stopButton.textContent = "Stop";
    document.documentElement.style.setProperty('--bg-color', bgColor.value);

    let prevCols = document.querySelectorAll('.grid-item');
    let cols = colNumberInput.value;

    if (cols * cols != prevCols.length) {
        await makeGrid(cols);
    }

    let coherence = coherenceInput.value;
    let opacity = opacityInput.value;
    let delay = delayInput.value;

    await drawingAnimation(cols, delay, coherence, opacity);

    isRunning.value = "0";
    if (isAnimating > 0) isAnimating--;
    counterSpan.textContent = isAnimating;
}

/**
 * Runs the drawing animation.
*/
async function drawingAnimation(cols, delay, coherence, opacity) {
    cancelAnimation = false; // Reset after beginning.

    let total = cols * cols;
    let color = await getRandomColor(coherence, opacity);
    let prevColor = color;
    let uncolored = new Set(Array.from({ length: total }, (_, i) => i)); // O(1) lookup and delete
    const queue = [];
    const visited = new Set(); // Optional: to avoid pushing same item twice
    const first = await getFirstGridItemId(cols);
    queue.push(first);
    visited.add(first);

    while (uncolored.size > 0 && queue.length > 0) {
        if (cancelAnimation) break; // Stop if reset was called.

        while (animationPaused) {
            await sleep(100); // Wait in small intervalls until resumed.
        }

        let next = queue.shift();
        if (!uncolored.has(next)) continue; // Skip if already colored (just in case)

        let gridItem = document.getElementById(`grid-item-${next}`);
        if (gridItem) {
            gridItem.style.backgroundColor = color;
        }

        uncolored.delete(next); // O(1) delete
        prevColor = color;
        color = await getRandomColor(coherence, opacity, prevColor);

        let neighbors = getUncoloredNeighbors(next, cols, uncolored);
        for (let n of neighbors) {
            if (!visited.has(n)) {
                queue.push(n);
                visited.add(n);
            }
        }
        await sleep(delay);
    }
}

function getUncoloredNeighbors(item, cols, uncoloredSet) {
    let row = Math.floor(item / cols);
    let col = item % cols;
    let neighbors = [];

    const tryAdd = (r, c) => {
        if (r >= 0 && r < cols && c >= 0 && c < cols) {
            let id = r * cols + c;
            if (uncoloredSet.has(id)) neighbors.push(id);
        }
    };

    tryAdd(row - 1, col); // up
    tryAdd(row + 1, col); // down
    tryAdd(row, col - 1); // left
    tryAdd(row, col + 1); // right

    return neighbors;
}


/**
 *  
 * @param {Number} cols 
 * @returns 
 */
async function getFirstGridItemId(cols) {
    let first = 0;
    let startFrom = startFromSelect.value;
    if (startFrom == 'center') {
        first = cols % 2 == 0 ?
            Math.floor((cols * cols) / 2 + cols / 2) :
            Math.floor((cols * cols) / 2);
    } else if (startFrom == 'top-right') {
        first = cols - 1;
    } else if (startFrom == 'bottom-left') {
        first = cols * cols - cols;
    } else if (startFrom == 'bottom-right') {
        first = cols * cols - 1;
    }
    return first;
}

/**
 * Computes a random color.
 * The coherence value determines how closely related the random color should be to the previous color.
 * If set to 0.99 and #000000 was the prev color, the next color should not deviate a lot from the prev color.
 * If coherence is set to 0, the computed color is random, meaning even if the previous color was red, the current random color
 * can also be black.
 * @param {Number} coherence Determines how "close" a color should be to the previous color (0 - no relation, 1 - same color)
 * @param {Number} opacity The opacity of the color (0-1).
 * @param {*} prevColor The previously used color.
*/
async function getRandomColor(coherence, opacity, prevColor = null) {
    let r, g, b;

    if (prevColor && typeof prevColor === "string") {
        // Extract RGB from hex or rgba.
        let prevRGB;

        if (prevColor.startsWith("#")) {
            prevRGB = hexToRgb(prevColor);
        } else if (prevColor.startsWith("rgb")) {
            prevRGB = prevColor
                .replace(/[^\d,]/g, '')
                .split(',')
                .slice(0, 3)
                .map(Number);
        }
        // Generate new color with controlled variation
        [r, g, b] = prevRGB.map(channel => {
            const maxDeviation = (1 - coherence) * 255;
            const variation = (Math.random() * 2 - 1) * maxDeviation;
            return clamp(Math.round(channel + variation), 0, 255);
        });
    } else {
        // No previous color or coherence = 0, so generate random
        r = Math.floor(Math.random() * 256);
        g = Math.floor(Math.random() * 256);
        b = Math.floor(Math.random() * 256);
    }

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function hexToRgb(hex) {
    const bigint = parseInt(hex.replace('#', ''), 16);
    return [
        (bigint >> 16) & 255,
        (bigint >> 8) & 255,
        bigint & 255
    ];
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Fills the color-container with the initial grid.
*/
async function makeGrid(cols) {
    let gridItemNumber = Math.pow(cols, 2);
    // let gridItemWidth = colorContainer.offsetWidth / cols;
    // let gridItemHeight = colorContainer.offsetWidth / cols;

    // Clear the placeholder.
    colorContainer.innerHTML = "";
    colorContainer.style.setProperty('--cols', cols);

    const fragment = document.createDocumentFragment();
    // Insert the number of items with the specified dimensions into the colorContainer.
    for (let i = 0; i < gridItemNumber; i++) {
        const div = document.createElement("div");

        // Assign unique id to the grid-items.
        div.id = `grid-item-${i}`;
        div.classList.add("grid-item");
        fragment.appendChild(div);
    }

    colorContainer.appendChild(fragment);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function reset() {
    cancelAnimation = true;
    animationPaused = false;
    isAnimating = 0;

    colorContainer.innerHTML = "";
    const div = document.createElement("div");
    div.classList.add("placeholder");
    div.classList.add("grid-item");
    colorContainer.appendChild(div);
    colorContainer.style.setProperty('--cols', 1);

    isRunning.value = "0";
    stopButton.textContent = "Stop";
}
