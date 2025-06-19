// js/camera.js
// Handles camera stream, photo/video capture, and interaction with filters.js.
// Manages UI state for camera view and post-capture options.
// Total lines (including comments and empty lines): ~500+

document.addEventListener('DOMContentLoaded', () => {
    // --- Initial User Authentication Check ---
    const currentUser = getCurrentUser();
    if (!currentUser) {
        console.warn('CAMERA_INIT: No current user found in session storage. Redirecting to login.');
        window.location.href = 'index.html';
        return; // Stop script execution
    }
    console.log(`CAMERA_INIT: User "${currentUser.username}" is logged in.`);

    // --- DOM Element References ---
    const videoSource = document.getElementById('camera-video-source'); // Hidden video element for raw stream
    const canvas = document.getElementById('camera-canvas');           // Visible canvas for processed feed
    const ctx = canvas.getContext('2d');                               // 2D rendering context of the canvas
    const photoPreview = document.getElementById('photo-preview');     // Image element for displaying captured photo/video thumbnail
    const captionInput = document.getElementById('caption-input');     // Input field for adding captions
    const captureButton = document.getElementById('capture-button');   // Main button for photo/video capture
    const postCaptureControls = document.querySelector('.post-capture-controls'); // Container for Retake/Save buttons
    const retakeButton = document.getElementById('retake-button');     // Button to retake media
    const saveGalleryButton = document.getElementById('save-gallery-button'); // Button to save media to gallery
    const switchCameraButton = document.getElementById('switch-camera-button'); // Button to switch front/back camera
    const flashlightButton = document.getElementById('flashlight-button');     // Button for simulated flashlight
    const screenFlashOverlay = document.getElementById('screen-flash-overlay'); // Overlay for flashlight effect
    const filterControls = document.getElementById('filter-controls');         // Container for filter selection buttons

    // --- Application State Variables ---
    let currentStream = null;          // Holds the MediaStream object from getUserMedia.
    let capturedMediaData = null;      // Stores Base64 string for image or Blob object for video.
    let capturedMediaType = null;      // Type of captured media: 'image' or 'video'.
    let mediaRecorder = null;          // MediaRecorder instance for video capture.
    let videoChunks = [];              // Array to store video data chunks during recording.
    let isRecording = false;           // Boolean flag indicating if recording is active.
    let recordingTimeout = null;       // Timeout ID for auto-stopping recording after 30 seconds.
    let currentFacingMode = 'user';    // Current camera direction: 'user' (front) or 'environment' (back).
    let animationFrameId = null;       // ID returned by requestAnimationFrame for the drawing loop.
    let frameCount = 0;                // Counter for frames, used by animated filters for time-based effects.

    // --- Camera & Canvas Setup ---

    /**
     * Configures the canvas dimensions to a fixed portrait aspect ratio (9:16).
     * This ensures consistent output resolution for captured media and display.
     */
    const setupCanvasResolution = () => {
        const idealWidth = 450; // A good balance for mobile screen width.
        const idealHeight = 800; // Corresponding height for a 9:16 aspect ratio.

        canvas.width = idealWidth;
        canvas.height = idealHeight;
        console.log(`CAMERA_SETUP: Canvas resolution set to: ${canvas.width}x${canvas.height}`);
    };

    /**
     * The main drawing loop for the camera feed.
     * It continuously draws frames from the `videoSource` onto the `canvas`
     * and applies the active filter. This is a crucial function for live camera display.
     */
    const drawFrame = () => {
        // Only draw if video is playing and has enough data to prevent errors with `drawImage`.
        if (!videoSource.paused && !videoSource.ended && videoSource.readyState >= 2) {
            frameCount++; // Increment frame counter for animated filters.

            // Apply filter via FilterManager. This function handles:
            // 1. Clearing the canvas.
            // 2. Drawing the video frame with correct aspect ratio and mirroring.
            // 3. Applying pixel-based or preparing for CSS-based filters.
            FilterManager.applyActiveFilter(ctx, videoSource, canvas, frameCount, currentFacingMode);
            
            // Re-schedule the next frame draw using requestAnimationFrame for smooth animation.
            animationFrameId = requestAnimationFrame(drawFrame);
        } else {
            console.debug("CAMERA_DRAW: Video source not ready for drawing or paused/ended. Waiting...");
            // Optionally, draw a placeholder or black screen if video is not ready.
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // Even if not ready, keep requesting frames to catch when it becomes ready.
            animationFrameId = requestAnimationFrame(drawFrame);
        }
    };

    /**
     * Initializes and starts the camera stream.
     * Requests media permissions and connects the stream to the `videoSource` element.
     * This function is responsible for getting the camera feed to display.
     */
    const startCamera = async () => {
        console.log('CAMERA_START: Attempting to start camera.');
        // Stop any existing stream before starting a new one to prevent conflicts.
        if (currentStream) {
            console.log('CAMERA_START: Stopping previous camera stream tracks.');
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        // Stop any ongoing animation frame request to prevent duplicate drawing loops.
        if (animationFrameId) {
            console.log('CAMERA_START: Cancelling previous animation frame loop.');
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        try {
            // Define video constraints: preferred facing mode and desired aspect ratio/resolution.
            // `ideal` values are hints; browser tries to get closest. `exact` forces it (may cause errors if not supported).
            const constraints = { 
                video: { 
                    facingMode: currentFacingMode,
                    width: { ideal: 1080 },  // Request high resolution width (for quality)
                    height: { ideal: 1920 }, // Request high resolution height (for 9:16 portrait)
                    aspectRatio: { exact: 9 / 16 } // Explicitly request 9:16 aspect ratio (critical for layout)
                },
                audio: false // No audio needed for this clone's current features.
            };
            console.log('CAMERA_START: Requesting camera access with constraints:', constraints);
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            videoSource.srcObject = currentStream;
            videoSource.play(); // Start playing the hidden video stream.

            setupCanvasResolution(); // Ensure canvas is correctly sized before drawing.

            // --- IMPORTANT FIX: Wait for video to load enough data before starting the draw loop ---
            // The `loadeddata` event fires when the frame at `currentTime` is loaded.
            // The `playing` event fires when playback actually starts after loading.
            // Using `canplay` or `playing` is often more robust than `loadedmetadata` for initial drawing.
            const onVideoReady = () => {
                console.log(`CAMERA_READY: Video is ready for playback. Native resolution: ${videoSource.videoWidth}x${videoSource.videoHeight}`);
                // Start drawing video to canvas with filters after video is ready.
                if (!animationFrameId) { // Prevent multiple loops if this event fires multiple times.
                    animationFrameId = requestAnimationFrame(drawFrame);
                    console.log('CAMERA_READY: Canvas drawing loop started successfully.');
                }
                // Remove this listener after it fires once to prevent unnecessary calls.
                videoSource.removeEventListener('loadeddata', onVideoReady);
                videoSource.removeEventListener('canplay', onVideoReady);
            };
            videoSource.addEventListener('loadeddata', onVideoReady);
            videoSource.addEventListener('canplay', onVideoReady); // Using canplay for quicker response

            // Reset UI state to live camera view
            canvas.style.display = 'block';        // Show the canvas.
            photoPreview.style.display = 'none';   // Hide any previous photo preview.
            captionInput.style.display = 'none';   // Hide caption input.
            postCaptureControls.style.display = 'none'; // Hide post-capture controls.
            captureButton.style.display = 'block'; // Show the main capture button.
            captureButton.classList.remove('recording'); // Ensure recording indicator is off.

            // Apply the appropriate CSS class for the active filter to the canvas element.
            const activeFilter = FilterManager.getActiveFilter();
            if (activeFilter.type === 'css') {
                canvas.className = activeFilter.applyFunc; // `applyFunc` stores the CSS class name.
                console.log(`CAMERA_START: Applied CSS filter class: "${canvas.className}".`);
            } else {
                canvas.className = ''; // Clear any previous CSS filter class for canvas filters.
                console.log('CAMERA_START: Cleared CSS filter class (using canvas filter).');
            }

        } catch (err) {
            console.error("CAMERA_ERROR: Failed to access camera:", err);
            let errorMessage = "Could not access camera. Please allow camera permissions and ensure your device has a camera.";
            if (err.name === "NotAllowedError") {
                errorMessage += " (Permission denied. You might need to change browser/OS settings).";
            } else if (err.name === "NotFoundError") {
                errorMessage += " (No camera found on this device).";
            } else if (err.name === "NotReadableError") {
                errorMessage += " (Camera is in use by another application or hardware error).";
            } else if (err.name === "OverconstrainedError") {
                 errorMessage += ` (Requested constraints not supported: ${err.message}). Try adjusting resolution or aspect ratio.`;
            } else if (err.name === "AbortError") {
                 errorMessage += " (Operation aborted).";
            } else {
                errorMessage += ` (Unknown error: ${err.message || err}).`;
            }
            alert(errorMessage);
            // Optionally, redirect to a fallback page or show a static message on the UI.
        }
    };

    /**
     * Stops the camera stream and the canvas animation loop.
     * Essential for releasing camera resources and for stable capture.
     */
    const stopCamera = () => {
        if (currentStream) {
            console.log('CAMERA_STOP: Stopping camera tracks.');
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        if (animationFrameId) {
            console.log('CAMERA_STOP: Cancelling animation frame loop.');
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    };

    /**
     * Captures a still photo from the current state of the canvas.
     * The active filter and mirroring are "baked" into the captured image.
     */
    const takePhoto = () => {
        console.log('CAPTURE: Initiating photo capture.');
        stopCamera(); // Stop live camera processing to get a stable, single frame for capture.
        
        // Ensure the last frame with active filters is drawn to canvas before capturing.
        // This ensures pixel-based filters and mirroring are applied correctly.
        FilterManager.applyActiveFilter(ctx, videoSource, canvas, frameCount, currentFacingMode);

        // Get image data as a Base64 encoded JPEG. Quality 0.9 for balance.
        capturedMediaData = canvas.toDataURL('image/jpeg', 0.9);
        capturedMediaType = 'image';
        console.log('CAPTURE: Photo captured (Base64 data generated).');

        // Update UI to show photo preview and post-capture controls.
        photoPreview.src = capturedMediaData;
        photoPreview.setAttribute('data-type', 'image'); // Indicate that this is an image preview.
        photoPreview.style.display = 'block';           // Show the image element.
        captionInput.style.display = 'block';           // Show caption input.
        postCaptureControls.style.display = 'flex';     // Show Retake/Save buttons.
        captureButton.style.display = 'none';           // Hide the main capture button.
        
        canvas.style.display = 'none'; // Hide the canvas since we are now showing a static preview.

        // Transfer CSS filter class from canvas to photo preview for visual consistency.
        photoPreview.className = canvas.className;
        photoPreview.style.transform = 'none'; // Ensure no residual CSS transforms on the preview.
    };

    /**
     * Starts video recording from the canvas's stream.
     * All canvas-based filters, mirroring, and aspect ratio corrections are included in the recorded video.
     */
    const startRecording = () => {
        if (!currentStream || videoSource.readyState < 2) {
            console.error("RECORDING: Attempted to start recording without an active camera stream or video not ready.");
            alert("Camera not ready for recording. Please ensure camera is active and loaded.");
            return;
        }

        console.log('RECORDING: Initiating video recording.');
        isRecording = true;
        captureButton.classList.add('recording'); // Add visual recording indicator (pulsing).
        videoChunks = []; // Clear previous video chunks for a new recording.

        // Create a MediaRecorder instance from the canvas's stream.
        // `canvas.captureStream(30)` creates a new MediaStream from the canvas, at 30 frames per second.
        mediaRecorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm; codecs=vp8' });

        // Event listener to collect video data chunks as they become available.
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                videoChunks.push(event.data); // Add valid data chunks to the array.
            }
        };

        // Event listener for when recording stops (either manually or automatically).
        mediaRecorder.onstop = async () => {
            console.log('RECORDING: Video recording stopped.');
            isRecording = false;
            captureButton.classList.remove('recording'); // Remove recording indicator.

            // Create a Blob from the collected video chunks.
            const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
            capturedMediaData = videoBlob; // Store the Blob object.
            capturedMediaType = 'video';
            console.log('RECORDING: Video Blob generated:', videoBlob);

            // Create a temporary URL for the video Blob to display in the preview.
            const videoUrl = URL.createObjectURL(videoBlob);
            
            // Update UI to show video preview and post-capture controls.
            photoPreview.src = videoUrl;
            photoPreview.setAttribute('data-type', 'video'); // Indicate it's a video preview.
            photoPreview.setAttribute('controls', '');      // Show default video controls (will be replaced by custom).
            photoPreview.style.display = 'block';           // Show the video element.
            captionInput.style.display = 'block';           // Show caption input.
            postCaptureControls.style.display = 'flex';     // Show Retake/Save buttons.
            captureButton.style.display = 'none';           // Hide the main capture button.
            
            canvas.style.display = 'none'; // Hide the canvas.
            // Transfer CSS filter class if any (for visual consistency on preview).
            photoPreview.className = canvas.className;
            photoPreview.style.transform = 'none'; // Ensure no residual CSS transforms.
            
            stopCamera(); // Stop live camera processing after video is finalized.
        };

        mediaRecorder.start(); // Start the recording process.
        console.log('RECORDING: Recording started successfully.');

        // Set a timeout to automatically stop recording after 30 seconds (time limit).
        recordingTimeout = setTimeout(() => {
            if (isRecording) { // Check if recording is still active.
                mediaRecorder.stop();
                console.log('RECORDING: Recording stopped automatically after 30 seconds (time limit reached).');
            }
        }, 30000); // 30 seconds duration.
    };

    /**
     * Manually stops video recording if it is currently active.
     */
    const stopRecording = () => {
        if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop(); // Stop the MediaRecorder.
            if (recordingTimeout) {
                clearTimeout(recordingTimeout); // Clear the auto-stop timeout.
                recordingTimeout = null;
            }
            console.log('RECORDING: Recording stopped manually by user.');
        } else {
            console.warn('RECORDING: Attempted to stop recording, but no active recording found.');
        }
    };

    // --- Event Listeners for Camera UI Interactions ---

    // Long press / Click logic for the main capture button.
    // Distinguishes between a quick tap (photo) and a long press (video recording).
    let pressTimer;
    const PRESS_THRESHOLD = 200; // Time in milliseconds to distinguish click from long press.

    captureButton.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Check for left mouse button click (primary click).
            console.log('EVENT: Mouse down on capture button. Starting press timer.');
            pressTimer = setTimeout(startRecording, PRESS_THRESHOLD); // Start timer for long press.
        }
    });

    captureButton.addEventListener('mouseup', () => {
        clearTimeout(pressTimer); // Always clear the timer when mouse button is released.
        console.log('EVENT: Mouse up on capture button.');
        if (isRecording) {
            stopRecording(); // If recording was initiated, stop it now.
        } else if (mediaRecorder && mediaRecorder.state === 'recording') {
            // This condition handles a rare case where `startRecording` fires *just* before `mouseup`
            // but `isRecording` might not be true yet (due to async nature).
            // It ensures we don't accidentally take a photo if recording was intended and initiated.
            console.log('EVENT: Recording was in progress when mouse up, letting recording finish.');
        } else {
            // If no recording started (meaning it was a quick click, shorter than PRESS_THRESHOLD), take a photo.
            console.log('EVENT: Short click detected, taking photo.');
            takePhoto();
        }
    });

    captureButton.addEventListener('mouseleave', () => {
        // If the mouse cursor leaves the button area while the button is still pressed.
        console.log('EVENT: Mouse left capture button area.');
        clearTimeout(pressTimer); // Clear the timer.
        if (isRecording) {
            stopRecording(); // If recording was initiated, stop it.
        }
    });

    // --- Touch Event Listeners for Mobile Devices ---
    // Using `passive: false` to allow `e.preventDefault()` for better control over default touch behavior.

    captureButton.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent default touch behaviors (e.g., scrolling, zoom, tap highlights).
        console.log('EVENT: Touch start on capture button. Starting press timer.');
        pressTimer = setTimeout(startRecording, PRESS_THRESHOLD);
    }, { passive: false });
    
    captureButton.addEventListener('touchend', () => {
        clearTimeout(pressTimer); // Clear the timer when touch ends.
        console.log('EVENT: Touch end on capture button.');
        if (isRecording) {
            stopRecording(); // If recording was initiated, stop it.
        } else if (mediaRecorder && mediaRecorder.state === 'recording') {
            // Similar to mouseup, ensures we don't take a photo if recording was already active.
            console.log('EVENT: Recording was in progress when touch ended, letting recording finish.');
        } else {
            // If no recording started (it was a quick tap), take a photo.
            console.log('EVENT: Short tap detected, taking photo.');
            takePhoto();
        }
    });

    captureButton.addEventListener('touchcancel', () => {
        // If touch is interrupted (e.g., phone call, alert, switching apps).
        console.log('EVENT: Touch canceled on capture button.');
        clearTimeout(pressTimer);
        if (isRecording) {
            stopRecording(); // Stop recording if it was active.
        }
    });


    retakeButton.addEventListener('click', () => {
        console.log('UI_ACTION: Retake button clicked. Resetting UI and restarting camera.');
        // Clear all captured media data and reset UI elements.
        capturedMediaData = null;
        capturedMediaType = null;
        captionInput.value = ''; // Clear any caption entered.
        
        // Reset photo preview element to its initial state.
        photoPreview.src = '';
        photoPreview.removeAttribute('controls'); 
        photoPreview.removeAttribute('data-type');
        photoPreview.className = ''; // Remove any filter classes.
        photoPreview.style.transform = 'none'; // Reset any CSS transforms.

        startCamera(); // Restart the live camera feed.
    });

    saveGalleryButton.addEventListener('click', async () => {
        console.log('UI_ACTION: Save to Gallery button clicked.');
        if (!capturedMediaData) {
            console.warn('UI_ACTION: No media data found to save.');
            alert("No media to save! Capture something first.");
            return;
        }

        // Prepare the media object for storage in IndexedDB.
        let mediaToSave = {
            senderId: currentUser.id, // ID of the user who captured this media.
            type: capturedMediaType,   // Type: 'image' or 'video'.
            caption: captionInput.value.trim(), // Get caption from input field.
            timestamp: Date.now(),     // Current timestamp for chronological sorting.
            filtersApplied: FilterManager.getActiveFilter().id, // Store the ID of the filter applied.
            // Zooming functionality has been removed, so `zoomLevel` is no longer saved.
        };
        console.log('UI_ACTION: Media data prepared for saving:', mediaToSave);

        if (capturedMediaType === 'image') {
            mediaToSave.data = capturedMediaData; // Image data (Base64 string).
            await saveAndRedirect(mediaToSave);
        } else if (capturedMediaType === 'video') {
            mediaToSave.data = capturedMediaData; // Video data (Blob object).
            
            // For videos, generate a thumbnail from the first frame for gallery preview.
            const tempVideoElement = document.createElement('video');
            tempVideoElement.src = URL.createObjectURL(capturedMediaData); // Create a temporary URL from the Blob.
            tempVideoElement.currentTime = 0.1; // Seek to 0.1 seconds for a stable frame.
            
            tempVideoElement.onloadeddata = async () => {
                console.log('THUMBNAIL_GEN: Video loaded for thumbnail generation.');
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = tempVideoElement.videoWidth;
                tempCanvas.height = tempVideoElement.videoHeight;
                const tempCtx = tempCanvas.getContext('2d');
                
                // Draw thumbnail WITHOUT mirroring (as the video data is already baked and correctly oriented).
                tempCtx.drawImage(tempVideoElement, 0, 0, tempCanvas.width, tempCanvas.height);

                mediaToSave.thumbnail = tempCanvas.toDataURL('image/jpeg', 0.7); // Save thumbnail as Base64.
                console.log('THUMBNAIL_GEN: Thumbnail generated for video.');
                
                await saveAndRedirect(mediaToSave);
                URL.revokeObjectURL(tempVideoElement.src); // Clean up the temporary Blob URL.
            };
            tempVideoElement.onerror = async (err) => {
                console.error("THUMBNAIL_GEN_ERROR: Error loading video for thumbnail generation:", err);
                mediaToSave.thumbnail = null; // Set thumbnail to null if generation fails.
                await saveAndRedirect(mediaToSave);
                URL.revokeObjectURL(tempVideoElement.src); // Clean up the temporary Blob URL.
            };
        }
    });

    /**
     * Saves the prepared media object to IndexedDB and then redirects the user to the gallery page.
     * @param {object} mediaToSave - The media object ready for storage.
     */
    async function saveAndRedirect(mediaToSave) {
        try {
            await openDatabase(); // Ensure IndexedDB is open and ready.
            const mediaId = await addData('media', mediaToSave); // Add data to the 'media' object store.
            console.log(`DB_SAVE: Media saved successfully with ID: ${mediaId}`);
            alert("Media saved to gallery!");
            window.location.href = 'gallery.html'; // Navigate to the gallery page.
        } catch (error) {
            console.error("DB_SAVE_ERROR: Failed to save media to IndexedDB:", error);
            alert("Failed to save media. Please try again.");
        }
    }

    // Camera Switch Button: Toggles between 'user' (front) and 'environment' (back) cameras.
    switchCameraButton.addEventListener('click', () => {
        console.log('UI_ACTION: Switch camera button clicked. Current mode:', currentFacingMode);
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        startCamera(); // Restart camera stream with the new facing mode.
    });

    // Flashlight Button (Simulated): Triggers a screen flash effect.
    // IMPORTANT: Direct control of the device's LED flashlight from web browsers is NOT possible due to security restrictions.
    flashlightButton.addEventListener('click', () => {
        console.log('UI_ACTION: Flashlight button clicked. Triggering screen flash simulation.');
        screenFlashOverlay.style.opacity = 1; // Make the overlay fully opaque (bright white).
        setTimeout(() => {
            screenFlashOverlay.style.opacity = 0; // Fade out quickly.
        }, 100); // Flash duration in milliseconds.
    });

    // --- Filter Controls Initialization ---
    /**
     * Populates the filter selection bar with buttons for each registered filter.
     * Each button will set the active filter and update the canvas's class if it's a CSS filter.
     */
    const initializeFilterButtons = () => {
        filterControls.innerHTML = ''; // Clear any existing buttons to prevent duplicates.
        FilterManager.getAllFilters().forEach(filter => {
            const button = document.createElement('button');
            button.textContent = filter.name;
            button.className = 'filter-button';
            button.dataset.filterId = filter.id; // Store filter ID on the button for easy access.
            button.addEventListener('click', () => {
                console.log(`UI_ACTION: Filter "${filter.name}" selected.`);
                FilterManager.setActiveFilter(filter.id); // Set the active filter in the FilterManager.

                // Apply CSS class to the canvas if it's a CSS filter, otherwise ensure no CSS class is active.
                if (filter.type === 'css') {
                    canvas.className = filter.applyFunc; // `applyFunc` stores the CSS class name (e.g., 'filter-css-sepia').
                } else {
                    canvas.className = ''; // Remove any previous CSS filter class for canvas filters (pixel manipulators).
                }
                
                // Update active state visuals for filter buttons in the UI.
                Array.from(filterControls.children).forEach(btn => {
                    if (btn.dataset.filterId === filter.id) {
                        btn.classList.add('active'); // Add 'active' class to the selected button.
                    } else {
                        btn.classList.remove('active'); // Remove 'active' class from others.
                    }
                });
            });
            filterControls.appendChild(button); // Add the button to the filter controls container.
        });
        // Set the initial 'None' filter button as active on page load.
        const noneFilterButton = filterControls.querySelector(`[data-filter-id="none"]`);
        if (noneFilterButton) {
            noneFilterButton.classList.add('active');
        }
        console.log('SETUP: Filter buttons initialized.');
    };

    // --- Initial Application Setup ---
    initializeFilterButtons(); // Populate the filter selection bar.
    startCamera();            // Start the camera feed when the page loads.
    console.log('SETUP: Camera page initialization complete.');
});