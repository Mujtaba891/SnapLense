// js/camera.js
// Handles camera stream, photo/video capture, and interaction with filters.js.
// Total lines (including comments and empty lines): ~500+

document.addEventListener('DOMContentLoaded', () => {
    // --- Initial User Authentication Check ---
    const currentUser = getCurrentUser();
    if (!currentUser) {
        console.warn('No current user found in session storage. Redirecting to login.');
        window.location.href = 'index.html';
        return; // Stop script execution
    }
    console.log(`User ${currentUser.username} is logged in.`);

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
    let currentStream = null;          // Holds the MediaStream object from getUserMedia
    let capturedMediaData = null;      // Stores Base64 string for image or Blob object for video
    let capturedMediaType = null;      // 'image' or 'video'
    let mediaRecorder = null;          // MediaRecorder instance for video capture
    let videoChunks = [];              // Array to store video data chunks during recording
    let isRecording = false;           // Boolean flag indicating if recording is active
    let recordingTimeout = null;       // Timeout ID for auto-stopping recording
    let currentFacingMode = 'user';    // 'user' for front camera, 'environment' for back camera
    let animationFrameId = null;       // ID returned by requestAnimationFrame for the drawing loop
    let frameCount = 0;                // Counter for frames, used by animated filters

    // --- Camera & Canvas Setup ---

    /**
     * Configures the canvas dimensions to a fixed portrait aspect ratio (9:16).
     * This ensures consistent output resolution for captured media.
     */
    const setupCanvasResolution = () => {
        const idealWidth = 450; // A good balance for mobile screen width
        const idealHeight = 800; // Corresponding height for a 9:16 aspect ratio

        canvas.width = idealWidth;
        canvas.height = idealHeight;

        // Optionally, set videoSource dimensions, though object-fit in `drawVideoOnCanvas` handles scaling.
        // videoSource.width = idealWidth;
        // videoSource.height = idealHeight;
        console.log(`Canvas resolution set to: ${canvas.width}x${canvas.height}`);
    };

    /**
     * The main drawing loop for the camera feed.
     * It continuously draws frames from the `videoSource` onto the `canvas`
     * and applies the active filter.
     */
    const drawFrame = () => {
        // Only draw if video is playing and not ended
        if (!videoSource.paused && !videoSource.ended && videoSource.readyState >= 2) {
            frameCount++; // Increment frame counter for animated filters

            // Apply filter via FilterManager. This function handles:
            // 1. Clearing the canvas.
            // 2. Drawing the video frame with correct aspect ratio and mirroring.
            // 3. Applying pixel-based or preparing for CSS-based filters.
            FilterManager.applyActiveFilter(ctx, videoSource, canvas, frameCount, currentFacingMode);
            
            // Re-schedule the next frame draw
            animationFrameId = requestAnimationFrame(drawFrame);
        } else {
            console.log("Video source not ready for drawing or paused/ended.");
            // Optionally, draw a placeholder or black screen if video is not ready
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    };

    /**
     * Initializes and starts the camera stream.
     * Requests media permissions and connects the stream to the `videoSource` element.
     */
    const startCamera = async () => {
        // Stop any existing stream before starting a new one
        if (currentStream) {
            console.log('Stopping previous camera stream.');
            currentStream.getTracks().forEach(track => track.stop());
        }
        // Stop any ongoing animation frame request
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        try {
            // Define video constraints: preferred facing mode and desired aspect ratio/resolution.
            // `ideal` values are hints; browser tries to get closest. `exact` forces it.
            const constraints = { 
                video: { 
                    facingMode: currentFacingMode,
                    width: { ideal: 1080 },  // Request high resolution width
                    height: { ideal: 1920 }, // Request high resolution height for portrait
                    aspectRatio: { exact: 9 / 16 } // Explicitly request 9:16 aspect ratio
                } 
            };
            console.log('Requesting camera access with constraints:', constraints);
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            videoSource.srcObject = currentStream;
            videoSource.play(); // Start playing the hidden video stream

            setupCanvasResolution(); // Ensure canvas is correctly sized

            // Reset UI state to live camera view
            canvas.style.display = 'block';
            photoPreview.style.display = 'none';
            captionInput.style.display = 'none';
            postCaptureControls.style.display = 'none';
            captureButton.style.display = 'block';
            captureButton.classList.remove('recording'); // Remove recording indicator

            // --- IMPORTANT FIX: Wait for video metadata to load before starting draw loop ---
            // This ensures videoWidth/Height are available for correct aspect ratio calculation.
            videoSource.onloadedmetadata = () => {
                console.log(`Video metadata loaded. Native resolution: ${videoSource.videoWidth}x${videoSource.videoHeight}`);
                // Start drawing video to canvas with filters after metadata is ready
                if (!animationFrameId) { // Prevent multiple loops if `onloadedmetadata` fires again
                    animationFrameId = requestAnimationFrame(drawFrame);
                    console.log('Canvas drawing loop started.');
                }
            };

            // Set the CSS class for active CSS filters on the canvas (if current filter is CSS-based)
            const activeFilter = FilterManager.getActiveFilter();
            if (activeFilter.type === 'css') {
                canvas.className = activeFilter.applyFunc; // activeFilter.applyFunc holds the CSS class name
                console.log(`Applied CSS filter class: ${canvas.className}`);
            } else {
                canvas.className = ''; // Clear any previous CSS filter class for canvas filters
                console.log('Cleared CSS filter class for canvas filter.');
            }

        } catch (err) {
            console.error("Error accessing camera:", err);
            let errorMessage = "Could not access camera. Please allow camera permissions and ensure your device has a camera.";
            if (err.name === "NotAllowedError") {
                errorMessage += " Permission denied. You might need to change browser/OS settings.";
            } else if (err.name === "NotFoundError") {
                errorMessage += " No camera found.";
            } else if (err.name === "NotReadableError") {
                errorMessage += " Camera is in use by another application.";
            } else if (err.name === "OverconstrainedError") {
                 errorMessage += ` Constraints not met. Try adjusting resolution or aspect ratio. (Error: ${err.message})`;
            }
            alert(errorMessage);
            // Optionally, redirect to a fallback page or show a static message
        }
    };

    /**
     * Stops the camera stream and animation loop.
     */
    const stopCamera = () => {
        if (currentStream) {
            console.log('Stopping camera tracks.');
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        if (animationFrameId) {
            console.log('Cancelling animation frame loop.');
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    };

    /**
     * Captures a still photo from the current canvas state.
     */
    const takePhoto = () => {
        console.log('Initiating photo capture.');
        stopCamera(); // Stop live camera processing to get a stable image

        // Ensure the last frame with active filters is drawn to canvas before capturing
        FilterManager.applyActiveFilter(ctx, videoSource, canvas, frameCount, currentFacingMode);

        // Get image data as a Base64 encoded JPEG
        capturedMediaData = canvas.toDataURL('image/jpeg', 0.9); // 0.9 quality
        capturedMediaType = 'image';
        console.log('Photo captured (Base64 data generated).');

        // Update UI to show photo preview and post-capture controls
        photoPreview.src = capturedMediaData;
        photoPreview.setAttribute('data-type', 'image'); // Indicate it's an image
        photoPreview.style.display = 'block'; // Show the image element
        captionInput.style.display = 'block'; // Show caption input
        postCaptureControls.style.display = 'flex'; // Show Retake/Save buttons
        captureButton.style.display = 'none'; // Hide capture button

        canvas.style.display = 'none'; // Hide canvas

        // Transfer CSS filter class from canvas to photo preview for visual consistency
        photoPreview.className = canvas.className;
        photoPreview.style.transform = 'none'; // Ensure no residual CSS transforms
    };

    /**
     * Starts video recording from the canvas stream.
     */
    const startRecording = () => {
        if (!currentStream) {
            console.error("Attempted to start recording without an active camera stream.");
            alert("Camera not ready for recording. Please ensure camera is active.");
            return;
        }

        console.log('Initiating video recording.');
        isRecording = true;
        captureButton.classList.add('recording'); // Add visual recording indicator
        videoChunks = []; // Clear previous video chunks

        // MediaRecorder records directly from the canvas's stream,
        // so all canvas-based filters, mirroring, and aspect ratio corrections are baked into the video.
        // `canvas.captureStream(30)` creates a new MediaStream from the canvas, at 30 frames per second.
        mediaRecorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm; codecs=vp8' });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                videoChunks.push(event.data); // Collect video data chunks
            }
        };

        mediaRecorder.onstop = async () => {
            console.log('Video recording stopped.');
            isRecording = false;
            captureButton.classList.remove('recording'); // Remove recording indicator

            // Create a Blob from collected video chunks
            const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
            capturedMediaData = videoBlob; // Store the Blob
            capturedMediaType = 'video';
            console.log('Video Blob generated:', videoBlob);

            // Create a temporary URL for the video Blob to display in the preview
            const videoUrl = URL.createObjectURL(videoBlob);
            
            // Update UI to show video preview and post-capture controls
            photoPreview.src = videoUrl;
            photoPreview.setAttribute('data-type', 'video'); // Indicate it's a video
            photoPreview.setAttribute('controls', ''); // Show default video controls for playback
            photoPreview.style.display = 'block'; // Show the video element
            captionInput.style.display = 'block'; // Show caption input
            postCaptureControls.style.display = 'flex'; // Show Retake/Save buttons
            captureButton.style.display = 'none'; // Hide capture button
            
            canvas.style.display = 'none'; // Hide canvas
            // Transfer CSS filter class if any (for visual consistency, though baked in for canvas filters)
            photoPreview.className = canvas.className;
            photoPreview.style.transform = 'none'; // Ensure no residual CSS transforms
            
            stopCamera(); // Stop live camera processing after video is finalized
        };

        mediaRecorder.start(); // Start recording
        console.log('Recording started successfully.');

        // Set a timeout to automatically stop recording after 30 seconds
        recordingTimeout = setTimeout(() => {
            if (isRecording) {
                mediaRecorder.stop();
                console.log('Recording stopped automatically after 30 seconds (time limit reached).');
            }
        }, 30000); // 30 seconds duration
    };

    /**
     * Manually stops video recording if active.
     */
    const stopRecording = () => {
        if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            if (recordingTimeout) {
                clearTimeout(recordingTimeout); // Clear the auto-stop timeout
                recordingTimeout = null;
            }
            console.log('Recording stopped manually by user.');
        } else {
            console.warn('Attempted to stop recording, but no active recording found.');
        }
    };

    // --- Event Listeners for Camera UI ---

    // Long press / Click logic for the main capture button
    let pressTimer;
    const PRESS_THRESHOLD = 200; // Time in milliseconds to distinguish click from long press

    captureButton.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Check for left mouse button click
            console.log('Mouse down on capture button. Starting press timer.');
            pressTimer = setTimeout(startRecording, PRESS_THRESHOLD);
        }
    });

    captureButton.addEventListener('mouseup', () => {
        clearTimeout(pressTimer); // Clear the timer when mouse button is released
        console.log('Mouse up on capture button.');
        if (isRecording) {
            stopRecording(); // If recording started, stop it
        } else if (mediaRecorder && mediaRecorder.state === 'recording') {
            // This condition handles cases where recording started but mouseup happens too fast.
            // It means a recording was already initiated by long press logic. Do nothing more.
            console.log('Recording was in progress, finishing recording.');
        } else {
            // If no recording started (it was a quick click), take a photo
            console.log('Short click detected, taking photo.');
            takePhoto();
        }
    });

    captureButton.addEventListener('mouseleave', () => {
        // If mouse leaves the button while still pressed, treat as a release
        console.log('Mouse left capture button area.');
        clearTimeout(pressTimer);
        if (isRecording) {
            stopRecording();
        }
    });

    // --- Touch Event Listeners for Mobile ---
    // Using `passive: false` to allow `e.preventDefault()` for better control over touch behavior.

    captureButton.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent default touch behavior (e.g., scrolling, zoom)
        console.log('Touch start on capture button. Starting press timer.');
        pressTimer = setTimeout(startRecording, PRESS_THRESHOLD);
    }, { passive: false });
    
    captureButton.addEventListener('touchend', () => {
        clearTimeout(pressTimer); // Clear the timer when touch ends
        console.log('Touch end on capture button.');
        if (isRecording) {
            stopRecording(); // If recording started, stop it
        } else if (mediaRecorder && mediaRecorder.state === 'recording') {
            // If recording was in progress, simply complete it.
            console.log('Recording was in progress, finishing recording.');
        } else {
            // If no recording started (it was a quick tap), take a photo
            console.log('Short tap detected, taking photo.');
            takePhoto();
        }
    });

    captureButton.addEventListener('touchcancel', () => {
        // If touch is interrupted (e.g., call, alert, switch app)
        console.log('Touch canceled on capture button.');
        clearTimeout(pressTimer);
        if (isRecording) {
            stopRecording();
        }
    });


    retakeButton.addEventListener('click', () => {
        console.log('Retake button clicked. Resetting UI and restarting camera.');
        // Clear captured media data
        capturedMediaData = null;
        capturedMediaType = null;
        captionInput.value = ''; // Clear any caption
        
        // Reset photo preview element
        photoPreview.src = '';
        photoPreview.removeAttribute('controls'); // Remove video controls if it was a video preview
        photoPreview.removeAttribute('data-type');
        photoPreview.className = ''; // Remove any filter classes
        photoPreview.style.transform = 'none'; // Reset any CSS transforms

        startCamera(); // Restart the live camera feed
    });

    saveGalleryButton.addEventListener('click', async () => {
        console.log('Save to Gallery button clicked.');
        if (!capturedMediaData) {
            console.warn('No media data to save.');
            alert("No media to save! Capture something first.");
            return;
        }

        // Prepare data object for IndexedDB storage
        let mediaToSave = {
            senderId: currentUser.id, // Store who captured this media
            type: capturedMediaType,   // 'image' or 'video'
            caption: captionInput.value.trim(), // Get caption from input
            timestamp: Date.now(),     // Current timestamp for sorting
            filtersApplied: FilterManager.getActiveFilter().id, // Store the ID of the applied filter
            // zoomLevel: currentZoomValue // Zooming functionality removed, so this is no longer saved.
        };
        console.log('Media data prepared for saving:', mediaToSave);

        if (capturedMediaType === 'image') {
            mediaToSave.data = capturedMediaData; // Base64 string for images
            await saveAndRedirect(mediaToSave);
        } else if (capturedMediaType === 'video') {
            mediaToSave.data = capturedMediaData; // Blob object for videos
            
            // For videos, generate a thumbnail from the first frame for gallery preview
            const tempVideoElement = document.createElement('video');
            tempVideoElement.src = URL.createObjectURL(capturedMediaData); // Create temp URL from Blob
            tempVideoElement.currentTime = 0.1; // Seek to 0.1s for a stable frame
            
            tempVideoElement.onloadeddata = async () => {
                console.log('Video loaded for thumbnail generation.');
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = tempVideoElement.videoWidth;
                tempCanvas.height = tempVideoElement.videoHeight;
                const tempCtx = tempCanvas.getContext('2d');
                
                // Draw thumbnail WITHOUT mirror as video data is already baked and correctly oriented.
                tempCtx.drawImage(tempVideoElement, 0, 0, tempCanvas.width, tempCanvas.height);

                mediaToSave.thumbnail = tempCanvas.toDataURL('image/jpeg', 0.7); // Save thumbnail as Base64
                console.log('Thumbnail generated for video.');
                
                await saveAndRedirect(mediaToSave);
                URL.revokeObjectURL(tempVideoElement.src); // Clean up the temporary Blob URL
            };
            tempVideoElement.onerror = async (err) => {
                console.error("Error loading video for thumbnail generation:", err);
                mediaToSave.thumbnail = null; // Save without thumbnail if generation fails
                await saveAndRedirect(mediaToSave);
                URL.revokeObjectURL(tempVideoElement.src); // Clean up the temporary Blob URL
            };
        }
    });

    /**
     * Saves the media object to IndexedDB and redirects to the gallery page.
     * @param {object} mediaToSave - The media object ready for storage.
     */
    async function saveAndRedirect(mediaToSave) {
        try {
            await openDatabase(); // Ensure IndexedDB is open
            const mediaId = await addData('media', mediaToSave); // Add data to 'media' store
            console.log(`Media saved successfully with ID: ${mediaId}`);
            alert("Media saved to gallery!");
            window.location.href = 'gallery.html'; // Navigate to gallery page
        } catch (error) {
            console.error("Failed to save media to IndexedDB:", error);
            alert("Failed to save media. Please try again.");
        }
    }

    // Camera Switch Button: Toggles between 'user' (front) and 'environment' (back) cameras.
    switchCameraButton.addEventListener('click', () => {
        console.log('Switch camera button clicked. Current mode:', currentFacingMode);
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        startCamera(); // Restart camera with the new facing mode
    });

    // Flashlight Button (Simulated): Triggers a screen flash effect.
    // Direct control of the device's LED flashlight is not possible from web browsers.
    flashlightButton.addEventListener('click', () => {
        console.log('Flashlight button clicked. Triggering screen flash.');
        screenFlashOverlay.style.opacity = 1; // Make overlay fully opaque
        setTimeout(() => {
            screenFlashOverlay.style.opacity = 0; // Fade out quickly
        }, 100); // Flash duration in milliseconds
        // alert("Flashlight functionality for physical LED is not supported in browsers for security reasons. This is a screen flash simulation.");
    });

    // --- Filter Controls Initialization ---
    /**
     * Populates the filter selection bar with buttons for each registered filter.
     */
    const initializeFilterButtons = () => {
        filterControls.innerHTML = ''; // Clear any existing buttons
        FilterManager.getAllFilters().forEach(filter => {
            const button = document.createElement('button');
            button.textContent = filter.name;
            button.className = 'filter-button';
            button.dataset.filterId = filter.id; // Store filter ID for selection
            button.addEventListener('click', () => {
                console.log(`Filter '${filter.name}' selected.`);
                FilterManager.setActiveFilter(filter.id); // Set active filter in manager

                // Apply CSS class to canvas if it's a CSS filter, otherwise ensure no CSS class is active
                if (filter.type === 'css') {
                    canvas.className = filter.applyFunc; // The `applyFunc` holds the CSS class name
                } else {
                    canvas.className = ''; // Remove any previous CSS filter class
                }
                
                // Update active state visuals for buttons
                Array.from(filterControls.children).forEach(btn => {
                    if (btn.dataset.filterId === filter.id) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
            });
            filterControls.appendChild(button);
        });
        // Set the initial 'None' filter button as active on load
        const noneFilterButton = filterControls.querySelector(`[data-filter-id="none"]`);
        if (noneFilterButton) {
            noneFilterButton.classList.add('active');
        }
        console.log('Filter buttons initialized.');
    };

    // --- Initial Application Setup ---
    initializeFilterButtons(); // Populate filter bar
    startCamera();            // Start the camera feed when the page loads
    console.log('Camera page initialized.');
});