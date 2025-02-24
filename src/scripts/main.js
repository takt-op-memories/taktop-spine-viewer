const CONFIG = {
    API_BASE: 'https://takt-op-memories.up.railway.app',
    DB_BASE: 'https://takt-op-memories.github.io/taktop-spine-db',
    ASSETS: {
        SPINE_LIST: '/spine.json',
        BACKGROUND: './src/images/background.png'
    }
};

const getSpineUrls = (fileName) => ({
    skel: `${CONFIG.DB_BASE}/skel/${fileName}.skel`,
    atlas: `${CONFIG.DB_BASE}/atlas/${fileName}.atlas`,
    png: `${CONFIG.DB_BASE}/png/${fileName}.png`
});

const loadHeight = () => {
    const headerHeight = document.getElementsByTagName('header')[0].clientHeight;
    const authContainer = document.querySelector('#auth-container');
    const main = document.querySelector('#main');
    const footer = document.querySelector('footer');
    const windowHeight = window.innerHeight;
    const footerHeight = footer.clientHeight;

    // Get info/warn height
    const infoElements = authContainer.querySelectorAll('.info, .warn');
    const infoHeight = Array.from(infoElements).reduce((total, element) => {
        return total + element.clientHeight;
    }, 0);

    // Adjust margins to account for info/warn height
    const adjustedMargin = headerHeight - infoHeight;
    authContainer.style.marginTop = adjustedMargin + 'px';
    main.style.marginTop = headerHeight + 'px';

    // Adjust margins according to the element being displayed
    const visibleElement = main.style.display === 'none' ? authContainer : main;

    // Alignment of info/warn elements
    infoElements.forEach(element => {
        element.style.position = 'relative';
        element.style.zIndex = '1';
    });

    // Adjust footer position
    const visibleHeight = visibleElement.clientHeight;
    const totalContentHeight = headerHeight + visibleHeight + footerHeight;

    if (totalContentHeight < windowHeight) {
        const marginBottom = windowHeight - totalContentHeight;
        visibleElement.style.marginBottom = marginBottom + 'px';
    } else {
        visibleElement.style.marginBottom = '0px';
    }
}

window.addEventListener('load', () => {
    loadAnimationList();

    requestAnimationFrame(() => {
        loadHeight();
    });
});

let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        loadHeight();
    }, 100);
});

function generateWarnings() {
    return `
        <div class="warn">
            <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="18" height="18"
                viewBox="0 0 24 24">
                <path d="M12 5.99L19.53 19H4.47L12 5.99M12 2L1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z"
                    fill="rgb(255, 60, 60)">
                </path>
            </svg>
            <div style="text-align: center;">
                Displayed content may include unpublished content and spoilers
            </div>
        </div>
    `;
}

document.querySelectorAll(".warnings-container").forEach(container => {
    container.innerHTML = generateWarnings();
});

// List and display Spine animation files from /spine-files
async function loadAnimationList() {
    try {
        // Load local spine.json
        const response = await fetch(`${CONFIG.DB_BASE}/spine.json`);
        if (!response.ok) {
            throw new Error('Failed to load spine.json');
        }
        const files = await response.json();

        const selectElement = document.getElementById('animationSelect');
        files.forEach(file => {
            const option = document.createElement('option');
            option.value = file.fileName;
            option.textContent = file.listName;
            selectElement.appendChild(option);
        });

        if (files.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Animation not available';
            selectElement.appendChild(option);
        }
    } catch (error) {
        console.error('Failed to load animation list:', error);

        // Added fallback option on error
        const selectElement = document.getElementById('animationSelect');
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Failed to load list';
        selectElement.appendChild(option);
    }
}

let player; // Instance of SpinePlayer

// Load selected animation file
async function loadSelectedFiles() {
    const selectedAnimation = document.getElementById('animationSelect').value;
    if (!selectedAnimation) {
        alert('Select the animation you wish to view');
        return;
    }

    // Discard existing player and canvas
    destroyPlayer();

    // Set file path
    const urls = getSpineUrls(selectedAnimation);

    // Function to read file as data URL
    const readFileAsDataURL = (url, timeout = 30000) => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.responseType = 'blob';

            // タイムアウトの設定
            xhr.timeout = timeout;

            xhr.onload = () => {
                // ステータスコードのチェック
                if (xhr.status !== 200) {
                    reject(new Error(`HTTP error! status: ${xhr.status}`));
                    return;
                }

                const reader = new FileReader();

                reader.onload = (e) => {
                    if (!e.target || !e.target.result) {
                        reject(new Error('Failed to convert blob to data URL'));
                        return;
                    }
                    resolve(e.target.result);
                };

                reader.onerror = (error) => {
                    reject(new Error('FileReader error: ' + error.message));
                };

                reader.onabort = () => {
                    reject(new Error('File reading was aborted'));
                };

                reader.readAsDataURL(xhr.response);
            };

            xhr.onerror = () => {
                reject(new Error('Network error occurred'));
            };

            xhr.ontimeout = () => {
                reject(new Error('Request timeout'));
            };

            xhr.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    console.log(`Loading progress: ${percentComplete.toFixed(2)}%`);
                }
            };

            xhr.open('GET', url, true);

            try {
                xhr.send();
            } catch (error) {
                reject(new Error('Failed to send request: ' + error.message));
            }
        });
    };

    try {
        // Read all files as data URLs
        const [skelData, atlasData, pngData] = await Promise.all([
            readFileAsDataURL(urls.skel),
            readFileAsDataURL(urls.atlas),
            readFileAsDataURL(urls.png)
        ]);

        const config = {
            skelUrl: urls.skel,
            atlasUrl: urls.atlas,
            rawDataURIs: {
                [urls.skel]: skelData,
                [urls.atlas]: atlasData,
                [urls.png]: pngData
            },
            alpha: true,
            backgroundColor: "transparent",
            debug: false,
            premultipliedAlpha: false,
            backgroundImage: {
                url: CONFIG.ASSETS.BACKGROUND,
            },
            success: (spinePlayer) => {
                player = spinePlayer;
                console.log('spinePlayer: ', spinePlayer);

                // Settings after animation display
                const canvas = document.querySelector('#player-container canvas');
                if (canvas) {
                    canvas.style.width = `100%`;
                    canvas.style.height = `600px`;
                    canvas.style.minHeight = `75%`;
                }

                // Trigger full screen display
                requestFullScreen();

                console.log("Animation loaded successfully");
            },
            error: (player, msg) => {
                console.error("Error loading animation:", msg);
            }
        };

        player = null;
        player = new spine.SpinePlayer("player-container", config);
        loadHeight();

    } catch (error) {
        console.error("Error loading files:", error);
        alert('Error loading files: ' + error.message);
    }
}

// Function to destroy a SpinePlayer instance
function destroyPlayer() {
    if (player) {
        try {
            // Release WebGL context and resources as appropriate
            player.stopRendering();

            // dereference to player instance
            player = null;
        } catch (error) {
            console.error('Error disposing SpinePlayer:', error);
        }
    }

    // reset or delete canvas
    const canvas = document.querySelector('#player-container canvas');
    if (canvas) {
        const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
        if (gl) {
            // Additional cleanup of WebGL context
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        canvas.remove();
    }

    // reset player-container
    const container = document.querySelector('#player-container');
    if (container) {
        container.style.height = 'auto';
        container.style.width = '100%';
        // Additional cleanup as needed
        container.innerHTML = '';
    }
}

// full screen display function
function requestFullScreen() {
    const elem = document.getElementById('player-container');
    if (document.fullscreenEnabled) {
        elem.requestFullscreen()
            .catch(err => console.log('Full screen display failed:', err));
    } else {
        console.log('Full screen is not supported');
    }
}

async function authenticate(event) {
    event.preventDefault();
    const password = document.getElementById('password').value;

    try {
        const response = await fetch(`${CONFIG.API_BASE}/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ password })
        });

        if (response.ok) {
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('auth-error').style.display = 'none';
            document.getElementById('main').style.display = 'block';
            loadHeight();
        } else {
            document.getElementById('auth-error').style.display = 'block';
        }
    } catch (error) {
        console.error('authentication error:', error);
    }
}