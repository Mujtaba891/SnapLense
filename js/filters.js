// js/filters.js

const FilterManager = (() => {
    let activeFilterId = 'none'; // Default filter ID
    const filters = {}; // Store filter functions

    /**
     * Registers a new filter.
     * @param {string} id - Unique ID for the filter (e.g., 'glitch', 'sepia').
     * @param {string} name - Display name for the filter.
     * @param {string} type - 'canvas' for pixel manipulation, 'css' for CSS filter string.
     * @param {Function|string} applyFuncOrCssClass - Function for canvas filters (data, w, h, frameCount, ctx, video) or CSS class name for CSS filters.
     */
    const registerFilter = (id, name, type, applyFuncOrCssClass) => {
        filters[id] = { id, name, type, applyFunc: applyFuncOrCssClass };
    };

    /**
     * Sets the active filter.
     * @param {string} id - The ID of the filter to activate.
     */
    const setActiveFilter = (id) => {
        if (filters[id]) {
            activeFilterId = id;
            console.log(`Active filter set to: ${filters[id].name}`);
        } else {
            console.warn(`Filter with ID '${id}' not found.`);
        }
    };

    /**
     * Gets the active filter object.
     * @returns {object} The active filter object.
     */
    const getActiveFilter = () => filters[activeFilterId];

    /**
     * Gets all registered filters.
     * @returns {Array<object>} An array of all filter objects.
     */
    const getAllFilters = () => Object.values(filters);

    /**
     * Helper to draw video onto canvas, maintaining aspect ratio like object-fit: cover.
     * Also applies mirroring if facingMode is 'user'.
     * This function now does NOT take a zoom factor.
     */
    const drawVideoOnCanvas = (ctx, video, canvas, facingMode) => {
        const videoRatio = video.videoWidth / video.videoHeight;
        const canvasRatio = canvas.width / canvas.height;

        let sx, sy, sWidth, sHeight; // Source rectangle (from video)
        let dx, dy, dWidth, dHeight; // Destination rectangle (on canvas)

        // Calculate source dimensions to "cover" the canvas
        if (videoRatio > canvasRatio) { 
            // Video is wider than canvas
            sHeight = video.videoHeight;
            sWidth = sHeight * canvasRatio;
            sx = (video.videoWidth - sWidth) / 2; // Center horizontally
            sy = 0;
        } else { 
            // Video is taller than canvas
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

        // Save context state for transformations (mirroring)
        ctx.save();

        // Apply mirroring for user-facing camera (pixel manipulation)
        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }

        // Draw the image with calculated source and destination rectangles
        ctx.drawImage(video, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);

        // Restore context after drawing the base image
        ctx.restore();
    };

    /**
     * Applies the active filter to the canvas.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context of the canvas.
     * @param {HTMLVideoElement} video - The source video element.
     * @param {HTMLCanvasElement} canvas - The canvas element.
     * @param {number} frameCount - A counter for animation-based filters.
     * @param {string} facingMode - 'user' or 'environment'.
     */
    const applyActiveFilter = (ctx, video, canvas, frameCount, facingMode) => {
        const filter = getActiveFilter();
        
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear previous frame

        // Always draw the base video frame (with aspect ratio cover and mirror)
        drawVideoOnCanvas(ctx, video, canvas, facingMode);
        
        if (filter.type === 'css') {
            // CSS filters are applied directly to the canvas element's class in camera.js.
            // No pixel manipulation needed here for CSS filters.
        } else if (filter.type === 'canvas' && typeof filter.applyFunc === 'function') {
            // For canvas filters, we get the imageData *after* drawing the base video
            let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            let data = imageData.data; // Raw pixel data (RGBA)

            // Apply the custom canvas filter function
            filter.applyFunc(data, canvas.width, canvas.height, frameCount, ctx, video);
            
            // Put modified image data back
            ctx.putImageData(imageData, 0, 0);
        }
    };


    // --- Filter Definitions (these remain unchanged) ---

    // 1. CSS Filters (these will apply a class to the canvas element in camera.js)
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


    // 2. Canvas Filters (Pixel Manipulation) - These functions are unchanged.
    registerFilter('glitch', 'Glitch', 'canvas', (data, w, h, frameCount) => {
        const severity = 2 + Math.sin(frameCount * 0.1) * 2;
        const blockHeight = 10;
        for (let y = 0; y < h; y += blockHeight) {
            const offset = Math.floor(Math.random() * severity * 2) - severity;
            if (offset === 0) continue;
            const xStart = Math.random() < 0.5 ? 0 : Math.floor(w * 0.2);
            const blockWidth = Math.floor(w * (0.8 - Math.random() * 0.4));
            for (let dy = 0; dy < blockHeight; dy++) {
                if (y + dy >= h) break;
                for (let dx = 0; dx < blockWidth; dx++) {
                    if (xStart + dx >= w) break;
                    const srcX = xStart + dx;
                    const srcY = y + dy;
                    const destX = srcX + offset;
                    const destY = srcY;
                    if (destX >= 0 && destX < w && destY >= 0 && destY < h) {
                        const srcIdx = (srcY * w + srcX) * 4;
                        const destIdx = (destY * w + destX) * 4;
                        let r = data[srcIdx], g = data[srcIdx + 1], b = data[srcIdx + 2], a = data[srcIdx + 3];
                        data[destIdx] = b;
                        data[destIdx + 1] = g;
                        data[destIdx + 2] = r;
                        data[destIdx + 3] = a;
                    }
                }
            }
        }
    });

    registerFilter('rumble', 'Rumble', 'canvas', (data, w, h, frameCount) => {
        let originalData = new Uint8ClampedArray(data);
        const strength = 10;
        const frequency = 0.05;
        const time = frameCount * 0.05;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4;
                const dx = strength * Math.sin(x * frequency + time) * Math.sin(y * frequency * 2 + time);
                const dy = strength * Math.cos(y * frequency + time) * Math.sin(x * frequency * 2 + time);
                const newX = Math.floor(x + dx);
                const newY = Math.floor(y + dy);
                if (newX >= 0 && newX < w && newY >= 0 && newY < h) {
                    const newIdx = (newY * w + newX) * 4;
                    data[srcIdx] = originalData[newIdx]; data[srcIdx + 1] = originalData[newIdx + 1]; data[srcIdx + 2] = originalData[newIdx + 2]; data[srcIdx + 3] = originalData[newIdx + 3];
                } else {
                    data[srcIdx] = data[srcIdx + 1] = data[srcIdx + 2] = 0; data[srcIdx + 3] = 255;
                }
            }
        }
    });

    registerFilter('squeeze', 'Squeeze', 'canvas', (data, w, h) => {
        let originalData = new Uint8ClampedArray(data);
        const centerX = w / 2; const centerY = h / 2; const radius = Math.min(w, h) / 2; const strength = 0.5;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4; const dx = x - centerX; const dy = y - centerY; const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < radius) {
                    const angle = Math.atan2(dy, dx); const percent = dist / radius; const newDist = dist * (1 - strength * (1 - percent));
                    const newX = Math.floor(centerX + newDist * Math.cos(angle)); const newY = Math.floor(centerY + newDist * Math.sin(angle));
                    if (newX >= 0 && newX < w && newY >= 0 && newY < h) {
                        const newIdx = (newY * w + newX) * 4;
                        data[srcIdx] = originalData[newIdx]; data[srcIdx + 1] = originalData[newIdx + 1]; data[srcIdx + 2] = originalData[newIdx + 2]; data[srcIdx + 3] = originalData[newIdx + 3];
                    } else {
                        data[srcIdx] = data[srcIdx + 1] = data[srcIdx + 2] = 0; data[srcIdx + 3] = 255;
                    }
                }
            }
        }
    });

    registerFilter('rain', 'Rain', 'canvas', (data, w, h, frameCount, ctx) => {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, data[i] - 20); data[i + 1] = Math.max(0, data[i + 1] - 10); data[i + 2] = Math.min(255, data[i + 2] + 30);
        }
        const numDrops = 100; const dropSpeed = 10; const dropLength = 20;
        ctx.fillStyle = 'rgba(200, 200, 255, 0.7)';
        for (let i = 0; i < numDrops; i++) {
            const x = (i * 13 + frameCount * dropSpeed) % (w + dropLength) - dropLength; const y = (i * 29 + frameCount * dropSpeed) % (h + dropLength) - dropLength;
            ctx.fillRect(x, y, 2, dropLength);
        }
    });

    registerFilter('snow', 'Snow', 'canvas', (data, w, h, frameCount, ctx) => {
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i+1] + data[i+2]) / 3;
            data[i] = avg; data[i+1] = avg; data[i+2] = avg + 20;
        }
        const numSnowflakes = 200; const snowflakeSpeed = 2; const snowflakeSize = 3;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (let i = 0; i < numSnowflakes; i++) {
            const x = (i * 31 + frameCount * snowflakeSpeed * 0.5 + Math.sin(i * 0.1 + frameCount * 0.05) * 20) % (w + snowflakeSize) - snowflakeSize; const y = (i * 17 + frameCount * snowflakeSpeed) % (h + snowflakeSize) - snowflakeSize;
            ctx.beginPath(); ctx.arc(x, y, snowflakeSize, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    });

    registerFilter('sun', 'Sun Glare', 'canvas', (data, w, h, frameCount, ctx) => {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, data[i] + 40); data[i + 1] = Math.min(255, data[i + 1] + 20); data[i + 2] = Math.max(0, data[i + 2] - 10);
        }
        const centerX = w * 0.8; const centerY = h * 0.2; const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.min(w, h) * 0.6);
        gradient.addColorStop(0, 'rgba(255, 200, 0, 0.5)'); gradient.addColorStop(0.5, 'rgba(255, 165, 0, 0.3)'); gradient.addColorStop(1, 'rgba(255, 255, 0, 0)');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.beginPath(); ctx.arc(centerX - 100, centerY + 80, 15, 0, Math.PI * 2); ctx.arc(centerX + 80, centerY - 120, 10, 0, Math.PI * 2); ctx.fill();
    });

    registerFilter('moon', 'Moon Glow', 'canvas', (data, w, h, frameCount, ctx) => {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, data[i] * 0.5 - 20); data[i + 1] = Math.max(0, data[i + 1] * 0.6 - 10); data[i + 2] = Math.min(255, data[i + 2] * 0.8 + 30);
        }
        const centerX = w * 0.2; const centerY = h * 0.2; const radius = Math.min(w, h) * 0.15; const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)'); gradient.addColorStop(0.7, 'rgba(200, 200, 255, 0.6)'); gradient.addColorStop(1, 'rgba(150, 150, 255, 0)');
        ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.fill();
    });

    registerFilter('stars', 'Stars', 'canvas', (data, w, h, frameCount, ctx) => {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = data[i] * 0.4; data[i + 1] = data[i + 1] * 0.4; data[i + 2] = data[i + 2] * 0.6;
        }
        const numStars = 300;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        for (let i = 0; i < numStars; i++) {
            const x = Math.random() * w; const y = Math.random() * h; const size = Math.random() * 2 + 0.5; const twinkle = Math.sin(frameCount * 0.1 + i) * 0.3 + 0.7;
            ctx.globalAlpha = twinkle; ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    });

    registerFilter('water', 'Water Ripple', 'canvas', (data, w, h, frameCount) => {
        let originalData = new Uint8ClampedArray(data);
        const rippleStrength = 5; const rippleFrequency = 0.03; const time = frameCount * 0.05;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4;
                const dx = rippleStrength * Math.sin(x * rippleFrequency + time); const dy = rippleStrength * Math.cos(y * rippleFrequency + time);
                const newX = Math.floor(x + dx); const newY = Math.floor(y + dy);
                if (newX >= 0 && newX < w && newY >= 0 && newY < h) {
                    const newIdx = (newY * w + newX) * 4;
                    data[srcIdx] = originalData[newIdx]; data[srcIdx + 1] = originalData[newIdx + 1]; data[srcIdx + 2] = originalData[newIdx + 2]; data[srcIdx + 3] = originalData[newIdx + 3];
                } else {
                    data[srcIdx] = data[srcIdx + 1] = data[srcIdx + 2] = 0; data[srcIdx + 3] = 255;
                }
            }
        }
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, data[i] - 10); data[i + 1] = Math.min(255, data[i + 1] + 10); data[i + 2] = Math.min(255, data[i + 2] + 20);
        }
    });

    registerFilter('rainbow', 'Rainbow', 'canvas', (data, w, h, frameCount, ctx) => {
        const gradientHeight = h / 2; const gradient = ctx.createLinearGradient(0, h/2 - gradientHeight/2, w, h/2 + gradientHeight/2);
        const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'];
        colors.forEach((color, i) => {
            gradient.addColorStop((i + (frameCount % 100 / 100)) / colors.length, color);
        });
        ctx.fillStyle = gradient; ctx.globalAlpha = 0.3; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1.0;
    });

    registerFilter('cyclone', 'Cyclone', 'canvas', (data, w, h, frameCount) => {
        let originalData = new Uint8ClampedArray(data);
        const centerX = w / 2; const centerY = h / 2; const time = frameCount * 0.05; const strength = 0.05;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4; const dx = x - centerX; const dy = y - centerY; const dist = Math.sqrt(dx * dx + dy * dy); let angle = Math.atan2(dy, dx);
                const twist = dist * strength + time; angle += twist;
                const newX = Math.floor(centerX + dist * Math.cos(angle)); const newY = Math.floor(centerY + dist * Math.sin(angle));
                if (newX >= 0 && newX < w && newY >= 0 && newY < h) {
                    const newIdx = (newY * w + newX) * 4;
                    data[srcIdx] = originalData[newIdx]; data[srcIdx + 1] = originalData[newIdx + 1]; data[srcIdx + 2] = originalData[newIdx + 2]; data[srcIdx + 3] = originalData[newIdx + 3];
                } else {
                    data[srcIdx] = data[srcIdx + 1] = data[srcIdx + 2] = 0; data[srcIdx + 3] = 255;
                }
            }
        }
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i+1] + data[i+2]) / 3;
            data[i] = avg * 0.8; data[i+1] = avg * 0.8; data[i+2] = avg * 0.8;
        }
    });

    registerFilter('drought', 'Drought', 'canvas', (data, w, h, frameCount, ctx) => {
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2]; const avg = (r + g + b) / 3;
            data[i] = avg * 0.8 + 50; data[i+1] = avg * 0.8 + 20; data[i+2] = avg * 0.8;
        }
        ctx.strokeStyle = 'rgba(100, 50, 0, 0.4)'; ctx.lineWidth = 1; const lineDensity = 0.05;
        for (let y = 0; y < h; y += h * lineDensity) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + Math.sin(y * 0.1 + frameCount * 0.02) * 10); ctx.stroke();
        }
        for (let x = 0; x < w; x += w * lineDensity) {
            ctx.beginPath(); ctx.moveTo(x + Math.cos(x * 0.1 + frameCount * 0.03) * 10, 0); ctx.lineTo(x, h); ctx.stroke();
        }
    });

    registerFilter('squish', 'Squish', 'canvas', (data, w, h, frameCount) => {
        let originalData = new Uint8ClampedArray(data);
        const compressionFactor = 0.7;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = (y * w + x) * 4;
                const originalY = Math.floor(y / compressionFactor);
                if (originalY < h) {
                    const originalIdx = (originalY * w + x) * 4;
                    data[srcIdx] = originalData[originalIdx]; data[srcIdx + 1] = originalData[originalIdx + 1]; data[srcIdx + 2] = originalData[originalIdx + 2]; data[srcIdx + 3] = originalData[originalIdx + 3];
                } else {
                    data[srcIdx] = data[srcIdx + 1] = data[srcIdx + 2] = 0; data[srcIdx + 3] = 0;
                }
            }
        }
    });

    registerFilter('pixelate', 'Pixelate', 'canvas', (data, w, h) => {
        const pixelSize = 10;
        for (let y = 0; y < h; y += pixelSize) {
            for (let x = 0; x < w; x += pixelSize) {
                const originalIdx = (y * w + x) * 4;
                const r = data[originalIdx]; const g = data[originalIdx + 1]; const b = data[originalIdx + 2]; const a = data[originalIdx + 3];
                for (let dy = 0; dy < pixelSize; dy++) {
                    if (y + dy >= h) break;
                    for (let dx = 0; dx < pixelSize; dx++) {
                        if (x + dx >= w) break;
                        const destIdx = ((y + dy) * w + (x + dx)) * 4;
                        data[destIdx] = r; data[destIdx + 1] = g; data[destIdx + 2] = b; data[destIdx + 3] = a;
                    }
                }
            }
        }
    });

    registerFilter('negative', 'Negative', 'canvas', (data, w, h) => {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i]; data[i + 1] = 255 - data[i + 1]; data[i + 2] = 255 - data[i + 2];
        }
    });

    return {
        registerFilter,
        setActiveFilter,
        getActiveFilter,
        getAllFilters,
        applyActiveFilter
    };
})();