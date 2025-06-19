// js/filters.js
// This file manages all image/video filters for the SnapLens application.
// It defines both CSS-based filters (applied via CSS classes) and
// Canvas-based filters (applied via direct pixel manipulation).
// Total lines (including comments and empty lines): ~1000+

/**
 * FilterManager Module
 * Provides functionality to register, activate, and apply various image/video filters.
 * Filters can be 'css' type (relying on CSS filter property) or 'canvas' type (pixel manipulation).
 */
const FilterManager = (() => {
    let activeFilterId = 'none'; // Stores the ID of the currently active filter.
    const filters = {};           // A dictionary to store all registered filter objects.
    let frameCount = 0;           // Global frame counter for animated filters.

    // --- Core Filter Management Functions ---

    /**
     * Registers a new filter with the manager.
     * @param {string} id - A unique identifier for the filter (e.g., 'glitch', 'sepia').
     * @param {string} name - The display name for the filter (e.g., 'Digital Glitch', 'Old Sepia').
     * @param {string} type - The type of filter: 'canvas' for pixel manipulation, 'css' for CSS filter string.
     * @param {Function|string} applyFuncOrCssClass -
     *   If `type` is 'canvas': A function (data, w, h, frameCount, ctx, video) that manipulates pixel data.
     *   If `type` is 'css': The CSS class name to apply for the filter (e.g., 'filter-css-grayscale').
     */
    const registerFilter = (id, name, type, applyFuncOrCssClass) => {
        if (filters[id]) {
            console.warn(`Filter with ID '${id}' already registered. Overwriting.`);
        }
        filters[id] = { id, name, type, applyFunc: applyFuncOrCssClass };
        console.log(`Registered filter: ${name} (ID: ${id}, Type: ${type})`);
    };

    /**
     * Sets the currently active filter by its ID.
     * When a new filter is set, subsequent calls to `applyActiveFilter` will use this filter.
     * @param {string} id - The ID of the filter to activate.
     */
    const setActiveFilter = (id) => {
        if (filters[id]) {
            activeFilterId = id;
            console.log(`Active filter set to: ${filters[id].name} (ID: ${id})`);
        } else {
            console.warn(`Filter with ID '${id}' not found. Active filter remains '${activeFilterId}'.`);
        }
    };

    /**
     * Retrieves the object for the currently active filter.
     * @returns {object} The active filter object (id, name, type, applyFunc).
     */
    const getActiveFilter = () => filters[activeFilterId];

    /**
     * Retrieves an array of all registered filter objects.
     * Useful for dynamically creating filter selection buttons in the UI.
     * @returns {Array<object>} An array containing all filter objects.
     */
    const getAllFilters = () => Object.values(filters);

    /**
     * Helper function to draw the source video frame onto the canvas.
     * This function ensures the video maintains its aspect ratio (like `object-fit: cover`)
     * and applies mirroring if the camera is user-facing.
     * This is the base drawing operation before any specific filter effects are applied.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context of the canvas.
     * @param {HTMLVideoElement} video - The source video element (e.g., #camera-video-source).
     * @param {HTMLCanvasElement} canvas - The target canvas element (e.g., #camera-canvas).
     * @param {string} facingMode - The current camera facing mode ('user' for front, 'environment' for back).
     */
    const drawVideoOnCanvas = (ctx, video, canvas, facingMode) => {
        // Ensure video is ready and has dimensions
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            console.warn("Video source dimensions are zero, skipping draw.");
            return;
        }

        const videoRatio = video.videoWidth / video.videoHeight;
        const canvasRatio = canvas.width / canvas.height;

        let sx, sy, sWidth, sHeight; // Source rectangle (from video)
        let dx, dy, dWidth, dHeight; // Destination rectangle (on canvas)

        // Calculate source dimensions to "cover" the canvas (object-fit: cover logic)
        if (videoRatio > canvasRatio) { 
            // Video is wider than canvas: crop video horizontally
            sHeight = video.videoHeight;
            sWidth = sHeight * canvasRatio;
            sx = (video.videoWidth - sWidth) / 2; // Center horizontally
            sy = 0;
        } else { 
            // Video is taller than canvas: crop video vertically
            sWidth = video.videoWidth;
            sHeight = sWidth / canvasRatio;
            sx = 0;
            sy = (video.videoHeight - sHeight) / 2; // Center vertically
        }

        // Destination dimensions are always the full canvas
        dx = 0;
        dy = 0;
        dWidth = canvas.width;
        dHeight = canvas.height;

        // Save the current state of the canvas context (before transformations)
        ctx.save();

        // Apply mirroring transformation for user-facing camera
        // This flips the pixels horizontally so selfies appear naturally.
        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0); // Move origin to the right edge
            ctx.scale(-1, 1);               // Flip horizontally
        }

        // Draw the image with calculated source and destination rectangles.
        // This bakes in the aspect ratio correction and mirroring directly into the pixels.
        ctx.drawImage(video, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);

        // Restore the canvas context to its state before mirroring.
        // This is crucial so subsequent drawing operations (like filter overlays) are not mirrored.
        ctx.restore();
    };

    /**
     * Applies the currently active filter to the canvas.
     * This function is called repeatedly in the animation loop.
     * It first draws the base video frame and then applies the chosen filter effect.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context of the canvas.
     * @param {HTMLVideoElement} video - The source video element.
     * @param {HTMLCanvasElement} canvas - The canvas element.
     * @param {number} currentFrameCount - A counter for animation-based filters.
     * @param {string} facingMode - 'user' or 'environment'.
     */
    const applyActiveFilter = (ctx, video, canvas, currentFrameCount, facingMode) => {
        frameCount = currentFrameCount; // Update global frame count
        const filter = getActiveFilter();
        
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the entire canvas for the new frame

        // 1. Draw the base video frame (with aspect ratio and mirroring applied).
        drawVideoOnCanvas(ctx, video, canvas, facingMode);
        
        // 2. Apply the chosen filter effect.
        if (filter.type === 'css') {
            // For CSS filters, the CSS class is applied directly to the canvas element in camera.js.
            // No pixel manipulation is performed here for CSS filters; `drawVideoOnCanvas` is sufficient.
            // This condition is mostly for logical branching.
        } else if (filter.type === 'canvas' && typeof filter.applyFunc === 'function') {
            // For canvas filters, we get the pixel data from the canvas *after* the base video is drawn.
            let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            let data = imageData.data; // Raw pixel data (Uint8ClampedArray: R, G, B, A for each pixel)

            // Apply the custom canvas filter function, which manipulates the `data` array.
            // Some canvas filters might need the context (ctx) or video for advanced drawing.
            filter.applyFunc(data, canvas.width, canvas.height, frameCount, ctx, video);
            
            // Put the modified pixel data back onto the canvas.
            ctx.putImageData(imageData, 0, 0);
        }
    };

    // --- Utility Functions for Canvas Pixel Manipulation (Internal Helpers) ---

    /**
     * Gets the RGBA values of a pixel at (x, y) from the imageData array.
     * @param {Uint8ClampedArray} data - The pixel data array.
     * @param {number} x - The x-coordinate of the pixel.
     * @param {number} y - The y-coordinate of the pixel.
     * @param {number} w - The width of the image.
     * @returns {object} An object {r, g, b, a} or null if out of bounds.
     */
    const getPixel = (data, x, y, w) => {
        if (x < 0 || x >= w || y < 0 || y * w * 4 >= data.length) return null; // Check bounds
        const i = (y * w + x) * 4;
        return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
    };

    /**
     * Sets the RGBA values of a pixel at (x, y) in the imageData array.
     * @param {Uint8ClampedArray} data - The pixel data array.
     * @param {number} x - The x-coordinate of the pixel.
     * @param {number} y - The y-coordinate of the pixel.
     * @param {number} w - The width of the image.
     * @param {number} r - Red value (0-255).
     * @param {number} g - Green value (0-255).
     * @param {number} b - Blue value (0-255).
     * @param {number} a - Alpha value (0-255).
     */
    const setPixel = (data, x, y, w, r, g, b, a) => {
        if (x < 0 || x >= w || y < 0 || y * w * 4 >= data.length) return; // Check bounds
        const i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = a;
    };

    /**
     * Converts an RGB color value to HSL. Conversion formula
     * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
     * Assumes r, g, and b are contained in the set [0, 255] and
     * returns h, s, and l in the set [0, 1].
     *
     * @param   Number  r       The red color value
     * @param   Number  g       The green color value
     * @param   Number  b       The blue color value
     * @return  Array           The HSL representation
     */
    const rgbToHsl = (r, g, b) => {
        r /= 255, g /= 255, b /= 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
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
     * Converts an HSL color value to RGB. Conversion formula
     * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
     * Assumes h, s, and l are contained in the set [0, 1] and
     * returns r, g, and b in the set [0, 255].
     *
     * @param   Number  h       The hue
     * @param   Number  s       The saturation
     * @param   Number  l       The lightness
     * @return  Array           The RGB representation
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

    // 1. CSS Filters (Applied by setting a CSS class on the canvas element)
    // These filters are registered here, but their actual effect is controlled
    // by CSS properties (filter, opacity, etc.) applied in `style.css`.
    // The `applyActiveFilter` function in this module simply draws the base video.

    console.log("Registering CSS Filters...");
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
    registerFilter('pop-art', 'Pop Art', 'css', 'filter-css-pop-art');
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
    registerFilter('crosshatch', 'Crosshatch (CSS)', 'css', 'filter-css-crosshatch'); // Limited CSS
    registerFilter('sketch', 'Sketch (CSS)', 'css', 'filter-css-sketch');         // Basic CSS
    registerFilter('cartoon', 'Cartoon (CSS)', 'css', 'filter-css-cartoon');       // Basic CSS
    registerFilter('sunlight', 'Sunlight', 'css', 'filter-css-sunlight');
    registerFilter('moonlight', 'Moonlight', 'css', 'filter-css-moonlight');
    registerFilter('old-film', 'Old Film', 'css', 'filter-css-old-film');
    registerFilter('pop-color', 'Pop Color', 'css', 'filter-css-pop-color');
    registerFilter('aqua', 'Aqua', 'css', 'filter-css-aqua');
    registerFilter('chrome', 'Chrome', 'css', 'filter-css-chrome');
    registerFilter('fade-to-black', 'Fade to Black', 'css', 'filter-css-fade-to-black');
    registerFilter('high-contrast-bw', 'High Contrast BW', 'css', 'filter-css-high-contrast-bw');


    // 2. Canvas Filters (Pixel Manipulation)
    // These functions directly manipulate the `data` (Uint8ClampedArray) of an ImageData object.
    // They generally receive: data (pixel array), w (width), h (height), frameCount (for animation),
    // and sometimes ctx (context) or video (source element) for drawing overlays.

    console.log("Registering Canvas Filters...");

    /**
     * Glitch Filter
     * Introduces random pixel displacement and color channel swaps.
     * Mimics digital signal corruption.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     */
    registerFilter('glitch', 'Glitch', 'canvas', (data, w, h, frameCount) => {
        const severity = 2 + Math.sin(frameCount * 0.1) * 2; // Vary glitch intensity
        const blockHeight = 10; // Height of pixel blocks to displace
        let originalData = new Uint8ClampedArray(data); // Copy original pixels for sourcing

        for (let y = 0; y < h; y += blockHeight) {
            // Random horizontal offset for each block
            const offset = Math.floor(Math.random() * severity * 2) - severity;
            if (offset === 0) continue; // Skip if no offset

            // Vary start X and width for more organic glitches
            const xStart = Math.random() < 0.5 ? 0 : Math.floor(w * 0.2);
            const blockWidth = Math.floor(w * (0.8 - Math.random() * 0.4));

            for (let dy = 0; dy < blockHeight; dy++) {
                if (y + dy >= h) break; // Check bounds vertically
                for (let dx = 0; dx < blockWidth; dx++) {
                    if (xStart + dx >= w) break; // Check bounds horizontally

                    const srcX = xStart + dx;
                    const srcY = y + dy;
                    const destX = srcX + offset; // Apply horizontal displacement
                    const destY = srcY;

                    if (destX >= 0 && destX < w && destY >= 0 && destY < h) {
                        const srcIdx = (srcY * w + srcX) * 4;
                        const destIdx = (destY * w + destX) * 4;

                        // Classic glitch: swap red and blue channels (or just copy for simple displacement)
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
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     */
    registerFilter('rumble', 'Rumble', 'canvas', (data, w, h, frameCount) => {
        let originalData = new Uint8ClampedArray(data); // Copy original pixels
        const strength = 10; // Maximum pixel displacement
        const frequency = 0.05; // Spatial frequency of the waves
        const time = frameCount * 0.05; // Time component for animation

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4;

                // Calculate displacement for x and y using sine/cosine waves
                const dx = strength * Math.sin(x * frequency + time) * Math.sin(y * frequency * 2 + time);
                const dy = strength * Math.cos(y * frequency + time) * Math.sin(x * frequency * 2 + time);

                // Calculate the new source pixel coordinates
                const newX = Math.floor(x + dx);
                const newY = Math.floor(y + dy);

                if (newX >= 0 && newX < w && newY >= 0 && newY < h) {
                    const newIdx = (newY * w + newX) * 4;
                    // Copy pixel from new source coordinates to current destination
                    data[srcIdx] = originalData[newIdx];
                    data[srcIdx + 1] = originalData[newIdx + 1];
                    data[srcIdx + 2] = originalData[newIdx + 2];
                    data[srcIdx + 3] = originalData[newIdx + 3];
                } else {
                    // If source pixel is out of bounds, make current pixel black (or transparent)
                    data[srcIdx] = data[srcIdx + 1] = data[srcIdx + 2] = 0;
                    data[srcIdx + 3] = 255; // Opaque black
                }
            }
        }
    });

    /**
     * Squeeze / Radial Distortion Filter
     * Distorts pixels towards or away from the center, creating a "squeeze" or "pinch" effect.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('squeeze', 'Squeeze', 'canvas', (data, w, h) => {
        let originalData = new Uint8ClampedArray(data);
        const centerX = w / 2;
        const centerY = h / 2;
        const radius = Math.min(w, h) / 2; // Radius of effect, based on smaller dimension
        const strength = 0.5; // How much to squeeze (0.0 to 1.0, 1.0 being max squeeze)

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4;

                const dx = x - centerX; // Horizontal distance from center
                const dy = y - centerY; // Vertical distance from center
                const dist = Math.sqrt(dx * dx + dy * dy); // Euclidean distance from center

                if (dist < radius) { // Only apply effect within the defined radius
                    const angle = Math.atan2(dy, dx); // Angle from center to current pixel
                    const percent = dist / radius; // Distance as a percentage of radius (0 at center, 1 at edge)
                    // Calculate new distance: squeeze more towards center (1 - percent)
                    const newDist = dist * (1 - strength * (1 - percent)); 

                    // Convert back to Cartesian coordinates for the new source pixel
                    const newX = Math.floor(centerX + newDist * Math.cos(angle));
                    const newY = Math.floor(centerY + newDist * Math.sin(angle));

                    if (newX >= 0 && newX < w && newY >= 0 && newY < h) {
                        const newIdx = (newY * w + newX) * 4;
                        data[srcIdx] = originalData[newIdx];
                        data[srcIdx + 1] = originalData[newIdx + 1];
                        data[srcIdx + 2] = originalData[newIdx + 2];
                        data[srcIdx + 3] = originalData[newIdx + 3];
                    } else {
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
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing particles).
     */
    registerFilter('rain', 'Rain', 'canvas', (data, w, h, frameCount, ctx) => {
        // Pixel manipulation for subtle blue tint on the base image
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, data[i] - 20);      // Reduce Red
            data[i + 1] = Math.max(0, data[i + 1] - 10);  // Reduce Green
            data[i + 2] = Math.min(255, data[i + 2] + 30); // Increase Blue
        }

        // Draw rain particles on top of the modified image (on the same canvas context)
        // This part needs `ctx` access, so it runs *after* pixel data is put back.
        // It's technically drawing *over* the previous frame's pixels, but within the draw loop.
        const numDrops = 100;
        const dropSpeed = 10;     // How fast rain falls
        const dropLength = 20;    // Length of rain streaks
        
        ctx.fillStyle = 'rgba(200, 200, 255, 0.7)'; // Light blue transparent drops
        for (let i = 0; i < numDrops; i++) {
            // Calculate animated X and Y positions for each drop
            const x = (i * 13 + frameCount * dropSpeed) % (w + dropLength) - dropLength;
            const y = (i * 29 + frameCount * dropSpeed) % (h + dropLength) - dropLength;
            
            ctx.fillRect(x, y, 2, dropLength); // Draw vertical line for drop
        }
    });

    /**
     * Snow Filter
     * Applies a slight desaturation and cold tint, then overlays animated snowflakes.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing particles).
     */
    registerFilter('snow', 'Snow', 'canvas', (data, w, h, frameCount, ctx) => {
        // Pixel manipulation: slight desaturation and cold tint
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i+1] + data[i+2]) / 3;
            data[i] = avg;       // Set red to average (desaturate)
            data[i+1] = avg;     // Set green to average (desaturate)
            data[i+2] = avg + 20; // Add blue component for cold tint
        }

        // Draw animated snowflakes on top
        const numSnowflakes = 200;
        const snowflakeSpeed = 2;
        const snowflakeSize = 3;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; // White transparent snowflakes
        for (let i = 0; i < numSnowflakes; i++) {
            // Calculate animated X and Y positions with slight horizontal drift for each snowflake
            const x = (i * 31 + frameCount * snowflakeSpeed * 0.5 + Math.sin(i * 0.1 + frameCount * 0.05) * 20) % (w + snowflakeSize) - snowflakeSize;
            const y = (i * 17 + frameCount * snowflakeSpeed) % (h + snowflakeSize) - snowflakeSize;
            
            ctx.beginPath();
            ctx.arc(x, y, snowflakeSize, 0, Math.PI * 2); // Draw a circle for each snowflake
            ctx.fill();
        }
    });

    /**
     * Sun Glare / Bloom Filter
     * Increases warmth and brightness, then overlays a simulated sun glare/lens flare effect.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing glare).
     */
    registerFilter('sun', 'Sun Glare', 'canvas', (data, w, h, frameCount, ctx) => {
        // Pixel manipulation: increase overall brightness and warmth
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, data[i] + 40);  // Increase Red
            data[i + 1] = Math.min(255, data[i + 1] + 20); // Increase Green
            data[i + 2] = Math.max(0, data[i + 2] - 10); // Decrease Blue slightly (for warmth)
        }

        // Draw a yellowish-orange radial gradient for simulated sun glare/bloom
        const centerX = w * 0.8; // Position the "sun" towards the top-right
        const centerY = h * 0.2;
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.min(w, h) * 0.6);
        gradient.addColorStop(0, 'rgba(255, 200, 0, 0.5)');   // Bright yellow center
        gradient.addColorStop(0.5, 'rgba(255, 165, 0, 0.3)'); // Orange middle
        gradient.addColorStop(1, 'rgba(255, 255, 0, 0)');     // Fully transparent outer edge

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h); // Draw the gradient over the entire canvas

        // Add some small, bright "lens flare" like dots for realism
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; // Semi-transparent white
        ctx.beginPath();
        ctx.arc(centerX - 100, centerY + 80, 15, 0, Math.PI * 2); // Dot 1
        ctx.arc(centerX + 80, centerY - 120, 10, 0, Math.PI * 2); // Dot 2
        ctx.fill();
    });

    /**
     * Moon Glow Filter
     * Transforms the image into a night scene by darkening and adding a blue tint,
     * then overlays a soft, glowing moon effect.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing moon).
     */
    registerFilter('moon', 'Moon Glow', 'canvas', (data, w, h, frameCount, ctx) => {
        // Pixel manipulation: convert to night mode (darken and add blue tint)
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, data[i] * 0.5 - 20); // Darken red significantly
            data[i + 1] = Math.max(0, data[i + 1] * 0.6 - 10); // Darken green
            data[i + 2] = Math.min(255, data[i + 2] * 0.8 + 30); // Add blue, darken slightly
        }

        // Draw a soft white-blue moon at the top-left corner
        const centerX = w * 0.2; // Position towards top-left
        const centerY = h * 0.2;
        const radius = Math.min(w, h) * 0.15; // Moon size relative to canvas
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)'); // Bright white center
        gradient.addColorStop(0.7, 'rgba(200, 200, 255, 0.6)'); // Soft blue glow
        gradient.addColorStop(1, 'rgba(150, 150, 255, 0)');     // Transparent outer edge

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); // Draw the moon circle
        ctx.fill();
    });

    /**
     * Stars Filter
     * Darkens the image for a night effect and overlays animated, twinkling stars.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing stars).
     */
    registerFilter('stars', 'Stars', 'canvas', (data, w, h, frameCount, ctx) => {
        // Pixel manipulation: darken image for night effect
        for (let i = 0; i < data.length; i += 4) {
            data[i] = data[i] * 0.4;     // Darken red
            data[i + 1] = data[i + 1] * 0.4; // Darken green
            data[i + 2] = data[i + 2] * 0.6; // Darken blue slightly less for a cool tint
        }

        // Draw animated, twinkling stars on top
        const numStars = 300;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; // Semi-transparent white stars
        for (let i = 0; i < numStars; i++) {
            // Use random positions for each star
            const x = (Math.sin(i * 0.07 + frameCount * 0.005) * 0.5 + 0.5) * w; // Slight horizontal wobble
            const y = (Math.cos(i * 0.05 + frameCount * 0.003) * 0.5 + 0.5) * h; // Slight vertical wobble
            const size = Math.random() * 2 + 0.5; // Random size for stars (0.5 to 2.5 pixels)
            // Simple twinkle effect using sine wave on alpha
            const twinkle = Math.sin(frameCount * 0.1 + i) * 0.3 + 0.7; // Varies opacity between 0.4 and 1.0
            
            ctx.globalAlpha = twinkle; // Apply twinkling opacity
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2); // Draw a circle for each star
            ctx.fill();
        }
        ctx.globalAlpha = 1.0; // Reset global alpha for subsequent drawing
    });

    /**
     * Water Ripple Filter
     * Creates a watery, rippling distortion effect across the image, plus a subtle blue-green tint.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     */
    registerFilter('water', 'Water Ripple', 'canvas', (data, w, h, frameCount) => {
        let originalData = new Uint8ClampedArray(data);
        const rippleStrength = 5; // How much pixels are displaced (intensity)
        const rippleFrequency = 0.03; // How dense the ripples are (wavelength)
        const time = frameCount * 0.05; // Time component for animation

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4;

                // Calculate ripple displacement using sine and cosine waves
                const dx = rippleStrength * Math.sin(x * rippleFrequency + time);
                const dy = rippleStrength * Math.cos(y * rippleFrequency + time);

                // Determine the new source pixel coordinates based on displacement
                const newX = Math.floor(x + dx);
                const newY = Math.floor(y + dy);

                if (newX >= 0 && newX < w && newY >= 0 && newY < h) {
                    const newIdx = (newY * w + newX) * 4;
                    // Copy pixel from the displaced source to the current destination
                    data[srcIdx] = originalData[newIdx];
                    data[srcIdx + 1] = originalData[newIdx + 1];
                    data[srcIdx + 2] = originalData[newIdx + 2];
                    data[srcIdx + 3] = originalData[newIdx + 3];
                } else {
                    // If source pixel is out of bounds, fill with black
                    data[srcIdx] = data[srcIdx + 1] = data[srcIdx + 2] = 0;
                    data[srcIdx + 3] = 255; // Opaque
                }
            }
        }
        // Add subtle blue/green tint for a more realistic water feel
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, data[i] - 10);      // Reduce red
            data[i + 1] = Math.min(255, data[i + 1] + 10); // Increase green
            data[i + 2] = Math.min(255, data[i + 2] + 20); // Increase blue
        }
    });

    /**
     * Rainbow Overlay Filter
     * Overlays a semi-transparent, animated horizontal rainbow gradient across the image.
     * @param {Uint8ClampedArray} data - Pixel data. (Not directly manipulated here, but passed for consistency)
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing rainbow).
     */
    registerFilter('rainbow', 'Rainbow', 'canvas', (data, w, h, frameCount, ctx) => {
        // Create a linear gradient for the rainbow colors
        const gradientHeight = h / 2; // Height of the rainbow band
        const gradient = ctx.createLinearGradient(0, h/2 - gradientHeight/2, w, h/2 + gradientHeight/2);
        
        // Define rainbow colors
        const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'];
        // Add color stops, with a slight shift over time for animation
        colors.forEach((color, i) => {
            gradient.addColorStop((i + (frameCount % 100 / 100)) / colors.length, color);
        });

        ctx.fillStyle = gradient; // Set fill style to the rainbow gradient
        ctx.globalAlpha = 0.3;    // Make it semi-transparent so the original image is still visible
        ctx.fillRect(0, 0, w, h); // Draw the gradient over the entire canvas area
        ctx.globalAlpha = 1.0;    // Reset global alpha for subsequent drawing operations
    });

    /**
     * Disaster: Cyclone Filter
     * Creates a swirling, tornado-like distortion and darkens the image.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     */
    registerFilter('cyclone', 'Cyclone', 'canvas', (data, w, h, frameCount) => {
        let originalData = new Uint8ClampedArray(data);
        const centerX = w / 2;
        const centerY = h / 2;
        const time = frameCount * 0.05; // Time for animation
        const strength = 0.05; // How much to twist (intensity of swirl)

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4;

                const dx = x - centerX; // Horizontal distance from center
                const dy = y - centerY; // Vertical distance from center
                const dist = Math.sqrt(dx * dx + dy * dy); // Distance from center
                let angle = Math.atan2(dy, dx); // Angle of current pixel relative to center

                // Add a twisting effect: angle increases with distance and time
                const twist = dist * strength + time;
                angle += twist;

                // Convert back to Cartesian coordinates to find the source pixel's original position
                const newX = Math.floor(centerX + dist * Math.cos(angle));
                const newY = Math.floor(centerY + dist * Math.sin(angle));

                if (newX >= 0 && newX < w && newY >= 0 && newY < h) {
                    const newIdx = (newY * w + newX) * 4;
                    data[srcIdx] = originalData[newIdx];
                    data[srcIdx + 1] = originalData[newIdx + 1];
                    data[srcIdx + 2] = originalData[newIdx + 2];
                    data[srcIdx + 3] = originalData[newIdx + 3];
                } else {
                    data[srcIdx] = data[srcIdx + 1] = data[srcIdx + 2] = 0;
                    data[srcIdx + 3] = 255;
                }
            }
        }
        // Darken and desaturate the entire image for a "stormy" feel
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i+1] + data[i+2]) / 3;
            data[i] = avg * 0.8; // Reduce red
            data[i+1] = avg * 0.8; // Reduce green
            data[i+2] = avg * 0.8; // Reduce blue
        }
    });

    /**
     * Disaster: Drought Filter
     * Desaturates the image and adds a reddish-brown tint,
     * then overlays animated crackle lines to simulate dry earth.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing cracks).
     */
    registerFilter('drought', 'Drought', 'canvas', (data, w, h, frameCount, ctx) => {
        // Pixel manipulation: desaturate and add a reddish-brown tint
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            const avg = (r + g + b) / 3;
            data[i] = Math.min(255, avg * 0.8 + 50); // More red
            data[i+1] = Math.min(255, avg * 0.8 + 20); // More green
            data[i+2] = Math.max(0, avg * 0.8);    // Less blue
        }

        // Draw animated crackle lines on top (simulating dry earth)
        ctx.strokeStyle = 'rgba(100, 50, 0, 0.4)'; // Dark brown color for cracks
        ctx.lineWidth = 1;
        const lineDensity = 0.05; // Density of crack lines
        
        // Draw wavy horizontal lines
        for (let y = 0; y < h; y += h * lineDensity) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            // Add a sine wave distortion to the horizontal lines for organic look
            ctx.lineTo(w, y + Math.sin(y * 0.1 + frameCount * 0.02) * 10);
            ctx.stroke();
        }
        // Draw wavy vertical lines
        for (let x = 0; x < w; x += w * lineDensity) {
            ctx.beginPath();
            // Add a cosine wave distortion to the vertical lines
            ctx.moveTo(x + Math.cos(x * 0.1 + frameCount * 0.03) * 10, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
    });

    /**
     * Squish Filter
     * Applies a vertical compression effect to the image, making it appear "squished".
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('squish', 'Squish', 'canvas', (data, w, h) => {
        let originalData = new Uint8ClampedArray(data);
        const compressionFactor = 0.7; // 70% compressed vertically (0.0 to 1.0)

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4;

                // Map current Y coordinate to a new Y in the original image.
                // To compress, we sample from a higher Y in the original image.
                const originalY = Math.floor(y / compressionFactor);
                
                if (originalY >= 0 && originalY < h) { // Ensure source pixel is within original image bounds
                    const originalIdx = (originalY * w + x) * 4;
                    data[srcIdx] = originalData[originalIdx];
                    data[srcIdx + 1] = originalData[originalIdx + 1];
                    data[srcIdx + 2] = originalData[originalIdx + 2];
                    data[srcIdx + 3] = originalData[originalIdx + 3];
                } else {
                    // If the source pixel is out of original bounds (due to compression),
                    // fill the destination pixel with transparency.
                    data[srcIdx] = data[srcIdx + 1] = data[srcIdx + 2] = 0;
                    data[srcIdx + 3] = 0; // Transparent
                }
            }
        }
    });

    /**
     * Pixelate Filter
     * Reduces the image resolution by averaging colors in blocks of pixels,
     * creating a pixelated effect.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('pixelate', 'Pixelate', 'canvas', (data, w, h) => {
        const pixelSize = 10; // Size of each pixel block (e.g., 10x10 pixels will be one block)

        for (let y = 0; y < h; y += pixelSize) {
            for (let x = 0; x < w; x += pixelSize) {
                // Get the color of the top-left pixel in the current block.
                // This color will be used for the entire block.
                const originalIdx = (y * w + x) * 4;
                const r = data[originalIdx];
                const g = data[originalIdx + 1];
                const b = data[originalIdx + 2];
                const a = data[originalIdx + 3];

                // Fill the entire block (pixelSize x pixelSize) with this single color.
                for (let dy = 0; dy < pixelSize; dy++) {
                    if (y + dy >= h) break; // Ensure we don't go out of bounds vertically
                    for (let dx = 0; dx < pixelSize; dx++) {
                        if (x + dx >= w) break; // Ensure we don't go out of bounds horizontally

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
     * Red becomes Cyan, Green becomes Magenta, Blue becomes Yellow.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('negative', 'Negative', 'canvas', (data, w, h) => {
        // Iterate through all pixels (4 components at a time: R, G, B, A)
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];     // Invert Red component
            data[i + 1] = 255 - data[i + 1]; // Invert Green component
            data[i + 2] = 255 - data[i + 2]; // Invert Blue component
            // Alpha (data[i + 3]) remains unchanged to preserve transparency
        }
    });

    /**
     * Heat Map / Thermal Vision Filter
     * Maps color intensities to a gradient from blue (cold) to red (hot).
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('thermal', 'Thermal', 'canvas', (data, w, h) => {
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const avg = (r + g + b) / 3; // Get grayscale value

            let newR, newG, newB;
            if (avg < 85) { // Blue range (cold)
                newB = 255;
                newG = avg * 3;
                newR = 0;
            } else if (avg < 170) { // Green-Yellow range (warm)
                newB = 255 - (avg - 85) * 3;
                newG = 255;
                newR = (avg - 85) * 3;
            } else { // Red range (hot)
                newB = 0;
                newG = 255 - (avg - 170) * 3;
                newR = 255;
            }

            data[i] = newR;
            data[i + 1] = newG;
            data[i + 2] = newB;
        }
    });

    /**
     * Comic Book Filter
     * Simplifies colors and applies a halftone dot pattern (simulated).
     * This is a simplified version; a true halftone is complex.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (for drawing dots).
     */
    registerFilter('comic', 'Comic Book', 'canvas', (data, w, h, frameCount, ctx) => {
        // Step 1: Quantize colors (reduce color palette)
        const quantizationFactor = 32; // Reduce colors to multiples of 32
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.round(data[i] / quantizationFactor) * quantizationFactor;
            data[i + 1] = Math.round(data[i + 1] / quantizationFactor) * quantizationFactor;
            data[i + 2] = Math.round(data[i + 2] / quantizationFactor) * quantizationFactor;
        }

        // Step 2: Draw halftone dots overlay
        const dotSize = 4; // Size of each dot
        const dotSpacing = 8; // Spacing between dot centers
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Semi-transparent black dots
        for (let y = 0; y < h; y += dotSpacing) {
            for (let x = 0; x < w; x += dotSpacing) {
                const pixel = getPixel(data, x, y, w);
                if (!pixel) continue;

                // Calculate dot radius based on pixel brightness (darker = larger dot)
                const brightness = (pixel.r + pixel.g + pixel.b) / 3;
                const radius = dotSize * (1 - brightness / 255); // Inverse brightness

                ctx.beginPath();
                ctx.arc(x, y, radius / 2, 0, Math.PI * 2); // Divide by 2 as radius is full diameter
                ctx.fill();
            }
        }
    });

    /**
     * Emboss Filter
     * Creates a raised, embossed effect by detecting edges and adding light/shadow.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('emboss', 'Emboss', 'canvas', (data, w, h) => {
        let originalData = new Uint8ClampedArray(data);
        const kernel = [ // Emboss convolution kernel
            -2, -1, 0,
            -1, 1, 1,
            0, 1, 2
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

                // Apply a bias (e.g., 128) to center the values around gray for embossing
                setPixel(data, x, y, w,
                    Math.min(255, Math.max(0, rSum + 128)),
                    Math.min(255, Math.max(0, gSum + 128)),
                    Math.min(255, Math.max(0, bSum + 128)),
                    getPixel(originalData, x, y, w).a // Preserve original alpha
                );
            }
        }
    });

    /**
     * Scanline Filter
     * Adds horizontal scanlines to simulate older display screens.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     */
    registerFilter('scanline', 'Scanline', 'canvas', (data, w, h, frameCount) => {
        const lineThickness = 2; // Every 2 lines will be affected
        const intensity = 0.3; // How dark the lines are (0.0 to 1.0)
        const flicker = Math.sin(frameCount * 0.5) * 0.1 + 0.9; // Subtle flicker effect

        for (let y = 0; y < h; y++) {
            if (y % lineThickness === 0) { // Apply to every Nth line
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4;
                    data[i] = Math.max(0, data[i] * (1 - intensity * flicker));
                    data[i + 1] = Math.max(0, data[i + 1] * (1 - intensity * flicker));
                    data[i + 2] = Math.max(0, data[i + 2] * (1 - intensity * flicker));
                }
            }
        }
    });

    /**
     * Old TV Noise Filter
     * Adds static noise and slight color shift to mimic old TV sets.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('tv-noise', 'Old TV Noise', 'canvas', (data, w, h) => {
        const noiseFactor = 30; // Intensity of noise
        const rgbShift = 5; // How much to shift color channels

        for (let i = 0; i < data.length; i += 4) {
            // Add random noise
            const noise = (Math.random() - 0.5) * noiseFactor;
            data[i] = Math.min(255, Math.max(0, data[i] + noise));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));

            // Apply slight RGB shift for chromatic aberration effect
            const originalR = data[i];
            const originalG = data[i+1];
            const originalB = data[i+2];

            // Simple shift: Red from slightly left, Green from original, Blue from slightly right
            // This is a rough simulation, more accurate needs sampling from different pixels.
            data[i] = originalR;
            data[i+1] = originalG;
            data[i+2] = originalB;

            // Simple color degradation
            const avg = (data[i] + data[i+1] + data[i+2]) / 3;
            data[i] = avg * 0.9 + 20; // Slight red tint
            data[i+1] = avg * 0.9;
            data[i+2] = avg * 1.1; // Slight blue tint
        }
    });

    /**
     * Frosted Glass Filter
     * Applies a uniform blur and slightly reduces clarity,
     * simulating looking through frosted glass.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('frosted-glass', 'Frosted Glass', 'canvas', (data, w, h) => {
        // This is essentially a simple box blur
        let originalData = new Uint8ClampedArray(data);
        const blurRadius = 5; // The size of the blur kernel

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let rSum = 0, gSum = 0, bSum = 0, count = 0;

                // Sum up colors from surrounding pixels within the blur radius
                for (let dy = -blurRadius; dy <= blurRadius; dy++) {
                    for (let dx = -blurRadius; dx <= blurRadius; dx++) {
                        const pixelX = x + dx;
                        const pixelY = y + dy;

                        const pixel = getPixel(originalData, pixelX, pixelY, w);
                        if (pixel) {
                            rSum += pixel.r;
                            gSum += pixel.g;
                            bSum += pixel.b;
                            count++;
                        }
                    }
                }

                // Calculate average and set the pixel
                setPixel(data, x, y, w,
                    rSum / count,
                    gSum / count,
                    bSum / count,
                    getPixel(originalData, x, y, w).a
                );
            }
        }
    });

    /**
     * Ascii Art Filter (Simplified)
     * Converts the image to a monochrome representation using ASCII characters.
     * Renders directly onto the canvas context.
     * @param {Uint8ClampedArray} data - Pixel data. (Ignored for direct drawing)
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} frameCount - Current animation frame count.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context.
     */
    registerFilter('ascii', 'ASCII Art', 'canvas', (data, w, h, frameCount, ctx) => {
        // This filter overrides the pixel data entirely and redraws text.
        // It requires ctx to be cleared first and then draw on it.
        // Note: Performance might be an issue for live video on mobile.
        const charSet = " .:-=+*#%@"; // Characters from light to dark
        const fontSize = 8; // Size of each ASCII character (pixels per character)
        const charWidth = fontSize / 0.6; // Adjust charWidth for monospaced font
        const charHeight = fontSize;

        ctx.clearRect(0, 0, w, h); // Clear the canvas fully
        ctx.fillStyle = 'white'; // Background color for ASCII art
        ctx.fillRect(0,0,w,h);
        ctx.font = `${fontSize}px monospace`;
        ctx.fillStyle = 'black'; // Text color

        // Iterate through blocks of pixels and draw corresponding ASCII character
        for (let y = 0; y < h; y += charHeight) {
            for (let x = 0; x < w; x += charWidth) {
                // Get average brightness of the block from the original video frame
                let rSum = 0, gSum = 0, bSum = 0, count = 0;
                // Sample center pixel of the block from the hidden video source
                const pixel = getPixel(new Uint8ClampedArray(ctx.getImageData(0,0,w,h).data), x, y, w); // Get from current drawn state
                if(pixel) {
                    const brightness = (pixel.r + pixel.g + pixel.b) / 3;
                    const charIndex = Math.floor((brightness / 255) * (charSet.length - 1));
                    ctx.fillText(charSet[charIndex], x, y + charHeight);
                }
            }
        }
    });

    /**
     * Mirror Horizontal Filter
     * Flips the image horizontally (independent of camera facing mode).
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('mirror-h', 'Mirror Horizontal', 'canvas', (data, w, h) => {
        let originalData = new Uint8ClampedArray(data);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + (w - 1 - x)) * 4; // Source from mirrored X position
                const destIdx = (y * w + x) * 4;
                data[destIdx] = originalData[srcIdx];
                data[destIdx + 1] = originalData[srcIdx + 1];
                data[destIdx + 2] = originalData[srcIdx + 2];
                data[destIdx + 3] = originalData[srcIdx + 3];
            }
        }
    });

    /**
     * Old Photo Filter
     * Combines sepia, faded look, and slight noise for an old photograph effect.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('old-photo', 'Old Photo', 'canvas', (data, w, h) => {
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];

            // Sepia effect
            const newR = (r * 0.393) + (g * 0.769) + (b * 0.189);
            const newG = (r * 0.349) + (g * 0.686) + (b * 0.168);
            const newB = (r * 0.272) + (g * 0.534) + (b * 0.131);

            data[i] = Math.min(255, newR);
            data[i + 1] = Math.min(255, newG);
            data[i + 2] = Math.min(255, newB);

            // Add subtle noise
            const noise = (Math.random() - 0.5) * 10;
            data[i] = Math.min(255, Math.max(0, data[i] + noise));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
        }
    });

    /**
     * Pop Art Filter (Simplified)
     * Reduces color palette and shifts hues for a vibrant pop-art look.
     * @param {Uint8ClampedArray} data - Pixel data.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     */
    registerFilter('pop-art-canvas', 'Pop Art (Canvas)', 'canvas', (data, w, h) => {
        const step = 64; // Quantize to 4 levels per channel (256/64)
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.floor(data[i] / step) * step;
            data[i + 1] = Math.floor(data[i + 1] / step) * step;
            data[i + 2] = Math.floor(data[i + 2] / step) * step;

            // Further shift certain hues dramatically
            const [h, s, l] = rgbToHsl(data[i], data[i+1], data[i+2]);
            let newH = h;
            if (h > 0.1 && h < 0.3) newH = 0.5; // Shift yellows to green
            else if (h > 0.6 && h < 0.8) newH = 0.1; // Shift blues to red/pink
            const [newR, newG, newB] = hslToRgb(newH, s, l);
            data[i] = newR;
            data[i+1] = newG;
            data[i+2] = newB;
        }
    });


    // --- Return public API of the FilterManager ---
    return {
        registerFilter,
        setActiveFilter,
        getActiveFilter,
        getAllFilters,
        applyActiveFilter
    };
})();