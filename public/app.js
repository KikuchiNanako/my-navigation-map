/**
 * アプリのメインエントリーポイント＆初期化管理
 */

window.appState = {
    //地図・GoogleAPIインスタンス
    map: null,
    directionsService: null,
    directionsRenderer: null,

    //位置・トラッキング関連
    currentLocationMarker: null,
    destinationMarker: null,
    tempMarker: null,
    watchId: null,
    lastHeading: 0,
    markerAnimationId: null,
    targetLat: null,
    targetLng: null,
    targetHeading: null,
    currentDisplayedLat: null,
    currentDisplayedLng: null,
    currentDisplayedHeading: null,

    //ナビゲーション状態
    navigationActive: false,
    currentStepIndex: 0,
    steps: [],
    isRerouting: false,
    isUserInteracting: false,
    interactionTimeout: null,

    lastDirectionsResponse: null,
    selectedRouteIndex: 0,

    //ポリライン・データ
    routePolylines: [],
    activeTraveledPolyline: null,
    activeRemainingPolyline: null,
    alternativePolylines: [],
    frequentPolylines: [],

    allPoints: [],
    frequentPoints: [],
    frequentSegments: [],
    gpxProcessed: false,

    resetNavigation() {
        this.navigationActive = false;
        this.currentStepIndex = 0;
        this.steps = [];
        this.isRerouting = false;

        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }

        if (this.tempMarker) {
            this.tempMarker.setMap(null);
            this.tempMarker = null;
        }

        if (this.destinationMarker) {
            this.destinationMarker.setMap(null);
            this.destinationMarker = null;
        }

        //ポリラインのクリア
        this.clearPolylines();

        if (this.directionsRenderer) {
            this.directionsRenderer.setDirections({ routes: [] });
        }

        this.lastDirectionsResponse = null;
        this.selectedRouteIndex = 0;
    },

    clearPolylines() {
        this.routePolylines.forEach(p => p.setMap(null));
        this.routePolylines = [];

        this.alternativePolylines.forEach(item => item.polyline?.setMap(null));
        this.alternativePolylines = [];

        if (this.activeTraveledPolyline) {
            this.activeTraveledPolyline.setMap(null);
            this.activeTraveledPolyline = null;
        }

        if (this.activeRemainingPolyline) {
            this.activeRemainingPolyline.setMap(null);
            this.activeRemainingPolyline = null;
        }
    }
};


//ログ切り替え関数
function toggleLogDisplay() {
    const logDiv = document.getElementById('log');
    if (logDiv) {
        logDiv.style.display = (logDiv.style.display === 'block') ? 'none' : 'block';
    }
}

//Google Maps APIロード
async function loadGoogleMaps() {
    try {
        const res = await fetch("/api/get-api-key");
        if (!res.ok) throw new  Error("APIキーの取得に失敗しました");
        const data = await res.json();
        const API_KEY = data.key;

        if (!API_KEY) {
            logMessage("Google Maps APIキーが設定されてません");
            return;
        }

        window.MAPS_API_KEY = API_KEY;

        ((g) => {
            var h, a, k, p = "The Google Maps Javascript API", c = "google", l = "importLibrary", q = "__ib__", m = document, b = window;
            b = b[c] || (b[c] = {});
            var d = b.maps || (b.maps = {}), r = new Set, e = new URLSearchParams, u = () => h || (h = new Promise(async (f, n) => {
                await (a = m.createElement("script"));
                e.set("libraries", [...r] + "");
                for (k in g) e.set(k.replace(/[A-Z]/g, t => "_" + t[0].toLowerCase()), g[k]);
                e.set("callback", c + ".maps." + q);
                a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
                d[q] = f;
                a.onerror = () => h = n(Error(p + " could not load. "));
                a.nonce = m.querySelector("script[nonce]")?.nonce || "";
                m.head.append(a)
            }));
            d[l] ? console.warn(p + " only loads once. RE-referencing library %s.", r) : d[l] = (f, ...n) => r.add(f) && u().then(() => d[l] (f, ...n))
        })({
            key: API_KEY,
            v: "beta",
            language: "ja",
            mapIds: ["3d7b65239e3531fb68add898"]
        });

        await google.maps.importLibrary("maps");
        await google.maps.importLibrary("routes");
        await google.maps.importLibrary("places");

    
        await initMap();
        logMessage("Google Maps ロード完了");
            
    } catch (error) {
        logMessage(`APIキーのロードエラー： ${error.message}`);
        console.error("APIキーロードエラー", error);
    }
}

//イベントリスナーの登録
window.addEventListener("DOMContentLoaded", loadGoogleMaps);

window.addEventListener("load", async () => {
    
    try {
        logMessage("保存済みのログを確認しています");
        const allSaveData = await getAllPointsFromDB();

        if (allSaveData && allSaveData.length > 0) {
            appState.allPoints = allSaveData.map(d => ({ lat: d.lat, lon: d.lon, time: d.time }));
            logMessage(`合計 ${appState.allPoints.length} 地点の過去ログを読み込みました`);

            calculateFrequentPoints();
            appState.gpxProcessed = true;

            if (appState.map) drawMap();
        } else {
            logMessage("保存されたログがありません。新しいGPXファイルを読み込んでください");
        }
    } catch (e) {
            console.error("初期読み込みエラー:", e);
    }
});

async function processFiles() {
    const fileInput = document.getElementById("gpxFileInput");
    const files = fileInput.files;

    if (!files || files.length === 0) {
        logMessage("GPXファイルを選択してください");
        return;
    }

    try {
        let allNewPoints = [];

        for (const file of files) {
            const gpxText = await file.text();
            const points = patseGpx(gpxText);

            allNewPoints.push(...points);
            logMessage(`${file.name}: ${points.length}地点を読み込みました`);
        }
        if (allNewPoints.length === 0) {
            logMessage("有効なGPXデータがありませんでした");
            return;
        }

        //IndexDBに保存
        await bulkSavePoints(allPoints);

        const allSaveData = await getAllPointsFromDB();

        appState.allPoints = allSaveData.map(d => ({
            lat: d.lat,
            lon: d.lon,
            time: d.time
        }));

        calculateFrequentPoints();

        appState.gpxProcessed = true;

        if (appState.map) {
            drawMap();
        }

        logMessage(`GPXファイルの保存完了:${allNewPoints.length}地点を追加しました`);
    } catch (error) {
        console.error("GPX処理エラー:", error);
        logMessage(`GPX処理エラー:${error.message}`);
    }
}
