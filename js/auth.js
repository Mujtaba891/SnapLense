// js/auth.js

document.addEventListener('DOMContentLoaded', () => {
    const authForm = document.getElementById('auth-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const authButton = document.getElementById('auth-button');
    const toggleAuthLink = document.getElementById('toggle-auth');
    const authMessage = document.getElementById('auth-message');

    let isLoginMode = true; // true for login, false for register

    const showMessage = (msg, type = 'error') => {
        authMessage.textContent = msg;
        authMessage.className = `error-message ${type}`;
    };

    const clearMessage = () => {
        authMessage.textContent = '';
        authMessage.className = 'error-message';
    };

    const setAuthMode = (isLogin) => {
        isLoginMode = isLogin;
        authButton.textContent = isLoginMode ? 'Login' : 'Register';
        toggleAuthLink.textContent = isLoginMode ? 'Register here' : 'Login here';
        toggleAuthLink.parentElement.firstChild.textContent = isLoginMode ? "Don't have an account? " : "Already have an account? ";
        clearMessage();
    };

    toggleAuthLink.addEventListener('click', (e) => {
        e.preventDefault();
        setAuthMode(!isLoginMode);
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessage();

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            showMessage('Please enter both username and password.');
            return;
        }

        try {
            await openDatabase(); // Ensure DB is open

            if (isLoginMode) {
                // Login Logic
                const users = await getAllData('users');
                const user = users.find(u => u.username === username && u.password === password);

                if (user) {
                    sessionStorage.setItem('currentUser', JSON.stringify(user));
                    window.location.href = 'camera.html'; // Redirect to camera page
                } else {
                    showMessage('Invalid username or password.');
                }
            } else {
                // Register Logic
                const users = await getAllData('users');
                const existingUser = users.find(u => u.username === username);

                if (existingUser) {
                    showMessage('Username already exists. Please choose another.');
                } else {
                    const newUser = { username, password };
                    await addData('users', newUser);
                    showMessage('Registration successful! Please login.', 'success');
                    setAuthMode(true); // Switch to login mode after registration
                }
            }
        } catch (error) {
            console.error('Auth error:', error);
            showMessage('An error occurred during authentication.');
        }
    });

    // Check if user is already logged in (e.g., if navigating back)
    if (getCurrentUser()) {
        window.location.href = 'camera.html';
    }
});