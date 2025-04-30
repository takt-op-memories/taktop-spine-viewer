const CONFIG = {
    API_BASE: 'https://takt-op-memories.up.railway.app',
    DB_BASE: 'https://takt-op-memories.github.io/taktop-spine-db',
    ASSETS: {
        SPINE_LIST: '/spine.json',
        BACKGROUND: './src/images/background.png'
    }
};

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

const Lang = {
    current: 'en',
    data: null,

    async init() {
        try {
            const response = await fetch('./src/i18n.json');
            this.data = await response.json();

            const savedLang = localStorage.getItem('preferred_language');
            if (savedLang) {
                this.current = savedLang;
            }

            const warningsContainers = document.querySelectorAll('.warnings-container');
            warningsContainers.forEach(container => {
                container.insertAdjacentHTML('beforebegin', `
                <div class="lang-switch">
                    <button onclick="Lang.switch('ja')" class="lang-btn">日本語</button>
                    <button onclick="Lang.switch('en')" class="lang-btn">English</button>
                </div>
            `);

                container.innerHTML = generateWarnings();
            });

            this.apply();

        } catch (error) {
            console.error('Failed to initialize language:', error);
        }
    },

    switch(lang) {
        if (this.current === lang) {
            return;
        }

        this.current = lang;
        localStorage.setItem('preferred_language', lang);
        this.apply();

        document.querySelectorAll(".warnings-container").forEach(container => {
            container.innerHTML = generateWarnings();
        });

        document.getElementById('animationSelect').innerHTML = '';
        loadAnimationList();

        const statusChecker = new AuthStatusChecker();
        statusChecker.checkStatus();
    },

    apply() {
        if (!this.data) return;

        const strings = this.data[this.current];
        if (!strings) return;

        document.title = strings.title;
        document.querySelector('.site-name').textContent = strings.title;

        document.querySelector('#animationSelect').previousElementSibling.textContent = strings.selectAnimation;
        document.querySelector('button[onclick="loadSelectedFiles()"]').textContent = strings.loadAnimation;

        document.querySelector('.warn div').textContent = strings.warning;

        document.querySelector('#auth-container h2').textContent = strings.auth.title;
        document.querySelector('#password').placeholder = strings.auth.placeholder;
        document.querySelector('#auth-error').textContent = strings.auth.error;
        document.querySelector('#auth-form button').textContent = strings.auth.submit;

        document.querySelector('footer div').textContent = strings.footer.disclaimer;
    }
};

window.addEventListener('load', async () => {
    await Lang.init();
    loadAnimationList();

    const statusChecker = new AuthStatusChecker();
    statusChecker.checkStatus();
    setInterval(() => statusChecker.checkStatus(), 60000);

    const savedPassword = sessionStorage.getItem(STORAGE_KEY.PASSWORD);
    if (savedPassword) {
        await authenticate();
    }

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
    if (!Lang?.data?.[Lang.current]) return '';
    const strings = Lang.data[Lang.current];
    return `
        <div class="warn">
            <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="18" height="18"
                viewBox="0 0 24 24">
                <path d="M12 5.99L19.53 19H4.47L12 5.99M12 2L1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z"
                    fill="rgb(255, 60, 60)">
                </path>
            </svg>
            <div style="text-align: center;">
                ${strings.warning}
            </div>
        </div>
    `;
}

// List and display Spine animation files from /spine-files
async function loadAnimationList() {
    try {
        // Load local spine.json
        const response = await fetch(`${CONFIG.DB_BASE}/spine.json`);
        if (!response.ok) {
            throw new Error('Failed to load spine.json');
        }
        const files = await response.json();

        const strings = Lang.data[Lang.current];
        const selectElement = document.getElementById('animationSelect');

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = strings.selectDefault;
        selectElement.appendChild(defaultOption);

        files.forEach(file => {
            const option = document.createElement('option');
            option.value = file.fileName;
            option.textContent = Lang.current === 'en' ? file.fileName : file.listName;
            selectElement.appendChild(option);
        });

        if (files.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = strings.noAnimation;
            selectElement.appendChild(option);
        }
    } catch (error) {
        console.error('Failed to load animation list:', error);

        // Added fallback option on error
        const selectElement = document.getElementById('animationSelect');
        const option = document.createElement('option');
        option.value = '';
        option.textContent = strings.loadError;
        selectElement.appendChild(option);
    }
}

let player; // Instance of SpinePlayer
let isExporting = false; // Export processing flag

// Load selected animation file
async function loadSelectedFiles() {

    const password = sessionStorage.getItem(STORAGE_KEY.PASSWORD);
    if (!password) {
        Auth.clearAndReload();
        return;
    }

    const isValid = await Auth.verify(password);
    if (!isValid) {
        Auth.clearAndReload();
        return;
    }

    const selectedAnimation = document.getElementById('animationSelect').value;
    if (!selectedAnimation) {
        const strings = Lang.data[Lang.current];
        alert(strings.alerts.selectAnimation);
        return;
    }

    // Discard existing player and canvas
    destroyPlayer();

    // Set file path
    const skelFile = `/taktop-spine-db/spines/${selectedAnimation}.skel`;
    const atlasFile = `/taktop-spine-db/spines/${selectedAnimation}.atlas`;
    const pngFile = `/taktop-spine-db/spines/${selectedAnimation}.png`;

    // Function to read file as data URL
    const readFileAsDataURL = (url) => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.responseType = 'blob';
            xhr.onload = () => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (error) => reject(error);
                reader.readAsDataURL(xhr.response);
            };
            xhr.onerror = () => reject(new Error('Failed to load file: ' + url));
            xhr.open('GET', url, true);
            xhr.send();
        });
    };

    try {
        // Read all files as data URLs
        const [skelData, atlasData, pngData] = await Promise.all([
            readFileAsDataURL(skelFile),
            readFileAsDataURL(atlasFile),
            readFileAsDataURL(pngFile)
        ]);

        const config = {
            skelUrl: skelFile,
            atlasUrl: atlasFile,
            rawDataURIs: {
                [skelFile]: skelData,
                [atlasFile]: atlasData,
                [pngFile]: pngData
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

// Function to download selected animation files
async function downloadSelectedFiles() {
    const selectedAnimation = document.getElementById('animationSelect').value;
    if (!selectedAnimation) {
        const strings = Lang.data[Lang.current];
        alert(strings.alerts.selectAnimation);
        return;
    }

    const filesToDownload = [
        { name: `${selectedAnimation}.skel`, path: `/taktop-spine-db/spines/${selectedAnimation}.skel` },
        { name: `${selectedAnimation}.atlas`, path: `/taktop-spine-db/spines/${selectedAnimation}.atlas` },
        { name: `${selectedAnimation}.png`, path: `/taktop-spine-db/spines/${selectedAnimation}.png` }
    ];

    try {
        for (const file of filesToDownload) {
            const response = await fetch(file.path);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${file.name}`);
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            // 短い遅延を追加して、ブラウザがダウンロードダイアログを処理する時間を確保します
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log("Raw files downloaded successfully.");
    } catch (error) {
        console.error("Error downloading raw files:", error);
        alert('Error downloading raw files: ' + error.message);
    }
}

// --- PNG Sequence Export ---
async function exportPngSequence() {
    if (isExporting) {
        alert("現在エクスポート処理中です。");
        return;
    }
    if (!player || !player.animationState || !player.skeleton || !player.canvas) {
        alert("アニメーションがロードされていないか、プレイヤーの準備ができていません。");
        return;
    }

    const currentTrackEntry = player.animationState.getCurrent(0);
    if (!currentTrackEntry || !currentTrackEntry.animation) {
        alert("再生中のアニメーションが見つかりません。アニメーションを再生してから実行してください。");
        return;
    }
    const animation = currentTrackEntry.animation;
    const animationName = animation.name;
    const duration = animation.duration;
    const frameRate = 30;
    const totalFrames = Math.ceil(duration * frameRate);

    if (totalFrames <= 0 || !isFinite(duration)) {
        alert("有効なアニメーションが見つからないか、長さが0または無効です。");
        return;
    }

    const confirmExport = confirm(
        `アニメーション "${animationName}" を ${totalFrames} フレーム (約 ${duration.toFixed(2)}秒, ${frameRate}fps) の PNG シーケンスとしてエクスポートしますか？\n` +
        `フレーム数が多い場合、ブラウザが非常に重くなるか、応答しなくなる可能性があります。\n` +
        `【注意】この機能は実験的なものであり、失敗する、または黒い画像が出力される場合があります。` // 注意文を追加
    );

    if (!confirmExport) {
        return;
    }

    isExporting = true;
    const statusElement = document.getElementById('exportStatus');
    statusElement.textContent = "エクスポート準備中...";
    console.log(`Starting PNG sequence export: ${animationName}, Duration: ${duration}s, Frames: ${totalFrames}, FPS: ${frameRate}`);

    const zip = new JSZip();
    const canvas = player.canvas;
    // WebGLコンテキストを取得 (エラーチェック用)
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (!gl) {
        console.error("WebGL context could not be retrieved.");
        alert("WebGL コンテキストの取得に失敗しました。エクスポートできません。");
        statusElement.textContent = "エクスポート失敗";
        isExporting = false;
        return;
    }

    // SpinePlayer の自動レンダリングを一時的に無効にする試み (コメントアウトのまま)
    // player.config.renderPlayerOnTrackEntry = false;
    // player.pause();

    let currentFrame = 0;
    const timeStep = 1 / frameRate;
    let errorOccurred = false; // エラー発生フラグ

    // アニメーションの開始位置に設定し、最初のフレームを描画
    player.animationState.setAnimation(0, animationName, false);
    player.animationState.update(0);
    player.animationState.apply(player.skeleton);
    player.skeleton.updateWorldTransform();
    try {
        player.render(); // 最初のフレームを描画
    } catch (renderError) {
        console.error("Initial render failed:", renderError);
        alert("最初のフレームのレンダリングに失敗しました。エクスポートを中止します。");
        statusElement.textContent = "エクスポート失敗";
        isExporting = false;
        return;
    }

    statusElement.textContent = `エクスポート中: 0 / ${totalFrames}`;

    // フレームごとにキャプチャする非同期関数
    async function captureFrame() {
        // エラー発生時または全フレーム完了時
        if (errorOccurred || currentFrame >= totalFrames) {
            // エラーがなければZip生成
            if (!errorOccurred) {
                statusElement.textContent = "Zip ファイル生成中...";
                try {
                    const zipBlob = await zip.generateAsync({
                        type: "blob",
                        compression: "DEFLATE",
                        compressionOptions: { level: 1 } // 低圧縮・高速
                    });
                    const url = window.URL.createObjectURL(zipBlob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = `${animationName}_png_sequence.zip`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    a.remove();
                    statusElement.textContent = "エクスポート完了";
                    console.log("PNG sequence export finished successfully.");
                } catch (zipError) {
                    console.error("Zip file generation error:", zipError);
                    statusElement.textContent = "Zip生成エラー";
                    alert("Zip ファイルの生成中にエラーが発生しました。");
                    errorOccurred = true; // Zip生成エラーもエラーとして扱う
                }
            }

            // 共通の後処理
            if (errorOccurred) {
                statusElement.textContent = "エラーにより中断";
                alert("エクスポート中にエラーが発生したため、処理を中断しました。詳細はコンソールを確認してください。");
            }
            isExporting = false;
            // player.config.renderPlayerOnTrackEntry = true; // (もし存在すれば)
            // player.play(); // (もし存在すれば)
            if (player && player.animationState && animationName) {
                // 元のアニメーションをループ再生で再設定 (エラー時も試みる)
                try {
                    player.animationState.setAnimation(0, animationName, true);
                } catch (resetError) {
                    console.warn("Failed to reset animation state after export:", resetError);
                }
            }
            console.log("Export process ended.");
            return; // 処理終了
        }

        // --- フレーム処理 ---
        try {
            // 1. アニメーション状態を進める
            player.animationState.update(timeStep);
            player.animationState.apply(player.skeleton);
            player.skeleton.updateWorldTransform();

            // 2. レンダリング実行
            player.render();

            // 3. requestAnimationFrame を使って描画完了を待機し、キャプチャ
            requestAnimationFrame(() => {
                // WebGLコンテキストが失われていないか確認
                if (gl.isContextLost()) {
                    console.error(`WebGL context lost at frame ${currentFrame}. Aborting.`);
                    errorOccurred = true;
                    captureFrame(); // 終了処理へ
                    return;
                }

                canvas.toBlob(async (blob) => {
                    if (blob && !errorOccurred) { // エラーが発生していなければ処理
                        const frameNumber = String(currentFrame).padStart(4, '0');
                        try {
                            await zip.file(`frame_${frameNumber}.png`, blob);
                            statusElement.textContent = `エクスポート中: ${currentFrame + 1} / ${totalFrames}`;

                            currentFrame++; // 成功したら次のフレームへ
                            // 次のフレーム処理をスケジュール
                            setTimeout(captureFrame, 10); // 少し待機

                        } catch (zipAddError) {
                            console.error(`Error adding frame ${currentFrame} to zip:`, zipAddError);
                            errorOccurred = true;
                            captureFrame(); // 終了処理へ
                        }
                    } else if (!errorOccurred) {
                        console.warn(`Failed to create blob for frame ${currentFrame}. Skipping.`);
                        // blob 生成失敗はスキップして次のフレームへ進むか、エラーとするか選択
                        // ここではエラーとして中断する
                        errorOccurred = true;
                        captureFrame(); // 終了処理へ
                    }
                }, 'image/png');
            });

        } catch (frameError) {
            console.error(`Error processing frame ${currentFrame}:`, frameError);
            errorOccurred = true;
            captureFrame(); // エラー発生時は即座に終了処理へ
        }
    }

    // 最初のフレームキャプチャを開始 (最初の描画後、少し待つ)
    setTimeout(captureFrame, 100);
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

const STORAGE_KEY = {
    PASSWORD: 'auth_password'
};

const Auth = {
    async verify(password) {
        try {
            const response = await fetch(`${CONFIG.API_BASE}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ password })
            });
            return response.ok;
        } catch (error) {
            console.error('Authentication error:', error);
            return false;
        }
    },

    handleAuthSuccess() {
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('auth-error').style.display = 'none';
        document.getElementById('main').style.display = 'block';
        loadHeight();
    },

    clearAndReload() {
        sessionStorage.removeItem(STORAGE_KEY.PASSWORD);
        window.location.reload();
    }
};

async function authenticate(event) {
    if (event) event.preventDefault();

    const password = event ?
        document.getElementById('password').value :
        sessionStorage.getItem(STORAGE_KEY.PASSWORD);

    if (!password) return;

    const isValid = await Auth.verify(password);

    if (isValid) {
        sessionStorage.setItem(STORAGE_KEY.PASSWORD, password);
        Auth.handleAuthSuccess();
    } else {
        document.getElementById('auth-error').style.display = 'block';
        Auth.clearAndReload();
    }
}

class AuthStatusChecker {
    constructor() {
        this.statusEndpoint = 'https://takt-op-memories.up.railway.app/api/v1/secure/status';
        this.statusElement = document.getElementById('password-status');
    }

    async checkStatus() {
        try {
            if (!Lang.data) {
                console.warn('Language data not initialized yet');
                return;
            }

            const response = await fetch(this.statusEndpoint);
            if (!response.ok) {
                throw new Error('Status acquisition error');
            }

            const data = await response.json();
            this.updateStatusDisplay(data);
        } catch (error) {
            console.error('status check error:', error);
            if (Lang.data) {
                this.showError();
            }
        }
    }

    updateStatusDisplay(data) {
        if (!Lang?.data?.[Lang.current]) return;
        const strings = Lang.data[Lang.current].status;
        const now = new Date();
        const nextChange = new Date(data.nextChange);
        const timeUntilChange = nextChange - now;

        if (timeUntilChange <= 0) {
            this.statusElement.innerHTML = `
                <div class="status-info">
                    <p>${strings.updating}</p>
                </div>
            `;
            return;
        }

        const hoursRemaining = Math.floor(timeUntilChange / (1000 * 60 * 60));
        const minutesRemaining = Math.floor((timeUntilChange % (1000 * 60 * 60)) / (1000 * 60));

        this.statusElement.innerHTML = `
            <div class="status-info">
                <p>${strings.until}</p>
                <p class="time-remaining">${hoursRemaining}h${minutesRemaining}m</p>
            </div>
        `;
    }

    showError() {
        if (!Lang?.data?.[Lang.current]) return;
        const strings = Lang.data[Lang.current].status;
        this.statusElement.innerHTML = `
            <div class="status-error">
                <p>${strings.error}</p>
            </div>
        `;
    }
}