// js/filters.js
// This file manages all image/video filters for the SnapLens application.
// It defines both CSS-based filters (applied via CSS class) and
// Canvas-based filters (applied via direct pixel manipulation).
// Total lines (including comments and empty lines): ~1000+

/**
 * FilterManager Module
 * Provides functionality to register, activate, and apply various image/video filters.
 * Filters can be 'css' type (relying on CSS filter property) or 'canvas' type (pixel manipulation).
 *
 * @module FilterManager
 */
const FilterManager = (() => {
    let activeFilterId = 'none'; // Stores the ID of the currently active filter. Default is 'none'.
    const filters = {};           // A dictionary to store all registered filter objects (key: filter ID).
    let frameCount = 0;           // Global frame counter, incremented each frame for animated filters.

    // --- Core Filter Management Functions ---

    /**
     * Registers a new filter with the manager.
     * Each filter must have a unique ID, a display name, a type ('canvas' or 'css'),
     * and a function/CSS class to apply its effect.
     *
     * @param {string} id - A unique identifier for the filter (e.g., 'glitch', 'sepia').
     * @param {string} name - The display name for the filter (e.g., 'Digital Glitch', 'Old Sepia').
     * @param {string} type - The type of filter: 'canvas' for pixel manipulation, 'css' for CSS filter string.
     * @param {Function|string} applyFuncOrCssClass -
     *   If `type` is 'canvas': A function (data, w, h, frameCount, ctx, video) that manipulates pixel data.
     *   If `type` is 'css': The CSS class name to apply for the filter (e.g., 'filter-css-grayscale').
     */
    const registerFilter = (id, name, type, applyFuncOrCssClass) => {
        if (filters[id]) {
            console.warn(`Filter with ID '${id}' already registered. Overwriting existing filter.`);
        }
        filters[id] = { id, name, type, applyFunc: applyFuncOrCssClass };
        console.debug(`Registered filter: "${name}" (ID: "${id}", Type: ${type})`);
    };

    /**
     * Sets the currently active filter by its ID.
     * Subsequent calls to `applyActiveFilter` will use this newly activated filter.
     * If the ID is not found, a warning is logged and the active filter remains unchanged.
     *
     * @param {string} id - The ID of the filter to activate.
     */
    const setActiveFilter = (id) => {
        if (filters[id]) {
            activeFilterId = id;
            console.log(`Active filter set to: "${filters[id].name}" (ID: "${id}")`);
        } else {
            console.warn(`Filter with ID "${id}" not found. Active filter remains "${activeFilterId}".`);
        }
    };

    /**
     * Retrieves the object representing the currently active filter.
     *
     * @returns {object} The active filter object (containing id, name, type, and applyFunc).
     */
    const getActiveFilter = () => filters[activeFilterId];

    /**
     * Retrieves an array of all registered filter objects.
     * This is useful for dynamically generating the filter selection UI buttons.
     *
     * @returns {Array<object>} An array containing all filter objects registered with the manager.
     */
    const getAllFilters = () => Object.values(filters);

    /**
     * Helper function to draw the source video frame onto the canvas,
     * ensuring correct aspect ratio (`object-fit: cover` behavior) and mirroring.
     * This function performs the base drawing operation before any specific filter effects are applied.
     *
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context of the canvas.
     * @param {HTMLVideoElement} video - The source video element (e.g., #camera-video-source).
     * @param {HTMLCanvasElement} canvas - The target canvas element (e.g., #camera-canvas).
     * @param {string} facingMode - The current camera facing mode ('user' for front, 'environment' for back).
     */
    const drawVideoOnCanvas = (ctx, video, canvas, facingMode) => {
        // Ensure video is ready and has valid dimensions to prevent errors during draw.
        if (video.videoWidth === 0 || video.videoHeight === 0 || video.readyState < 2) {
            // console.warn("Video source not ready for drawing (dimensions zero or not enough data).");
            return; // Skip drawing this frame if video is not ready
        }

        const videoRatio = video.videoWidth / video.videoHeight;
        const canvasRatio = canvas.width / canvas.height;

        let sx, sy, sWidth, sHeight; // Source rectangle: portion of the video to draw from.
        let dx, dy, dWidth, dHeight; // Destination rectangle: where on the canvas to draw.

        // Calculate source dimensions to "cover" the canvas.
        // This simulates `object-fit: cover` by cropping the video if its aspect ratio
        // doesn't exactly match the canvas aspect ratio.
        if (videoRatio > canvasRatio) { 
            // Video is wider than canvas (e.g., 16:9 video on a 9:16 canvas).
            // Crop video horizontally to match canvas aspect ratio.
            sHeight = video.videoHeight;
            sWidth = sHeight * canvasRatio;
            sx = (video.videoWidth - sWidth) / 2; // Center the cropped area horizontally.
            sy = 0;
        } else { 
            // Video is taller than canvas (e.g., a standard portrait video on a wider landscape canvas, or similar).
            // Crop video vertically to match canvas aspect ratio.
            sWidth = video.videoWidth;
            sHeight = sWidth / canvasRatio;
            sx = 0;
            sy = (video.videoHeight - sHeight) / 2; // Center the cropped area vertically.
        }

        // Destination dimensions are always the full canvas area, as we want to fill it.
        dx = 0;
        dy = 0;
        dWidth = canvas.width;
        dHeight = canvas.height;

        // Save the current state of the canvas context. This is crucial for transformations.
        ctx.save();

        // Apply mirroring transformation for user-facing (front) camera.
        // This flips the pixels horizontally so the selfie appears naturally (not inverted).
        // This transformation is applied directly to the drawing context.
        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0); // Move the origin to the right edge of the canvas.
            ctx.scale(-1, 1);               // Scale by -1 horizontally, effectively flipping it.
        }

        // Draw the image with the calculated source and destination rectangles.
        // This operation bakes in the aspect ratio correction and mirroring directly into the canvas pixels.
        ctx.drawImage(video, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);

        // Restore the canvas context to its state before mirroring.
        // This is important so that subsequent drawing operations (like filter overlays)
        // are not also mirrored or transformed.
        ctx.restore();
    };

    /**
     * The main function to apply the currently active filter to the canvas.
     * This function is called repeatedly within the animation loop (`requestAnimationFrame`).
     * It orchestrates drawing the base video frame and then applying pixel-based or CSS-based filter effects.
     *
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context of the canvas.
     * @param {HTMLVideoElement} video - The source video element.
     * @param {HTMLCanvasElement} canvas - The canvas element.
     * @param {number} currentFrameCount - The current animation frame count (for time-based effects).
     * @param {string} facingMode - 'user' or 'environment' camera.
     */
    const applyActiveFilter = (ctx, video, canvas, currentFrameCount, facingMode) => {
        frameCount = currentFrameCount; // Update the module's global frame counter.
        const filter = getActiveFilter(); // Get the currently selected filter.
        
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the entire canvas for the new frame.

        // 1. Draw the base video frame onto the canvas. This includes aspect ratio correction and mirroring.
        drawVideoOnCanvas(ctx, video, canvas, facingMode);
        
        // 2. Apply the chosen filter effect based on its type.
        if (filter.type === 'css') {
            // For 'css' type filters, the visual effect is handled by a CSS class
            // applied directly to the `<canvas>` element in `camera.js`.
            // No pixel manipulation is performed here within `filters.js` for CSS filters.
            // This conditional block primarily serves for logical separation.
        } else if (filter.type === 'canvas' && typeof filter.applyFunc === 'function') {
            // For 'canvas' type filters, we need to manipulate the actual pixel data.
            // Get the ImageData object from the canvas *after* the base video frame has been drawn.
            let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            let data = imageData.data; // This is a Uint8ClampedArray containing RGBA pixel values.

            // Apply the custom canvas filter function.
            // The filter function modifies the `data` array in place.
            // We pass `ctx` and `video` as some advanced canvas filters might need them for drawing overlays.
            filter.applyFunc(data, canvas.width, canvas.height, frameCount, ctx, video);
            
            // Put the modified pixel data back onto the canvas.
            ctx.putImageData(imageData, 0, 0);
        }
    };

    // --- Utility Functions for Canvas Pixel Manipulation (Internal Helpers) ---
    // These functions simplify common tasks when working with raw pixel data.

    /**
     * Retrieves the RGBA values of a pixel at specified (x, y) coordinates from an ImageData array.
     * @param {Uint8ClampedArray} data - The raw pixel data array (RGBA).
     * @param {number} x - The x-coordinate of the pixel.
     * @param {number} y - The y-coordinate of the pixel.
     * @param {number} w - The width of the image (needed to calculate array index).
     * @returns {object|null} An object {r, g, b, a} for the pixel, or null if coordinates are out of bounds.
     */
    const getPixel = (data, x, y, w) => {
        // Check for out-of-bounds access
        if (x < 0 || x >= w || y < 0 || y * w * 4 >= data.length) {
            return null;
        }
        const i = (y * w + x) * 4; // Calculate the starting index for this pixel's RGBA values.
        return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
    };

    /**
     * Sets the RGBA values of a pixel at specified (x, y) coordinates in an ImageData array.
     * Values are clamped between 0 and 255.
     * @param {Uint8ClampedArray} data - The raw pixel data array (RGBA).
     * @param {number} x - The x-coordinate of the pixel.
     * @param {number} y - The y-coordinate of the pixel.
     * @param {number} w - The width of the image.
     * @param {number} r - Red value (0-255).
     * @param {number} g - Green value (0-255).
     * @param {number} b - Blue value (0-255).
     * @param {number} a - Alpha value (0-255).
     */
    const setPixel = (data, x, y, w, r, g, b, a) => {
        // Check for out-of-bounds access
        if (x < 0 || x >= w || y < 0 || y * w * 4 >= data.length) {
            return;
        }
        const i = (y * w + x) * 4; // Calculate the starting index for this pixel.
        // Clamp values to ensure they are within the valid 0-255 range for Uint8ClampedArray.
        data[i] = Math.min(255, Math.max(0, r));
        data[i + 1] = Math.min(255, Math.max(0, g));
        data[i + 2] = Math.min(255, Math.max(0, b));
        data[i + 3] = Math.min(255, Math.max(0, a));
    };

    /**
     * Converts an RGB color value to HSL.
     * Conversion formula adapted from http://en.wikipedia.org/wiki/HSL_color_space.
     * Assumes r, g, and b are contained in the set [0, 255] and returns h, s, and l in the set [0, 1].
     * Used for filters that manipulate hue, saturation, or lightness.
     *
     * @param {number} r - The red color value (0-255).
     * @param {number} g - The green color value (0-255).
     * @param {number} b - The blue color value (0-255).
     * @returns {Array<number>} An array `[h, s, l]` representing the HSL color.
     */
    const rgbToHsl = (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic (grayscale)
        } else {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h, s, l];
    };

    /**
     * Converts an HSL color value to RGB.
     * Conversion formula adapted from http://en.wikipedia.org/wiki/HSL_color_space.
     * Assumes h, s, and l are contained in the set [0, 1] and returns r, g, and b in the set [0, 255].
     * Used for filters that manipulate hue, saturation, or lightness.
     *
     * @param {number} h - The hue (0-1).
     * @param {number} s - The saturation (0-1).
     * @param {number} l - The lightness (0-1).
     * @returns {Array<number>} An array `[r, g, b]` representing the RGB color.
     */
    const hslToRgb = (h, s, l) => {
        let r, g, b;

        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            let p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    };


    // --- Filter Definitions ---
    // This section defines all the available filters by registering them with the FilterManager.
    // Filters are categorized by their `type`: 'css' or 'canvas'.

    console.log("--- Registering Filters ---");

    // 1. CSS Filters
    // These filters leverage the native `filter` CSS property for performance.
    // They are applied by adding a specific CSS class to the canvas element.
    console.log("Registering CSS Filters (applied via CSS class names)...");
    registerFilter('none', 'None', 'css', 'filter-css-none');
    registerFilter('grayscale', 'Grayscale', 'css', 'filter-css-grayscale');
    registerFilter('sepia', 'Sepia', 'css', 'filter-css-sepia');
    registerFilter('invert', 'Invert', 'css', 'filter-css-invert');
    registerFilter('contrast', 'Contrast', 'css', 'filter-css-contrast');
    registerFilter('saturate', 'Saturate', 'css', 'filter-css-saturate');
    registerFilter('hue-rotate', 'Hue Rotate', 'css', 'filter-css-hue-rotate');
    registerFilter('blur', 'Blur', 'css', 'filter-css-blur');
    registerFilter('brightness', 'Brightness', 'css', 'filter-css-brightness');
    registerFilter('dark', 'Dark', 'css', 'filter-css-dark');
    registerFilter('warm', 'Warm', 'css', 'filter-css-warm');
    registerFilter('cold', 'Cold', 'css', 'filter-css-cold');
    registerFilter('vintage', 'Vintage', 'css', 'filter-css-vintage');
    registerFilter('noir', 'Noir', 'css', 'filter-css-noir');
    registerFilter('lomo', 'Lomo', 'css', 'filter-css-lomo');
    registerFilter('dreamy', 'Dreamy', 'css', 'filter-css-dreamy');
    registerFilter('faded', 'Faded', 'css', 'filter-css-faded');
    registerFilter('gotham', 'Gotham', 'css', 'filter-css-gotham');
    registerFilter('cross-process', 'Cross Process', 'css', 'filter-css-cross-process');
    registerFilter('bleach-bypass', 'Bleach Bypass', 'css', 'filter-css-bleach-bypass');
    registerFilter('pastel', 'Pastel', 'css', 'filter-css-pastel');
    registerFilter('cyberpunk', 'Cyberpunk', 'css', 'filter-css-cyberpunk');
    registerFilter('infra-red', 'Infra Red', 'css', 'filter-css-infra-red');
    registerFilter('pop-art-css', 'Pop Art (CSS)', 'css', 'filter-css-pop-art'); // Renamed to avoid clash
    registerFilter('neon', 'Neon', 'css', 'filter-css-neon');
    registerFilter('glow', 'Glow', 'css', 'filter-css-glow');
    registerFilter('duotone', 'Duotone', 'css', 'filter-css-duotone');
    registerFilter('desaturated', 'Desaturated', 'css', 'filter-css-desaturated');
    registerFilter('high-key', 'High Key', 'css', 'filter-css-high-key');
    registerFilter('low-key', 'Low Key', 'css', 'filter-css-low-key');
    registerFilter('cool-blue', 'Cool Blue', 'css', 'filter-css-cool-blue');
    registerFilter('warm-red', 'Warm Red', 'css', 'filter-css-warm-red');
    registerFilter('soft-focus', 'Soft Focus', 'css', 'filter-css-soft-focus');
    registerFilter('punchy', 'Punchy', 'css', 'filter-css-punchy');
    registerFilter('muted', 'Muted', 'css', 'filter-css-muted');
    registerFilter('green-tint', 'Green Tint', 'css', 'filter-css-green-tint');
    registerFilter('purple-haze', 'Purple Haze', 'css', 'filter-css-purple-haze');
    registerFilter('orange-peel', 'Orange Peel', 'css', 'filter-css-orange-peel');
    registerFilter('fuji', 'Fuji', 'css', 'filter-css-fuji');
    registerFilter('kodak', 'Kodak', 'css', 'filter-css-kodak');
    registerFilter('crosshatch-css', 'Crosshatch (CSS)', 'css', 'filter-css-crosshatch'); // Limited CSS simulation
    registerFilter('sketch-css', 'Sketch (CSS)', 'css', 'filter-css-sketch');         // Basic CSS simulation
    registerFilter('cartoon-css', 'Cartoon (CSS)', 'css', 'filter-css-cartoon');       // Basic CSS simulation
    registerFilter('sunlight-css', 'Sunlight (CSS)', 'css', 'filter-css-sunlight');
    registerFilter('moonlight-css', 'Moonlight (CSS)', 'css', 'filter-css-moonlight');
    registerFilter('old-film-css', 'Old Film (CSS)', 'css', 'filter-css-old-film');
    registerFilter('pop-color-css', 'Pop Color (CSS)', 'css', 'filter-css-pop-color');
    registerFilter('aqua-css', 'Aqua (CSS)', 'css', 'filter-css-aqua');
    registerFilter('chrome-css', 'Chrome (CSS)', 'css', 'filter-css-chrome');
    registerFilter('fade-to-black-css', 'Fade to Black (CSS)', 'css', 'filter-css-fade-to-black');
    registerFilter('high-contrast-bw-css', 'High Contrast BW (CSS)', 'css', 'filter-css-high-contrast-bw');
    registerFilter('vintage-light', 'Vintage Light', 'css', 'filter-css-vintage-light');
    registerFilter('dramatic-blue', 'Dramatic Blue', 'css', 'filter-css-dramatic-blue');
    registerFilter('golden-hour', 'Golden Hour', 'css', 'filter-css-golden-hour');
    registerFilter('dark-contrast', 'Dark Contrast', 'css', 'filter-css-dark-contrast');
    registerFilter('sepia-strong', 'Sepia Strong', 'css', 'filter-css-sepia-strong');
    registerFilter('grayscale-strong', 'Grayscale Strong', 'css', 'filter-css-grayscale-strong');
    registerFilter('vibrant', 'Vibrant', 'css', 'filter-css-vibrant');
    registerFilter('mellow', 'Mellow', 'css', 'filter-css-mellow');
    registerFilter('shadow-boost', 'Shadow Boost', 'css', 'filter-css-shadow-boost');
    registerFilter('highlight-reduce', 'Highlight Reduce', 'css', 'filter-css-highlight-reduce');
    registerFilter('soft-glow', 'Soft Glow', 'css', 'filter-css-soft-glow');


    // 2. Canvas Filters (Pixel Manipulation)
    // These filters involve direct manipulation of the image's pixel data using the Canvas API.
    // They are typically more complex but allow for effects not possible with CSS filters alone.
    // Each function receives: `data` (Uint8ClampedArray), `w` (width), `h` (height),
    // `frameCount` (for animation), and optionally `ctx` (CanvasRenderingContext2D)
    // or `video` (HTMLVideoElement) for drawing overlays.

    console.log("Registering Canvas Filters (pixel manipulation and custom drawing)...");

    /**
     * Glitch Filter
     * Introduces random pixel displacement and color channel swaps.
     * Mimics digital signal corruption.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     */
    registerFilter('glitch', 'Glitch', 'canvas', (data, w, h, frameCount) => {
        const severity = 2 + Math.sin(frameCount * 0.1) * 2; // Vary glitch intensity over time
        const blockHeight = 10; // Height of pixel blocks to displace
        let originalData = new Uint8ClampedArray(data); // Copy original pixels for sourcing

        for (let y = 0; y < h; y += blockHeight) {
            // Random horizontal offset for each block
            const offset = Math.floor(Math.random() * severity * 2) - severity;
            if (offset === 0) continue; // Skip if no displacement

            // Vary start X and width for more organic/chaotic glitches
            const xStart = Math.random() < 0.5 ? 0 : Math.floor(w * 0.2);
            const blockWidth = Math.floor(w * (0.8 - Math.random() * 0.4));

            for (let dy = 0; dy < blockHeight; dy++) {
                if (y + dy >= h) break; // Ensure vertical bounds
                for (let dx = 0; dx < blockWidth; dx++) {
                    if (xStart + dx >= w) break; // Ensure horizontal bounds

                    const srcX = xStart + dx;
                    const srcY = y + dy;
                    const destX = srcX + offset; // Apply horizontal displacement
                    const destY = srcY;

                    if (destX >= 0 && destX < w && destY >= 0 && destY < h) {
                        const srcIdx = (srcY * w + srcX) * 4;
                        const destIdx = (destY * w + destX) * 4;

                        // Classic glitch: swap red and blue channels, or just copy for simple displacement
                        data[destIdx] = originalData[srcIdx + 2];     // Red becomes Blue
                        data[destIdx + 1] = originalData[srcIdx + 1]; // Green remains Green
                        data[destIdx + 2] = originalData[srcIdx];     // Blue becomes Red
                        data[destIdx + 3] = originalData[srcIdx + 3]; // Alpha remains Alpha
                    }
                }
            }
        }
    });

    /**
     * Rumble / Wave Distortion Filter
     * Creates a wavy, distorted effect by displacing pixels based on sine/cosine waves.
     * The displacement changes over time, creating an animated "rumble."
     * @param {Uint8ClampedArray} data - Pixel data (modified in place).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     */
    registerFilter('rumble', 'Rumble', 'canvas', (data, w, h, frameCount) => {
        let originalData = new Uint8ClampedArray(data); // Copy original pixels to sample from.
        const strength = 10; // Maximum pixel displacement in any direction.
        const frequency = 0.05; // Spatial frequency of the waves (how many waves across the image).
        const time = frameCount * 0.05; // Time component for animating the waves.

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4; // Index of the current pixel in the output array.

                // Calculate displacement for x and y using sine/cosine waves.
                // This creates a complex, undulating distortion pattern.
                const dx = strength * Math.sin(x * frequency + time) * Math.sin(y * frequency * 2 + time);
                const dy = strength * Math.cos(y * frequency + time) * Math.sin(x * frequency * 2 + time);

                // Calculate the new source pixel coordinates from which to sample.
                const newX = Math.floor(x + dx);
                const newY = Math.floor(y + dy);

                // Copy pixel from the (displaced) source coordinates to the current destination pixel.
                if (newX >= 0 && newX < w && newY >= 0 && newY < h) {
                    const newIdx = (newY * w + newX) * 4;
                    data[srcIdx] = originalData[newIdx];
                    data[srcIdx + 1] = originalData[newIdx + 1];
                    data[srcIdx + 2] = originalData[newIdx + 2];
                    data[srcIdx + 3] = originalData[newIdx + 3];
                } else {
                    // If the source pixel is out of bounds due to displacement, fill with opaque black.
                    data[srcIdx] = data[srcIdx + 1] = data[srcIdx + 2] = 0;
                    data[srcIdx + 3] = 255; 
                }
            }
        }
    });

    /**
     * Squeeze / Radial Distortion Filter
     * Distorts pixels towards or away from the center, creating a "squeeze" or "pinch" effect.
     * Pixels closer to the center are squeezed more intensely.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('squeeze', 'Squeeze', 'canvas', (data, w, h) => {
        let originalData = new Uint8ClampedArray(data);
        const centerX = w / 2;
        const centerY = h / 2;
        const radius = Math.min(w, h) / 2; // Radius of effect, based on smaller dimension.
        const strength = 0.5; // How much to squeeze (0.0 to 1.0, 1.0 being maximum squeeze).

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4;

                const dx = x - centerX; // Horizontal distance from center.
                const dy = y - centerY; // Vertical distance from center.
                const dist = Math.sqrt(dx * dx + dy * dy); // Euclidean distance from center.

                if (dist < radius) { // Only apply effect within the defined radius.
                    const angle = Math.atan2(dy, dx); // Angle from center to current pixel.
                    const percent = dist / radius; // Distance as a percentage of radius (0 at center, 1 at edge).
                    
                    // Calculate new distance: squeeze more towards the center (1 - percent).
                    // The `strength` factor controls the overall intensity of the squeeze.
                    const newDist = dist * (1 - strength * (1 - percent)); 

                    // Convert back from polar coordinates (new distance, original angle) to Cartesian
                    // to find the new source pixel coordinates.
                    const newX = Math.floor(centerX + newDist * Math.cos(angle));
                    const newY = Math.floor(centerY + newDist * Math.sin(angle));

                    if (newX >= 0 && newX < w && newY >= 0 && newY < h) {
                        const newIdx = (newY * w + newX) * 4;
                        data[srcIdx] = originalData[newIdx];
                        data[srcIdx + 1] = originalData[newIdx + 1];
                        data[srcIdx + 2] = originalData[newIdx + 2];
                        data[srcIdx + 3] = originalData[newIdx + 3];
                    } else {
                        // If source pixel is out of bounds due to distortion, fill with opaque black.
                        data[srcIdx] = data[srcIdx + 1] = data[srcIdx + 2] = 0;
                        data[srcIdx + 3] = 255; 
                    }
                }
            }
        }
    });

    /**
     * Rain Filter
     * Applies a subtle blue tint to the image and overlays animated rain particles.
     * Rain particles are drawn directly onto the canvas context.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place for tint).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing particles).
     */
    registerFilter('rain', 'Rain', 'canvas', (data, w, h, frameCount, ctx) => {
        // Step 1: Pixel manipulation for subtle blue tint on the base image.
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, data[i] - 20);      // Reduce Red component.
            data[i + 1] = Math.max(0, data[i + 1] - 10);  // Reduce Green component.
            data[i + 2] = Math.min(255, data[i + 2] + 30); // Increase Blue component.
        }

        // Step 2: Draw animated rain particles directly onto the canvas context.
        // This part needs `ctx` access, so it runs after pixel data is put back (conceptually).
        // It draws over the existing pixels on the canvas for the current frame.
        const numDrops = 100;    // Number of individual rain drops.
        const dropSpeed = 10;    // How fast rain falls vertically.
        const dropLength = 20;   // Length of the rain streaks.
        
        ctx.fillStyle = 'rgba(200, 200, 255, 0.7)'; // Light blue, semi-transparent color for drops.
        for (let i = 0; i < numDrops; i++) {
            // Calculate animated X and Y positions for each drop.
            // `% (w + dropLength) - dropLength` ensures drops cycle from top to bottom.
            const x = (i * 13 + frameCount * dropSpeed) % (w + dropLength) - dropLength;
            const y = (i * 29 + frameCount * dropSpeed) % (h + dropLength) - dropLength;
            
            ctx.fillRect(x, y, 2, dropLength); // Draw a thin vertical rectangle for each drop.
        }
    });

    /**
     * Snow Filter
     * Applies a slight desaturation and cold tint, then overlays animated snowflakes.
     * Snowflakes are drawn directly onto the canvas context.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place for tint).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing particles).
     */
    registerFilter('snow', 'Snow', 'canvas', (data, w, h, frameCount, ctx) => {
        // Step 1: Pixel manipulation for slight desaturation and cold tint.
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i+1] + data[i+2]) / 3; // Calculate average brightness.
            data[i] = avg;       // Set red component to average (desaturates).
            data[i+1] = avg;     // Set green component to average (desaturates).
            data[i+2] = avg + 20; // Increase blue component for a cold tint.
        }

        // Step 2: Draw animated snowflakes directly onto the canvas context.
        const numSnowflakes = 200;    // Number of individual snowflakes.
        const snowflakeSpeed = 2;     // How fast snowflakes fall vertically.
        const snowflakeSize = 3;      // Size of each snowflake (radius).

        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; // White, semi-transparent color for snowflakes.
        for (let i = 0; i < numSnowflakes; i++) {
            // Calculate animated X and Y positions with slight horizontal drift (sine wave).
            const x = (i * 31 + frameCount * snowflakeSpeed * 0.5 + Math.sin(i * 0.1 + frameCount * 0.05) * 20) % (w + snowflakeSize) - snowflakeSize;
            const y = (i * 17 + frameCount * snowflakeSpeed) % (h + snowflakeSize) - snowflakeSize;
            
            ctx.beginPath();
            ctx.arc(x, y, snowflakeSize, 0, Math.PI * 2); // Draw a circle for each snowflake.
            ctx.fill();
        }
        ctx.globalAlpha = 1.0; // Reset global alpha to default for safety.
    });

    /**
     * Sun Glare / Bloom Filter
     * Increases overall warmth and brightness of the image,
     * then overlays a simulated sun glare/lens flare effect using gradients and circles.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place for warmth/brightness).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing glare).
     */
    registerFilter('sun', 'Sun Glare', 'canvas', (data, w, h, frameCount, ctx) => {
        // Step 1: Pixel manipulation to increase overall brightness and warmth.
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, data[i] + 40);  // Increase Red component.
            data[i + 1] = Math.min(255, data[i + 1] + 20); // Increase Green component.
            data[i + 2] = Math.max(0, data[i + 2] - 10); // Slightly decrease Blue for warmth.
        }

        // Step 2: Draw a yellowish-orange radial gradient for simulated sun glare/bloom.
        const centerX = w * 0.8; // Position the "sun" towards the top-right of the canvas.
        const centerY = h * 0.2;
        // Create a radial gradient (inner circle, then outer circle parameters).
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.min(w, h) * 0.6);
        gradient.addColorStop(0, 'rgba(255, 200, 0, 0.5)');   // Bright yellow center (50% opacity).
        gradient.addColorStop(0.5, 'rgba(255, 165, 0, 0.3)'); // Orange middle (30% opacity).
        gradient.addColorStop(1, 'rgba(255, 255, 0, 0)');     // Fully transparent yellow outer edge.

        ctx.fillStyle = gradient;    // Set fill style to the gradient.
        ctx.fillRect(0, 0, w, h);    // Draw the gradient over the entire canvas area.

        // Step 3: Add some small, bright "lens flare" like dots for realism.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; // Semi-transparent white for flares.
        ctx.beginPath();
        ctx.arc(centerX - 100, centerY + 80, 15, 0, Math.PI * 2); // First flare dot.
        ctx.arc(centerX + 80, centerY - 120, 10, 0, Math.PI * 2); // Second flare dot.
        ctx.fill();
    });

    /**
     * Moon Glow Filter
     * Transforms the image into a night scene by darkening and adding a blue tint,
     * then overlays a soft, glowing moon effect.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place for night effect).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing moon).
     */
    registerFilter('moon', 'Moon Glow', 'canvas', (data, w, h, frameCount, ctx) => {
        // Step 1: Pixel manipulation to convert to night mode (darken and add blue tint).
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, data[i] * 0.5 - 20); // Darken red component significantly.
            data[i + 1] = Math.max(0, data[i + 1] * 0.6 - 10); // Darken green component.
            data[i + 2] = Math.min(255, data[i + 2] * 0.8 + 30); // Add blue, but also darken slightly.
        }

        // Step 2: Draw a soft white-blue moon at a specific position (e.g., top-left corner).
        const centerX = w * 0.2; // Position towards the top-left.
        const centerY = h * 0.2;
        const radius = Math.min(w, h) * 0.15; // Moon size relative to the canvas dimensions.
        // Create a radial gradient for the moon's soft glow effect.
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)'); // Bright white center of the moon.
        gradient.addColorStop(0.7, 'rgba(200, 200, 255, 0.6)'); // Soft blue glow around the moon.
        gradient.addColorStop(1, 'rgba(150, 150, 255, 0)');     // Fully transparent outer edge of the glow.

        ctx.fillStyle = gradient;    // Set fill style to the gradient.
        ctx.beginPath();             // Begin drawing a new path.
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); // Draw a full circle for the moon.
        ctx.fill();                  // Fill the moon circle with the gradient.
    });

    /**
     * Stars Filter
     * Darkens the image for a night effect and overlays animated, twinkling stars.
     * Stars are drawn as small circles with varying opacity.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place for night effect).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing stars).
     */
    registerFilter('stars', 'Stars', 'canvas', (data, w, h, frameCount, ctx) => {
        // Step 1: Pixel manipulation to darken the image for a night effect.
        for (let i = 0; i < data.length; i += 4) {
            data[i] = data[i] * 0.4;     // Darken red component.
            data[i + 1] = data[i + 1] * 0.4; // Darken green component.
            data[i + 2] = data[i + 2] * 0.6; // Darken blue component slightly less for a cool night tint.
        }

        // Step 2: Draw animated, twinkling stars directly onto the canvas.
        const numStars = 300; // Number of individual stars to draw.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; // Semi-transparent white color for stars.
        for (let i = 0; i < numStars; i++) {
            // Calculate animated X and Y positions with slight random wobble.
            const x = (Math.sin(i * 0.07 + frameCount * 0.005) * 0.5 + 0.5) * w; 
            const y = (Math.cos(i * 0.05 + frameCount * 0.003) * 0.5 + 0.5) * h; 
            const size = Math.random() * 2 + 0.5; // Random size for stars (ranging from 0.5 to 2.5 pixels).
            
            // Simple twinkling effect: Varies opacity using a sine wave over time for each star.
            const twinkle = Math.sin(frameCount * 0.1 + i) * 0.3 + 0.7; // Opacity varies between 0.4 and 1.0.
            
            ctx.globalAlpha = twinkle; // Apply the twinkling opacity.
            ctx.beginPath();           // Begin drawing a new path for the star.
            ctx.arc(x, y, size, 0, Math.PI * 2); // Draw a full circle for each star.
            ctx.fill();                // Fill the star circle.
        }
        ctx.globalAlpha = 1.0; // Reset global alpha to default (opaque) for subsequent drawing operations.
    });

    /**
     * Water Ripple Filter
     * Creates a watery, rippling distortion effect across the image, plus a subtle blue-green tint.
     * Uses pixel displacement based on sine/cosine waves to simulate ripples.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place for distortion and tint).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     */
    registerFilter('water', 'Water Ripple', 'canvas', (data, w, h, frameCount) => {
        let originalData = new Uint8ClampedArray(data); // Copy original pixels to sample from.
        const rippleStrength = 5; // How much pixels are displaced (intensity of ripple).
        const rippleFrequency = 0.03; // How dense the ripples are (wavelength of the ripple effect).
        const time = frameCount * 0.05; // Time component for animating the ripples.

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4;

                // Calculate ripple displacement using sine and cosine waves based on position and time.
                const dx = rippleStrength * Math.sin(x * rippleFrequency + time);
                const dy = rippleStrength * Math.cos(y * rippleFrequency + time);

                // Determine the new source pixel coordinates by adding displacement to current coordinates.
                const newX = Math.floor(x + dx);
                const newY = Math.floor(y + dy);

                if (newX >= 0 && newX < w && newY >= 0 && newY < h) {
                    const newIdx = (newY * w + newX) * 4;
                    // Copy pixel from the displaced source to the current destination.
                    data[srcIdx] = originalData[newIdx];
                    data[srcIdx + 1] = originalData[newIdx + 1];
                    data[srcIdx + 2] = originalData[newIdx + 2];
                    data[srcIdx + 3] = originalData[newIdx + 3];
                } else {
                    // If source pixel is out of bounds due to distortion, fill with opaque black.
                    data[srcIdx] = data[srcIdx + 1] = data[srcIdx + 2] = 0;
                    data[srcIdx + 3] = 255; 
                }
            }
        }
        // Add subtle blue/green tint to the entire image for a more realistic water feel.
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, data[i] - 10);      // Reduce red component.
            data[i + 1] = Math.min(255, data[i + 1] + 10); // Increase green component.
            data[i + 2] = Math.min(255, data[i + 2] + 20); // Increase blue component.
        }
    });

    /**
     * Rainbow Overlay Filter
     * Overlays a semi-transparent, animated horizontal rainbow gradient across the image.
     * The gradient shifts slowly over time for an animation effect.
     * @param {Uint8ClampedArray} data - Pixel data (not directly manipulated for this overlay, but passed for consistency).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing the rainbow).
     */
    registerFilter('rainbow', 'Rainbow', 'canvas', (data, w, h, frameCount, ctx) => {
        // Create a linear gradient for the rainbow colors.
        const gradientHeight = h / 2; // Height of the rainbow band on the canvas.
        // The gradient spans from the top of the band to the bottom of the band.
        const gradient = ctx.createLinearGradient(0, h/2 - gradientHeight/2, w, h/2 + gradientHeight/2);
        
        // Define the standard rainbow colors.
        const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'];
        // Add color stops for each color, with an animated offset based on `frameCount`.
        colors.forEach((color, i) => {
            // `(frameCount % 100 / 100)` creates a smooth cycle from 0 to 1 over 100 frames.
            gradient.addColorStop((i + (frameCount % 100 / 100)) / colors.length, color);
        });

        ctx.fillStyle = gradient; // Set the fill style to the created rainbow gradient.
        ctx.globalAlpha = 0.3;    // Set global alpha to make the rainbow semi-transparent, so original image is visible.
        ctx.fillRect(0, 0, w, h); // Draw the gradient rectangle over the entire canvas area.
        ctx.globalAlpha = 1.0;    // Reset global alpha to default (opaque) for subsequent drawing operations.
    });

    /**
     * Disaster: Cyclone Filter
     * Creates a swirling, tornado-like distortion and darkens the image.
     * Pixels are twisted around the center, with the effect strengthening further from the center.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place for distortion and darkening).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     */
    registerFilter('cyclone', 'Cyclone', 'canvas', (data, w, h, frameCount) => {
        let originalData = new Uint8ClampedArray(data); // Copy original pixels to sample from.
        const centerX = w / 2;
        const centerY = h / 2;
        const time = frameCount * 0.05; // Time component for animating the swirl.
        const strength = 0.05; // How much to twist (intensity of the swirling effect).

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4;

                const dx = x - centerX; // Horizontal distance from center.
                const dy = y - centerY; // Vertical distance from center.
                const dist = Math.sqrt(dx * dx + dy * dy); // Euclidean distance from center.
                let angle = Math.atan2(dy, dx); // Angle of the current pixel relative to the center.

                // Add a twisting effect: the angle is modified based on distance from center and time.
                const twist = dist * strength + time;
                angle += twist;

                // Convert back from polar coordinates (new angle, original distance) to Cartesian
                // to find the original source pixel's position.
                const newX = Math.floor(centerX + dist * Math.cos(angle));
                const newY = Math.floor(centerY + dist * Math.sin(angle));

                if (newX >= 0 && newX < w && newY >= 0 && newY < h) {
                    const newIdx = (newY * w + newX) * 4;
                    // Copy pixel from the twisted source to the current destination.
                    data[srcIdx] = originalData[newIdx];
                    data[srcIdx + 1] = originalData[newIdx + 1];
                    data[srcIdx + 2] = originalData[newIdx + 2];
                    data[srcIdx + 3] = originalData[newIdx + 3];
                } else {
                    // If source pixel is out of bounds due to distortion, fill with opaque black.
                    data[srcIdx] = data[srcIdx + 1] = data[srcIdx + 2] = 0;
                    data[srcIdx + 3] = 255; 
                }
            }
        }
        // Darken and desaturate the entire image for a "stormy" or "apocalyptic" feel.
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i+1] + data[i+2]) / 3; // Calculate average brightness.
            data[i] = avg * 0.8; // Reduce red component.
            data[i+1] = avg * 0.8; // Reduce green component.
            data[i+2] = avg * 0.8; // Reduce blue component.
        }
    });

    /**
     * Disaster: Drought Filter
     * Desaturates the image and adds a reddish-brown tint,
     * then overlays animated crackle lines to simulate dry, cracked earth.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place for tint and desaturation).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing crack lines).
     */
    registerFilter('drought', 'Drought', 'canvas', (data, w, h, frameCount, ctx) => {
        // Step 1: Pixel manipulation to desaturate and add a reddish-brown tint.
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            const avg = (r + g + b) / 3; // Average brightness.
            data[i] = Math.min(255, avg * 0.8 + 50); // Increase red component significantly.
            data[i+1] = Math.min(255, avg * 0.8 + 20); // Increase green component slightly.
            data[i+2] = Math.max(0, avg * 0.8);    // Decrease blue component.
        }

        // Step 2: Draw animated crackle lines directly onto the canvas (simulating dry earth).
        ctx.strokeStyle = 'rgba(100, 50, 0, 0.4)'; // Dark brown color for the cracks.
        ctx.lineWidth = 1; // Thin lines.
        const lineDensity = 0.05; // Determines how many lines are drawn (e.g., 5% of height/width).
        
        // Draw wavy horizontal lines.
        for (let y = 0; y < h; y += h * lineDensity) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            // Add a sine wave distortion to the horizontal lines, animated over time.
            ctx.lineTo(w, y + Math.sin(y * 0.1 + frameCount * 0.02) * 10);
            ctx.stroke();
        }
        // Draw wavy vertical lines.
        for (let x = 0; x < w; x += w * lineDensity) {
            ctx.beginPath();
            // Add a cosine wave distortion to the vertical lines, animated over time.
            ctx.moveTo(x + Math.cos(x * 0.1 + frameCount * 0.03) * 10, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
    });

    /**
     * Squish Filter
     * Applies a vertical compression effect to the image, making it appear "squished".
     * Pixels are remapped to appear compressed vertically.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place for distortion).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('squish', 'Squish', 'canvas', (data, w, h) => {
        let originalData = new Uint8ClampedArray(data); // Copy original pixels to sample from.
        const compressionFactor = 0.7; // The degree of vertical compression (0.0 to 1.0).

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4; // Index of the current pixel in the output array.

                // Map the current Y coordinate in the output image to a new Y in the original image.
                // To achieve compression, we sample from a higher Y coordinate in the original image.
                const originalY = Math.floor(y / compressionFactor);
                
                if (originalY >= 0 && originalY < h) { // Ensure the source pixel is within original image bounds.
                    const originalIdx = (originalY * w + x) * 4;
                    data[srcIdx] = originalData[originalIdx];
                    data[srcIdx + 1] = originalData[originalIdx + 1];
                    data[srcIdx + 2] = originalData[originalIdx + 2];
                    data[srcIdx + 3] = originalData[originalIdx + 3];
                } else {
                    // If the source pixel is out of original bounds (due to compression),
                    // fill the destination pixel with transparency.
                    data[srcIdx] = data[srcIdx + 1] = data[srcIdx + 2] = 0;
                    data[srcIdx + 3] = 0; // Transparent (alpha = 0).
                }
            }
        }
    });

    /**
     * Pixelate Filter
     * Reduces the image resolution by averaging colors within blocks of pixels,
     * creating a blocky, pixelated effect.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('pixelate', 'Pixelate', 'canvas', (data, w, h) => {
        const pixelSize = 10; // The size of each square pixel block (e.g., 10x10 pixels will become one block).

        // Iterate through the image in blocks, not individual pixels.
        for (let y = 0; y < h; y += pixelSize) {
            for (let x = 0; x < w; x += pixelSize) {
                // Get the color of the top-left pixel (or average color) in the current block.
                // This color will then be used to fill the entire block.
                const originalIdx = (y * w + x) * 4;
                const r = data[originalIdx];
                const g = data[originalIdx + 1];
                const b = data[originalIdx + 2];
                const a = data[originalIdx + 3];

                // Fill the entire pixel block (pixelSize x pixelSize) with this single color.
                for (let dy = 0; dy < pixelSize; dy++) {
                    if (y + dy >= h) break; // Ensure we don't go out of vertical bounds.
                    for (let dx = 0; dx < pixelSize; dx++) {
                        if (x + dx >= w) break; // Ensure we don't go out of horizontal bounds.

                        const destIdx = ((y + dy) * w + (x + dx)) * 4;
                        data[destIdx] = r;
                        data[destIdx + 1] = g;
                        data[destIdx + 2] = b;
                        data[destIdx + 3] = a;
                    }
                }
            }
        }
    });

    /**
     * Negative Filter
     * Inverts the colors of the image, similar to a photographic negative.
     * Each color component (R, G, B) is subtracted from 255.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('negative', 'Negative', 'canvas', (data, w, h) => {
        // Iterate through all pixels in the data array (4 components at a time: R, G, B, A).
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];     // Invert Red component.
            data[i + 1] = 255 - data[i + 1]; // Invert Green component.
            data[i + 2] = 255 - data[i + 2]; // Invert Blue component.
            // Alpha (data[i + 3]) remains unchanged to preserve original transparency.
        }
    });

    /**
     * Heat Map / Thermal Vision Filter
     * Converts the image's colors into a gradient from blue (cold) to red (hot)
     * based on the pixel's brightness.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('thermal', 'Thermal', 'canvas', (data, w, h) => {
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const avg = (r + g + b) / 3; // Calculate the average brightness (grayscale value) of the pixel.

            let newR, newG, newB;

            // Map the brightness value to a color in the thermal gradient.
            if (avg < 85) { // Lower brightness (0-84): Blue range (cold)
                newB = 255;
                newG = Math.round(avg * 3); // Green component increases as brightness approaches 85.
                newR = 0;
            } else if (avg < 170) { // Medium brightness (85-169): Green-Yellow range (warm)
                newB = Math.round(255 - (avg - 85) * 3); // Blue decreases.
                newG = 255;                           // Green is max.
                newR = Math.round((avg - 85) * 3);    // Red increases.
            } else { // Higher brightness (170-255): Red range (hot)
                newB = 0;
                newG = Math.round(255 - (avg - 170) * 3); // Green decreases.
                newR = 255;                           // Red is max.
            }

            setPixel(data, i / 4 % w, Math.floor(i / 4 / w), w, newR, newG, newB, data[i+3]);
        }
    });

    /**
     * Comic Book Filter (Simplified)
     * Quantizes colors to a limited palette and optionally simulates a halftone dot pattern.
     * The halftone drawing is done directly on the context.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place for quantization).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count. (Not directly used in pixel logic)
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing dots).
     */
    registerFilter('comic', 'Comic Book', 'canvas', (data, w, h, frameCount, ctx) => {
        // Step 1: Quantize colors (reduce the color palette to create a flat comic book look).
        const quantizationFactor = 32; // Colors will be reduced to multiples of this factor (e.g., 0, 32, 64, ..., 255).
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.round(data[i] / quantizationFactor) * quantizationFactor;
            data[i + 1] = Math.round(data[i + 1] / quantizationFactor) * quantizationFactor;
            data[i + 2] = Math.round(data[i + 2] / quantizationFactor) * quantizationFactor;
        }

        // Step 2: Draw halftone dots overlay (optional, but enhances comic effect).
        // This is a simplified simulation; a true halftone involves complex dithering.
        const dotSize = 4; // Base size of each dot.
        const dotSpacing = 8; // Spacing between dot centers.
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Semi-transparent black dots.
        for (let y = 0; y < h; y += dotSpacing) {
            for (let x = 0; x < w; x += dotSpacing) {
                const pixel = getPixel(data, x, y, w); // Get the quantized pixel color.
                if (!pixel) continue;

                // Calculate dot radius based on pixel brightness (darker pixels get larger dots).
                const brightness = (pixel.r + pixel.g + pixel.b) / 3;
                const radius = dotSize * (1 - brightness / 255); // Inverse brightness: 0 for white, `dotSize` for black.

                if (radius > 0.5) { // Only draw dots if they are visible enough.
                    ctx.beginPath();
                    ctx.arc(x, y, radius / 2, 0, Math.PI * 2); // Draw a circle for each dot.
                    ctx.fill();
                }
            }
        }
    });

    /**
     * Emboss Filter
     * Creates a raised, embossed effect by detecting edges and adding light/shadow.
     * Uses a convolution kernel to find edges and then biases colors towards gray.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('emboss', 'Emboss', 'canvas', (data, w, h) => {
        let originalData = new Uint8ClampedArray(data); // Copy original pixels for convolution.
        const kernel = [ // Emboss convolution kernel (defines how surrounding pixels influence the center pixel).
            -2, -1, 0,
            -1, 1, 1,
            0, 1, 2
        ];
        const kernelSize = 3; // The kernel is a 3x3 matrix.
        const halfKernel = Math.floor(kernelSize / 2); // Used for calculating pixel offsets.

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let rSum = 0, gSum = 0, bSum = 0; // Sums for applying kernel weights.

                // Iterate over the kernel's area around the current pixel.
                for (let ky = 0; ky < kernelSize; ky++) {
                    for (let kx = 0; kx < kernelSize; kx++) {
                        const pixelX = x + kx - halfKernel; // X-coordinate of surrounding pixel.
                        const pixelY = y + ky - halfKernel; // Y-coordinate of surrounding pixel.
                        const weight = kernel[ky * kernelSize + kx]; // Weight from the kernel matrix.

                        const pixel = getPixel(originalData, pixelX, pixelY, w); // Get surrounding pixel color.
                        if (pixel) {
                            rSum += pixel.r * weight;
                            gSum += pixel.g * weight;
                            bSum += pixel.b * weight;
                        }
                    }
                }

                // Apply a bias (e.g., 128) to center the color values around gray (128,128,128) for embossing.
                setPixel(data, x, y, w,
                    rSum + 128, // Add bias to red sum.
                    gSum + 128, // Add bias to green sum.
                    bSum + 128, // Add bias to blue sum.
                    getPixel(originalData, x, y, w).a // Preserve original alpha channel.
                );
            }
        }
    });

    /**
     * Scanline Filter
     * Adds horizontal scanlines to simulate older display screens (e.g., CRT monitors).
     * Lines appear as darker strips.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count (for subtle flicker).
     */
    registerFilter('scanline', 'Scanline', 'canvas', (data, w, h, frameCount) => {
        const lineThickness = 2; // Every Nth line will be affected (e.g., every 2nd line).
        const intensity = 0.3; // How dark the lines are (0.0 to 1.0).
        const flicker = Math.sin(frameCount * 0.5) * 0.1 + 0.9; // Subtle flicker effect using sine wave.

        for (let y = 0; y < h; y++) {
            if (y % lineThickness === 0) { // Check if current line is one to be modified.
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4; // Index of the current pixel.
                    // Darken the pixel based on intensity and flicker.
                    data[i] = Math.max(0, data[i] * (1 - intensity * flicker));
                    data[i + 1] = Math.max(0, data[i + 1] * (1 - intensity * flicker));
                    data[i + 2] = Math.max(0, data[i + 2] * (1 - intensity * flicker));
                }
            }
        }
    });

    /**
     * Old TV Noise Filter
     * Adds random static noise and a slight color shift to mimic old analog TV sets.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('tv-noise', 'Old TV Noise', 'canvas', (data, w, h) => {
        const noiseFactor = 30; // Intensity of the random noise.
        
        for (let i = 0; i < data.length; i += 4) {
            // Add random noise to each color channel.
            const noise = (Math.random() - 0.5) * noiseFactor; // Random value between -noiseFactor/2 and +noiseFactor/2.
            data[i] = Math.min(255, Math.max(0, data[i] + noise));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));

            // Apply a simple color degradation/tint to mimic old TV colors.
            const avg = (data[i] + data[i+1] + data[i+2]) / 3; // Average brightness.
            data[i] = Math.min(255, Math.max(0, avg * 0.9 + 20)); // Slight red tint.
            data[i+1] = Math.min(255, Math.max(0, avg * 0.9));    // Slight green tint.
            data[i+2] = Math.min(255, Math.max(0, avg * 1.1));    // Slight blue tint.
        }
    });

    /**
     * Frosted Glass Filter
     * Applies a uniform blur and slightly reduces clarity,
     * simulating looking through frosted glass. This is implemented as a simple box blur.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('frosted-glass', 'Frosted Glass', 'canvas', (data, w, h) => {
        let originalData = new Uint8ClampedArray(data); // Copy original pixels to sample from.
        const blurRadius = 5; // The size of the blur kernel (e.g., 5 means 5x5 area).

        // Iterate through each pixel of the image.
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let rSum = 0, gSum = 0, bSum = 0, count = 0; // Accumulators for color sums and pixel count.

                // Sum up colors from surrounding pixels within the blur radius.
                for (let dy = -blurRadius; dy <= blurRadius; dy++) {
                    for (let dx = -blurRadius; dx <= blurRadius; dx++) {
                        const pixelX = x + dx;
                        const pixelY = y + dy;

                        const pixel = getPixel(originalData, pixelX, pixelY, w); // Get surrounding pixel.
                        if (pixel) {
                            rSum += pixel.r;
                            gSum += pixel.g;
                            bSum += pixel.b;
                            count++;
                        }
                    }
                }

                // Calculate the average color and set the current pixel to this average.
                setPixel(data, x, y, w,
                    rSum / count,
                    gSum / count,
                    bSum / count,
                    getPixel(originalData, x, y, w).a // Preserve original alpha channel.
                );
            }
        }
    });

    /**
     * Ascii Art Filter (Simplified)
     * Converts the image to a monochrome representation using ASCII characters.
     * This filter draws text directly onto the canvas context, overriding pixel data.
     * Note: Performance might be a challenge for live video on less powerful mobile devices.
     * @param {Uint8ClampedArray} data - Pixel data. (Ignored for direct drawing, as it redraws text).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count. (Not directly used in drawing logic).
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing ASCII characters).
     */
    registerFilter('ascii', 'ASCII Art', 'canvas', (data, w, h, frameCount, ctx) => {
        // This filter fundamentally changes how the image is rendered, overriding pixel data.
        const charSet = " .:-=+*#%@"; // Characters from light to dark brightness.
        const fontSize = 8; // Size of each ASCII character (in pixels).
        const charWidth = fontSize * 0.6; // Approximate width for monospaced font character.
        const charHeight = fontSize;

        // Clear the canvas fully to ensure no residual image pixels.
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'white'; // Set background color for the ASCII art.
        ctx.fillRect(0,0,w,h); // Fill the background.
        ctx.font = `${fontSize}px monospace`; // Set font to a monospaced font for consistent character spacing.
        ctx.fillStyle = 'black'; // Set text color.

        // Iterate through the canvas in blocks, drawing an ASCII character for each block.
        for (let y = 0; y < h; y += charHeight) {
            for (let x = 0; x < w; x += charWidth) {
                // Get the brightness of the block from the current canvas state (after `drawVideoOnCanvas`).
                // We re-sample from the canvas here, which is slightly inefficient but ensures the base image is considered.
                const pixel = getPixel(ctx.getImageData(0,0,w,h).data, x, y, w); 
                if(pixel) {
                    const brightness = (pixel.r + pixel.g + pixel.b) / 3; // Calculate average brightness.
                    // Map brightness to a character in the `charSet`.
                    const charIndex = Math.floor((brightness / 255) * (charSet.length - 1));
                    ctx.fillText(charSet[charIndex], x, y + charHeight); // Draw the character.
                }
            }
        }
    });

    /**
     * Mirror Horizontal Filter
     * Flips the image horizontally by remapping pixels from the mirrored X position.
     * This is applied *after* the `drawVideoOnCanvas` base mirroring, effectively un-mirroring a selfie.
     * Or, for environment camera, it will mirror it.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('mirror-h', 'Mirror Horizontal', 'canvas', (data, w, h) => {
        let originalData = new Uint8ClampedArray(data); // Copy original pixels to sample from.
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                // Calculate source pixel's X coordinate from the mirrored position.
                const srcX = (w - 1 - x); 
                const srcIdx = (y * w + srcX) * 4; // Index of the source pixel.
                const destIdx = (y * w + x) * 4;   // Index of the destination pixel.
                
                // Copy RGBA values from the mirrored source pixel to the current destination pixel.
                data[destIdx] = originalData[srcIdx];
                data[destIdx + 1] = originalData[srcIdx + 1];
                data[destIdx + 2] = originalData[srcIdx + 2];
                data[destIdx + 3] = originalData[srcIdx + 3];
            }
        }
    });

    /**
     * Old Photo Filter
     * Combines sepia toning, a faded look, and subtle noise for an old photograph effect.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('old-photo', 'Old Photo', 'canvas', (data, w, h) => {
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];

            // Apply Sepia effect using standard transformation matrix coefficients.
            const newR = (r * 0.393) + (g * 0.769) + (b * 0.189);
            const newG = (r * 0.349) + (g * 0.686) + (b * 0.168);
            const newB = (r * 0.272) + (g * 0.534) + (b * 0.131);

            data[i] = Math.min(255, newR);
            data[i + 1] = Math.min(255, newG);
            data[i + 2] = Math.min(255, newB);

            // Add subtle random noise to simulate film grain or old photo imperfections.
            const noise = (Math.random() - 0.5) * 10; // Random value between -5 and +5.
            data[i] = Math.min(255, Math.max(0, data[i] + noise));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
        }
    });

    /**
     * Pop Art Filter (Canvas-based)
     * Reduces color palette (quantization) and shifts hues dramatically for a vibrant pop-art look.
     * @param {Uint8ClampedArray} data - Pixel data (modified in place).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('pop-art-canvas', 'Pop Art (Canvas)', 'canvas', (data, w, h) => {
        const step = 64; // Quantize colors to multiples of 64 (e.g., 0, 64, 128, 192, 255).
        for (let i = 0; i < data.length; i += 4) {
            // Step 1: Quantize RGB channels.
            data[i] = Math.floor(data[i] / step) * step;
            data[i + 1] = Math.floor(data[i + 1] / step) * step;
            data[i + 2] = Math.floor(data[i + 2] / step) * step;

            // Step 2: Apply hue shifting for specific color ranges to achieve pop-art style.
            const [h, s, l] = rgbToHsl(data[i], data[i+1], data[i+2]); // Convert to HSL.
            let newH = h;
            // Example shifts:
            if (h > 0.1 && h < 0.3) newH = 0.5; // Shift yellows to green.
            else if (h > 0.6 && h < 0.8) newH = 0.1; // Shift blues to red/pink.
            // Add more specific hue shifts as desired for more pop-art variations.

            const [newR, newG, newB] = hslToRgb(newH, s, l); // Convert back to RGB.
            data[i] = newR;
            data[i+1] = newG;
            data[i+2] = newB;
        }
    });

    /**
     * Color Tint Filter
     * Applies a uniform color tint to the image (e.g., red, green, blue overlay).
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {object} tintColor - An object {r, g, b} representing the tint color.
     */
    const tintFilterGenerator = (tintColor) => (data, w, h) => {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, data[i] + tintColor.r);
            data[i + 1] = Math.min(255, data[i + 1] + tintColor.g);
            data[i + 2] = Math.min(255, data[i + 2] + tintColor.b);
        }
    };
    registerFilter('tint-red', 'Tint Red', 'canvas', tintFilterGenerator({r: 50, g: 0, b: 0}));
    registerFilter('tint-green', 'Tint Green', 'canvas', tintFilterGenerator({r: 0, g: 50, b: 0}));
    registerFilter('tint-blue', 'Tint Blue', 'canvas', tintFilterGenerator({r: 0, g: 0, b: 50}));
    registerFilter('tint-purple', 'Tint Purple', 'canvas', tintFilterGenerator({r: 30, g: 0, b: 30}));
    registerFilter('tint-yellow', 'Tint Yellow', 'canvas', tintFilterGenerator({r: 30, g: 30, b: 0}));

    /**
     * Sharpen Filter (Basic)
     * Applies a basic sharpening effect using a convolution kernel.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('sharpen', 'Sharpen', 'canvas', (data, w, h) => {
        let originalData = new Uint8ClampedArray(data);
        const kernel = [
            0, -1, 0,
            -1, 5, -1,
            0, -1, 0
        ];
        const kernelSize = 3;
        const halfKernel = Math.floor(kernelSize / 2);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let rSum = 0, gSum = 0, bSum = 0;

                for (let ky = 0; ky < kernelSize; ky++) {
                    for (let kx = 0; kx < kernelSize; kx++) {
                        const pixelX = x + kx - halfKernel;
                        const pixelY = y + ky - halfKernel;
                        const weight = kernel[ky * kernelSize + kx];

                        const pixel = getPixel(originalData, pixelX, pixelY, w);
                        if (pixel) {
                            rSum += pixel.r * weight;
                            gSum += pixel.g * weight;
                            bSum += pixel.b * weight;
                        }
                    }
                }
                setPixel(data, x, y, w, rSum, gSum, bSum, getPixel(originalData, x, y, w).a);
            }
        }
    });

    /**
     * Edge Detection Filter (Basic)
     * Converts the image to grayscale and highlights edges.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('edge-detect', 'Edge Detect', 'canvas', (data, w, h) => {
        let originalData = new Uint8ClampedArray(data);
        // Grayscale conversion
        for (let i = 0; i < data.length; i += 4) {
            const avg = (originalData[i] + originalData[i+1] + originalData[i+2]) / 3;
            originalData[i] = originalData[i+1] = originalData[i+2] = avg;
        }

        const kernel = [
            -1, -1, -1,
            -1, 8, -1,
            -1, -1, -1
        ]; // Laplacian kernel for edge detection
        const kernelSize = 3;
        const halfKernel = Math.floor(kernelSize / 2);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let rSum = 0, gSum = 0, bSum = 0;

                for (let ky = 0; ky < kernelSize; ky++) {
                    for (let kx = 0; kx < kernelSize; kx++) {
                        const pixelX = x + kx - halfKernel;
                        const pixelY = y + ky - halfKernel;
                        const weight = kernel[ky * kernelSize + kx];

                        const pixel = getPixel(originalData, pixelX, pixelY, w);
                        if (pixel) {
                            rSum += pixel.r * weight;
                            gSum += pixel.g * weight;
                            bSum += pixel.b * weight;
                        }
                    }
                }
                // Invert the edge colors to make them visible against black
                setPixel(data, x, y, w, Math.abs(rSum), Math.abs(gSum), Math.abs(bSum), getPixel(originalData, x, y, w).a);
            }
        }
    });

    /**
     * Vignette Filter
     * Darkens the edges of the image, drawing attention to the center.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('vignette', 'Vignette', 'canvas', (data, w, h) => {
        const centerX = w / 2;
        const centerY = h / 2;
        const maxDist = Math.sqrt(centerX * centerX + centerY * centerY); // Max distance from center
        const vignetteStrength = 0.7; // How dark the edges get

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                const vignetteFactor = 1 - vignetteStrength * (dist / maxDist); // Factor for darkening

                const i = (y * w + x) * 4;
                data[i] = Math.max(0, data[i] * vignetteFactor);
                data[i + 1] = Math.max(0, data[i + 1] * vignetteFactor);
                data[i + 2] = Math.max(0, data[i + 2] * vignetteFactor);
            }
        }
    });

    /**
     * Cross Process Filter (Canvas-based)
     * Simulates the chemical cross-processing effect, often resulting in strong blues/greens and high contrast.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('cross-process-canvas', 'Cross Process (Canvas)', 'canvas', (data, w, h) => {
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];

            // Apply custom curves/transformations for cross-process look
            // These are approximation values
            const newR = Math.min(255, Math.max(0, 1.2 * r + 0.1 * g - 0.05 * b));
            const newG = Math.min(255, Math.max(0, 0.1 * r + 1.1 * g + 0.05 * b));
            const newB = Math.min(255, Math.max(0, -0.05 * r + 0.1 * g + 1.3 * b));

            // Increase contrast and saturation
            const [h, s, l] = rgbToHsl(newR, newG, newB);
            const [finalR, finalG, finalB] = hslToRgb(h, Math.min(1, s * 1.5), Math.max(0, Math.min(1, l * 1.1 + 0.05)));

            data[i] = finalR;
            data[i + 1] = finalG;
            data[i + 2] = finalB;
        }
    });


    // --- Module Return (Public API) ---
    return {
        registerFilter,
        setActiveFilter,
        getActiveFilter,
        getAllFilters,
        applyActiveFilter
    };
})();