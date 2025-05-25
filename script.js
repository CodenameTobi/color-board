const colorContainer = document.getElementById('color-container');
const size = 600; // Change if px size of colorContainer changes.
const runButton = document.getElementById('run-button');
const stopButton = document.getElementById('stop-button');
const resetButton = document.getElementById('reset-button');
const isRunning = document.getElementById('is-running');
const placeholder = document.getElementById('placeholder');
const startFromSelect = document.getElementById('start-from');
const colNumberInput = document.getElementById('cols'); // Determines the size of the grid.
const coherenceInput = document.getElementById('coherence'); // Determines how "close" a color is to the next computed random color.
const opacityInput = document.getElementById('opacity'); // Determines the used opacity for the colors.
const delayInput = document.getElementById('delay'); // Determines the delay after each drawing step in seconds.

runButton.addEventListener('click', runColorAnimation);
stopButton.addEventListener('click', stopOrContinueAnimation);
resetButton.addEventListener('click', reset);

let animationPaused = false;
let cancelAnimation = false;
let isAnimating = false;

function reset() {
    cancelAnimation = true;
    animationPaused = false;
    isAnimating = false;

    colorContainer.innerHTML = "";
    const div = document.createElement("div");
    div.classList.add("placeholder");
    colorContainer.appendChild(div);

    isRunning.value = "0";
    runButton.disabled = false;
    stopButton.disabled = true;
    stopButton.textContent = "🛑";
}

async function stopOrContinueAnimation() {
    if (!isAnimating) return; // No animation, do nothing

    animationPaused = !animationPaused;
    isRunning.value = animationPaused ? "0" : "1";

    runButton.disabled = animationPaused;
    stopButton.textContent = animationPaused ? "⏩" : "🛑";
}

async function runColorAnimation() {
    isAnimating = true;
    animationPaused = false;
    cancelAnimation = false;

    isRunning.value = "1";
    stopButton.disabled = false;

    let prevCols = document.querySelectorAll('.grid-item');
    let cols = colNumberInput.value;

    if (cols * cols != prevCols.length) {
        await makeGrid(cols);
    }

    let coherence = coherenceInput.value;
    let opacity = opacityInput.value;
    let delay = delayInput.value / (1000 * cols);

    await drawingAnimation(cols, delay, coherence, opacity);

    isRunning.value = "0";
    stopButton.disabled = true;
    isAnimating = false; // ✅ done
}



async function simpleAnimation(cols, delay, coherence, opacity) {
    let total = cols * cols;
    let color = getRandomColor(coherence, opacity);
    let prevColor = color;

    for (let i = 0; i < total; i++) {
        let gridItem = document.getElementById(`grid-item-${i}`);
        if (gridItem) {
            gridItem.style.backgroundColor = color;
        }

        // Prepare next color before waiting
        prevColor = color;
        color = getRandomColor(coherence, opacity, prevColor);

        // Wait before next iteration
        await sleep(delay);
    }
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
    let gridItemWidth = size / cols;
    let gridItemHeight = size / cols;

    // Clear the placeholder.
    colorContainer.innerHTML = "";

    const fragment = document.createDocumentFragment();
    // Insert the number of items with the specified dimensions into the colorContainer.
    for (let i = 0; i < gridItemNumber; i++) {
        const div = document.createElement("div");

        // Assign unique id to the grid-items.
        div.id = `grid-item-${i}`;

        div.style.width = `${gridItemWidth}px`;
        div.style.height = `${gridItemHeight}px`;
        div.classList.add("grid-item");

        fragment.appendChild(div);
    }

    colorContainer.appendChild(fragment);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}