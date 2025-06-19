// js/gallery.js

document.addEventListener('DOMContentLoaded', () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }

    const galleryGrid = document.getElementById('gallery-grid');
    const mediaViewerOverlay = document.getElementById('media-viewer-overlay');
    const mediaViewerContent = document.getElementById('media-viewer-content');
    const viewerImage = document.getElementById('viewer-image');
    const viewerVideo = document.getElementById('viewer-video');
    const viewerCaption = document.getElementById('viewer-caption');
    const closeViewerButton = document.getElementById('close-viewer-button');
    const prevMediaButton = document.getElementById('prev-media-button');
    const nextMediaButton = document.getElementById('next-media-button');
    const downloadButton = document.getElementById('download-button');
    const shareButton = document.getElementById('share-button');
    const deleteButton = document.getElementById('delete-button');

    // Custom Video Controls Elements
    const videoControlsContainer = document.getElementById('video-controls-container');
    const playPauseButton = document.getElementById('play-pause-button');
    const progressBarWrapper = document.getElementById('progress-bar-wrapper');
    const progressBar = document.getElementById('progress-bar');
    const timeDisplay = document.getElementById('time-display');
    const volumeButton = document.getElementById('volume-button');
    const fullscreenButton = document.getElementById('fullscreen-button');

    let userMedia = [];
    let currentMediaIndex = -1;

    // Helper function to format time
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    }

    // --- Video Controls Logic ---

    function setupVideoControls() {
        playPauseButton.addEventListener('click', togglePlayPause);
        viewerVideo.addEventListener('play', updatePlayPauseButton);
        viewerVideo.addEventListener('pause', updatePlayPauseButton);
        viewerVideo.addEventListener('ended', resetVideoState);
        viewerVideo.addEventListener('timeupdate', updateProgressBar);
        viewerVideo.addEventListener('loadedmetadata', updateProgressBar);

        progressBarWrapper.addEventListener('click', seekVideo);

        volumeButton.addEventListener('click', toggleMute);
        fullscreenButton.addEventListener('click', toggleFullscreen);

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange); // For Safari
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);   // For Firefox
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);    // For IE/Edge
    }

    function removeVideoControlsListeners() {
        playPauseButton.removeEventListener('click', togglePlayPause);
        viewerVideo.removeEventListener('play', updatePlayPauseButton);
        viewerVideo.removeEventListener('pause', updatePlayPauseButton);
        viewerVideo.removeEventListener('ended', resetVideoState);
        viewerVideo.removeEventListener('timeupdate', updateProgressBar);
        viewerVideo.removeEventListener('loadedmetadata', updateProgressBar);

        progressBarWrapper.removeEventListener('click', seekVideo);

        volumeButton.removeEventListener('click', toggleMute);
        fullscreenButton.removeEventListener('click', toggleFullscreen);

        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
        document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    }

    function togglePlayPause() {
        if (viewerVideo.paused || viewerVideo.ended) {
            viewerVideo.play();
        } else {
            viewerVideo.pause();
        }
    }

    function updatePlayPauseButton() {
        if (viewerVideo.paused || viewerVideo.ended) {
            playPauseButton.innerHTML = '<i class="fas fa-play"></i>';
        } else {
            playPauseButton.innerHTML = '<i class="fas fa-pause"></i>';
        }
    }

    function resetVideoState() {
        viewerVideo.currentTime = 0;
        updatePlayPauseButton();
        updateProgressBar(); // Reset progress bar and time
    }

    function updateProgressBar() {
        const percentage = (viewerVideo.currentTime / viewerVideo.duration) * 100;
        progressBar.style.width = `${percentage}%`;
        timeDisplay.textContent = `${formatTime(viewerVideo.currentTime)} / ${formatTime(viewerVideo.duration)}`;
    }

    function seekVideo(e) {
        const rect = progressBarWrapper.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const seekTime = (clickX / width) * viewerVideo.duration;
        viewerVideo.currentTime = seekTime;
    }

    function toggleMute() {
        viewerVideo.muted = !viewerVideo.muted;
        if (viewerVideo.muted) {
            volumeButton.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else {
            volumeButton.innerHTML = '<i class="fas fa-volume-up"></i>';
        }
    }

    function toggleFullscreen() {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { /* Safari */
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) { /* Firefox */
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) { /* IE/Edge */
                document.msExitFullscreen();
            }
        } else {
            if (viewerVideo.requestFullscreen) {
                viewerVideo.requestFullscreen();
            } else if (viewerVideo.webkitRequestFullscreen) { /* Safari */
                viewerVideo.webkitRequestFullscreen();
            } else if (viewerVideo.mozRequestFullScreen) { /* Firefox */
                viewerVideo.mozRequestFullScreen();
            } else if (viewerVideo.msRequestFullscreen) { /* IE/Edge */
                viewerVideo.msRequestFullscreen();
            }
        }
    }

    function handleFullscreenChange() {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
            fullscreenButton.innerHTML = '<i class="fas fa-compress"></i>';
            mediaViewerContent.classList.add('fullscreen');
        } else {
            fullscreenButton.innerHTML = '<i class="fas fa-expand"></i>';
            mediaViewerContent.classList.remove('fullscreen');
        }
    }

    // --- Gallery Load and Viewer Logic ---

    const loadGallery = async () => {
        await openDatabase();
        const allMedia = await getAllData('media');
        
        userMedia = allMedia
            .filter(media => media.senderId === currentUser.id)
            .sort((a, b) => a.timestamp - b.timestamp); 

        galleryGrid.innerHTML = '';

        if (userMedia.length === 0) {
            galleryGrid.innerHTML = '<p style="color:#bbb; text-align: center; padding: 20px;">Your gallery is empty. Capture some media!</p>';
            return;
        }

        [...userMedia].reverse().forEach(media => { 
            const itemDiv = document.createElement('div');
            itemDiv.className = 'gallery-item';
            itemDiv.dataset.id = media.id;

            let mediaElement;
            if (media.type === 'image') {
                mediaElement = document.createElement('img');
                mediaElement.src = media.data;
            } else if (media.type === 'video') {
                mediaElement = document.createElement('video');
                mediaElement.src = media.thumbnail || (media.data instanceof Blob ? URL.createObjectURL(media.data) : media.data);
                
                const videoIndicator = document.createElement('span');
                videoIndicator.className = 'video-indicator';
                videoIndicator.textContent = 'VIDEO';
                itemDiv.appendChild(videoIndicator);
            }
            mediaElement.alt = media.caption || media.type;
            
            const filterInfo = FilterManager.getAllFilters().find(f => f.id === media.filtersApplied);
            if (filterInfo && filterInfo.type === 'css') {
                 mediaElement.classList.add(filterInfo.applyFunc);
            } else {
                 mediaElement.classList.remove(...mediaElement.classList);
            }
            
            mediaElement.style.transform = 'none'; // Ensure no residual transforms from camera if any

            const deleteItemButton = document.createElement('button');
            deleteItemButton.className = 'delete-button';
            deleteItemButton.innerHTML = '<i class="fas fa-times"></i>';
            deleteItemButton.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteMedia(media.id);
            });

            itemDiv.appendChild(mediaElement);
            itemDiv.appendChild(deleteItemButton);
            itemDiv.addEventListener('click', () => {
                const clickedIndex = userMedia.findIndex(m => m.id === media.id);
                openMediaViewer(clickedIndex);
            });
            galleryGrid.appendChild(itemDiv);
        });
    };

    const deleteMedia = async (id) => {
        if (confirm('Are you sure you want to delete this item?')) {
            try {
                await openDatabase();
                await deleteData('media', id);
                alert('Media deleted successfully!');
                closeMediaViewer();
                loadGallery();
            } catch (error) {
                console.error('Failed to delete media:', error);
                alert('Failed to delete media.');
            }
        }
    };

    const openMediaViewer = (index) => {
        if (index < 0 || index >= userMedia.length) {
            console.warn("Invalid media index.");
            return;
        }

        currentMediaIndex = index;
        const media = userMedia[currentMediaIndex];

        viewerImage.style.display = 'none';
        viewerVideo.style.display = 'none';
        viewerVideo.pause();
        viewerVideo.removeAttribute('src'); // Clear video source
        
        viewerImage.className = ''; 
        viewerVideo.className = ''; 
        viewerImage.style.transform = 'none'; 
        viewerVideo.style.transform = 'none'; 

        // Hide video controls by default, show if it's a video
        videoControlsContainer.style.display = 'none';
        removeVideoControlsListeners(); // Remove old listeners before setting up new for next video

        if (media.type === 'image') {
            viewerImage.src = media.data;
            viewerImage.style.display = 'block';
            const filterInfo = FilterManager.getAllFilters().find(f => f.id === media.filtersApplied);
            if (filterInfo && filterInfo.type === 'css') {
                 viewerImage.classList.add(filterInfo.applyFunc);
            }
        } else if (media.type === 'video') {
            viewerVideo.src = media.data instanceof Blob ? URL.createObjectURL(media.data) : media.data;
            viewerVideo.style.display = 'block';
            const filterInfo = FilterManager.getAllFilters().find(f => f.id === media.filtersApplied);
            if (filterInfo && filterInfo.type === 'css') {
                 viewerVideo.classList.add(filterInfo.applyFunc);
            }
            viewerVideo.load();
            viewerVideo.play(); // Auto-play video
            
            // Show and setup video controls for video
            videoControlsContainer.style.display = 'flex';
            setupVideoControls(); // Add new listeners
            updatePlayPauseButton(); // Initial state for play/pause button
            updateProgressBar(); // Initial state for time and progress
            toggleMute(); // Call once to set initial volume icon correctly
        }

        viewerCaption.textContent = media.caption || 'No caption.';
        mediaViewerOverlay.style.display = 'flex';
        mediaViewerOverlay.classList.add('active'); // Add active class for controls visibility CSS

        prevMediaButton.style.display = currentMediaIndex > 0 ? 'flex' : 'none';
        nextMediaButton.style.display = currentMediaIndex < userMedia.length - 1 ? 'flex' : 'none';

        downloadButton.dataset.mediaId = media.id;
        shareButton.dataset.mediaId = media.id;
        deleteButton.dataset.mediaId = media.id;
    };

    const closeMediaViewer = () => {
        mediaViewerOverlay.style.display = 'none';
        mediaViewerOverlay.classList.remove('active'); // Remove active class
        viewerImage.src = '';
        viewerVideo.src = '';
        viewerVideo.pause();
        viewerVideo.removeAttribute('src');
        viewerImage.className = ''; 
        viewerVideo.className = ''; 
        viewerImage.style.transform = 'none';
        viewerVideo.style.transform = 'none';
        currentMediaIndex = -1; 
        
        removeVideoControlsListeners(); // Clean up listeners
        videoControlsContainer.style.display = 'none'; // Ensure controls are hidden

        if (viewerVideo.src && viewerVideo.src.startsWith('blob:')) {
            URL.revokeObjectURL(viewerVideo.src);
        }
    };

    const navigateMedia = (direction) => {
        if (direction === 'prev') {
            openMediaViewer(currentMediaIndex - 1);
        } else if (direction === 'next') {
            openMediaViewer(currentMediaIndex + 1);
        }
    };

    const downloadMedia = () => {
        if (currentMediaIndex === -1) return;
        const media = userMedia[currentMediaIndex];
        let url;
        let filename = `snaplens_media_${media.id}`;

        if (media.type === 'image') {
            url = media.data;
            filename += '.jpeg';
        } else if (media.type === 'video') {
            url = media.data instanceof Blob ? URL.createObjectURL(media.data) : media.data;
            filename += '.webm';
        } else {
            return;
        }

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const shareMedia = async () => {
        if (currentMediaIndex === -1) return;
        const media = userMedia[currentMediaIndex];
        let filesToShare = [];
        let shareData = {
            title: 'SnapLens Media',
            text: media.caption || 'Check out this SnapLens media!'
        };

        try {
            if (media.type === 'image') {
                const response = await fetch(media.data);
                const blob = await response.blob();
                filesToShare.push(new File([blob], `snaplens_image_${media.id}.jpeg`, { type: 'image/jpeg' }));
            } else if (media.type === 'video') {
                let blob;
                if (media.data instanceof Blob) {
                    blob = media.data;
                } else {
                    const response = await fetch(media.data);
                    blob = await response.blob();
                }
                filesToShare.push(new File([blob], `snaplens_video_${media.id}.webm`, { type: 'video/webm' }));
            }

            if (filesToShare.length > 0 && navigator.canShare && navigator.canShare({ files: filesToShare })) {
                shareData.files = filesToShare;
                await navigator.share(shareData);
                console.log('Media shared successfully');
            } else if (navigator.share) {
                await navigator.share(shareData);
                console.log('Text/URL shared successfully (files not supported)');
            } else {
                alert('Web Share API not supported in your browser.');
            }
        } catch (error) {
            console.error('Error sharing media:', error);
            if (error.name !== 'AbortError') {
                alert('Failed to share media.');
            }
        }
    };

    closeViewerButton.addEventListener('click', closeMediaViewer);
    prevMediaButton.addEventListener('click', () => navigateMedia('prev'));
    nextMediaButton.addEventListener('click', () => navigateMedia('next'));
    downloadButton.addEventListener('click', downloadMedia);
    shareButton.addEventListener('click', shareMedia);
    deleteButton.addEventListener('click', () => {
        if (currentMediaIndex !== -1) {
            const mediaIdToDelete = userMedia[currentMediaIndex].id;
            deleteMedia(mediaIdToDelete);
        }
    });

    loadGallery();
});