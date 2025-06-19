// js/gallery.js
// Handles displaying media in the gallery, managing the full-screen viewer,
// and implementing custom video playback controls for video media.
// Total lines (including comments and empty lines): ~500+

document.addEventListener('DOMContentLoaded', () => {
    // --- Initial User Authentication Check ---
    const currentUser = getCurrentUser();
    if (!currentUser) {
        console.warn('GALLERY_INIT: No current user found in session storage. Redirecting to login.');
        window.location.href = 'index.html';
        return; // Stop script execution.
    }
    console.log(`GALLERY_INIT: User "${currentUser.username}" is logged in for gallery.`);

    // --- DOM Element References ---
    const galleryGrid = document.getElementById('gallery-grid');
    const mediaViewerOverlay = document.getElementById('media-viewer-overlay');
    const mediaViewerContent = document.getElementById('media-viewer-content'); // Container for actual image/video within viewer.
    const viewerImage = document.getElementById('viewer-image');
    const viewerVideo = document.getElementById('viewer-video');
    const viewerCaption = document.getElementById('viewer-caption');
    const closeViewerButton = document.getElementById('close-viewer-button');
    const prevMediaButton = document.getElementById('prev-media-button');
    const nextMediaButton = document.getElementById('next-media-button');
    const downloadButton = document.getElementById('download-button');
    const shareButton = document.getElementById('share-button'); // Corrected ID usage from HTML.
    const deleteButton = document.getElementById('delete-button');

    // Custom Video Controls Elements
    const videoControlsContainer = document.getElementById('video-controls-container');
    const playPauseButton = document.getElementById('play-pause-button');
    const progressBarWrapper = document.getElementById('progress-bar-wrapper');
    const progressBar = document.getElementById('progress-bar');
    const timeDisplay = document.getElementById('time-display');
    const volumeButton = document.getElementById('volume-button');
    const fullscreenButton = document.getElementById('fullscreen-button');

    // --- Application State Variables ---
    let userMedia = [];        // Array to hold all media items for the current user, sorted ascending by timestamp.
    let currentMediaIndex = -1; // Index of the media item currently displayed in the viewer (-1 if no item is open).

    // --- Helper Function: Time Formatting ---
    /**
     * Formats a time in seconds into a human-readable "MM:SS" string.
     * Handles potential NaN or negative values gracefully by returning "0:00".
     * @param {number} seconds - The time in seconds.
     * @returns {string} Formatted time string (e.g., "0:00", "1:35", "12:05").
     */
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0:00";
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    }

    // --- Custom Video Controls Logic ---

    /**
     * Sets up all necessary event listeners for the custom video controls.
     * Crucially, existing listeners are removed before new ones are added to prevent duplicates
     * and ensure correct behavior when switching between different video sources.
     */
    function setupVideoControls() {
        console.log('VIDEO_CONTROLS: Setting up video control listeners.');
        removeVideoControlsListeners(); // Remove previous listeners to prevent memory leaks/duplicate actions.

        // Video playback control events.
        playPauseButton.addEventListener('click', togglePlayPause);
        viewerVideo.addEventListener('play', updatePlayPauseButton);      // Update button when video starts playing.
        viewerVideo.addEventListener('pause', updatePlayPauseButton);     // Update button when video is paused.
        viewerVideo.addEventListener('ended', resetVideoState);           // Reset video when it ends.
        viewerVideo.addEventListener('timeupdate', updateProgressBar);    // Update progress bar as time passes.
        viewerVideo.addEventListener('loadedmetadata', updateProgressBar); // Update duration when video metadata loads.
        viewerVideo.addEventListener('volumechange', updateVolumeButton); // Update volume icon when volume changes.

        // Seek functionality for the progress bar.
        progressBarWrapper.addEventListener('click', seekVideo);

        // Volume and Fullscreen controls.
        volumeButton.addEventListener('click', toggleMute);
        fullscreenButton.addEventListener('click', toggleFullscreen);

        // Fullscreen change events (with vendor prefixes for broader browser compatibility).
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange); // For Safari.
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);   // For Firefox.
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);    // For IE/Edge.

        // Set initial state of controls (icons, time display) for the newly loaded video.
        updatePlayPauseButton();
        updateProgressBar();
        updateVolumeButton();
        console.log('VIDEO_CONTROLS: Video control listeners added and initialized successfully.');
    }

    /**
     * Removes all event listeners for the custom video controls.
     * This is vital for memory management and preventing unintended side effects when
     * video elements are dynamically swapped or the viewer is closed.
     */
    function removeVideoControlsListeners() {
        playPauseButton.removeEventListener('click', togglePlayPause);
        viewerVideo.removeEventListener('play', updatePlayPauseButton);
        viewerVideo.removeEventListener('pause', updatePlayPauseButton);
        viewerVideo.removeEventListener('ended', resetVideoState);
        viewerVideo.removeEventListener('timeupdate', updateProgressBar);
        viewerVideo.removeEventListener('loadedmetadata', updateProgressBar);
        viewerVideo.removeEventListener('volumechange', updateVolumeButton);

        progressBarWrapper.removeEventListener('click', seekVideo);

        volumeButton.removeEventListener('click', toggleMute);
        fullscreenButton.removeEventListener('click', toggleFullscreen);

        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
        document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        console.log('VIDEO_CONTROLS: Video control listeners removed successfully.');
    }

    /**
     * Toggles the play/pause state of the `viewerVideo` element.
     */
    function togglePlayPause() {
        if (viewerVideo.paused || viewerVideo.ended) {
            viewerVideo.play();
            console.log('VIDEO_PLAYBACK: Video playing.');
        } else {
            viewerVideo.pause();
            console.log('VIDEO_PLAYBACK: Video paused.');
        }
    }

    /**
     * Updates the icon of the play/pause button based on the current video state (playing/paused/ended).
     */
    function updatePlayPauseButton() {
        if (viewerVideo.paused || viewerVideo.ended) {
            playPauseButton.innerHTML = '<i class="fas fa-play"></i>'; // Show play icon.
        } else {
            playPauseButton.innerHTML = '<i class="fas fa-pause"></i>'; // Show pause icon.
        }
    }

    /**
     * Resets the video to the beginning (currentTime = 0) and updates the UI
     * when the video finishes playing.
     */
    function resetVideoState() {
        viewerVideo.currentTime = 0; // Rewind video to start.
        updatePlayPauseButton();     // Update play/pause button to 'play' icon.
        updateProgressBar();         // Reset progress bar and time display to 0:00.
        console.log('VIDEO_PLAYBACK: Video ended and reset to start.');
    }

    /**
     * Updates the width of the progress bar and the time display text during video playback.
     * This function is called frequently by the `timeupdate` event listener.
     */
    function updateProgressBar() {
        // Only update if video duration is available and not NaN.
        if (viewerVideo.duration && !isNaN(viewerVideo.duration) && isFinite(viewerVideo.duration)) {
            const percentage = (viewerVideo.currentTime / viewerVideo.duration) * 100;
            progressBar.style.width = `${percentage}%`; // Set width of the progress bar.
            timeDisplay.textContent = `${formatTime(viewerVideo.currentTime)} / ${formatTime(viewerVideo.duration)}`; // Update time text.
        } else {
            // Display default "0:00 / 0:00" if duration is not yet available (e.g., video loading).
            progressBar.style.width = `0%`;
            timeDisplay.textContent = `0:00 / 0:00`;
        }
    }

    /**
     * Seeks the video to a specific point based on where the user clicks on the progress bar.
     * @param {MouseEvent} e - The click event object.
     */
    function seekVideo(e) {
        const rect = progressBarWrapper.getBoundingClientRect(); // Get the size and position of the progress bar.
        const clickX = e.clientX - rect.left; // Calculate the X-coordinate of the click relative to the bar's left edge.
        const width = rect.width; // Total width of the progress bar.
        
        // Only seek if video duration is known and valid.
        if (viewerVideo.duration && !isNaN(viewerVideo.duration) && isFinite(viewerVideo.duration)) { 
            const seekTime = (clickX / width) * viewerVideo.duration; // Calculate the new time to seek to.
            viewerVideo.currentTime = seekTime; // Set the video's current time.
            console.log(`VIDEO_PLAYBACK: Video seeked to: ${formatTime(seekTime)}.`);
        } else {
            console.warn('VIDEO_PLAYBACK: Cannot seek, video duration not available or invalid.');
        }
    }

    /**
     * Toggles the mute/unmute state of the `viewerVideo`.
     */
    function toggleMute() {
        viewerVideo.muted = !viewerVideo.muted; // Toggle the `muted` property.
        updateVolumeButton(); // Update the volume button icon immediately.
        console.log(`VIDEO_PLAYBACK: Video muted: ${viewerVideo.muted}.`);
    }

    /**
     * Updates the volume button icon (`volume-up` or `volume-mute`) based on the video's mute state.
     */
    function updateVolumeButton() {
        if (viewerVideo.muted) {
            volumeButton.innerHTML = '<i class="fas fa-volume-mute"></i>'; // Show mute icon.
        } else {
            volumeButton.innerHTML = '<i class="fas fa-volume-up"></i>'; // Show volume up icon.
        }
    }

    /**
     * Toggles fullscreen mode for the video player.
     * Uses `requestFullscreen` and `exitFullscreen` with vendor prefixes for compatibility.
     */
    function toggleFullscreen() {
        // Check if currently in fullscreen mode.
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
            // If in fullscreen, exit fullscreen.
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { /* Safari */
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) { /* Firefox */
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) { /* IE/Edge */
                document.msExitFullscreen();
            }
            console.log('VIDEO_FULLSCREEN: Exiting fullscreen mode.');
        } else {
            // If not in fullscreen, request fullscreen for the `viewerVideo` element.
            if (viewerVideo.requestFullscreen) {
                viewerVideo.requestFullscreen();
            } else if (viewerVideo.webkitRequestFullscreen) { /* Safari */
                viewerVideo.webkitRequestFullscreen();
            } else if (viewerVideo.mozRequestFullScreen) { /* Firefox */
                viewerVideo.mozRequestFullScreen();
            } else if (viewerVideo.msRequestFullscreen) { /* IE/Edge */
                viewerVideo.msRequestFullscreen();
            }
            console.log('VIDEO_FULLSCREEN: Requesting fullscreen mode.');
        }
    }

    /**
     * Handles changes in fullscreen state (triggered by browser events).
     * Updates the fullscreen button icon and applies/removes a 'fullscreen' class for styling adjustments.
     */
    function handleFullscreenChange() {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
            fullscreenButton.innerHTML = '<i class="fas fa-compress"></i>'; // Show "compress" icon when in fullscreen.
            mediaViewerContent.classList.add('fullscreen'); // Add class for fullscreen-specific styling.
        } else {
            fullscreenButton.innerHTML = '<i class="fas fa-expand"></i>'; // Show "expand" icon when not in fullscreen.
            mediaViewerContent.classList.remove('fullscreen'); // Remove class.
        }
        console.log('VIDEO_FULLSCREEN: Fullscreen state changed.');
    }

    // --- Gallery Load and Viewer Logic ---

    /**
     * Loads all media items for the current user from IndexedDB and populates the gallery grid.
     * Media items are displayed in reverse chronological order (newest first).
     */
    const loadGallery = async () => {
        console.log('GALLERY_LOAD: Loading gallery media items...');
        try {
            await openDatabase(); // Ensure IndexedDB is open and ready.
            const allMedia = await getAllData('media'); // Fetch all media items from the 'media' object store.
            
            // Filter media to only show items belonging to the current user,
            // and sort them by timestamp in ascending order for consistent viewer navigation.
            userMedia = allMedia
                .filter(media => media.senderId === currentUser.id)
                .sort((a, b) => a.timestamp - b.timestamp); 

            galleryGrid.innerHTML = ''; // Clear any existing content in the gallery grid.

            if (userMedia.length === 0) {
                galleryGrid.innerHTML = '<p style="color:#bbb; text-align: center; padding: 20px;">Your gallery is empty. Capture some media!</p>';
                console.log('GALLERY_LOAD: Gallery is currently empty for this user.');
                return; // Exit if no media items found.
            }

            // Display media in reverse chronological order (newest first) in the grid.
            // Using `[...userMedia].reverse()` creates a shallow copy to reverse for display without altering original `userMedia` array.
            [...userMedia].reverse().forEach(media => { 
                const itemDiv = document.createElement('div');
                itemDiv.className = 'gallery-item';
                itemDiv.dataset.id = media.id; // Store media ID on the DOM element for easy lookup.

                let mediaElement;
                if (media.type === 'image') {
                    mediaElement = document.createElement('img');
                    mediaElement.src = media.data; // Image data (Base64 string).
                } else if (media.type === 'video') {
                    mediaElement = document.createElement('video');
                    // Use thumbnail for preview. If no thumbnail (e.g., failed generation), fallback to video data URL.
                    mediaElement.src = media.thumbnail || (media.data instanceof Blob ? URL.createObjectURL(media.data) : media.data);
                    
                    // Add a "VIDEO" indicator overlay for video thumbnails.
                    const videoIndicator = document.createElement('span');
                    videoIndicator.className = 'video-indicator';
                    videoIndicator.textContent = 'VIDEO';
                    itemDiv.appendChild(videoIndicator);
                }
                mediaElement.alt = media.caption || media.type; // Alt text for accessibility.
                
                // Apply CSS filter class to the thumbnail if the saved filter was a CSS type.
                const filterInfo = FilterManager.getAllFilters().find(f => f.id === media.filtersApplied);
                if (filterInfo && filterInfo.type === 'css') {
                    mediaElement.classList.add(filterInfo.applyFunc); // Add CSS class (e.g., 'filter-css-sepia').
                } else {
                    // For canvas-based filters, the effect is already baked into the image/video data.
                    // Ensure no old filter classes are lingering by removing all.
                    mediaElement.classList.remove(...mediaElement.classList);
                }
                
                // Ensure no residual CSS transforms (like zoom or mirroring) are applied to thumbnails.
                mediaElement.style.transform = 'none'; 

                // Add a delete button to each gallery item.
                const deleteItemButton = document.createElement('button');
                deleteItemButton.className = 'delete-button';
                deleteItemButton.innerHTML = '<i class="fas fa-times"></i>'; // Font Awesome "X" icon.
                deleteItemButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent the click from bubbling up and opening the viewer.
                    deleteMedia(media.id); // Call the delete function for this specific item.
                });

                itemDiv.appendChild(mediaElement);
                itemDiv.appendChild(deleteItemButton);
                // Add click listener to open the full media viewer when an item is tapped.
                itemDiv.addEventListener('click', () => {
                    // Find the original index of the clicked media item in the `userMedia` array (ascending sorted).
                    const clickedIndex = userMedia.findIndex(m => m.id === media.id);
                    openMediaViewer(clickedIndex); // Open the viewer at this index.
                });
                galleryGrid.appendChild(itemDiv); // Add the media item to the grid.
            });
            console.log(`GALLERY_LOAD: Gallery loaded with ${userMedia.length} items.`);
        } catch (error) {
            console.error('GALLERY_LOAD_ERROR: Failed to load gallery media:', error);
            alert('Failed to load your gallery. Please refresh the page.');
        }
    };

    /**
     * Deletes a specific media item from IndexedDB and reloads the gallery.
     * @param {number} id - The unique ID of the media item to delete.
     */
    const deleteMedia = async (id) => {
        if (confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
            console.log(`GALLERY_DELETE: Attempting to delete media item with ID: ${id}.`);
            try {
                await openDatabase(); // Ensure IndexedDB is open.
                await deleteData('media', id); // Delete data from the 'media' object store.
                console.log(`GALLERY_DELETE: Media item with ID ${id} deleted successfully.`);
                alert('Media deleted successfully!');
                closeMediaViewer(); // Close the viewer if the item being viewed was just deleted.
                loadGallery(); // Reload the gallery grid to reflect the deletion.
            } catch (error) {
                console.error('GALLERY_DELETE_ERROR: Failed to delete media from IndexedDB:', error);
                alert('Failed to delete media. Please try again.');
            }
        }
    };

    /**
     * Opens the full-screen media viewer for a specific media item.
     * This function handles displaying either an image or a video, along with its caption,
     * and sets up relevant controls.
     * @param {number} index - The index of the media item in the `userMedia` array to display.
     */
    const openMediaViewer = (index) => {
        if (index < 0 || index >= userMedia.length) {
            console.warn("VIEWER_OPEN: Invalid media index provided to viewer:", index);
            return;
        }

        currentMediaIndex = index; // Update the index of the currently viewed item.
        const media = userMedia[currentMediaIndex]; // Get the media object.

        console.log(`VIEWER_OPEN: Opening viewer for media ID: ${media.id}, Type: ${media.type}.`);

        // Hide both image and video elements initially and reset their states.
        viewerImage.style.display = 'none';
        viewerVideo.style.display = 'none';
        viewerVideo.pause(); // Ensure video is paused if switching from another video or opening/closing.
        viewerVideo.removeAttribute('src'); // Clear video source to prevent background playback/resource use.
        
        // Clear any previous CSS filter classes and transforms from the viewer elements.
        viewerImage.className = ''; 
        viewerVideo.className = ''; 
        viewerImage.style.transform = 'none'; 
        viewerVideo.style.transform = 'none'; 

        // Hide video controls container by default; it will be shown explicitly if the media is a video.
        videoControlsContainer.style.display = 'none';
        removeVideoControlsListeners(); // Remove old video control listeners to prevent duplicates.

        if (media.type === 'image') {
            viewerImage.src = media.data; // Set image source (Base64 string).
            viewerImage.style.display = 'block'; // Show the image element.
            // Apply CSS filter class if the saved filter was a CSS type.
            const filterInfo = FilterManager.getAllFilters().find(f => f.id === media.filtersApplied);
            if (filterInfo && filterInfo.type === 'css') {
                 viewerImage.classList.add(filterInfo.applyFunc);
            }
        } else if (media.type === 'video') {
            // Set video source. If it's a Blob, create an Object URL.
            viewerVideo.src = media.data instanceof Blob ? URL.createObjectURL(media.data) : media.data;
            viewerVideo.style.display = 'block'; // Show the video element.
            const filterInfo = FilterManager.getAllFilters().find(f => f.id === media.filtersApplied);
            if (filterInfo && filterInfo.type === 'css') {
                 viewerVideo.classList.add(filterInfo.applyFunc);
            }
            viewerVideo.load(); // Load video metadata (important for duration etc.).
            viewerVideo.play(); // Auto-play the video.
            
            // Show and setup custom video controls for this video.
            videoControlsContainer.style.display = 'flex'; // Make controls visible.
            setupVideoControls(); // Attach new listeners for this specific video.
        }

        viewerCaption.textContent = media.caption || 'No caption.'; // Set the caption text.
        mediaViewerOverlay.style.display = 'flex'; // Make the entire viewer overlay visible.
        mediaViewerOverlay.classList.add('active'); // Add 'active' class for additional CSS styling/transitions.

        // Update navigation arrow visibility based on current index.
        prevMediaButton.style.display = currentMediaIndex > 0 ? 'flex' : 'none'; // Show 'Previous' if not the first item.
        nextMediaButton.style.display = currentMediaIndex < userMedia.length - 1 ? 'flex' : 'none'; // Show 'Next' if not the last item.

        // Attach media ID to action buttons (Download, Share, Delete) for easy access in their handlers.
        downloadButton.dataset.mediaId = media.id;
        shareButton.dataset.mediaId = media.id;
        deleteButton.dataset.mediaId = media.id;
    };

    /**
     * Closes the full-screen media viewer and cleans up its state and resources.
     */
    const closeMediaViewer = () => {
        console.log('VIEWER_CLOSE: Closing media viewer.');
        mediaViewerOverlay.style.display = 'none';
        mediaViewerOverlay.classList.remove('active'); // Remove 'active' class.

        // Reset viewer elements to their default hidden state and clear content.
        viewerImage.src = '';
        viewerVideo.src = '';
        viewerVideo.pause(); // Pause video when closing.
        viewerVideo.removeAttribute('src'); // Clear video source to free up resources.
        viewerImage.className = ''; // Clear filter classes.
        viewerVideo.className = ''; // Clear filter classes.
        viewerImage.style.transform = 'none'; // Reset any transforms.
        viewerVideo.style.transform = 'none'; // Reset any transforms.
        currentMediaIndex = -1; // Reset the current media index.
        
        // Clean up custom video controls.
        removeVideoControlsListeners(); // Remove all video control listeners.
        videoControlsContainer.style.display = 'none'; // Ensure controls are hidden.

        // Revoke Blob URLs to free memory allocated for video data, if applicable.
        if (viewerVideo.src && viewerVideo.src.startsWith('blob:')) {
            URL.revokeObjectURL(viewerVideo.src);
            console.log('VIEWER_CLOSE: Revoked Blob URL for video.');
        }
    };

    /**
     * Navigates to the previous or next media item in the viewer sequence.
     * @param {string} direction - 'prev' to go to the previous item, 'next' to go to the next.
     */
    const navigateMedia = (direction) => {
        if (direction === 'prev') {
            openMediaViewer(currentMediaIndex - 1);
        } else if (direction === 'next') {
            openMediaViewer(currentMediaIndex + 1);
        }
        console.log(`VIEWER_NAV: Navigating to ${direction} media.`);
    };

    /**
     * Initiates the download of the currently viewed media item (image or video).
     * Creates a temporary anchor tag to trigger the download.
     */
    const downloadMedia = () => {
        if (currentMediaIndex === -1) {
            console.warn('DOWNLOAD: No media selected for download.');
            return;
        }
        const media = userMedia[currentMediaIndex];
        let url;
        // Construct a filename based on media ID and caption (sanitized).
        let filename = `snaplens_media_${media.id}_${media.caption ? media.caption.replace(/\s+/g, '_').toLowerCase() : 'untitled'}`;

        if (media.type === 'image') {
            url = media.data;
            filename += '.jpeg';
        } else if (media.type === 'video') {
            // For videos, create a temporary Object URL from the Blob if it's not already a URL.
            url = media.data instanceof Blob ? URL.createObjectURL(media.data) : media.data;
            filename += '.webm'; // Assuming webm format from MediaRecorder.
        } else {
            console.warn('DOWNLOAD: Unsupported media type for download.');
            return;
        }

        // Create a temporary anchor (<a>) element to trigger the download.
        const a = document.createElement('a');
        a.href = url;
        a.download = filename; // Set the suggested filename for download.
        document.body.appendChild(a); // Append to body (required for Firefox to click).
        a.click(); // Programmatically click the link to start download.
        document.body.removeChild(a); // Remove the temporary link.

        console.log(`DOWNLOAD: Download initiated for "${filename}".`);
        // For Blob URLs, revoking immediately might interrupt the download.
        // It's generally safer to let the browser manage it or revoke after a short delay.
    };

    /**
     * Initiates sharing of the currently viewed media item using the Web Share API.
     * Converts Base64 images/Blobs to File objects for sharing.
     */
    const shareMedia = async () => {
        if (currentMediaIndex === -1) {
            console.warn('SHARE: No media selected for sharing.');
            return;
        }
        const media = userMedia[currentMediaIndex];
        let filesToShare = [];
        // Prepare data for the Web Share API.
        let shareData = {
            title: 'SnapLens Media',
            text: media.caption || 'Check out this SnapLens media!',
            url: window.location.href // Fallback URL to the app.
        };

        try {
            // Convert Base64 image data or Blob video data into File objects for sharing.
            if (media.type === 'image') {
                const response = await fetch(media.data); // Fetch Base64 data as a Blob.
                const blob = await response.blob();
                filesToShare.push(new File([blob], `snaplens_image_${media.id}.jpeg`, { type: 'image/jpeg' }));
            } else if (media.type === 'video') {
                let blob;
                if (media.data instanceof Blob) {
                    blob = media.data; // Use Blob directly if already a Blob.
                } else {
                    const response = await fetch(media.data); // If video data was stored as Base64 (less efficient).
                    blob = await response.blob();
                }
                filesToShare.push(new File([blob], `snaplens_video_${media.id}.webm`, { type: 'video/webm' }));
            }

            // Check if the Web Share API is supported and if it can share files.
            if (filesToShare.length > 0 && navigator.canShare && navigator.canShare({ files: filesToShare })) {
                shareData.files = filesToShare; // Add files to share data.
                await navigator.share(shareData); // Open the native share dialog.
                console.log('SHARE: Media shared successfully via Web Share API (with files).');
            } else if (navigator.share) {
                // Fallback: If file sharing is not supported by the browser, try sharing text/URL only.
                console.warn('SHARE: Web Share API supports text/URL, but not files in this context. Sharing text/URL only.');
                await navigator.share(shareData);
            } else {
                // If Web Share API is not supported at all.
                alert('Web Share API is not supported in your browser.');
                console.warn('SHARE: Web Share API not supported in this browser.');
            }
        } catch (error) {
            // `AbortError` usually means the user cancelled the share dialog.
            if (error.name !== 'AbortError') { 
                console.error('SHARE_ERROR: Error sharing media:', error);
                alert('Failed to share media. Error: ' + error.message);
            } else {
                console.log('SHARE: Media sharing aborted by user.');
            }
        }
    };

    // --- Global Event Listeners for Gallery UI ---
    closeViewerButton.addEventListener('click', closeMediaViewer);
    prevMediaButton.addEventListener('click', () => navigateMedia('prev'));
    nextMediaButton.addEventListener('click', () => navigateMedia('next'));
    downloadButton.addEventListener('click', downloadMedia);
    shareButton.addEventListener('click', shareMedia);
    deleteButton.addEventListener('click', () => {
        // Get the ID of the media currently displayed in the viewer.
        if (currentMediaIndex !== -1) {
            const mediaIdToDelete = userMedia[currentMediaIndex].id;
            deleteMedia(mediaIdToDelete);
        }
    });

    // --- Initial Load ---
    loadGallery(); // Load gallery items when the page first loads.
    console.log('SETUP: Gallery page initialization complete.');
});