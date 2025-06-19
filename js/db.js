// js/db.js

const DB_NAME = 'SnapCloneV3DB'; // Changed DB name to ensure fresh start
const DB_VERSION = 2; // Keep version 2 as schema is compatible

let db;

/**
 * Opens the IndexedDB database and creates object stores if they don't exist.
 */
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;

            // Users Object Store: username, password, id
            if (!db.objectStoreNames.contains('users')) {
                const userStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
                userStore.createIndex('username', 'username', { unique: true });
            }

            // Media Object Store: senderId, type (image/video), data (base64 or Blob), caption, timestamp, filtersApplied[], thumbnail (base64 for video)
            if (!db.objectStoreNames.contains('media')) {
                const mediaStore = db.createObjectStore('media', { keyPath: 'id', autoIncrement: true });
                mediaStore.createIndex('senderId', 'senderId', { unique: false });
                mediaStore.createIndex('timestamp', 'timestamp', { unique: false });
                mediaStore.createIndex('type', 'type', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Database opened successfully');
            resolve(db);
        };

        request.onerror = (event) => {
            console.error('Database error:', event.target.errorCode);
            reject('Database error');
        };
    });
}

/**
 * Adds data to an object store.
 * @param {string} storeName - The name of the object store.
 * @param {object} data - The data to add.
 */
function addData(storeName, data) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.add(data);

        request.onsuccess = () => resolve(request.result); // Returns the key of the added object
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * Retrieves all data from an object store.
 * @param {string} storeName - The name of the object store.
 */
function getAllData(storeName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * Retrieves specific data from an object store by key.
 * @param {string} storeName - The name of the object store.
 * @param {any} key - The key of the item to retrieve.
 */
function getDataByKey(storeName, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * Deletes data from an object store by key.
 * @param {string} storeName - The name of the object store.
 * @param {any} key - The key of the item to delete.
 */
function deleteData(storeName, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

// Utility function to get current logged-in user from session storage
function getCurrentUser() {
    const user = sessionStorage.getItem('currentUser');
    return user ? JSON.parse(user) : null;
}

// Ensure database is open when script loads
openDatabase().catch(err => console.error("Failed to open database:", err));