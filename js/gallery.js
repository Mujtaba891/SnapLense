// js/gallery.js

document.addEventListener('DOMContentLoaded', () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }

    const galleryGrid = document.getElementById('gallery-grid');
    const mediaViewerOverlay = document.getElementById('media-viewer-overlay');
    const viewerImage = document.getElementById('viewer-image');
    const viewerVideo = document.getElementById('viewer-video');
    const viewerCaption = document.getElementById('viewer-caption');
    const closeViewerButton = document.getElementById('close-viewer-button');
    const prevMediaButton = document.getElementById('prev-media-button');
    const nextMediaButton = document.getElementById('next-media-button');
    const downloadButton = document.getElementById('download-button');
    const shareButton = document.getElementById('share-button');
    const deleteButton = document.getElementById('delete-button');

    let userMedia = []; // Stores all media for current user
    let currentMediaIndex = -1; // Index of the currently viewed media

    const loadGallery = async () => {
        await openDatabase(); // Ensure DB is open
        const allMedia = await getAllData('media');
        
        // Filter media to only show current user's media, sorted by timestamp ascending for viewer navigation
        userMedia = allMedia
            .filter(media => media.senderId === currentUser.id)
            .sort((a, b) => a.timestamp - b.timestamp); 

        galleryGrid.innerHTML = ''; // Clear existing items

        if (userMedia.length === 0) {
            galleryGrid.innerHTML = '<p style="color:#bbb; text-align: center; padding: 20px;">Your gallery is empty. Capture some media!</p>';
            return;
        }

        // Display in descending order for the grid (newest first)
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
                // Use thumbnail for preview. If no thumbnail (e.g., failed generation), use video data URL.
                mediaElement.src = media.thumbnail || (media.data instanceof Blob ? URL.createObjectURL(media.data) : media.data);
                
                const videoIndicator = document.createElement('span');
                videoIndicator.className = 'video-indicator';
                videoIndicator.textContent = 'VIDEO';
                itemDiv.appendChild(videoIndicator);
            }
            mediaElement.alt = media.caption || media.type;
            
            // Apply filter class if it's a CSS filter
            const filterInfo = FilterManager.getAllFilters().find(f => f.id === media.filtersApplied);
            if (filterInfo && filterInfo.type === 'css') {
                 mediaElement.classList.add(filterInfo.applyFunc); // Add CSS class name
            } else {
                 // For canvas-based filters, the effect is already baked into the image/video data.
                 mediaElement.classList.remove(...mediaElement.classList); // Clear any old filter classes
            }
            
            // Apply zoom level (CSS transform)
            if (media.zoomLevel && media.zoomLevel !== 1.0) {
                mediaElement.style.transform = `scale(${media.zoomLevel})`; 
            } else {
                mediaElement.style.transform = 'none'; // No transform if no zoom or 1.0x
            }
            

            const deleteItemButton = document.createElement('button');
            deleteItemButton.className = 'delete-button';
            deleteItemButton.innerHTML = '<i class="fas fa-times"></i>'; // Font Awesome icon
            deleteItemButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent opening viewer when clicking delete
                deleteMedia(media.id);
            });

            itemDiv.appendChild(mediaElement);
            itemDiv.appendChild(deleteItemButton);
            itemDiv.addEventListener('click', () => {
                // Find original index in `userMedia` array (which is sorted ascending)
                const clickedIndex = userMedia.findIndex(m => m.id === media.id);
                openMediaViewer(clickedIndex);
            });
            galleryGrid.appendChild(itemDiv);
        });
    };

    const deleteMedia = async (id) => {
        if (confirm('Are you sure you want to delete this item?')) {
            try {
                await openDatabase(); // Ensure DB is open
                await deleteData('media', id);
                alert('Media deleted successfully!');
                closeMediaViewer(); // Close viewer if currently viewing deleted item
                loadGallery(); // Reload gallery
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
        
        viewerImage.className = ''; // Clear previous filter class
        viewerVideo.className = ''; // Clear previous filter class
        viewerImage.style.transform = 'none'; // Reset transform
        viewerVideo.style.transform = 'none'; // Reset transform


        if (media.type === 'image') {
            viewerImage.src = media.data;
            viewerImage.style.display = 'block';
            // Apply CSS filter class only if it was a CSS filter
            const filterInfo = FilterManager.getAllFilters().find(f => f.id === media.filtersApplied);
            if (filterInfo && filterInfo.type === 'css') {
                 viewerImage.classList.add(filterInfo.applyFunc);
            }
            // Apply zoom level (CSS transform)
            if (media.zoomLevel && media.zoomLevel !== 1.0) {
                viewerImage.style.transform = `scale(${media.zoomLevel})`; 
            }

        } else if (media.type === 'video') {
            viewerVideo.src = media.data instanceof Blob ? URL.createObjectURL(media.data) : media.data;
            viewerVideo.style.display = 'block';
            const filterInfo = FilterManager.getAllFilters().find(f => f.id === media.filtersApplied);
            if (filterInfo && filterInfo.type === 'css') {
                 viewerVideo.classList.add(filterInfo.applyFunc);
            }
            if (media.zoomLevel && media.zoomLevel !== 1.0) {
                viewerVideo.style.transform = `scale(${media.zoomLevel})`;
            }
            viewerVideo.load();
            viewerVideo.play();
        }

        viewerCaption.textContent = media.caption || 'No caption.';
        mediaViewerOverlay.style.display = 'flex';

        // Update navigation button visibility
        prevMediaButton.style.display = currentMediaIndex > 0 ? 'flex' : 'none';
        nextMediaButton.style.display = currentMediaIndex < userMedia.length - 1 ? 'flex' : 'none';

        // Set current media ID for share/download/delete buttons
        downloadButton.dataset.mediaId = media.id;
        shareButton.dataset.mediaId = media.id;
        deleteButton.dataset.mediaId = media.id;
    };

    const closeMediaViewer = () => {
        mediaViewerOverlay.style.display = 'none';
        viewerImage.src = '';
        viewerVideo.src = '';
        viewerVideo.pause();
        viewerVideo.removeAttribute('src');
        viewerImage.className = ''; // Clear filter classes
        viewerVideo.className = ''; // Clear filter classes
        viewerImage.style.transform = 'none';
        viewerVideo.style.transform = 'none';
        currentMediaIndex = -1; // Reset index
        // Clean up object URLs for video blobs
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
            filename += '.webm'; // Assuming webm format from MediaRecorder
        } else {
            return;
        }

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        if (media.type === 'video' && url.startsWith('blob:')) {
            // URL.revokeObjectURL(url); // Don't revoke immediately, might need for other ops
        }
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

    loadGallery(); // Initial load
});