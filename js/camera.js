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
    // Removed: const zoomSlider = document.getElementById('zoom-slider');
    // Removed: const zoomLevelSpan = document.getElementById('zoom-level');

    let currentStream = null;
    let capturedMediaData = null; // Stores Base64 image or Blob video
    let capturedMediaType = null; // 'image' or 'video'
    let mediaRecorder = null;
    let videoChunks = [];
    let isRecording = false;
    let recordingTimeout = null;
    let currentFacingMode = 'user'; // 'user' for front, 'environment' for back
    // Removed: let currentZoomValue = 1.0; // Current zoom level
    let animationFrameId = null; // For the canvas drawing loop
    let frameCount = 0; // For animation-based filters

    const setupCanvasResolution = () => {
        const idealWidth = 450; 
        const idealHeight = 800; 

        canvas.width = idealWidth;
        canvas.height = idealHeight;

        videoSource.width = idealWidth;
        videoSource.height = idealHeight;
    };

    const drawFrame = () => {
        if (!videoSource.paused && !videoSource.ended) {
            frameCount++; // Increment frame counter for animated filters

            // Apply filter via FilterManager (now no currentZoomValue passed)
            FilterManager.applyActiveFilter(ctx, videoSource, canvas, frameCount, currentFacingMode);
            
            // Removed: canvas.style.transform = `scale(${currentZoomValue})`; // No zoom transform here

            animationFrameId = requestAnimationFrame(drawFrame);
        }
    };

    const startCamera = async () => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        try {
            const constraints = { 
                video: { 
                    facingMode: currentFacingMode,
                    width: { ideal: 1080 },
                    height: { ideal: 1920 },
                    aspectRatio: { exact: 9 / 16 }
                } 
            };
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            videoSource.srcObject = currentStream;
            videoSource.play();

            setupCanvasResolution();

            canvas.style.display = 'block';
            photoPreview.style.display = 'none';
            captionInput.style.display = 'none';
            postCaptureControls.style.display = 'none';
            captureButton.style.display = 'block';
            captureButton.classList.remove('recording');

            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            animationFrameId = requestAnimationFrame(drawFrame);

            const activeFilter = FilterManager.getActiveFilter();
            if (activeFilter.type === 'css') {
                canvas.className = activeFilter.applyFunc;
            } else {
                canvas.className = '';
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
        stopCamera();
        
        // Filter, mirror handled by applyActiveFilter, which bakes them into image data
        FilterManager.applyActiveFilter(ctx, videoSource, canvas, frameCount, currentFacingMode);

        capturedMediaData = canvas.toDataURL('image/jpeg', 0.9);
        capturedMediaType = 'image';
        photoPreview.src = capturedMediaData;
        photoPreview.setAttribute('data-type', 'image');
        photoPreview.style.display = 'block';
        captionInput.style.display = 'block';
        postCaptureControls.style.display = 'flex';
        captureButton.style.display = 'none';
        
        canvas.style.display = 'none';
        photoPreview.className = canvas.className;
        photoPreview.style.transform = 'none'; // No transform for photo preview as it's already processed
    };

    const startRecording = () => {
        if (!currentStream) {
            console.error("No camera stream available to record.");
            alert("Camera not ready for recording.");
            return;
        }

        isRecording = true;
        captureButton.classList.add('recording');
        videoChunks = [];

        // MediaRecorder records from the canvas.captureStream(), so filters and mirroring are included!
        mediaRecorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm; codecs=vp8' });

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
            photoPreview.setAttribute('controls', '');
            photoPreview.style.display = 'block';
            captionInput.style.display = 'block';
            postCaptureControls.style.display = 'flex';
            captureButton.style.display = 'none';
            
            canvas.style.display = 'none';
            photoPreview.className = canvas.className;
            photoPreview.style.transform = 'none'; // No transform for video preview
            stopCamera();
        };

        mediaRecorder.start();
        console.log('Recording started...');

        recordingTimeout = setTimeout(() => {
            if (isRecording) {
                mediaRecorder.stop();
                console.log('Recording stopped automatically after 30 seconds.');
            }
        }, 30000);
    };

    const stopRecording = () => {
        if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            if (recordingTimeout) clearTimeout(recordingTimeout);
            console.log('Recording stopped manually.');
        }
    };

    // Long press / click logic for capture button (UNMODIFIED)
    let pressTimer;
    const PRESS_THRESHOLD = 200;

    captureButton.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            pressTimer = setTimeout(startRecording, PRESS_THRESHOLD);
        }
    });
    captureButton.addEventListener('mouseup', () => {
        clearTimeout(pressTimer);
        if (isRecording) {
            stopRecording();
        } else if (mediaRecorder && mediaRecorder.state === 'recording') {
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

    captureButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        pressTimer = setTimeout(startRecording, PRESS_THRESHOLD);
    }, { passive: false });
    
    captureButton.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
        if (isRecording) {
            stopRecording();
        } else if (mediaRecorder && mediaRecorder.state === 'recording') {
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
        photoPreview.style.transform = 'none'; // Reset transform
        startCamera();
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
            filtersApplied: FilterManager.getActiveFilter().id,
            // Removed: zoomLevel: currentZoomValue // No longer saving zoom level
        };

        if (capturedMediaType === 'image') {
            mediaToSave.data = capturedMediaData;
            await saveAndRedirect(mediaToSave);
        } else if (capturedMediaType === 'video') {
            mediaToSave.data = capturedMediaData;
            const tempVideoElement = document.createElement('video');
            tempVideoElement.src = URL.createObjectURL(capturedMediaData);
            tempVideoElement.currentTime = 0.1;
            
            tempVideoElement.onloadeddata = async () => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = tempVideoElement.videoWidth;
                tempCanvas.height = tempVideoElement.videoHeight;
                const tempCtx = tempCanvas.getContext('2d');
                
                tempCtx.drawImage(tempVideoElement, 0, 0, tempCanvas.width, tempCanvas.height);

                mediaToSave.thumbnail = tempCanvas.toDataURL('image/jpeg', 0.7);
                
                await saveAndRedirect(mediaToSave);
                URL.revokeObjectURL(tempVideoElement.src);
            };
            tempVideoElement.onerror = async () => {
                console.error("Error loading video for thumbnail, saving without thumbnail.");
                mediaToSave.thumbnail = null;
                await saveAndRedirect(mediaToSave);
                URL.revokeObjectURL(tempVideoElement.src);
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

    // Camera Switch Button (UNMODIFIED)
    switchCameraButton.addEventListener('click', () => {
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        startCamera();
    });

    // Flashlight Button (Simulated) (UNMODIFIED)
    flashlightButton.addEventListener('click', () => {
        screenFlashOverlay.style.opacity = 1;
        setTimeout(() => {
            screenFlashOverlay.style.opacity = 0;
        }, 100);
    });

    // Removed: Zoom functionality
    // zoomSlider.addEventListener('input', () => {
    //     currentZoomValue = parseFloat(zoomSlider.value);
    //     zoomLevelSpan.textContent = `${currentZoomValue.toFixed(1)}x`;
    // });

    // Initialize filter buttons (UNMODIFIED, except internal logic for CSS vs Canvas)
    const initializeFilterButtons = () => {
        filterControls.innerHTML = '';
        FilterManager.getAllFilters().forEach(filter => {
            const button = document.createElement('button');
            button.textContent = filter.name;
            button.className = 'filter-button';
            button.dataset.filterId = filter.id;
            button.addEventListener('click', () => {
                FilterManager.setActiveFilter(filter.id);
                if (filter.type === 'css') {
                    canvas.className = filter.applyFunc;
                } else {
                    canvas.className = '';
                }
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
        const noneFilterButton = filterControls.querySelector(`[data-filter-id="none"]`);
        if (noneFilterButton) {
            noneFilterButton.classList.add('active');
        }
    };

    // Initial setup
    initializeFilterButtons();
    startCamera();
});