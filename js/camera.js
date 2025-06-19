// js/camera.js

document.addEventListener('DOMContentLoaded', () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }

    const videoSource = document.getElementById('camera-video-source'); // Hidden video element
    const canvas = document.getElementById('camera-canvas'); // Visible canvas for display
    const ctx = canvas.getContext('2d');
    const photoPreview = document.getElementById('photo-preview');
    const captionInput = document.getElementById('caption-input');
    const captureButton = document.getElementById('capture-button');
    const postCaptureControls = document.querySelector('.post-capture-controls');
    const retakeButton = document.getElementById('retake-button');
    const saveGalleryButton = document.getElementById('save-gallery-button');
    const switchCameraButton = document.getElementById('switch-camera-button');
    const flashlightButton = document.getElementById('flashlight-button');
    const screenFlashOverlay = document.getElementById('screen-flash-overlay');
    const filterControls = document.getElementById('filter-controls');
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomLevelSpan = document.getElementById('zoom-level');

    let currentStream = null;
    let capturedMediaData = null; // Stores Base64 image or Blob video
    let capturedMediaType = null; // 'image' or 'video'
    let mediaRecorder = null;
    let videoChunks = [];
    let isRecording = false;
    let recordingTimeout = null;
    let currentFacingMode = 'user'; // 'user' for front, 'environment' for back
    let currentZoomValue = 1.0; // Current zoom level
    let animationFrameId = null; // For the canvas drawing loop
    let frameCount = 0; // For animation-based filters

    const setupCanvasResolution = () => {
        // Set canvas resolution to match common mobile portrait aspect ratio (9:16)
        // Adjust these values for performance/quality trade-off
        const idealWidth = 450; // Max width of container
        const idealHeight = 800; // Approx. 16:9 ratio

        canvas.width = idealWidth;
        canvas.height = idealHeight;

        // Set videoSource dimensions if needed, though object-fit should handle it
        videoSource.width = idealWidth;
        videoSource.height = idealHeight;
    };

    const drawFrame = () => {
        if (!videoSource.paused && !videoSource.ended) {
            frameCount++; // Increment frame counter for animated filters

            // Apply filter via FilterManager
            FilterManager.applyActiveFilter(ctx, videoSource, canvas, frameCount, currentZoomValue, currentFacingMode);
            
            // Apply CSS transform for zoom only (no mirror here, as ctx handles the mirror for 'user' mode)
            canvas.style.transform = `scale(${currentZoomValue})`;

            animationFrameId = requestAnimationFrame(drawFrame);
        }
    };

    const startCamera = async () => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        try {
            // Adjust constraints for aspect ratio if camera supports it natively
            const constraints = { 
                video: { 
                    facingMode: currentFacingMode,
                    width: { ideal: 1080 }, // Request high resolution
                    height: { ideal: 1920 }, // for 9:16 portrait
                    aspectRatio: { exact: 9 / 16 } // Try to get 9:16 directly
                } 
            };
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            videoSource.srcObject = currentStream;
            videoSource.play(); // Start playing hidden video

            setupCanvasResolution(); // Set canvas to desired output resolution

            canvas.style.display = 'block';
            photoPreview.style.display = 'none';
            captionInput.style.display = 'none';
            postCaptureControls.style.display = 'none';
            captureButton.style.display = 'block';
            captureButton.classList.remove('recording');

            // Start drawing video to canvas with filters
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            animationFrameId = requestAnimationFrame(drawFrame);

            // Set the CSS class for active CSS filters (if current filter is CSS-based)
            const activeFilter = FilterManager.getActiveFilter();
            if (activeFilter.type === 'css') {
                canvas.className = activeFilter.applyFunc; // activeFilter.applyFunc holds the CSS class name
            } else {
                canvas.className = ''; // Clear CSS filter class if it's a canvas filter
            }


        } catch (err) {
            console.error("Error accessing camera: ", err);
            alert("Could not access camera. Please allow camera permissions and ensure device has a camera. Error: " + err.message);
        }
    };

    const stopCamera = () => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    };

    const takePhoto = () => {
        stopCamera(); // Stop live camera processing
        
        // Ensure the last frame is drawn to canvas before capturing
        // This will bake in the filter, zoom, and mirror correctly
        FilterManager.applyActiveFilter(ctx, videoSource, canvas, frameCount, currentZoomValue, currentFacingMode);

        capturedMediaData = canvas.toDataURL('image/jpeg', 0.9);
        capturedMediaType = 'image';
        photoPreview.src = capturedMediaData;
        photoPreview.setAttribute('data-type', 'image');
        photoPreview.style.display = 'block';
        captionInput.style.display = 'block';
        postCaptureControls.style.display = 'flex';
        captureButton.style.display = 'none';
        
        canvas.style.display = 'none'; // Hide canvas, show photo preview
        photoPreview.className = canvas.className; // Transfer CSS filter class if any
        photoPreview.style.transform = `scale(${currentZoomValue})`; // Transfer zoom only
    };

    const startRecording = () => {
        if (!currentStream) {
            console.error("No camera stream available to record.");
            alert("Camera not ready for recording.");
            return;
        }

        isRecording = true;
        captureButton.classList.add('recording');
        videoChunks = []; // Reset chunks for new recording

        // MediaRecorder records from the canvas.captureStream(), so filters, zoom, and mirror are included!
        mediaRecorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm; codecs=vp8' }); // 30fps

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                videoChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            isRecording = false;
            captureButton.classList.remove('recording');
            const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
            capturedMediaData = videoBlob;
            capturedMediaType = 'video';

            const videoUrl = URL.createObjectURL(videoBlob);
            
            photoPreview.src = videoUrl;
            photoPreview.setAttribute('data-type', 'video');
            photoPreview.setAttribute('controls', ''); // Show controls for video playback
            photoPreview.style.display = 'block';
            captionInput.style.display = 'block';
            postCaptureControls.style.display = 'flex';
            captureButton.style.display = 'none';
            
            canvas.style.display = 'none'; // Hide canvas, show video preview
            photoPreview.className = canvas.className; // Transfer CSS filter class if any
            photoPreview.style.transform = `scale(${currentZoomValue})`; // Transfer zoom only
            stopCamera(); // Stop live processing
        };

        mediaRecorder.start();
        console.log('Recording started...');

        recordingTimeout = setTimeout(() => {
            if (isRecording) {
                mediaRecorder.stop();
                console.log('Recording stopped automatically after 30 seconds.');
            }
        }, 30000); // 30 seconds
    };

    const stopRecording = () => {
        if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            if (recordingTimeout) clearTimeout(recordingTimeout);
            console.log('Recording stopped manually.');
        }
    };

    // Long press / click logic for capture button
    let pressTimer;
    const PRESS_THRESHOLD = 200; // ms

    captureButton.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Left click only
            pressTimer = setTimeout(startRecording, PRESS_THRESHOLD);
        }
    });
    captureButton.addEventListener('mouseup', () => {
        clearTimeout(pressTimer);
        if (isRecording) {
            stopRecording();
        } else if (mediaRecorder && mediaRecorder.state === 'recording') {
            // Do nothing if recording was already started and button released before threshold
        } else {
            takePhoto();
        }
    });
    captureButton.addEventListener('mouseleave', () => {
        clearTimeout(pressTimer);
        if (isRecording) {
            stopRecording();
        }
    });

    // For mobile touch events
    captureButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        pressTimer = setTimeout(startRecording, PRESS_THRESHOLD);
    }, { passive: false });
    
    captureButton.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
        if (isRecording) {
            stopRecording();
        } else if (mediaRecorder && mediaRecorder.state === 'recording') {
            // Same as mouseup, prevent photo capture if recording was in progress
        } else {
            takePhoto();
        }
    });
    captureButton.addEventListener('touchcancel', () => {
        clearTimeout(pressTimer);
        if (isRecording) {
            stopRecording();
        }
    });


    retakeButton.addEventListener('click', () => {
        capturedMediaData = null;
        capturedMediaType = null;
        captionInput.value = '';
        photoPreview.src = '';
        photoPreview.removeAttribute('controls');
        photoPreview.removeAttribute('data-type');
        photoPreview.className = '';
        photoPreview.style.transform = ''; // Reset transform
        startCamera(); // Restart camera
    });

    saveGalleryButton.addEventListener('click', async () => {
        if (!capturedMediaData) {
            alert("No media to save!");
            return;
        }

        let mediaToSave = {
            senderId: currentUser.id,
            type: capturedMediaType,
            caption: captionInput.value.trim(),
            timestamp: Date.now(),
            filtersApplied: FilterManager.getActiveFilter().id, // Save filter ID
            zoomLevel: currentZoomValue // Save zoom level
        };

        if (capturedMediaType === 'image') {
            mediaToSave.data = capturedMediaData; // Base64
            await saveAndRedirect(mediaToSave);
        } else if (capturedMediaType === 'video') {
            mediaToSave.data = capturedMediaData; // Blob
            // Generate thumbnail for video
            const tempVideoElement = document.createElement('video');
            tempVideoElement.src = URL.createObjectURL(capturedMediaData);
            tempVideoElement.currentTime = 0.1; // Seek to a very early point for thumbnail
            
            tempVideoElement.onloadeddata = async () => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = tempVideoElement.videoWidth;
                tempCanvas.height = tempVideoElement.videoHeight;
                const tempCtx = tempCanvas.getContext('2d');
                
                // Draw thumbnail WITHOUT mirror (as media is already baked, but ensure consistency)
                tempCtx.drawImage(tempVideoElement, 0, 0, tempCanvas.width, tempCanvas.height);

                mediaToSave.thumbnail = tempCanvas.toDataURL('image/jpeg', 0.7);
                
                await saveAndRedirect(mediaToSave);
                URL.revokeObjectURL(tempVideoElement.src); // Clean up temp URL
            };
            tempVideoElement.onerror = async () => {
                console.error("Error loading video for thumbnail, saving without thumbnail.");
                mediaToSave.thumbnail = null;
                await saveAndRedirect(mediaToSave);
                URL.revokeObjectURL(tempVideoElement.src); // Clean up temp URL
            };
        }
    });

    async function saveAndRedirect(mediaToSave) {
        try {
            await openDatabase();
            await addData('media', mediaToSave);
            alert("Media saved to gallery!");
            window.location.href = 'gallery.html';
        } catch (error) {
            console.error("Failed to save media:", error);
            alert("Failed to save media.");
        }
    }

    // Camera Switch Button
    switchCameraButton.addEventListener('click', () => {
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        startCamera();
    });

    // Flashlight Button (Simulated)
    flashlightButton.addEventListener('click', () => {
        screenFlashOverlay.style.opacity = 1;
        setTimeout(() => {
            screenFlashOverlay.style.opacity = 0;
        }, 100);
    });

    // Zoom functionality
    zoomSlider.addEventListener('input', () => {
        currentZoomValue = parseFloat(zoomSlider.value);
        zoomLevelSpan.textContent = `${currentZoomValue.toFixed(1)}x`;
        // Zoom is applied in drawFrame()
    });

    // Initialize filter buttons
    const initializeFilterButtons = () => {
        filterControls.innerHTML = '';
        FilterManager.getAllFilters().forEach(filter => {
            const button = document.createElement('button');
            button.textContent = filter.name;
            button.className = 'filter-button';
            button.dataset.filterId = filter.id;
            button.addEventListener('click', () => {
                FilterManager.setActiveFilter(filter.id);
                // Apply CSS class if it's a CSS filter, otherwise clear
                if (filter.type === 'css') {
                    canvas.className = filter.applyFunc; // The CSS class name
                } else {
                    canvas.className = ''; // Clear CSS filter if custom canvas filter
                }
                // Update active button state
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
        // Set initial active filter state for the 'None' button
        const noneFilterButton = filterControls.querySelector(`[data-filter-id="none"]`);
        if (noneFilterButton) {
            noneFilterButton.classList.add('active');
        }
    };

    // Initial setup
    initializeFilterButtons();
    startCamera();
});