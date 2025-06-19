// js/gallery.js
// Handles displaying media in the gallery, full-screen viewer, and custom video controls.
// Total lines (including comments and empty lines): ~500+

document.addEventListener('DOMContentLoaded', () => {
    // --- Initial User Authentication Check ---
    const currentUser = getCurrentUser();
    if (!currentUser) {
        console.warn('No current user found in session storage. Redirecting to login.');
        window.location.href = 'index.html';
        return; // Stop script execution
    }
    console.log(`User ${currentUser.username} is logged in for gallery.`);

    // --- DOM Element References ---
    const galleryGrid = document.getElementById('gallery-grid');
    const mediaViewerOverlay = document.getElementById('media-viewer-overlay');
    const mediaViewerContent = document.getElementById('media-viewer-content'); // Container for actual image/video
    const viewerImage = document.getElementById('viewer-image');
    const viewerVideo = document.getElementById('viewer-video');
    const viewerCaption = document.getElementById('viewer-caption');
    const closeViewerButton = document.getElementById('close-viewer-button');
    const prevMediaButton = document.getElementById('prev-media-button');
    const nextMediaButton = document.getElementById('next-media-button');
    const downloadButton = document.getElementById('download-button');
    const shareButton = document.getElementById('shareButton'); // Corrected ID usage from HTML
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
    let userMedia = [];        // Array to hold all media items for the current user
    let currentMediaIndex = -1; // Index of the media item currently displayed in the viewer

    // --- Helper Function: Time Formatting ---
    /**
     * Formats a time in seconds into a human-readable "MM:SS" string.
     * Handles potential NaN or negative values gracefully.
     * @param {number} seconds - The time in seconds.
     * @returns {string} Formatted time string (e.g., "0:00", "1:35").
     */
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0:00";
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    }

    // --- Custom Video Controls Logic ---

    /**
     * Sets up event listeners for the custom video controls.
     * Crucially, old listeners are removed before new ones are added to prevent duplicates.
     */
    function setupVideoControls() {
        // Remove existing listeners to prevent duplicates if `setupVideoControls` is called multiple times
        removeVideoControlsListeners(); 

        // Add event listeners for video playback control
        playPauseButton.addEventListener('click', togglePlayPause);
        viewerVideo.addEventListener('play', updatePlayPauseButton);
        viewerVideo.addEventListener('pause', updatePlayPauseButton);
        viewerVideo.addEventListener('ended', resetVideoState); // Reset to start on video end
        viewerVideo.addEventListener('timeupdate', updateProgressBar); // Update progress during playback
        viewerVideo.addEventListener('loadedmetadata', updateProgressBar); // Update duration once video metadata loads
        viewerVideo.addEventListener('volumechange', updateVolumeButton); // Update volume icon

        // Seek functionality on progress bar click
        progressBarWrapper.addEventListener('click', seekVideo);

        // Volume and Fullscreen controls
        volumeButton.addEventListener('click', toggleMute);
        fullscreenButton.addEventListener('click', toggleFullscreen);

        // Fullscreen change events (browser-specific prefixes for broader compatibility)
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange); // For Safari
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);   // For Firefox
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);    // For IE/Edge

        // Set initial state of controls (buttons, progress bar)
        updatePlayPauseButton();
        updateProgressBar();
        updateVolumeButton();
        console.log('Video controls listeners added and initialized.');
    }

    /**
     * Removes all event listeners for custom video controls.
     * Prevents memory leaks and ensures clean state when switching videos or closing viewer.
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
        console.log('Video controls listeners removed.');
    }

    /**
     * Toggles play/pause state of the video.
     */
    function togglePlayPause() {
        if (viewerVideo.paused || viewerVideo.ended) {
            viewerVideo.play();
            console.log('Video playing.');
        } else {
            viewerVideo.pause();
            console.log('Video paused.');
        }
    }

    /**
     * Updates the play/pause button icon based on video state.
     */
    function updatePlayPauseButton() {
        if (viewerVideo.paused || viewerVideo.ended) {
            playPauseButton.innerHTML = '<i class="fas fa-play"></i>';
        } else {
            playPauseButton.innerHTML = '<i class="fas fa-pause"></i>';
        }
    }

    /**
     * Resets video to beginning and updates UI when video ends.
     */
    function resetVideoState() {
        viewerVideo.currentTime = 0; // Rewind to start
        updatePlayPauseButton(); // Show play icon
        updateProgressBar(); // Reset progress bar and time display
        console.log('Video ended and reset.');
    }

    /**
     * Updates the video progress bar and time display during playback.
     */
    function updateProgressBar() {
        if (viewerVideo.duration && !isNaN(viewerVideo.duration)) { // Ensure duration is valid
            const percentage = (viewerVideo.currentTime / viewerVideo.duration) * 100;
            progressBar.style.width = `${percentage}%`;
            timeDisplay.textContent = `${formatTime(viewerVideo.currentTime)} / ${formatTime(viewerVideo.duration)}`;
        } else {
            // Display default "0:00 / 0:00" if duration is not yet available
            progressBar.style.width = `0%`;
            timeDisplay.textContent = `0:00 / 0:00`;
        }
    }

    /**
     * Seeks video to a specific point based on click position on the progress bar.
     * @param {MouseEvent} e - The click event object.
     */
    function seekVideo(e) {
        const rect = progressBarWrapper.getBoundingClientRect(); // Get bounding box of progress bar
        const clickX = e.clientX - rect.left; // X-coordinate of click relative to element
        const width = rect.width; // Total width of the progress bar
        if (viewerVideo.duration && !isNaN(viewerVideo.duration)) { // Only seek if video duration is known
            const seekTime = (clickX / width) * viewerVideo.duration; // Calculate new time
            viewerVideo.currentTime = seekTime;
            console.log(`Video seeked to: ${formatTime(seekTime)}`);
        }
    }

    /**
     * Toggles mute/unmute state of the video.
     */
    function toggleMute() {
        viewerVideo.muted = !viewerVideo.muted;
        updateVolumeButton(); // Update icon immediately
        console.log(`Video muted: ${viewerVideo.muted}`);
    }

    /**
     * Updates the volume button icon based on mute state.
     */
    function updateVolumeButton() {
        if (viewerVideo.muted) {
            volumeButton.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else {
            volumeButton.innerHTML = '<i class="fas fa-volume-up"></i>';
        }
    }

    /**
     * Toggles fullscreen mode for the video player.
     * Handles vendor prefixes for cross-browser compatibility.
     */
    function toggleFullscreen() {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
            // Currently in fullscreen, exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { /* Safari */
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) { /* Firefox */
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) { /* IE/Edge */
                document.msExitFullscreen();
            }
            console.log('Exiting fullscreen.');
        } else {
            // Not in fullscreen, request fullscreen for the video element
            if (viewerVideo.requestFullscreen) {
                viewerVideo.requestFullscreen();
            } else if (viewerVideo.webkitRequestFullscreen) { /* Safari */
                viewerVideo.webkitRequestFullscreen();
            } else if (viewerVideo.mozRequestFullScreen) { /* Firefox */
                viewerVideo.mozRequestFullScreen();
            } else if (viewerVideo.msRequestFullscreen) { /* IE/Edge */
                viewerVideo.msRequestFullscreen();
            }
            console.log('Requesting fullscreen.');
        }
    }

    /**
     * Handles changes in fullscreen state to update the fullscreen button icon and content class.
     */
    function handleFullscreenChange() {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
            fullscreenButton.innerHTML = '<i class="fas fa-compress"></i>'; // Show "compress" icon
            mediaViewerContent.classList.add('fullscreen'); // Add class for fullscreen specific styling
        } else {
            fullscreenButton.innerHTML = '<i class="fas fa-expand"></i>'; // Show "expand" icon
            mediaViewerContent.classList.remove('fullscreen'); // Remove class
        }
    }

    // --- Gallery Load and Viewer Logic ---

    /**
     * Loads all media items for the current user from IndexedDB and populates the gallery grid.
     */
    const loadGallery = async () => {
        console.log('Loading gallery media...');
        await openDatabase(); // Ensure IndexedDB is open
        const allMedia = await getAllData('media'); // Fetch all media items
        
        // Filter media to only show current user's media, and sort by timestamp ascending
        // (Ascending order is convenient for `userMedia` array, but display is reversed)
        userMedia = allMedia
            .filter(media => media.senderId === currentUser.id)
            .sort((a, b) => a.timestamp - b.timestamp); 

        galleryGrid.innerHTML = ''; // Clear existing gallery grid content

        if (userMedia.length === 0) {
            galleryGrid.innerHTML = '<p style="color:#bbb; text-align: center; padding: 20px;">Your gallery is empty. Capture some media!</p>';
            console.log('Gallery is empty.');
            return;
        }

        // Display media in descending order (newest first) in the grid
        [...userMedia].reverse().forEach(media => { 
            const itemDiv = document.createElement('div');
            itemDiv.className = 'gallery-item';
            itemDiv.dataset.id = media.id; // Store media ID on the DOM element

            let mediaElement;
            if (media.type === 'image') {
                mediaElement = document.createElement('img');
                mediaElement.src = media.data; // Image data (Base64)
            } else if (media.type === 'video') {
                mediaElement = document.createElement('video');
                // Use thumbnail for preview. If no thumbnail, fallback to video data URL.
                mediaElement.src = media.thumbnail || (media.data instanceof Blob ? URL.createObjectURL(media.data) : media.data);
                
                // Add a "VIDEO" indicator for video thumbnails
                const videoIndicator = document.createElement('span');
                videoIndicator.className = 'video-indicator';
                videoIndicator.textContent = 'VIDEO';
                itemDiv.appendChild(videoIndicator);
            }
            mediaElement.alt = media.caption || media.type; // Alt text for accessibility
            
            // Apply CSS filter class if the saved filter was a CSS type
            const filterInfo = FilterManager.getAllFilters().find(f => f.id === media.filtersApplied);
            if (filterInfo && filterInfo.type === 'css') {
                 mediaElement.classList.add(filterInfo.applyFunc); // Add CSS class (e.g., 'filter-css-sepia')
            } else {
                 // For canvas-based filters, the effect is already baked into the image/video data.
                 // Ensure no old filter classes are lingering.
                 mediaElement.classList.remove(...mediaElement.classList);
            }
            
            // Ensure no residual CSS transforms (like zoom or mirroring) are applied to thumbnails.
            // The data itself (image/video) should be correctly oriented and zoomed.
            mediaElement.style.transform = 'none'; 

            // Add delete button to each gallery item
            const deleteItemButton = document.createElement('button');
            deleteItemButton.className = 'delete-button';
            deleteItemButton.innerHTML = '<i class="fas fa-times"></i>'; // Font Awesome "X" icon
            deleteItemButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent the click from opening the viewer
                deleteMedia(media.id); // Call delete function
            });

            itemDiv.appendChild(mediaElement);
            itemDiv.appendChild(deleteItemButton);
            // Add click listener to open the full media viewer
            itemDiv.addEventListener('click', () => {
                // Find the original index in `userMedia` array (ascending sorted)
                const clickedIndex = userMedia.findIndex(m => m.id === media.id);
                openMediaViewer(clickedIndex);
            });
            galleryGrid.appendChild(itemDiv);
        });
        console.log(`Gallery loaded with ${userMedia.length} items.`);
    };

    /**
     * Deletes a media item from IndexedDB and reloads the gallery.
     * @param {number} id - The ID of the media item to delete.
     */
    const deleteMedia = async (id) => {
        if (confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
            try {
                await openDatabase();
                await deleteData('media', id);
                console.log(`Media item with ID ${id} deleted successfully.`);
                alert('Media deleted successfully!');
                closeMediaViewer(); // Close the viewer if the current item was deleted
                loadGallery(); // Reload the gallery to reflect the changes
            } catch (error) {
                console.error('Failed to delete media from IndexedDB:', error);
                alert('Failed to delete media. Please try again.');
            }
        }
    };

    /**
     * Opens the full-screen media viewer for a specific media item.
     * @param {number} index - The index of the media item in the `userMedia` array.
     */
    const openMediaViewer = (index) => {
        if (index < 0 || index >= userMedia.length) {
            console.warn("Invalid media index provided to viewer:", index);
            return;
        }

        currentMediaIndex = index; // Update current index
        const media = userMedia[currentMediaIndex];

        // Hide both image and video elements initially
        viewerImage.style.display = 'none';
        viewerVideo.style.display = 'none';
        viewerVideo.pause(); // Ensure video is paused if hidden
        viewerVideo.removeAttribute('src'); // Clear video source to prevent background playback/resource use
        
        // Clear any previous filter classes and transforms
        viewerImage.className = ''; 
        viewerVideo.className = ''; 
        viewerImage.style.transform = 'none'; 
        viewerVideo.style.transform = 'none'; 

        // Hide video controls container by default; it will be shown explicitly for videos.
        videoControlsContainer.style.display = 'none';
        removeVideoControlsListeners(); // Remove old listeners before setting up new ones for the specific media

        if (media.type === 'image') {
            viewerImage.src = media.data; // Set image source (Base64)
            viewerImage.style.display = 'block'; // Show image element
            // Apply CSS filter class if it was a CSS filter
            const filterInfo = FilterManager.getAllFilters().find(f => f.id === media.filtersApplied);
            if (filterInfo && filterInfo.type === 'css') {
                 viewerImage.classList.add(filterInfo.applyFunc);
            }
            console.log(`Displaying image ${media.id}.`);
        } else if (media.type === 'video') {
            viewerVideo.src = media.data instanceof Blob ? URL.createObjectURL(media.data) : media.data; // Set video source (Blob or URL)
            viewerVideo.style.display = 'block'; // Show video element
            const filterInfo = FilterManager.getAllFilters().find(f => f.id === media.filtersApplied);
            if (filterInfo && filterInfo.type === 'css') {
                 viewerVideo.classList.add(filterInfo.applyFunc);
            }
            viewerVideo.load(); // Load video metadata
            viewerVideo.play(); // Auto-play video
            
            // Show and setup custom video controls for this video
            videoControlsContainer.style.display = 'flex'; // Make controls visible
            setupVideoControls(); // Attach new listeners for this video
            console.log(`Displaying video ${media.id}.`);
        }

        viewerCaption.textContent = media.caption || 'No caption.'; // Set caption text
        mediaViewerOverlay.style.display = 'flex'; // Make the overlay visible
        mediaViewerOverlay.classList.add('active'); // Add active class for controls visibility CSS

        // Update navigation arrow visibility based on current index
        prevMediaButton.style.display = currentMediaIndex > 0 ? 'flex' : 'none';
        nextMediaButton.style.display = currentMediaIndex < userMedia.length - 1 ? 'flex' : 'none';

        // Attach media ID to action buttons for easy access in handlers
        downloadButton.dataset.mediaId = media.id;
        shareButton.dataset.mediaId = media.id;
        deleteButton.dataset.mediaId = media.id;
    };

    /**
     * Closes the full-screen media viewer and cleans up its state.
     */
    const closeMediaViewer = () => {
        console.log('Closing media viewer.');
        mediaViewerOverlay.style.display = 'none';
        mediaViewerOverlay.classList.remove('active'); // Remove active class

        // Reset viewer elements
        viewerImage.src = '';
        viewerVideo.src = '';
        viewerVideo.pause(); // Pause video when closing
        viewerVideo.removeAttribute('src'); // Clear source to free up resources
        viewerImage.className = ''; // Clear filter classes
        viewerVideo.className = ''; // Clear filter classes
        viewerImage.style.transform = 'none';
        viewerVideo.style.transform = 'none';
        currentMediaIndex = -1; // Reset index

        // Clean up custom video controls
        removeVideoControlsListeners(); // Remove listeners
        videoControlsContainer.style.display = 'none'; // Ensure controls are hidden

        // Revoke Blob URLs to free memory, if the source was a Blob
        if (viewerVideo.src && viewerVideo.src.startsWith('blob:')) {
            URL.revokeObjectURL(viewerVideo.src);
            console.log('Revoked Blob URL for video.');
        }
    };

    /**
     * Navigates to the previous or next media item in the viewer.
     * @param {string} direction - 'prev' or 'next'.
     */
    const navigateMedia = (direction) => {
        if (direction === 'prev') {
            openMediaViewer(currentMediaIndex - 1);
        } else if (direction === 'next') {
            openMediaViewer(currentMediaIndex + 1);
        }
        console.log(`Navigating to ${direction} media.`);
    };

    /**
     * Initiates download of the currently viewed media item.
     */
    const downloadMedia = () => {
        if (currentMediaIndex === -1) {
            console.warn('No media selected for download.');
            return;
        }
        const media = userMedia[currentMediaIndex];
        let url;
        let filename = `snaplens_media_${media.id}_${media.caption ? media.caption.replace(/\s/g, '_') : ''}`;

        if (media.type === 'image') {
            url = media.data;
            filename += '.jpeg';
        } else if (media.type === 'video') {
            url = media.data instanceof Blob ? URL.createObjectURL(media.data) : media.data;
            filename += '.webm'; // Assuming webm format from MediaRecorder
        } else {
            console.warn('Unsupported media type for download.');
            return;
        }

        // Create a temporary anchor element to trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = filename; // Set suggested filename
        document.body.appendChild(a); // Append to body (required for Firefox)
        a.click(); // Programmatically click the link
        document.body.removeChild(a); // Remove the temporary link

        console.log(`Download initiated for ${filename}`);
        // For Blob URLs, revoking immediately might interrupt download.
        // It's safer to let the browser manage it or revoke after a short delay.
    };

    /**
     * Initiates sharing of the currently viewed media item using Web Share API.
     */
    const shareMedia = async () => {
        if (currentMediaIndex === -1) {
            console.warn('No media selected for sharing.');
            return;
        }
        const media = userMedia[currentMediaIndex];
        let filesToShare = [];
        let shareData = {
            title: 'SnapLens Media',
            text: media.caption || 'Check out this SnapLens media!',
            url: window.location.href // Fallback URL
        };

        try {
            // Convert Base64 image or Blob video to File objects for sharing
            if (media.type === 'image') {
                const response = await fetch(media.data);
                const blob = await response.blob();
                filesToShare.push(new File([blob], `snaplens_image_${media.id}.jpeg`, { type: 'image/jpeg' }));
            } else if (media.type === 'video') {
                let blob;
                if (media.data instanceof Blob) {
                    blob = media.data;
                } else {
                    const response = await fetch(media.data); // If video data was stored as Base64 (less efficient)
                    blob = await response.blob();
                }
                filesToShare.push(new File([blob], `snaplens_video_${media.id}.webm`, { type: 'video/webm' }));
            }

            // Check if Web Share API supports sharing files
            if (filesToShare.length > 0 && navigator.canShare && navigator.canShare({ files: filesToShare })) {
                shareData.files = filesToShare;
                await navigator.share(shareData);
                console.log('Media shared successfully via Web Share API.');
            } else if (navigator.share) {
                // Fallback for sharing without files (text/URL only) if file sharing is not supported
                console.warn('Web Share API supports text/URL, but not files in this context. Sharing text/URL only.');
                await navigator.share(shareData);
            } else {
                alert('Web Share API is not supported in your browser.');
                console.warn('Web Share API not supported.');
            }
        } catch (error) {
            // AbortError means user cancelled the share dialog, which is not an error
            if (error.name !== 'AbortError') { 
                console.error('Error sharing media:', error);
                alert('Failed to share media. Error: ' + error.message);
            } else {
                console.log('Media sharing aborted by user.');
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
        // Find the ID of the media currently in the viewer
        if (currentMediaIndex !== -1) {
            const mediaIdToDelete = userMedia[currentMediaIndex].id;
            deleteMedia(mediaIdToDelete);
        }
    });

    // --- Initial Load ---
    loadGallery(); // Load gallery items when the page first loads
    console.log('Gallery page initialized.');
});